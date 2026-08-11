# -*- coding: utf-8 -*-
"""
Seed the accounts the Library Assistant end-to-end suite logs in as.

The suite needs one account per state of the opt-out switch — on, off, and the two scratch
accounts the mutation tests write to — each in a known state and stable across runs, so a
test that leaves an account dirty can be diagnosed rather than papered over by a fresh
registration.

Every account gets an id above ``reader.conftest.SYNTHETIC_USER_ID_FLOOR``. Mongo is not
swapped for a test database the way Postgres is, and a developer's local ``profiles``
collection is a restored public dump holding hundreds of thousands of real people at the
low ids a fresh auth database hands out. Ids here are deterministic as well as synthetic,
so re-seeding reuses the same accounts instead of accumulating new ones.

Writes a manifest at ``e2e-tests/.la-e2e-users.json`` for the Playwright suite to read.
``--manifest-stdout`` puts that same JSON on stdout and nothing else, so a run inside a
pod can be redirected straight into the file the suite reads outside the cluster.

The shared password comes from ``LA_E2E_PASSWORD`` when set. These are login-capable
accounts with predictable addresses, so any environment reachable from the public
internet wants a password of its own.

Usage:
    python scripts/dev/seed_library_assistant_e2e_users.py
    python scripts/dev/seed_library_assistant_e2e_users.py --reset
    python scripts/dev/seed_library_assistant_e2e_users.py --report
    python scripts/dev/seed_library_assistant_e2e_users.py --manifest-stdout > e2e-tests/.la-e2e-users.json
    python scripts/dev/seed_library_assistant_e2e_users.py --teardown
"""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

import django

django.setup()

from django.contrib.auth.models import User

from emailusernames.utils import _email_to_username
from reader.conftest import SYNTHETIC_USER_ID_FLOOR, purge_test_profiles
from reader.models import UserExperimentSettings
from sefaria.helper.library_assistant import SETTING_KEY
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db

PASSWORD = os.environ.get("LA_E2E_PASSWORD", "password")
MANIFEST = Path(__file__).resolve().parents[2] / "e2e-tests" / ".la-e2e-users.json"

# Offsets sit at the top of the 100,000,000-wide band `create_test_user` draws random
# offsets from, so a deterministic account cannot collide with a random one in practice,
# and the resulting ids stay under int4 max (User.pk is a 32-bit AutoField).
_OFFSET_BASE = 99_000_000

# setting is `profiles.settings.library_assistant`. `expected` is what the assistant should
# do for that account, and is asserted by the Playwright suite.
#
# Offsets are never reused: an account seeded by an earlier revision of this script keeps
# its id, so `--teardown` can still reap it (see `_RETIRED_OFFSETS`).
COHORTS = [
    {
        "key": "explicit_on",
        "offset": 4,
        "setting": True,
        "expected": True,
        "why": "turned the assistant on, or never turned it off — also the state a "
               "brand-new account is in, since registration writes the key outright",
    },
    {
        "key": "explicit_off",
        "offset": 5,
        "setting": False,
        "expected": False,
        "why": "turned it off through the settings page — the opt-out the switch exists for",
    },
    {
        "key": "toggler",
        "offset": 6,
        "setting": True,
        "expected": True,
        # Scratch: the only account any test writes to. Kept out of the cohort matrix so a
        # failed mutation test cannot make unrelated assertions fail on the next run.
        "scratch": True,
        "why": "scratch account for the tests that drive the settings toggle",
    },
    {
        "key": "enable_landing",
        "offset": 7,
        "setting": False,
        "expected": False,
        # Scratch: the landing page turns this account on mid-test. It needs an account
        # that starts off, and `explicit_off` cannot be it — that one is read-only, and
        # other tests assert it is off while this test would be flipping it.
        "scratch": True,
        "why": "scratch account the /enable-library-assistant landing test turns on",
    },
]

# Offsets this script used to seed. They are still torn down, because the accounts they
# created can log in and nothing else would ever reap them.
_RETIRED_OFFSETS = (1, 2, 3)


def _uid_for_offset(offset):
    return SYNTHETIC_USER_ID_FLOOR + _OFFSET_BASE + offset


def _uid(cohort):
    return _uid_for_offset(cohort["offset"])


def _reapable_uids():
    return [_uid(c) for c in COHORTS] + [_uid_for_offset(o) for o in _RETIRED_OFFSETS]


def _email(cohort):
    return f"la-e2e-{cohort['key'].replace('_', '-')}@example.com"


def _purge():
    # Every deletion here is keyed to this exact id list, never to a range or a pattern.
    # `purge_test_profiles` additionally asserts every id is at or above
    # `SYNTHETIC_USER_ID_FLOOR`, so a wrong id raises instead of removing a real profile.
    uids = _reapable_uids()
    purge_test_profiles(*uids)
    UserExperimentSettings.objects.filter(user_id__in=uids).delete()
    User.objects.filter(id__in=uids).delete()


def _seed_one(cohort):
    uid = _uid(cohort)
    email = _email(cohort)

    # Sefaria authenticates by email through `emailusernames`, which stores a hash of the
    # address in `username` and looks accounts up by that hash. An account created with
    # any other username exists in the admin but cannot log in — and `create_user` there
    # can't take an explicit id, so the username is derived here instead.
    user, created = User.objects.get_or_create(
        id=uid,
        defaults={"username": _email_to_username(email), "email": email},
    )
    user.username = _email_to_username(email)
    if created or not user.check_password(PASSWORD):
        user.set_password(PASSWORD)
    user.email = email
    user.is_active = True
    user.save()

    # The assistant does not read the parked experiments framework, but a whitelist row
    # left behind by an earlier seeding would still put its toggle on the settings page.
    UserExperimentSettings.objects.filter(user=user).delete()

    profile = UserProfile(id=uid)
    profile.settings[SETTING_KEY] = cohort["setting"]
    profile.save()

    return {
        "key": cohort["key"],
        "id": uid,
        "email": email,
        "password": PASSWORD,
        "expected": cohort["expected"],
        "scratch": cohort.get("scratch", False),
        "why": cohort["why"],
    }


def _observed(uid):
    profile = db.profiles.find_one({"id": uid}) or {}
    settings = profile.get("settings", {})
    return {
        "profile": bool(profile),
        "setting": settings.get(SETTING_KEY, "-"),
    }


def _report(stream=sys.stdout):
    print(f"{'cohort':<14} {'uid':>12}  {'setting':<8}", file=stream)
    print("-" * 40, file=stream)
    for cohort in COHORTS:
        uid = _uid(cohort)
        state = _observed(uid)
        marker = "" if state["profile"] else "  (no profile document)"
        print(
            f"{cohort['key']:<14} {uid:>12}  {str(state['setting']):<8}{marker}",
            file=stream,
        )


def _teardown():
    uids = _reapable_uids()
    profiles = db.profiles.count_documents({"id": {"$in": uids}})
    rows = UserExperimentSettings.objects.filter(user_id__in=uids).count()
    users = User.objects.filter(id__in=uids).count()

    _purge()

    try:
        MANIFEST.unlink()
        manifest = f"removed {MANIFEST}"
    except FileNotFoundError:
        manifest = f"no manifest at {MANIFEST}"
    except OSError as error:
        manifest = f"could not remove {MANIFEST} ({error})"

    print(
        f"Removed {users} accounts, {rows} experiment rows, "
        f"{profiles} profile documents; {manifest}."
    )


def seed(reset=False, report=False, manifest_stdout=False, teardown=False):
    if teardown:
        _teardown()
        return

    if report:
        _report()
        return

    if reset:
        _purge()

    accounts = [_seed_one(cohort) for cohort in COHORTS]
    manifest = json.dumps({"password": PASSWORD, "accounts": accounts}, indent=2) + "\n"

    # With --manifest-stdout, stdout carries the manifest and nothing else, so the run can
    # be redirected into the file the suite reads. Everything a human wants goes to stderr.
    summary = sys.stderr if manifest_stdout else sys.stdout
    if manifest_stdout:
        sys.stdout.write(manifest)

    # The filesystem may be read-only, and the manifest is the point of the run: say so
    # rather than dying, and emit the JSON so a failed write cannot lose it.
    try:
        MANIFEST.write_text(manifest)
        destination = str(MANIFEST)
    except OSError as error:
        if not manifest_stdout:
            summary.write(manifest)
        destination = f"NOT written to {MANIFEST} ({error}) — copy the JSON above"

    print(f"Seeded {len(accounts)} accounts; manifest at {destination}\n", file=summary)
    _report(stream=summary)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Library Assistant e2e accounts.")
    parser.add_argument("--reset", action="store_true", help="delete the accounts first, then reseed")
    parser.add_argument("--report", action="store_true", help="print current state without writing")
    parser.add_argument(
        "--manifest-stdout",
        action="store_true",
        help="print only the manifest JSON to stdout; send the summary to stderr",
    )
    parser.add_argument(
        "--teardown", action="store_true", help="delete the accounts and the manifest, then stop"
    )
    seed(**vars(parser.parse_args()))
