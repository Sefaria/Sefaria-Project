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
    (umask 077; python scripts/dev/seed_api_keys_e2e.py --target local --manifest-stdout > e2e-tests/.apikeys-e2e.json)
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

The manifest holds full API keys. Redirect --manifest-stdout to a file under ``umask 077``; the script also
chmods a regular-file stdout to 0600, and writes its own manifest file (no --manifest-stdout) with mode 0600 even
over an older, wider file.

The password is read from the preamble or from the file named by APIKEYS_E2E_PASSWORD_FILE, never
from argv, and is never printed. Key values appear only in the manifest.
"""

import argparse
import base64
import json
import os
import re
import secrets
import stat
import sys
import time
from datetime import UTC, datetime, timedelta
from datetime import timezone as dt_timezone
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
# A state of F8 gets a developer project.
ACCOUNTS = [
    (1, "gateway", "open", "F8", [("open", {})], "A1, A2: a valid key with no website restriction"),
    (
        2,
        "gateway",
        "restricted",
        "F8",
        [("restricted", {"restricted": True})],
        "A3: a key restricted to https://site-a.example.com",
    ),
    (3, "gateway", "revoked", "F8", [("revoked", {"revoked": True})], "A4: a revoked key is refused"),
    (
        4,
        "gateway",
        "deletedProject",
        "F8",
        [("deletedProject", {})],
        "A4: the key of a project deleted through delete_project is refused",
    ),
    (
        5,
        "gateway",
        "full5",
        "F8",
        [("full5.%d" % i, {}) for i in range(1, 6)],
        "A5, N-A7: a project at the 5-key limit",
    ),
    (101, "onboarding", "unverified", "F1", None, "C1, C2: an unconfirmed password account that never started"),
    (102, "onboarding", "unverifiedResend", "F1", None, "C1, N-C3: resend limits on a fresh unconfirmed account"),
    (103, "onboarding", "expiredLink", "F2", None, "C1: a confirmation link older than its 3 days"),
    (104, "onboarding", "ssoVerified", "F4", None, "C2: a Google login that verified the account email"),
    (105, "onboarding", "ssoUnverified", "F5", None, "C2: a Google login that did not verify the account email"),
    (201, "projects", "setUp", "F7", None, "N-C9, N-C13: a set-up developer with no projects"),
    (203, "projects", "otherAccount", "F7", None, "N-C13: another account that must not see the first one's projects"),
    (301, "keys", "setUp", "F8", [], "A9, C3: a project with no keys yet"),
    (
        302,
        "keys",
        "twoTabs",
        "F8",
        [("twoTabs.%d" % i, {}) for i in range(1, 5)],
        "C4, N-C12: a project at 4 of 5 keys",
    ),
    (401, "account", "password", "F13", None, "B2, N-M2: password and email changes in Account settings"),
    (402, "account", "hebrew", "F12+F13", None, "N-M3: Account settings in Hebrew"),
    (403, "account", "gauth", "F13", None, "N-C6: an account with a Google login"),
    (404, "account", "toDelete", "F8", [("toDelete", {})], "N-M6: delete the account, then use its key"),
    (501, "callers", "mobile", "F13", None, "B6: mobile-app style calls"),
    (502, "callers", "eval", "F13", None, "B7: eval-harness style calls"),
    (503, "callers", "legacy", "F13", None, "B10: a legacy Mongo API key, added with --legacy-key"),
    (701, "scenarios", "legacyBody", "F13", None, "B9: a legacy Mongo API key in the request body"),
    (702, "scenarios", "tierOwner", "F8", [("tierOwner", {})], "N-A11, E1: a key whose project tier changes"),
]

SENTINEL = (901, "stack", "sentinel", "F8", [("sentinel", {})], "keeps the local registry non-empty")


# --- Identity -----------------------------------------------------------------


def account_id(n, base=None):
    return (ID_BASE if base is None else base) + n


def account_email(suite, role):
    return f"apikeys-e2e-{suite}-{role}@example.com".lower()


def role_key(suite, role):
    return f"{suite}.{role}"


def account_specs(include_sentinel=False):
    specs = list(ACCOUNTS)
    if include_sentinel:
        specs.append(SENTINEL)
    return specs


def spec_for(role_name):
    for spec in account_specs(include_sentinel=True):
        if role_key(spec[1], spec[2]).lower() == role_name.lower():
            return spec
    raise SystemExit(f"Unknown role {role_name!r}. Use suite.role, e.g. onboarding.unverified.")


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
        raise AssertionError(f"refusing to touch user ids outside the fixture band: {bad}")


def new_run_id(target):
    return os.environ.get("APIKEYS_RUN_ID") or "{}-{}".format(datetime.now(UTC).strftime("%Y%m%dT%H%MZ"), target)


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
        raise SystemExit(f"Cannot read the password file named by APIKEYS_E2E_PASSWORD_FILE ({error}).")
    if len(password) < 12:
        raise SystemExit("The e2e password must be at least 12 characters.")
    return password


# --- Target guard ---------------------------------------------------------------


def cauldron_name():
    name = os.environ.get("APIKEYS_CAULDRON", "apisplit")
    if not re.fullmatch(r"[a-z0-9-]+", name):
        raise SystemExit(f"Refusing: APIKEYS_CAULDRON={name!r} is not a cauldron name.")
    return name


def _domain_hosts(value):
    """Every host named as a value anywhere in a DOMAIN_MODULES value, scheme and trailing slash removed.

    Dict keys (language codes, module names) are not hosts and are skipped.
    """
    if isinstance(value, dict):
        return set().union(set(), *(_domain_hosts(v) for v in value.values()))
    if isinstance(value, (list, tuple, set)):
        return set().union(set(), *(_domain_hosts(v) for v in value))
    if isinstance(value, str):
        return {re.sub(r"^https?://", "", value).rstrip("/")}
    return set()


def require_mutation_consent(target):
    """A cauldron write needs APIKEYS_CAULDRON set explicitly and APIKEYS_ALLOW_MUTATING_ON repeating it exactly."""
    if target != "cauldron":
        return
    named, allowed = os.environ.get("APIKEYS_CAULDRON"), os.environ.get("APIKEYS_ALLOW_MUTATING_ON")
    if not named or named != allowed or named != cauldron_name():
        raise SystemExit(
            "Refusing: writing to the cauldron needs APIKEYS_CAULDRON and APIKEYS_ALLOW_MUTATING_ON "
            "both set, to the same cauldron name."
        )


# Why the cauldron guard looks like this
#
# Service names are identical in the dev and the production clusters (both have Services such as postgres-18 and a
# Mongo Service in the default namespace), so a hostname allow-list cannot tell a dev database from a production one.
# What proves which cluster the process runs in is, together:
#   1. the pod's own DOMAIN_MODULES, which a production pod can never have set to a *.cauldron.sefaria.org site
#      (checked here, inside the pod), and
#   2. the kube context the outer cauldron scripts pin to the development cluster before they exec into the pod
#      (e2e-tests/api-keys/cauldron/lib.sh: KCTX, the kc and seed_exec helpers).
# On top of that the database destinations must be in-cluster Kubernetes names, so a cauldron whose settings were
# pointed at an external host (a production Cloud SQL address, a public IP, a vendor FQDN) is refused.
# APIKEYS_UNSAFE_ALLOW_HOSTS can add hosts to the in-cluster rule only; it never relaxes the domain check.

UNSAFE_ALLOW_HOSTS_ENV = "APIKEYS_UNSAFE_ALLOW_HOSTS"
CAULDRON_DOMAIN_SUFFIX = "cauldron.sefaria.org"
PRODUCTION_DOMAINS = ("sefaria.org", "sefaria.org.il")
REGISTRY_DB_NAME = "sefaria_auth"

_LABEL = r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
_SINGLE_LABEL_RE = re.compile(rf"^{_LABEL}$")
_SERVICE_FQDN_RE = re.compile(rf"^{_LABEL}(?:\.{_LABEL})*\.svc(?:\.cluster\.local)?$")
LOOPBACK_NAMES = LOOPBACK_HOSTS | {"0.0.0.0", "::"}


def parse_hosts(value, default_port=None):
    """
    The (host, port) pairs of a Postgres HOST or a Mongo MONGO_HOST value: a string or a list, each entry
    possibly a comma list of ``host``, ``host:port`` or ``[v6]:port``. A host that is empty yields nothing.
    """
    if value is None:
        return []
    entries = []
    for item in value if isinstance(value, (list, tuple, set)) else [value]:
        entries.extend(part.strip() for part in str(item).split(","))
    pairs = []
    for entry in entries:
        if not entry:
            continue
        port = default_port
        if entry.startswith("["):
            host, _, rest = entry[1:].partition("]")
            if rest.startswith(":"):
                port = rest[1:]
        elif entry.count(":") == 1:
            host, port = entry.split(":")
        else:
            host = entry
        pairs.append((host.lower(), None if port is None else str(port)))
    return pairs


def is_in_cluster_name(host):
    """A single DNS label, or <service>[.<namespace>].svc[.cluster.local]. Never an IP, loopback or external FQDN."""
    if host in LOOPBACK_NAMES or host.isdigit():
        return False
    return bool(_SINGLE_LABEL_RE.match(host) or _SERVICE_FQDN_RE.match(host))


def _extra_allowed_hosts(environ):
    return {h.strip().lower() for h in environ.get(UNSAFE_ALLOW_HOSTS_ENV, "").split(",") if h.strip()}


def check_cauldron_domains(domain_hosts, name):
    """Every configured site domain must be the cauldron's own; no production host may appear."""
    own = f"{name}.{CAULDRON_DOMAIN_SUFFIX}"
    if not domain_hosts:
        raise SystemExit(f"Refusing: this pod's DOMAIN_MODULES names no site, so it is not the {name} cauldron.")
    for host in sorted(domain_hosts):
        bare = host.split("/")[0].split(":")[0].lower()
        if bare == own or bare.endswith("." + own):
            continue
        if any(bare == d or bare.endswith("." + d) for d in PRODUCTION_DOMAINS):
            raise SystemExit(f"Refusing: DOMAIN_MODULES names the production host {host}.")
        raise SystemExit(f"Refusing: DOMAIN_MODULES names {host}, which is not under {own}.")


def check_destinations(label, pairs, target, extra_allowed=frozenset()):
    """The Postgres or Mongo destinations: loopback for local, in-cluster names (or explicit extras) for a cauldron."""
    if not pairs:
        raise SystemExit(f"Refusing: no {label} host is configured.")
    for host, _port in pairs:
        if target == "local":
            if host not in LOOPBACK_HOSTS:
                raise SystemExit(f"Refusing: --target local needs a loopback {label} host, not {host!r}.")
        elif host in LOOPBACK_NAMES:
            raise SystemExit(f"Refusing: --target cauldron but the {label} host {host!r} is on this machine.")
        elif not is_in_cluster_name(host) and host not in extra_allowed:
            raise SystemExit(
                f"Refusing: the {label} host {host!r} is not an in-cluster Kubernetes name "
                f"(a service name, or <service>.<namespace>.svc[.cluster.local]). "
                f"{UNSAFE_ALLOW_HOSTS_ENV} can add a host, at your own risk."
            )


def check_target(
    target,
    *,
    engine,
    pg_name,
    pg_host,
    pg_port,
    mongo_host,
    mongo_port,
    mongo_db,
    domain_hosts=None,
    cauldron=None,
    environ=None,
):
    """
    Pure guard over the effective settings of the process (no database, no Django). Refuses with SystemExit
    unless every database this script can write is the local stack's or the named cauldron's. Returns the
    one-line confirmation the caller prints.
    """
    environ = os.environ if environ is None else environ
    env_target = environ.get("APIKEYS_TARGET")
    if env_target and env_target != target:
        raise SystemExit(f"APIKEYS_TARGET={env_target} disagrees with --target {target}.")
    if target not in ("local", "cauldron"):
        raise SystemExit("--target must be local or cauldron.")
    if "postgresql" not in (engine or ""):
        raise SystemExit(f"Refusing: the default database is not Postgres ({engine}).")
    if pg_name != REGISTRY_DB_NAME:
        raise SystemExit(f"Refusing: the default database is {pg_name!r}, not {REGISTRY_DB_NAME!r}.")
    if not mongo_db:
        raise SystemExit("Refusing: the Mongo database name is empty.")
    pg_pairs = parse_hosts(pg_host, str(pg_port or ""))
    mongo_pairs = parse_hosts(mongo_host, None if mongo_port is None else str(mongo_port))
    if target == "local":
        # The stack's own Postgres only: no override, so a reset or teardown can never reach another local database.
        if len(pg_pairs) != 1 or pg_pairs[0][0] not in LOOPBACK_HOSTS or pg_pairs[0][1] not in LOCAL_PG_PORTS:
            raise SystemExit(
                f"Refusing: --target local needs the local stack's Postgres on 127.0.0.1:55432, not {pg_host}:{pg_port}."
            )
        check_destinations("Mongo", mongo_pairs, target)
        where = "this machine"
    else:
        name = cauldron
        if not name or not re.fullmatch(r"[a-z0-9-]+", name):
            raise SystemExit(f"Refusing: {name!r} is not a cauldron name.")
        check_cauldron_domains(set(domain_hosts or ()), name)
        extra = _extra_allowed_hosts(environ)
        check_destinations("Postgres", pg_pairs, target, extra)
        check_destinations("Mongo", mongo_pairs, target, extra)
        where = f"the {name} cauldron"
    return "target ok: {} (Postgres {} / {}, Mongo {} / database {!r})".format(
        where,
        ",".join(h for h, _ in pg_pairs),
        pg_name,
        ",".join(h for h, _ in mongo_pairs),
        mongo_db,
    )


def guard_target(target, out=None):
    """Reads the process's effective settings and refuses anything but the local stack or the named cauldron."""
    from django.conf import settings

    db = settings.DATABASES["default"]
    line = check_target(
        target,
        engine=db.get("ENGINE"),
        pg_name=db.get("NAME"),
        pg_host=db.get("HOST"),
        pg_port=db.get("PORT"),
        mongo_host=getattr(settings, "MONGO_HOST", None),
        mongo_port=getattr(settings, "MONGO_PORT", None),
        mongo_db=getattr(settings, "SEFARIA_DB", None),
        domain_hosts=_domain_hosts(getattr(settings, "DOMAIN_MODULES", None)),
        cauldron=cauldron_name() if target == "cauldron" else None,
    )
    print(line, file=out or sys.stderr)


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
    user.last_name = f"{suite.capitalize()} {role}"
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
    developer_states = {"F7", "F8"}
    verified = bool(states & developer_states)

    EmailAddress.objects.filter(user=user).delete()
    SocialAccount.objects.filter(user=user).delete()
    if verified:
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
    elif "F2" in states:
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=False)
    if states & {"F4", "F5"} or role == "gauth":
        SocialAccount.objects.create(
            user=user,
            provider="google",
            uid=f"apikeys-e2e-{user.id}",
            extra_data={"email": user.email, "email_verified": "F5" not in states, "name": user.get_full_name()},
        )

    profile = UserProfile(id=user.id)
    for setting in (
        developer.ENABLED_SETTING,
        developer.PROFILE_SETTING,
        developer.CONFIRMATION_SENT_SETTING,
        developer.CONFIRMATION_SENT_TO_SETTING,
        developer.CONFIRMATION_SENDS_SETTING,
    ):
        profile.settings.pop(setting, None)
    profile.settings["interface_language"] = "hebrew" if "F12" in states else "english"
    if verified:
        profile.settings[developer.ENABLED_SETTING] = True
        profile.settings[developer.PROFILE_SETTING] = developer.clean_profile(
            {
                "developerName": user.get_full_name(),
                "description": f"End-to-end test account ({role_key(suite, role)}).",
                "termsAccepted": True,
            }
        )
    if "F2" in states:
        sent = datetime.now(UTC) - EXPIRED_LINK_AGE
        profile.settings[developer.CONFIRMATION_SENT_SETTING] = developer.iso(sent)
        profile.settings[developer.CONFIRMATION_SENT_TO_SETTING] = user.email.lower()
        profile.settings[developer.CONFIRMATION_SENDS_SETTING] = [developer.iso(sent)]
    profile.save()
    # The confirmation throttle lives in its own collection. Drop the account's document so a reset really resets the
    # limits; the first send after it takes over whatever the settings above hold.
    _legacy_db()[developer.THROTTLE_COLLECTION].delete_many({"uid": user.id})


def _create_developer_project(user, suite, role, key_specs, notes):
    from powered_by import developer
    from powered_by.models import Project

    api_project = developer.create_project(
        user,
        {
            "name": f"E2E {suite} {role}",
            "description": "Temporary end-to-end test project.",
            "organization": "",
            "websiteUrl": SITE_A,
            "visibility": "private",
            "aiAssisted": False,
        },
    )
    Project.objects.filter(id=api_project.profile_id).update(
        notes=notes, is_published=False, request_not_to_publish=True
    )
    for name, options in key_specs:
        api_key = developer.create_key(user, api_project.id, name)
        if options.get("restricted"):
            developer.set_key_restriction(user, str(api_key.id), True)
        if options.get("revoked"):
            developer.revoke_key(user, str(api_key.id))
    if role == "deletedProject":
        developer.delete_project(user, api_project.id)
    return api_project


def _seed_account(spec, password, marker, base=None, notes=None):
    n, suite, role, state, key_specs, _ = spec
    user = _ensure_user(n, suite, role, password, base)
    _apply_state(user, suite, role, state)
    states = _states(state)
    if "F8" in states:
        _create_developer_project(user, suite, role, key_specs or [], notes or marker)
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
    if ApiKey.objects.filter(
        project__owner_id=uid, project__profile__notes=SENTINEL_NOTE, revoked_at__isnull=True
    ).exists():
        return False
    _seed_account(SENTINEL, password, marker=None, base=base, notes=SENTINEL_NOTE)
    return True


# --- Teardown -----------------------------------------------------------------


def _fixture_projects(include_sentinel=False, base=None):
    """
    The fixture profiles: marked ones, ones that have an API project owned by a fixture account, and
    unclaimed listings with a fixture email. The profile is the project; its API projects hang off it.
    """
    from django.db.models import Q

    from powered_by.models import ApiProject, Project

    ids = fixture_ids(include_sentinel, base)
    emails = fixture_emails(include_sentinel)
    live_profiles = ApiProject.objects.filter(deleted_at__isnull=True).values("profile_id")
    query = (
        Q(notes__regex=MARKER_RE.pattern)
        | Q(api_projects__owner_id__in=ids)
        | (Q(creator_email__in=emails) & ~Q(id__in=live_profiles))
    )
    if include_sentinel:
        query |= Q(notes=SENTINEL_NOTE)
    projects = Project.objects.filter(query)
    if not include_sentinel:
        projects = projects.exclude(notes=SENTINEL_NOTE).exclude(api_projects__owner_id=account_id(SENTINEL[0], base))
    return projects.distinct()


def teardown_plan(include_sentinel=False, base=None):
    """What a teardown would remove, without removing anything."""
    from django.contrib.auth.models import User

    from powered_by.models import ApiKey

    ids = fixture_ids(include_sentinel, base)
    emails = set(fixture_emails(include_sentinel))
    projects = []
    for profile in _fixture_projects(include_sentinel, base).order_by("id").prefetch_related("api_projects"):
        # Why each profile is a fixture, so a caller can check it: the run marker, an owner in the id band, or an
        # unclaimed listing with a fixture email.
        owners = sorted({a.owner_id for a in profile.api_projects.all() if a.owner_id in ids})
        if MARKER_RE.match(profile.notes or ""):
            why = "marker"
        elif owners:
            why = f"owner={owners[0]}"
        elif profile.creator_email in emails:
            why = f"email={profile.creator_email}"
        else:
            why = "sentinel" if include_sentinel else "unknown"
        projects.append((profile.id, profile.project_name, profile.notes, why))
    return {
        "users": list(User.objects.filter(id__in=ids).order_by("id").values_list("id", flat=True)),
        "projects": projects,
        "keys": ApiKey.objects.filter(project__profile_id__in=[p[0] for p in projects]).count(),
        "legacyKeys": _legacy_db().apikeys.count_documents({"uid": {"$in": ids}}),
        "profiles": _legacy_db().profiles.count_documents({"id": {"$in": ids}}),
    }


def _legacy_db():
    from sefaria.system.database import db

    return db


def teardown(include_sentinel=False, base=None):
    """
    Keys, then API projects, then profiles (the fixture profiles, by marker, by fixture owner, or
    unclaimed with a fixture email), then legacy keys and Mongo profiles by the exact id list, then
    the accounts by that list.
    """
    from django.contrib.auth.models import User
    from django.db import transaction

    from powered_by.models import ApiKey, ApiProject, Project

    ids = fixture_ids(include_sentinel, base)
    db = _legacy_db()
    with transaction.atomic():
        profile_ids = list(_fixture_projects(include_sentinel, base).values_list("id", flat=True))
        api_projects = ApiProject.objects.filter(profile_id__in=profile_ids)
        keys = ApiKey.objects.filter(project__in=api_projects).delete()[0]
        api_projects.delete()
        project_count = Project.objects.filter(id__in=profile_ids).delete()[0]
        users = User.objects.filter(id__in=ids).count()
        User.objects.filter(id__in=ids).delete()
    legacy = db.apikeys.delete_many({"uid": {"$in": ids}}).deleted_count
    purge_profiles(ids, base)
    return {"keys": keys, "projects": project_count, "users": users, "legacyKeys": legacy}


def purge_profiles(ids, base=None):
    check_ids(ids, base)
    from powered_by import developer

    _legacy_db().profiles.delete_many({"id": {"$in": ids}})
    _legacy_db()[developer.THROTTLE_COLLECTION].delete_many({"uid": {"$in": ids}})


def leftovers(include_sentinel=False, base=None):
    from django.contrib.auth.models import User
    from django.db.models import Q

    from powered_by.models import ApiKey, Project

    base = ID_BASE if base is None else base
    in_band = Q(id__gte=base + 1, id__lte=base + 999)
    owned = Q(api_projects__owner_id__gte=base + 1, api_projects__owner_id__lte=base + 999)
    mongo_band = {"$gte": base + 1, "$lte": base + 999}
    if not include_sentinel:
        sentinel_id = account_id(SENTINEL[0], base)
        in_band &= ~Q(id=sentinel_id)
        owned &= ~Q(api_projects__owner_id=sentinel_id)
        mongo_band["$ne"] = sentinel_id
    projects = Project.objects.filter(Q(notes__regex=MARKER_RE.pattern) | owned).distinct()
    db = _legacy_db()
    return {
        "users": User.objects.filter(in_band).count(),
        "projects": projects.count(),
        "keys": ApiKey.objects.filter(project__profile__in=projects).count(),
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
    # Everything the confirmation limits read: the profile's send record, the pending-confirmation fields (as
    # _apply_state clears them) and the throttle document in its own collection.
    for setting in (
        developer.CONFIRMATION_SENT_SETTING,
        developer.CONFIRMATION_SENT_TO_SETTING,
        developer.CONFIRMATION_SENDS_SETTING,
    ):
        profile.settings.pop(setting, None)
    profile.save()
    _legacy_db()[developer.THROTTLE_COLLECTION].delete_many({"uid": uid})


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
        raise SystemExit(f"Seed {role_name} first (--reset).")
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

    from powered_by.models import ApiKey, ApiProject, SubmissionSource

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
        # A developer project's id is its API project's id; a listing has no API project, so its id is the profile's.
        api_project = ApiProject.objects.filter(profile=project).order_by("-id").first()
        owner_id = api_project.owner_id if api_project else None
        owner_spec = roles.get(owner_id) or next(
            (s for s in roles.values() if account_email(s[1], s[2]) == (project.creator_email or "").lower()), None
        )
        suite, role = (owner_spec[1], owner_spec[2]) if owner_spec else ("", "")
        is_developer = project.submission_source == SubmissionSource.DEVELOPER_SETTINGS
        projects.append(
            {
                "suite": suite,
                "role": role,
                "id": api_project.id if is_developer and api_project else project.id,
                "name": project.project_name,
                "kind": "developer" if is_developer else "listing",
                "deleted": bool(api_project and api_project.deleted_at),
                "ownerId": owner_id,
            }
        )
        for api_key in ApiKey.objects.filter(project__profile=project).order_by("created_at"):
            keys.append(
                {
                    "suite": suite,
                    "role": role,
                    "name": api_key.label,
                    "id": str(api_key.id),
                    "projectId": api_key.project_id,
                    "value": api_key.key,
                    "allowedOrigins": list(api_key.allowed_origins or []),
                    "revoked": api_key.revoked_at is not None,
                }
            )

    legacy = []
    for row in _legacy_db().apikeys.find({"uid": {"$in": list(roles)}}):
        spec = roles[row["uid"]]
        legacy.append({"suite": spec[1], "role": spec[2], "value": row["key"], "mongoId": str(row["_id"])})

    return {
        "schemaVersion": 1,
        "target": target,
        "baseURL": {
            "local": "http://www.gateway.test:10080",
            "cauldron": f"https://www.{cauldron_name()}.cauldron.sefaria.org",
        }[target],
        "runId": run_id,
        "marker": marker_for(run_id) if run_id else None,
        "createdAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
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
    from powered_by.models import ApiKey, ApiProject
    from sefaria.model.user_profile import UserProfile

    print("run marker:{}".format(marker_for(current_run_id(base)) if current_run_id(base) else "(none)"), file=stream)
    header = "{:<28} {:>10} {:<8} {:<5} {:<4} {:<4} {:<4} {:>4} {:>8}".format(
        "role", "id", "state", "user", "ver", "sso", "dev", "proj", "keys"
    )
    print(header, file=stream)
    print("-" * len(header), file=stream)
    for uid, spec in sorted(_role_by_id(base).items()):
        user = User.objects.filter(id=uid).first()
        if user is None:
            print(f"{role_key(spec[1], spec[2]):<28} {uid:>10} {spec[3]:<8} no", file=stream)
            continue
        settings = UserProfile(id=uid).settings
        verified = EmailAddress.objects.filter(user=user, email__iexact=user.email, verified=True).exists()
        sso = user.socialaccount_set.filter(provider="google").exists()
        dev = bool(settings.get(developer.ENABLED_SETTING) and settings.get(developer.PROFILE_SETTING))
        owned = ApiProject.objects.filter(owner=user, deleted_at__isnull=True)
        active = ApiKey.objects.filter(project__owner=user, revoked_at__isnull=True).count()
        total = ApiKey.objects.filter(project__owner=user).count()
        print(
            "{:<28} {:>10} {:<8} {:<5} {:<4} {:<4} {:<4} {:>4} {:>8}".format(
                role_key(spec[1], spec[2]),
                uid,
                spec[3],
                "yes",
                _yn(verified),
                _yn(sso),
                _yn(dev),
                owned.count(),
                f"{active}/{total}",
            ),
            file=stream,
        )
    for row in _legacy_db().apikeys.find({"uid": {"$in": list(_role_by_id(base))}}):
        print("legacy key for {} ({})".format(row["uid"], mask(row["key"])), file=stream)


def _yn(value):
    return "yes" if value else "no"


def print_leftovers(stream, include_sentinel=False, base=None):
    counts = leftovers(include_sentinel, base)
    total = sum(counts.values())
    print("leftovers: {} ({})".format(total, ", ".join(f"{k}={v}" for k, v in counts.items())), file=stream)
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
    parser.add_argument(
        "--manifest-stdout",
        action="store_true",
        help="put the manifest, and nothing else, on stdout (alone: read-only manifest)",
    )
    parser.add_argument("--include-sentinel", action="store_true", help="with --teardown/--leftovers: the sentinel too")
    parser.add_argument("--dry-run", action="store_true", help="with --teardown: list what would be removed")
    if "--manifest-stdout" in argv and not any(
        a in argv
        for a in (
            "--reset",
            "--report",
            "--teardown",
            "--leftovers",
            "--write-manifest",
            "--reset-send-limits",
            "--mint-expired-link",
            "--legacy-key",
            "--ensure-sentinel",
        )
    ):
        argv = list(argv) + ["--write-manifest"]
    return parser.parse_args(argv)


def _manifest_path():
    if os.environ.get("APIKEYS_MANIFEST"):
        return Path(os.environ["APIKEYS_MANIFEST"])
    this_file = globals().get("__file__") or ""
    root = Path(this_file).resolve().parents[2] if this_file.endswith("seed_api_keys_e2e.py") else Path.cwd()
    return root / "e2e-tests" / ".apikeys-e2e.json"


def write_private(path, text):
    """Writes a file readable by its owner only, even when it already existed with wider permissions."""
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.fchmod(fd, 0o600)  # the mode argument of os.open applies only when the file is created
    except BaseException:
        os.close(fd)
        raise
    with os.fdopen(fd, "w") as handle:
        handle.write(text)


def enforce_private_stdout(stream=None):
    """
    When stdout is a regular file (a shell redirect keeps the mode of a file that already existed), make it 0600
    before the manifest goes into it. A pipe or terminal is left alone.
    """
    stream = stream or sys.stdout
    try:
        fileno = stream.fileno()
        if stat.S_ISREG(os.fstat(fileno).st_mode):
            os.fchmod(fileno, 0o600)
    except (AttributeError, OSError, ValueError):
        pass


def emit_manifest(args):
    """With --manifest-stdout the manifest is the only thing on stdout; otherwise it goes to the file."""
    manifest = json.dumps(build_manifest(args.target), indent=2) + "\n"
    if args.manifest_stdout:
        enforce_private_stdout()
        sys.stdout.write(manifest)
        sys.stdout.flush()
        return "stdout"
    if args.target == "cauldron":
        raise SystemExit("On the cauldron the manifest goes to stdout only: add --manifest-stdout.")
    path = _manifest_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    write_private(path, manifest)
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
    writes = (
        args.reset
        or args.legacy_key
        or args.reset_send_limits
        or args.mint_expired_link
        or (args.teardown and not args.dry_run)
    )
    if writes:
        require_mutation_consent(args.target)
    if args.teardown and args.dry_run:
        plan = teardown_plan(include_sentinel=args.include_sentinel)
        print(
            "would remove {} users ({}), {} projects, {} keys, {} legacy keys, {} profiles".format(
                len(plan["users"]),
                ", ".join(str(i) for i in plan["users"]) or "none",
                len(plan["projects"]),
                plan["keys"],
                plan["legacyKeys"],
                plan["profiles"],
            ),
            file=out,
        )
        for project_id, name, notes, why in plan["projects"]:
            print(f"  project {project_id} {name!r} notes={notes!r} why={why}", file=out)
        return 0
    if args.teardown:
        removed = teardown(include_sentinel=args.include_sentinel)
        print("removed: {}".format(", ".join(f"{k}={v}" for k, v in removed.items())), file=out)
        if not args.manifest_stdout and args.target == "local":
            try:
                _manifest_path().unlink()
                print(f"removed manifest {_manifest_path()}", file=out)
            except FileNotFoundError:
                pass
        return 1 if print_leftovers(out, args.include_sentinel) else 0
    if args.reset_send_limits:
        reset_send_limits(args.reset_send_limits)
        print(f"cleared confirmation sends of {args.reset_send_limits}", file=out)
        return 0
    if args.mint_expired_link:
        link = mint_expired_link(args.mint_expired_link)
        sys.stdout.write(json.dumps(link) + "\n")
        return 0

    password = read_password(password_preamble) if (args.reset or args.ensure_sentinel) else None
    if args.reset:
        run_id = reset(args.target, password)
        print(f"seeded {len(ACCOUNTS)} accounts, run {run_id}", file=out)
    elif args.ensure_sentinel:
        print("sentinel {}".format("created" if ensure_sentinel(password) else "already present"), file=out)
    elif args.legacy_key:
        add_legacy_key(args.legacy_key)
        print(f"legacy key set for {args.legacy_key}", file=out)

    if args.ensure_sentinel and not args.manifest_stdout:
        return 0
    destination = emit_manifest(args)
    print(f"manifest: {destination}", file=out)
    if args.reset:
        report(out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:], globals().get("APIKEYS_E2E_PASSWORD")))
elif "APIKEYS_SEED_ARGV" in globals():
    _status = main(globals()["APIKEYS_SEED_ARGV"], globals().get("APIKEYS_E2E_PASSWORD"))
    if _status:
        raise SystemExit(_status)
