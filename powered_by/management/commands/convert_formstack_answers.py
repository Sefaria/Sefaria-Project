"""
Converts the Powered by answers saved by the Formstack form into the format of the new publish form, so the form
reopens them and the gallery reads one format:

- project_category: labels (joined by commas or spaces) -> ids, "learning,ai".
- sefaria_tools_used: endpoint answers -> "Sefaria API", "MCP" -> "Sefaria MCP", "Other: ..." -> "Other".
- project_reach: "~100" -> "100", "None, it's mostly a proof of concept" -> "poc", "Other: x" -> "x".

The text typed under "Other", and any answer that matches no option, is added to the staff-only notes. The endpoint
lists are dropped (D41; decided by Sarah, 2026-11-19).

Safe to run whenever, and again: rows already in the new format are left as they are. updated_at is not touched
(bulk_update skips auto_now), nor are visibility, owner or submission_source. Run it after the release that serves ids
as labels (Project.contents) is on prod, so the gallery never sees raw ids.

    ./manage.py convert_formstack_answers --dry-run   # what would change, nothing written
    ./manage.py convert_formstack_answers
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from powered_by.formstack_answers import ROW_FIELDS, convert_row
from powered_by.models import Project


class Command(BaseCommand):
    help = "Convert old Formstack answers (categories, tools, monthly users) to the publish form's format."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="List what would change without writing.")

    def handle(self, *args, dry_run=False, **options):
        with transaction.atomic():
            changed, noted = [], 0
            for project in Project.objects.select_for_update().only("id", "project_name", *ROW_FIELDS).order_by("id"):
                updates = convert_row(project)
                if not updates:
                    continue
                noted += "notes" in updates
                if dry_run:
                    self.stdout.write(f"#{project.id} {project.project_name}: {', '.join(sorted(updates))}")
                for field, value in updates.items():
                    setattr(project, field, value)
                changed.append(project)
            if not dry_run:
                Project.objects.bulk_update(changed, ROW_FIELDS, batch_size=500)
        verb = "Would change" if dry_run else "Changed"
        self.stdout.write(self.style.SUCCESS(f"{verb} {len(changed)} project(s); {noted} with a note added."))
