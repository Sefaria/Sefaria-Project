#!/usr/bin/env python
"""
One-time import: upsert Powered by Sefaria projects from a CSV export
(matching the powered_by.models.Project field names) into the Project table.
Rows are matched on project_link, so re-running is safe -- existing rows are
updated in place rather than duplicated.

Usage:
    python powered_by/scripts/import_pbs.py path/to/pbs.csv
"""
import csv
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
django.setup()

from django.utils import timezone
from powered_by.models import Project, SubmissionSource

# The CSV's `submission_source` values don't match the model's choices
# (formstack/in_the_wild/manual) 1:1 -- map the free-text source labels
# used in the export to the closest valid choice.
SUBMISSION_SOURCE_MAP = {
    "formstack": SubmissionSource.FORMSTACK,
    "found in the wild (sefaria team outreach list)": SubmissionSource.IN_THE_WILD,
    "developers.sefaria.org master list": SubmissionSource.MANUAL,
}

BOOLEAN_FIELDS = (
    "is_developer", "vibe_coded", "has_pbs_logo",
    "is_buggy", "consent_to_display", "is_published", "featured",
)

LIST_FIELDS = ("sefaria_tools_used", "tags")

DIRECT_FIELDS = (
    "creator", "creator_email", "submitter", "salesforce_id",
    "job_title", "found_sefaria", "tech_used_raw", "technical_experience",
    "project_why", "project_name", "project_source_code", "project_reach",
    "project_desc", "project_category", "image_url", "status", "notes",
)


def parse_bool(value):
    return (value or "").strip().lower() == "true"


def parse_list(value):
    value = (value or "").strip()
    if not value:
        return []
    return [item.strip() for item in value.split(";") if item.strip()]


def parse_datetime(value):
    value = (value or "").strip()
    if not value:
        return None
    try:
        dt = timezone.datetime.fromisoformat(value)
    except ValueError:
        print(f"unparseable date {value!r}, importing as null", file=sys.stderr)
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


def main():
    if len(sys.argv) != 2:
        sys.exit(f"Usage: python {sys.argv[0]} path/to/pbs.csv")
    csv_path = sys.argv[1]

    created_count = 0
    updated_count = 0
    error_count = 0

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for line_num, row in enumerate(reader, start=2):
            project_link = (row.get("project_link") or "").strip()
            if not project_link:
                print(f"line {line_num}: skipping, no project_link", file=sys.stderr)
                error_count += 1
                continue

            try:
                defaults = {field_name: (row.get(field_name) or "").strip() for field_name in DIRECT_FIELDS}
                defaults["submission_source"] = SUBMISSION_SOURCE_MAP[(row.get("submission_source") or "").strip().lower()]
                for field_name in BOOLEAN_FIELDS:
                    defaults[field_name] = parse_bool(row.get(field_name))
                for field_name in LIST_FIELDS:
                    defaults[field_name] = parse_list(row.get(field_name))
                defaults["submission_date"] = parse_datetime(row.get("submission_date"))
                defaults["last_checked"] = parse_datetime(row.get("last_checked"))

                _, created = Project.objects.update_or_create(
                    project_link=project_link,
                    defaults=defaults,
                )
            except Exception as e:
                print(f"line {line_num} ({project_link}): {e}", file=sys.stderr)
                error_count += 1
                continue

            if created:
                created_count += 1
            else:
                updated_count += 1

    print(f"Done: {created_count} created, {updated_count} updated, {error_count} error(s).")


if __name__ == "__main__":
    main()
