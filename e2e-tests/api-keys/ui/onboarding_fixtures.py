# -*- coding: utf-8 -*-
"""
Account states for the onboarding suite, on the local stack only.

The onboarding specs confirm emails, change addresses and use up send limits, so each test puts
its account back into a known state first. States are applied with the seed script's own
functions, so they match what --reset seeds. The password is never touched, so the sessions the
setup captured stay valid.

    python onboarding_fixtures.py reset --role unverified --state F1 [--sends N --sends-age-minutes M]
    python onboarding_fixtures.py verify --role unverified
    python onboarding_fixtures.py drop-sso --role ssoVerified
    python onboarding_fixtures.py restore-sso --role ssoVerified
    python onboarding_fixtures.py expired-link --role expiredLink
    python onboarding_fixtures.py show --role unverified

Every command prints one JSON object. Run with the stack's settings (PYTHONPATH pointing at
auth-service/dev/local-stack, DJANGO_SETTINGS_MODULE=django_settings).
"""
import argparse
import importlib.util
import json
import os
import sys
from datetime import datetime, timedelta, timezone as dt_timezone

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, REPO_ROOT)

import django  # noqa: E402

django.setup()

_spec = importlib.util.spec_from_file_location("seed_api_keys_e2e", os.path.join(REPO_ROOT, "scripts", "dev", "seed_api_keys_e2e.py"))
seed = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seed)

from allauth.account.models import EmailAddress  # noqa: E402
from allauth.socialaccount.models import SocialAccount  # noqa: E402
from django.contrib.auth.models import User  # noqa: E402

from powered_by import developer  # noqa: E402
from sefaria.model.user_profile import UserProfile  # noqa: E402

SUITE = "onboarding"
STATES = {"F1", "F2", "F4", "F5", "F7"}


def spec_for(role):
    spec = seed.spec_for("{}.{}".format(SUITE, role))
    if spec[1] != SUITE:
        raise SystemExit("Refusing: {!r} is not an onboarding-suite account.".format(role))
    return spec


def fixture_user(role):
    spec = spec_for(role)
    uid = seed.account_id(spec[0])
    seed.check_ids([uid])
    return spec, User.objects.get(id=uid)


def describe(user):
    profile = UserProfile(id=user.id)
    addresses = list(EmailAddress.objects.filter(user=user).values("email", "verified", "primary"))
    return {
        "id": user.id,
        "email": user.email,
        "emailVerified": developer.email_verified(user),
        "addresses": addresses,
        "sso": list(SocialAccount.objects.filter(user=user).values_list("provider", flat=True)),
        "developerEnabled": bool(profile.settings.get(developer.ENABLED_SETTING)),
        "hasProfile": bool(profile.settings.get(developer.PROFILE_SETTING)),
        "confirmationSentAt": profile.settings.get(developer.CONFIRMATION_SENT_SETTING),
        "sends": len(profile.settings.get(developer.CONFIRMATION_SENDS_SETTING, [])),
    }


def reset(role, state, sends, sends_age_minutes):
    if state not in STATES:
        raise SystemExit("State must be one of {}.".format(", ".join(sorted(STATES))))
    spec = spec_for(role)
    user = seed._ensure_user(spec[0], spec[1], spec[2], None)
    seed._apply_state(user, spec[1], spec[2], state)
    if sends:
        profile = UserProfile(id=user.id)
        first = datetime.now(dt_timezone.utc) - timedelta(minutes=sends_age_minutes)
        profile.settings[developer.CONFIRMATION_SENDS_SETTING] = [
            developer.iso(first + timedelta(seconds=i)) for i in range(sends)]
        profile.save()
    return user


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    reset_cmd = sub.add_parser("reset")
    reset_cmd.add_argument("--state", required=True)
    reset_cmd.add_argument("--sends", type=int, default=0)
    reset_cmd.add_argument("--sends-age-minutes", type=int, default=30)
    for name in ("verify", "drop-sso", "restore-sso", "expired-link", "show"):
        sub.add_parser(name)
    for command in sub.choices.values():
        command.add_argument("--role", required=True)
    args = parser.parse_args()

    seed.guard_target("local")
    if args.command == "reset":
        user = reset(args.role, args.state, args.sends, args.sends_age_minutes)
        print(json.dumps(describe(user)))
        return
    spec, user = fixture_user(args.role)
    if args.command == "verify":
        EmailAddress.objects.filter(user=user).delete()
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
    elif args.command == "drop-sso":
        SocialAccount.objects.filter(user=user).delete()
    elif args.command == "restore-sso":
        SocialAccount.objects.filter(user=user).delete()
        SocialAccount.objects.create(
            user=user, provider="google", uid="apikeys-e2e-{}".format(user.id),
            extra_data={"email": user.email, "email_verified": True, "name": user.get_full_name()},
        )
    elif args.command == "expired-link":
        print(json.dumps({"email": user.email, "path": seed.expired_link_path(user)}))
        return
    print(json.dumps(describe(user)))


if __name__ == "__main__":
    main()
