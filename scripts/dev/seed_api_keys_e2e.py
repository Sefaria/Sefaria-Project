# -*- coding: utf-8 -*-
"""
Seed and tear down the accounts, projects and API keys the API keys end-to-end suites use.

The names, ids, states and manifest format are fixed by e2e-tests/api-keys/CONTRACT.md. Every
account sits in the id band 2_098_000_001..2_098_000_999, every project carries the run marker
``E2E api-keys <runId> (temporary)`` and is neither published nor consented for display, and every
deletion is keyed to an exact id list or that marker.

Projects and keys are written through powered_by.developer, so the database triggers notify the
auth service exactly as they do for a real developer.

Usage (local stack, from the repo root, with the stack's settings module):
    python scripts/dev/seed_api_keys_e2e.py --target local --reset
    python scripts/dev/seed_api_keys_e2e.py --target local --report
    python scripts/dev/seed_api_keys_e2e.py --target local --teardown --dry-run
    python scripts/dev/seed_api_keys_e2e.py --target local --teardown
    python scripts/dev/seed_api_keys_e2e.py --target local --manifest-stdout > e2e-tests/.apikeys-e2e.json
    python scripts/dev/seed_api_keys_e2e.py --target local --reset-send-limits onboarding.unverified
    python scripts/dev/seed_api_keys_e2e.py --target local --mint-expired-link onboarding.expiredLink
    python scripts/dev/seed_api_keys_e2e.py --target local --legacy-key callers.legacy
    python scripts/dev/seed_api_keys_e2e.py --target local --ensure-sentinel
    python scripts/dev/seed_api_keys_e2e.py --target local --leftovers

Inside a cluster pod the script is read from stdin, so neither it nor the password appears in
the exec arguments. The password goes first, as a one-line preamble:
    { printf 'APIKEYS_E2E_PASSWORD = %s\\n' "$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1]).read().strip()))' "$PWFILE")";
      cat scripts/dev/seed_api_keys_e2e.py; } |
      kubectl exec -i "$POD" -c web -- sh -c 'cd /app && python - --target cauldron --reset --manifest-stdout'
``manage.py shell --no-imports`` works too, with ``APIKEYS_SEED_ARGV = [...]`` in the preamble
(without --no-imports, Django prints its auto-import banner on stdout and breaks the manifest).

The password is read from the preamble or from the file named by APIKEYS_E2E_PASSWORD_FILE, never
from argv, and is never printed. Key values appear only in the manifest.
"""

import argparse
import base64
import json
import os
import re
import secrets
import sys
import time
from datetime import datetime, timedelta, timezone as dt_timezone
from pathlib import Path
from unittest.mock import patch


ID_BASE = 2_098_000_000
ID_FLOOR = ID_BASE + 1
ID_CEILING = ID_BASE + 999
SYNTHETIC_USER_ID_FLOOR = 2_000_000_000

MARKER_TEMPLATE = "E2E api-keys {run_id} (temporary)"
MARKER_RE = re.compile(r"^E2E api-keys (\S+) \(temporary\)$")
MARKER_SQL_LIKE = "E2E api-keys % (temporary)"
SENTINEL_NOTE = "E2E api-keys stack sentinel (local only)"

SITE_A = "https://site-a.example.com"

LOCAL_PG_PORTS = {"55432"}
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}

EXPIRED_LINK_AGE = timedelta(days=3, minutes=5)

# n, suite, role, state, developer project keys, why.
# A key spec is (name, options); options: restricted, revoked.
# A state of F8 gets a developer project; "listing" adds one unclaimed Powered by listing.
ACCOUNTS = [
    (1, "gateway", "open", "F8", [("open", {})], "A1, A2: a valid key with no website restriction"),
    (2, "gateway", "restricted", "F8", [("restricted", {"restricted": True})],
     "A3: a key restricted to https://site-a.example.com"),
    (3, "gateway", "revoked", "F8", [("revoked", {"revoked": True})], "A4: a revoked key is refused"),
    (4, "gateway", "deletedProject", "F8", [("deletedProject", {})],
     "A4: the key of a project deleted through delete_project is refused"),
    (5, "gateway", "full5", "F8", [("full5.%d" % i, {}) for i in range(1, 6)], "A5, N-A7: a project at the 5-key limit"),
    (101, "onboarding", "unverified", "F1", None, "C1, C2: an unconfirmed password account that never started"),
    (102, "onboarding", "unverifiedResend", "F1", None, "C1, N-C3: resend limits on a fresh unconfirmed account"),
    (103, "onboarding", "expiredLink", "F2", None, "C1: a confirmation link older than its 3 days"),
    (104, "onboarding", "ssoVerified", "F4", None, "C2: a Google login that verified the account email"),
    (105, "onboarding", "ssoUnverified", "F5", None, "C2: a Google login that did not verify the account email"),
    (201, "projects", "setUp", "F7", None, "N-C9, N-C13: a set-up developer with no projects"),
    (202, "projects", "listingOwner", "F9", None, "N-C14: one unclaimed Powered by listing with this email"),
    (203, "projects", "otherAccount", "F7", None, "N-C13: another account that must not see the first one's projects"),
    (301, "keys", "setUp", "F8", [], "A9, C3: a project with no keys yet"),
    (302, "keys", "twoTabs", "F8", [("twoTabs.%d" % i, {}) for i in range(1, 5)], "C4, N-C12: a project at 4 of 5 keys"),
    (401, "account", "password", "F13", None, "B2, N-M2: password and email changes in Account settings"),
    (402, "account", "hebrew", "F12+F13", None, "N-M3: Account settings in Hebrew"),
    (403, "account", "gauth", "F13", None, "N-C6: an account with a Google login"),
    (404, "account", "toDelete", "F8", [("toDelete", {})], "N-M6: delete the account, then use its key"),
    (501, "callers", "mobile", "F13", None, "B6: mobile-app style calls"),
    (502, "callers", "eval", "F13", None, "B7: eval-harness style calls"),
    (503, "callers", "legacy", "F13", None, "B10: a legacy Mongo API key, added with --legacy-key"),
    (601, "a11y", "setUp", "F8+F9", [("a11y.1", {})], "C10: keyboard and screen reader pass with a listing pending"),
    (602, "a11y", "hebrew", "F12+F8", [("a11yHe.1", {})], "C10: the same pass in Hebrew"),
    (701, "scenarios", "legacyBody", "F13", None, "B9: a legacy Mongo API key in the request body"),
    (702, "scenarios", "tierOwner", "F8", [("tierOwner", {})], "N-A11, E1: a key whose project tier changes"),
]

SENTINEL = (901, "stack", "sentinel", "F8", [("sentinel", {})], "keeps the local registry non-empty")


# --- Identity -----------------------------------------------------------------

def account_id(n, base=None):
    return (ID_BASE if base is None else base) + n


def account_email(suite, role):
    return "apikeys-e2e-{}-{}@example.com".format(suite, role).lower()


def role_key(suite, role):
    return "{}.{}".format(suite, role)


def account_specs(include_sentinel=False):
    specs = list(ACCOUNTS)
    if include_sentinel:
        specs.append(SENTINEL)
    return specs


def spec_for(role_name):
    for spec in account_specs(include_sentinel=True):
        if role_key(spec[1], spec[2]).lower() == role_name.lower():
            return spec
    raise SystemExit("Unknown role {!r}. Use suite.role, e.g. onboarding.unverified.".format(role_name))


def fixture_ids(include_sentinel=False, base=None):
    ids = [account_id(spec[0], base) for spec in account_specs(include_sentinel)]
    check_ids(ids, base)
    return ids


def fixture_emails(include_sentinel=False):
    return [account_email(spec[1], spec[2]) for spec in account_specs(include_sentinel)]


def check_ids(ids, base=None):
    base = ID_BASE if base is None else base
    bad = [i for i in ids if not (base + 1 <= i <= base + 999) or i < SYNTHETIC_USER_ID_FLOOR]
    if bad:
        raise AssertionError("refusing to touch user ids outside the fixture band: {}".format(bad))


def new_run_id(target):
    return os.environ.get("APIKEYS_RUN_ID") or "{}-{}".format(
        datetime.now(dt_timezone.utc).strftime("%Y%m%dT%H%MZ"), target)


def marker_for(run_id):
    return MARKER_TEMPLATE.format(run_id=run_id)


def mask(value):
    return (value or "")[:4] + "…" if value else ""


# --- Password -----------------------------------------------------------------

def read_password(preamble=None):
    if preamble:
        return preamble
    path = os.environ.get("APIKEYS_E2E_PASSWORD_FILE")
    if not path:
        raise SystemExit("Set APIKEYS_E2E_PASSWORD_FILE to a file holding the shared password.")
    try:
        password = Path(path).read_text().strip()
    except OSError as error:
        raise SystemExit("Cannot read the password file named by APIKEYS_E2E_PASSWORD_FILE ({}).".format(error))
    if len(password) < 12:
        raise SystemExit("The e2e password must be at least 12 characters.")
    return password


# --- Target guard ---------------------------------------------------------------

def cauldron_name():
    name = os.environ.get("APIKEYS_CAULDRON", "apikeys-pipeline")
    if not re.fullmatch(r"[a-z0-9-]+", name):
        raise SystemExit("Refusing: APIKEYS_CAULDRON={!r} is not a cauldron name.".format(name))
    return name


def guard_target(target):
    """Refuses to run anywhere but the local stack's Postgres or the cauldron named by APIKEYS_CAULDRON."""
    from django.conf import settings

    env_target = os.environ.get("APIKEYS_TARGET")
    if env_target and env_target != target:
        raise SystemExit("APIKEYS_TARGET={} disagrees with --target {}.".format(env_target, target))
    db = settings.DATABASES["default"]
    if "postgresql" not in db.get("ENGINE", ""):
        raise SystemExit("Refusing: the default database is not Postgres ({}).".format(db.get("ENGINE")))
    if db.get("NAME") != "sefaria_auth":
        raise SystemExit("Refusing: the default database is {!r}, not 'sefaria_auth'.".format(db.get("NAME")))
    host = str(db.get("HOST") or "")
    port = str(db.get("PORT") or "")
    if target == "local":
        allowed_ports = LOCAL_PG_PORTS | set(filter(None, [os.environ.get("APIKEYS_SEED_LOCAL_PG_PORT")]))
        if host not in LOOPBACK_HOSTS or port not in allowed_ports:
            raise SystemExit("Refusing: --target local needs the local stack's Postgres on 127.0.0.1:55432, "
                             "not {}:{}.".format(host, port))
    elif target == "cauldron":
        if host in LOOPBACK_HOSTS:
            raise SystemExit("Refusing: --target cauldron but the database is on this machine.")
        if not getattr(settings, "DEVELOPER_SETTINGS_MOCKS", False):
            raise SystemExit("Refusing: --target cauldron needs DEVELOPER_SETTINGS_MOCKS on.")
        name = cauldron_name()
        domains = json.dumps(getattr(settings, "DOMAIN_MODULES", {}) or {})
        if name not in domains:
            raise SystemExit("Refusing: this pod's DOMAIN_MODULES does not name the {} cauldron.".format(name))
    else:
        raise SystemExit("--target must be local or cauldron.")


# --- Seeding ------------------------------------------------------------------

def _states(state):
    return set(state.split("+"))


def _ensure_user(n, suite, role, password, base=None):
    from django.contrib.auth.models import User
    from emailusernames.utils import _email_to_username

    uid = account_id(n, base)
    check_ids([uid], base)
    email = account_email(suite, role)
    user, _ = User.objects.get_or_create(id=uid, defaults={"username": _email_to_username(email), "email": email})
    user.username = _email_to_username(email)
    user.email = email
    user.first_name = "E2E"
    user.last_name = "{} {}".format(suite.capitalize(), role)
    user.is_active = True
    user.is_staff = False
    user.is_superuser = False
    if password is not None and not user.check_password(password):
        user.set_password(password)
    user.save()
    return user


def _apply_state(user, suite, role, state):
    from allauth.account.models import EmailAddress
    from allauth.socialaccount.models import SocialAccount
    from powered_by import developer
    from sefaria.model.user_profile import UserProfile

    states = _states(state)
    developer_states = {"F7", "F8", "F9"}
    verified = bool(states & developer_states)

    EmailAddress.objects.filter(user=user).delete()
    SocialAccount.objects.filter(user=user).delete()
    if verified:
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
    elif "F2" in states:
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=False)
    if states & {"F4", "F5"} or role == "gauth":
        SocialAccount.objects.create(
            user=user, provider="google", uid="apikeys-e2e-{}".format(user.id),
            extra_data={"email": user.email, "email_verified": "F5" not in states,
                        "name": user.get_full_name()},
        )

    profile = UserProfile(id=user.id)
    for setting in (developer.ENABLED_SETTING, developer.PROFILE_SETTING, developer.CONFIRMATION_SENT_SETTING,
                    developer.CONFIRMATION_SENT_TO_SETTING, developer.CONFIRMATION_SENDS_SETTING,
                    developer.DISMISSED_LISTINGS_SETTING):
        profile.settings.pop(setting, None)
    profile.settings["interface_language"] = "hebrew" if "F12" in states else "english"
    if verified:
        profile.settings[developer.ENABLED_SETTING] = True
        profile.settings[developer.PROFILE_SETTING] = developer.clean_profile({
            "developerName": user.get_full_name(),
            "description": "End-to-end test account ({}).".format(role_key(suite, role)),
            "termsAccepted": True,
        })
    if "F2" in states:
        sent = datetime.now(dt_timezone.utc) - EXPIRED_LINK_AGE
        profile.settings[developer.CONFIRMATION_SENT_SETTING] = developer.iso(sent)
        profile.settings[developer.CONFIRMATION_SENT_TO_SETTING] = user.email.lower()
        profile.settings[developer.CONFIRMATION_SENDS_SETTING] = [developer.iso(sent)]
    profile.save()


def _create_developer_project(user, suite, role, key_specs, notes):
    from powered_by import developer
    from powered_by.models import Project

    project = developer.create_project(user, {
        "name": "E2E {} {}".format(suite, role),
        "description": "Temporary end-to-end test project.",
        "organization": "",
        "websiteUrl": SITE_A,
        "visibility": "private",
        "aiAssisted": False,
    })
    Project.objects.filter(id=project.id).update(notes=notes, is_published=False, consent_to_display=False)
    for name, options in key_specs:
        api_key = developer.create_key(user, project.id, name)
        if options.get("restricted"):
            developer.set_key_restriction(user, str(api_key.id), True)
        if options.get("revoked"):
            developer.revoke_key(user, str(api_key.id))
    if role == "deletedProject":
        developer.delete_project(user, project.id)
    return project


def _create_listing(user, suite, role, notes):
    from django.utils import timezone
    from powered_by.models import Project, SubmissionSource

    return Project.objects.create(
        submission_source=SubmissionSource.MANUAL,
        submission_date=timezone.now(),
        creator=user.get_full_name(),
        creator_email=user.email,
        project_name="E2E listing {} {}".format(suite, role),
        project_link="https://listing-{}.example.com".format(role.lower()),
        project_desc="Temporary end-to-end test listing.",
        consent_to_display=False,
        is_published=False,
        notes=notes,
    )


def _seed_account(spec, password, marker, base=None, notes=None):
    n, suite, role, state, key_specs, _ = spec
    user = _ensure_user(n, suite, role, password, base)
    _apply_state(user, suite, role, state)
    states = _states(state)
    if "F8" in states:
        _create_developer_project(user, suite, role, key_specs or [], notes or marker)
    if "F9" in states:
        _create_listing(user, suite, role, notes or marker)
    return user


def reset(target, password, run_id=None, base=None):
    run_id = run_id or new_run_id(target)
    marker = marker_for(run_id)
    teardown(include_sentinel=False, base=base)
    for spec in ACCOUNTS:
        _seed_account(spec, password, marker, base)
    return run_id


def ensure_sentinel(password, base=None):
    """The local stack's always-present key, so the auth service's empty-registry guard passes."""
    from powered_by.models import ApiKey

    uid = account_id(SENTINEL[0], base)
    if ApiKey.objects.filter(project__owner_id=uid, project__notes=SENTINEL_NOTE, revoked_at__isnull=True).exists():
        return False
    _seed_account(SENTINEL, password, marker=None, base=base, notes=SENTINEL_NOTE)
    return True


# --- Teardown -----------------------------------------------------------------

def _fixture_projects(include_sentinel=False, base=None):
    from django.db.models import Q
    from powered_by.models import Project

    ids = fixture_ids(include_sentinel, base)
    emails = fixture_emails(include_sentinel)
    query = Q(notes__regex=MARKER_RE.pattern) | Q(owner_id__in=ids) | Q(owner__isnull=True, creator_email__in=emails)
    if include_sentinel:
        query |= Q(notes=SENTINEL_NOTE)
    projects = Project.objects.filter(query)
    if not include_sentinel:
        projects = projects.exclude(notes=SENTINEL_NOTE).exclude(owner_id=account_id(SENTINEL[0], base))
    return projects


def teardown_plan(include_sentinel=False, base=None):
    """What a teardown would remove, without removing anything."""
    from django.contrib.auth.models import User
    from powered_by.models import ApiKey

    ids = fixture_ids(include_sentinel, base)
    projects = list(_fixture_projects(include_sentinel, base).order_by("id").values_list("id", "project_name", "notes"))
    return {
        "users": list(User.objects.filter(id__in=ids).order_by("id").values_list("id", flat=True)),
        "projects": projects,
        "keys": ApiKey.objects.filter(project_id__in=[p[0] for p in projects]).count(),
        "legacyKeys": _legacy_db().apikeys.count_documents({"uid": {"$in": ids}}),
        "profiles": _legacy_db().profiles.count_documents({"id": {"$in": ids}}),
    }


def _legacy_db():
    from sefaria.system.database import db
    return db


def teardown(include_sentinel=False, base=None):
    """
    Keys, then projects (by marker, by fixture owner, or unclaimed with a fixture email), then
    legacy keys and Mongo profiles by the exact id list, then the accounts by that list.
    """
    from django.contrib.auth.models import User
    from django.db import transaction
    from powered_by.models import ApiKey, Project

    ids = fixture_ids(include_sentinel, base)
    db = _legacy_db()
    with transaction.atomic():
        projects = list(_fixture_projects(include_sentinel, base).values_list("id", flat=True))
        keys = ApiKey.objects.filter(project_id__in=projects).delete()[0]
        project_count = Project.objects.filter(id__in=projects).delete()[0]
        users = User.objects.filter(id__in=ids).count()
        User.objects.filter(id__in=ids).delete()
    legacy = db.apikeys.delete_many({"uid": {"$in": ids}}).deleted_count
    purge_profiles(ids, base)
    return {"keys": keys, "projects": project_count, "users": users, "legacyKeys": legacy}


def purge_profiles(ids, base=None):
    check_ids(ids, base)
    _legacy_db().profiles.delete_many({"id": {"$in": ids}})


def leftovers(include_sentinel=False, base=None):
    from django.db.models import Q
    from django.contrib.auth.models import User
    from powered_by.models import ApiKey, Project

    base = ID_BASE if base is None else base
    in_band = Q(id__gte=base + 1, id__lte=base + 999)
    owned = Q(owner_id__gte=base + 1, owner_id__lte=base + 999)
    mongo_band = {"$gte": base + 1, "$lte": base + 999}
    if not include_sentinel:
        sentinel_id = account_id(SENTINEL[0], base)
        in_band &= ~Q(id=sentinel_id)
        owned &= ~Q(owner_id=sentinel_id)
        mongo_band["$ne"] = sentinel_id
    projects = Project.objects.filter(Q(notes__regex=MARKER_RE.pattern) | owned)
    db = _legacy_db()
    return {
        "users": User.objects.filter(in_band).count(),
        "projects": projects.count(),
        "keys": ApiKey.objects.filter(project__in=projects).count(),
        "profiles": db.profiles.count_documents({"id": mongo_band}),
        "legacyKeys": db.apikeys.count_documents({"uid": mongo_band}),
    }


# --- Extra modes ----------------------------------------------------------------

def reset_send_limits(role_name, base=None):
    from powered_by import developer
    from sefaria.model.user_profile import UserProfile

    spec = spec_for(role_name)
    uid = account_id(spec[0], base)
    check_ids([uid], base)
    profile = UserProfile(id=uid)
    profile.settings.pop(developer.CONFIRMATION_SENDS_SETTING, None)
    profile.save()


def expired_link_path(user, age=EXPIRED_LINK_AGE):
    from powered_by import developer

    sent = time.time() - age.total_seconds()
    with patch("django.core.signing.time.time", return_value=sent):
        key = developer.confirmation_for(user).key
    return "/settings/developer/confirm-email/" + key


def mint_expired_link(role_name, base=None):
    from django.contrib.auth.models import User

    spec = spec_for(role_name)
    user = User.objects.get(id=account_id(spec[0], base))
    return {"suite": spec[1], "role": spec[2], "email": user.email, "path": expired_link_path(user)}


def new_legacy_key_value():
    return base64.b64encode(secrets.token_bytes(32), altchars=b"rA").rstrip(b"=").decode("ascii")


def add_legacy_key(role_name, base=None):
    from django.contrib.auth.models import User

    spec = spec_for(role_name)
    uid = account_id(spec[0], base)
    check_ids([uid], base)
    if not User.objects.filter(id=uid).exists():
        raise SystemExit("Seed {} first (--reset).".format(role_name))
    db = _legacy_db()
    db.apikeys.delete_many({"uid": uid})
    db.apikeys.insert_one({"uid": uid, "key": new_legacy_key_value()})


# --- Manifest and report ------------------------------------------------------

def _role_by_id(base=None):
    return {account_id(spec[0], base): spec for spec in account_specs(include_sentinel=True)}


def current_run_id(base=None):
    for notes in _fixture_projects(base=base).values_list("notes", flat=True):
        match = MARKER_RE.match(notes or "")
        if match:
            return match.group(1)
    return None


def build_manifest(target, password_file="", base=None):
    from django.contrib.auth.models import User
    from powered_by.models import ApiKey, SubmissionSource

    roles = _role_by_id(base)
    run_id = current_run_id(base)
    users = {u.id: u for u in User.objects.filter(id__in=list(roles))}
    accounts = []
    for uid, spec in sorted(roles.items()):
        user = users.get(uid)
        if user is None:
            continue
        entry = {"suite": spec[1], "role": spec[2], "id": uid, "email": user.email, "state": spec[3], "why": spec[5]}
        if "F2" in _states(spec[3]):
            entry["expiredLinkPath"] = expired_link_path(user)
        accounts.append(entry)

    projects, keys = [], []
    for project in _fixture_projects(include_sentinel=True, base=base).order_by("id"):
        owner_spec = roles.get(project.owner_id) or next(
            (s for s in roles.values() if account_email(s[1], s[2]) == (project.creator_email or "").lower()), None)
        suite, role = (owner_spec[1], owner_spec[2]) if owner_spec else ("", "")
        projects.append({
            "suite": suite, "role": role, "id": project.id, "name": project.project_name,
            "kind": "developer" if project.submission_source == SubmissionSource.DEVELOPER_SETTINGS else "listing",
            "deleted": project.deleted_at is not None, "ownerId": project.owner_id,
        })
        for api_key in ApiKey.objects.filter(project=project).order_by("created_at"):
            keys.append({
                "suite": suite, "role": role, "name": api_key.label, "id": str(api_key.id), "projectId": project.id,
                "value": api_key.key, "allowedOrigins": list(api_key.allowed_origins or []),
                "revoked": api_key.revoked_at is not None,
            })

    legacy = []
    for row in _legacy_db().apikeys.find({"uid": {"$in": list(roles)}}):
        spec = roles[row["uid"]]
        legacy.append({"suite": spec[1], "role": spec[2], "value": row["key"], "mongoId": str(row["_id"])})

    return {
        "schemaVersion": 1,
        "target": target,
        "baseURL": {"local": "http://www.gateway.test:10080",
                    "cauldron": "https://www.{}.cauldron.sefaria.org".format(cauldron_name())}[target],
        "runId": run_id,
        "marker": marker_for(run_id) if run_id else None,
        "createdAt": datetime.now(dt_timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "passwordFile": os.environ.get("APIKEYS_E2E_PASSWORD_FILE", ""),
        "accounts": accounts,
        "projects": projects,
        "keys": keys,
        "legacyKeys": legacy,
    }


def report(stream, base=None):
    from allauth.account.models import EmailAddress
    from django.contrib.auth.models import User
    from powered_by import developer
    from powered_by.models import ApiKey, Project
    from sefaria.model.user_profile import UserProfile

    print("run marker: {}".format(marker_for(current_run_id(base)) if current_run_id(base) else "(none)"), file=stream)
    header = "{:<28} {:>10} {:<8} {:<5} {:<4} {:<4} {:<4} {:>4} {:>8} {:>4}".format(
        "role", "id", "state", "user", "ver", "sso", "dev", "proj", "keys", "list")
    print(header, file=stream)
    print("-" * len(header), file=stream)
    for uid, spec in sorted(_role_by_id(base).items()):
        user = User.objects.filter(id=uid).first()
        if user is None:
            print("{:<28} {:>10} {:<8} no".format(role_key(spec[1], spec[2]), uid, spec[3]), file=stream)
            continue
        settings = UserProfile(id=uid).settings
        verified = EmailAddress.objects.filter(user=user, email__iexact=user.email, verified=True).exists()
        sso = user.socialaccount_set.filter(provider="google").exists()
        dev = bool(settings.get(developer.ENABLED_SETTING) and settings.get(developer.PROFILE_SETTING))
        owned = Project.objects.filter(owner=user)
        active = ApiKey.objects.filter(project__owner=user, revoked_at__isnull=True).count()
        total = ApiKey.objects.filter(project__owner=user).count()
        listings = Project.objects.filter(owner__isnull=True, creator_email__iexact=user.email).count()
        print("{:<28} {:>10} {:<8} {:<5} {:<4} {:<4} {:<4} {:>4} {:>8} {:>4}".format(
            role_key(spec[1], spec[2]), uid, spec[3], "yes", _yn(verified), _yn(sso), _yn(dev),
            owned.count(), "{}/{}".format(active, total), listings), file=stream)
    for row in _legacy_db().apikeys.find({"uid": {"$in": list(_role_by_id(base))}}):
        print("legacy key for {} ({})".format(row["uid"], mask(row["key"])), file=stream)


def _yn(value):
    return "yes" if value else "no"


def print_leftovers(stream, include_sentinel=False, base=None):
    counts = leftovers(include_sentinel, base)
    total = sum(counts.values())
    print("leftovers: {} ({})".format(total, ", ".join("{}={}".format(k, v) for k, v in counts.items())), file=stream)
    return total


# --- Entry point --------------------------------------------------------------

def parse_args(argv):
    parser = argparse.ArgumentParser(description="Seed or tear down the API keys e2e fixtures.")
    parser.add_argument("--target", choices=["local", "cauldron"], required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--reset", action="store_true", help="tear down, then recreate every fixture")
    mode.add_argument("--report", action="store_true", help="print the fixtures' state; writes nothing")
    mode.add_argument("--teardown", action="store_true", help="remove every fixture, then print the leftover count")
    mode.add_argument("--leftovers", action="store_true", help="print the leftover count; exit 1 if not 0")
    mode.add_argument("--write-manifest", action="store_true", help="write the manifest of the current fixtures")
    mode.add_argument("--reset-send-limits", metavar="SUITE.ROLE", help="clear the account's confirmation send history")
    mode.add_argument("--mint-expired-link", metavar="SUITE.ROLE", help="print a confirmation link 3 days old")
    mode.add_argument("--legacy-key", metavar="SUITE.ROLE", help="give the account a legacy Mongo API key")
    mode.add_argument("--ensure-sentinel", action="store_true", help="local only: create the stack sentinel key")
    parser.add_argument("--manifest-stdout", action="store_true",
                        help="put the manifest, and nothing else, on stdout (alone: read-only manifest)")
    parser.add_argument("--include-sentinel", action="store_true", help="with --teardown/--leftovers: the sentinel too")
    parser.add_argument("--dry-run", action="store_true", help="with --teardown: list what would be removed")
    if "--manifest-stdout" in argv and not any(a in argv for a in (
            "--reset", "--report", "--teardown", "--leftovers", "--write-manifest", "--reset-send-limits",
            "--mint-expired-link", "--legacy-key", "--ensure-sentinel")):
        argv = list(argv) + ["--write-manifest"]
    return parser.parse_args(argv)


def _manifest_path():
    if os.environ.get("APIKEYS_MANIFEST"):
        return Path(os.environ["APIKEYS_MANIFEST"])
    this_file = globals().get("__file__") or ""
    root = Path(this_file).resolve().parents[2] if this_file.endswith("seed_api_keys_e2e.py") else Path.cwd()
    return root / "e2e-tests" / ".apikeys-e2e.json"


def emit_manifest(args):
    """With --manifest-stdout the manifest is the only thing on stdout; otherwise it goes to the file."""
    manifest = json.dumps(build_manifest(args.target), indent=2) + "\n"
    if args.manifest_stdout:
        sys.stdout.write(manifest)
        sys.stdout.flush()
        return "stdout"
    if args.target == "cauldron":
        raise SystemExit("On the cauldron the manifest goes to stdout only: add --manifest-stdout.")
    path = _manifest_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write(manifest)
    return str(path)


def setup_django():
    from django.apps import apps
    if apps.ready:
        return
    cwd = str(Path.cwd())
    if cwd not in sys.path:
        sys.path.insert(0, cwd)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
    import django
    django.setup()


def main(argv, password_preamble=None):
    args = parse_args(argv)
    setup_django()
    guard_target(args.target)
    out = sys.stderr if args.manifest_stdout else sys.stdout

    if args.ensure_sentinel and args.target != "local":
        raise SystemExit("The sentinel exists only on the local stack.")

    if args.report:
        report(out)
        print_leftovers(out)
        return 0
    if args.leftovers:
        return 1 if print_leftovers(out, args.include_sentinel) else 0
    if args.teardown and args.dry_run:
        plan = teardown_plan(include_sentinel=args.include_sentinel)
        print("would remove {} users ({}), {} projects, {} keys, {} legacy keys, {} profiles".format(
            len(plan["users"]), ", ".join(str(i) for i in plan["users"]) or "none", len(plan["projects"]),
            plan["keys"], plan["legacyKeys"], plan["profiles"]), file=out)
        for project_id, name, notes in plan["projects"]:
            print("  project {} {!r} notes={!r}".format(project_id, name, notes), file=out)
        return 0
    if args.teardown:
        removed = teardown(include_sentinel=args.include_sentinel)
        print("removed: {}".format(", ".join("{}={}".format(k, v) for k, v in removed.items())), file=out)
        if not args.manifest_stdout and args.target == "local":
            try:
                _manifest_path().unlink()
                print("removed manifest {}".format(_manifest_path()), file=out)
            except FileNotFoundError:
                pass
        return 1 if print_leftovers(out, args.include_sentinel) else 0
    if args.reset_send_limits:
        reset_send_limits(args.reset_send_limits)
        print("cleared confirmation sends of {}".format(args.reset_send_limits), file=out)
        return 0
    if args.mint_expired_link:
        link = mint_expired_link(args.mint_expired_link)
        sys.stdout.write(json.dumps(link) + "\n")
        return 0

    password = read_password(password_preamble) if (args.reset or args.ensure_sentinel) else None
    if args.reset:
        run_id = reset(args.target, password)
        print("seeded {} accounts, run {}".format(len(ACCOUNTS), run_id), file=out)
    elif args.ensure_sentinel:
        print("sentinel {}".format("created" if ensure_sentinel(password) else "already present"), file=out)
    elif args.legacy_key:
        add_legacy_key(args.legacy_key)
        print("legacy key set for {}".format(args.legacy_key), file=out)

    if args.ensure_sentinel and not args.manifest_stdout:
        return 0
    destination = emit_manifest(args)
    print("manifest: {}".format(destination), file=out)
    if args.reset:
        report(out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:], globals().get("APIKEYS_E2E_PASSWORD")))
elif "APIKEYS_SEED_ARGV" in globals():
    _status = main(globals()["APIKEYS_SEED_ARGV"], globals().get("APIKEYS_E2E_PASSWORD"))
    if _status:
        raise SystemExit(_status)
