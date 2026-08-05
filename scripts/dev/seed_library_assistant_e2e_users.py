# -*- coding: utf-8 -*-
"""
Seed the accounts the Library Assistant end-to-end suite logs in as.

The suite needs one account per cohort of the opt-out switch, in a known state, and it
needs them to survive the migration run that happens between its two passes. Registering
throwaway accounts per run would not do: the whole point of the beta cohorts is that they
predate the migration.

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

# whitelist_row is the Postgres `UserExperimentSettings.experiments` value, or None for a
# user who never enrolled. setting is `profiles.settings.library_assistant`, or None for a
# profile that does not carry the key. The two `expected_*` columns are what the assistant
# should do for that account, and are asserted by the Playwright suite.
COHORTS = [
    {
        "key": "beta_opt_in",
        "offset": 1,
        "whitelist_row": True,
        "experiments": True,
        "setting": None,
        "expected_pre": True,
        "expected_post": True,
        "why": "joined the beta and kept it on — on before the flip, on after",
    },
    {
        "key": "beta_opt_out",
        "offset": 2,
        "whitelist_row": False,
        "experiments": False,
        "setting": None,
        "expected_pre": False,
        "expected_post": False,
        "why": "joined the beta and turned it off — the deliberate opt-out the flip must preserve",
    },
    {
        "key": "never_chose",
        "offset": 3,
        "whitelist_row": None,
        "experiments": False,
        "setting": None,
        "expected_pre": False,
        "expected_post": True,
        "why": "never enrolled; carries experiments=False only because every profile save writes it",
    },
    {
        "key": "explicit_on",
        "offset": 4,
        "whitelist_row": None,
        "experiments": False,
        "setting": True,
        "expected_pre": True,
        "expected_post": True,
        "why": "already carries the key — the migration must skip it",
    },
    {
        "key": "explicit_off",
        "offset": 5,
        "whitelist_row": None,
        "experiments": False,
        "setting": False,
        "expected_pre": False,
        "expected_post": False,
        "why": "turned it off through the settings page — must stay off through the flip",
    },
    {
        "key": "toggler",
        "offset": 6,
        "whitelist_row": None,
        "experiments": False,
        "setting": True,
        "expected_pre": True,
        "expected_post": True,
        # Scratch: the only account any test writes to. Kept out of the cohort matrix so a
        # failed mutation test cannot make unrelated assertions fail on the next run.
        "scratch": True,
        "why": "scratch account for the tests that drive the settings toggle",
    },
    {
        "key": "enable_landing",
        "offset": 7,
        "whitelist_row": None,
        "experiments": False,
        "setting": False,
        "expected_pre": False,
        "expected_post": False,
        # Scratch: the landing page turns this account on mid-test. It needs an account
        # that starts off, and `explicit_off` cannot be it — that one is read-only, and
        # three other tests assert it is off while this test would be flipping it.
        "scratch": True,
        "why": "scratch account the /enable-library-assistant landing test turns on",
    },
]


def _uid(cohort):
    return SYNTHETIC_USER_ID_FLOOR + _OFFSET_BASE + cohort["offset"]


def _email(cohort):
    return f"la-e2e-{cohort['key'].replace('_', '-')}@example.com"


def _purge():
    # Every deletion here is keyed to this exact id list, never to a range or a pattern.
    # `purge_test_profiles` additionally asserts every id is at or above
    # `SYNTHETIC_USER_ID_FLOOR`, so a wrong id raises instead of removing a real profile.
    uids = [_uid(c) for c in COHORTS]
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

    if cohort["whitelist_row"] is None:
        UserExperimentSettings.objects.filter(user=user).delete()
    else:
        UserExperimentSettings.objects.update_or_create(
            user=user, defaults={"experiments": cohort["whitelist_row"]},
        )

    # Build the profile document directly rather than through `_set_user_experiments`:
    # that helper is the parked experiments framework's own write path, and going through
    # it would make the fixtures depend on code Phase 3 leaves behind.
    profile = UserProfile(id=uid)
    profile.experiments = bool(cohort["experiments"])
    profile.settings.pop(SETTING_KEY, None)
    if cohort["setting"] is not None:
        profile.settings[SETTING_KEY] = cohort["setting"]
    profile.save()

    # `UserProfile.update` deep-merges settings, so a key that must be *absent* has to be
    # unset on the stored document after the save rather than merely left out of it.
    if cohort["setting"] is None:
        db.profiles.update_one({"id": uid}, {"$unset": {f"settings.{SETTING_KEY}": ""}})

    return {
        "key": cohort["key"],
        "id": uid,
        "email": email,
        "password": PASSWORD,
        "expected_pre": cohort["expected_pre"],
        "expected_post": cohort["expected_post"],
        "scratch": cohort.get("scratch", False),
        "why": cohort["why"],
    }


def _observed(uid):
    profile = db.profiles.find_one({"id": uid}) or {}
    settings = profile.get("settings", {})
    row = UserExperimentSettings.objects.filter(user_id=uid).first()
    return {
        "profile": bool(profile),
        "row": None if row is None else row.experiments,
        "experiments": profile.get("experiments", "-"),
        "setting": settings.get(SETTING_KEY, "-"),
    }


def _report(stream=sys.stdout):
    print(
        f"{'cohort':<14} {'uid':>12}  {'row':<5} {'experiments':<11} {'setting':<8}",
        file=stream,
    )
    print("-" * 58, file=stream)
    for cohort in COHORTS:
        uid = _uid(cohort)
        state = _observed(uid)
        marker = "" if state["profile"] else "  (no profile document)"
        print(
            f"{cohort['key']:<14} {uid:>12}  {str(state['row']):<5} "
            f"{str(state['experiments']):<11} {str(state['setting']):<8}{marker}",
            file=stream,
        )


def _teardown():
    uids = [_uid(c) for c in COHORTS]
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
