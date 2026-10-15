# -*- coding: utf-8 -*-
"""
Powered by listings for the projects suite, on the local stack only.

A listing is a Project row with no owner whose creator_email is an account's email, as if the
public form had submitted it. The UI cannot make one without the test controls, so the listing
specs make them here, through the ORM, with the run marker in notes so the seed teardown removes
them.

    python listing_fixtures.py create --email <fixture email> --name <name> --marker <marker> [--consent yes|no]
    python listing_fixtures.py give --id <listing id> --to <fixture email>
    python listing_fixtures.py show --id <listing id>

Every command prints one JSON object. Run with the stack's settings (PYTHONPATH pointing at
auth-service/dev/local-stack, DJANGO_SETTINGS_MODULE=django_settings).
"""
import argparse
import json
import os
import re
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, REPO_ROOT)

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.contrib.auth.models import User  # noqa: E402
from django.utils import timezone  # noqa: E402

from powered_by.models import Project, SubmissionSource  # noqa: E402

FIXTURE_EMAIL = re.compile(r"^apikeys-e2e-projects-[a-z0-9]+@example\.com$")
MARKER = re.compile(r"^E2E api-keys \S+ \(temporary\)$")
ID_FLOOR, ID_CEILING = 2_098_000_001, 2_098_000_999


def guard():
    db = settings.DATABASES["default"]
    if not (db.get("NAME") == "sefaria_auth" and str(db.get("HOST")) == "127.0.0.1" and str(db.get("PORT")) == "55432"):
        raise SystemExit("Refusing: listing fixtures are for the local stack's Postgres on 127.0.0.1:55432 only.")


def fixture_user(email):
    if not FIXTURE_EMAIL.match(email or ""):
        raise SystemExit("Refusing: {!r} is not a projects-suite fixture email.".format(email))
    user = User.objects.get(email__iexact=email)
    if not ID_FLOOR <= user.id <= ID_CEILING:
        raise SystemExit("Refusing: user {} is outside the fixture id band.".format(user.id))
    return user


def fixture_listing(listing_id):
    project = Project.objects.get(id=int(listing_id))
    if not MARKER.match(project.notes or "") or not FIXTURE_EMAIL.match(project.creator_email or ""):
        raise SystemExit("Refusing: project {} is not a projects-suite fixture listing.".format(listing_id))
    return project


def describe(project):
    return {
        "id": project.id,
        "name": project.project_name,
        "ownerId": project.owner_id,
        "isPublished": project.is_published,
        "consentToDisplay": project.consent_to_display,
        "deleted": project.deleted_at is not None,
    }


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--marker", required=True)
    create.add_argument("--consent", choices=["yes", "no"], default="yes")
    give = sub.add_parser("give")
    give.add_argument("--id", required=True)
    give.add_argument("--to", required=True)
    show = sub.add_parser("show")
    show.add_argument("--id", required=True)
    args = parser.parse_args()

    guard()
    if args.command == "create":
        if not MARKER.match(args.marker):
            raise SystemExit("Refusing: {!r} is not a run marker.".format(args.marker))
        user = fixture_user(args.email)
        project = Project.objects.create(
            submission_source=SubmissionSource.MANUAL,
            submission_date=timezone.now(),
            creator=user.get_full_name(),
            creator_email=user.email,
            project_name=args.name,
            project_link="https://{}.example.com".format(re.sub(r"[^a-z0-9]+", "-", args.name.lower()).strip("-")),
            project_desc="Temporary end-to-end test listing.",
            consent_to_display=args.consent == "yes",
            is_published=False,
            notes=args.marker,
        )
    elif args.command == "give":
        project = fixture_listing(args.id)
        project.owner = fixture_user(args.to)
        project.save(update_fields=["owner"])
    else:
        project = fixture_listing(args.id)
    print(json.dumps(describe(project)))


if __name__ == "__main__":
    main()
