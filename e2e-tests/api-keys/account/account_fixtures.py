"""
Account states for the account suite, on the local stack only.

    python account_fixtures.py show --role password
    python account_fixtures.py reset-settings --role password [--interface-language english|hebrew]

`show` prints the saved account settings the specs assert on. `reset-settings` puts them back to
the seeded values before a test changes them.

Every command prints one JSON object. Run with the stack's settings (PYTHONPATH pointing at
auth-service/dev/local-stack, DJANGO_SETTINGS_MODULE=django_settings).
"""

import argparse
import importlib.util
import json
import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, REPO_ROOT)

import django  # noqa: E402

django.setup()

_spec = importlib.util.spec_from_file_location(
    "seed_api_keys_e2e", os.path.join(REPO_ROOT, "scripts", "dev", "seed_api_keys_e2e.py")
)
seed = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seed)

from django.conf import settings  # noqa: E402
from django.contrib.auth.models import User  # noqa: E402

from sefaria.model.user_profile import UserProfile  # noqa: E402

SUITE = "account"
SHOWN_SETTINGS = ("email_notifications", "interface_language", "reading_history", "textual_custom", "library_assistant")


def guard():
    db = settings.DATABASES["default"]
    if not (db.get("NAME") == "sefaria_auth" and str(db.get("HOST")) == "127.0.0.1" and str(db.get("PORT")) == "55432"):
        raise SystemExit("Refusing: account fixtures are for the local stack's Postgres on 127.0.0.1:55432 only.")
    # UserProfile.save() also writes the Mongo profiles collection, so the Mongo target is checked as well.
    seed.guard_target("local")


def fixture_user(role):
    spec = seed.spec_for(f"{SUITE}.{role}")
    if spec[1] != SUITE:
        raise SystemExit(f"Refusing: {role!r} is not an account-suite account.")
    uid = seed.account_id(spec[0])
    seed.check_ids([uid])
    return User.objects.get(id=uid)


def shown(user):
    profile = UserProfile(id=user.id)
    return {"id": user.id, "settings": {k: profile.settings.get(k) for k in SHOWN_SETTINGS}}


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    show = sub.add_parser("show")
    show.add_argument("--role", required=True)
    reset = sub.add_parser("reset-settings")
    reset.add_argument("--role", required=True)
    reset.add_argument("--interface-language", choices=["english", "hebrew"], default="english")
    args = parser.parse_args()

    guard()
    user = fixture_user(args.role)
    if args.command == "show":
        print(json.dumps(shown(user)))
    else:
        profile = UserProfile(id=user.id)
        profile.settings.update(
            {
                "email_notifications": "daily",
                "interface_language": args.interface_language,
                "reading_history": True,
                "textual_custom": "sephardi",
            }
        )
        profile.settings.pop("library_assistant", None)
        profile.save()
        print(json.dumps(shown(user)))


if __name__ == "__main__":
    main()
