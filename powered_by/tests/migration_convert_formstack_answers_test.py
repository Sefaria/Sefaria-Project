"""
Migration 0014 converts the Formstack answers already in powered_by_project to the new publish form's format. These
tests move the real schema from 0013 to 0014 and check the rows: what changes, what goes to notes, and what must
stay exactly as it was (visibility, owner, source, updated_at, rows already in the new format).
"""

import datetime
import importlib
from unittest import skipUnless

from django.db import connection

from powered_by.tests.migration_api_project_backfill_test import MigrationTestCase

BEFORE = ("powered_by", "0013_project_purpose")
AFTER = ("powered_by", "0014_convert_formstack_answers")
MIGRATION = importlib.import_module("powered_by.migrations.0014_convert_formstack_answers")

OLD_UPDATED_AT = datetime.datetime(2025, 3, 1, 12, 0, tzinfo=datetime.UTC)


@skipUnless(connection.vendor == "postgresql", "migrating back through 0006-0009 needs PostgreSQL")
class ConvertFormstackAnswersMigrationTest(MigrationTestCase):
    def make_listing(self, apps, name, **fields):
        fields.setdefault("submission_source", "formstack")
        project = self.make_project(apps, name, project_link=f"https://{name}.example.com", **fields)
        # updated_at is auto_now: set it with a plain UPDATE so the test can check the migration leaves it alone.
        apps.get_model("powered_by", "Project").objects.filter(pk=project.pk).update(updated_at=OLD_UPDATED_AT)
        return project.pk

    def row(self, pk):
        return self.migrate_apps.get_model("powered_by", "Project").objects.get(pk=pk)

    def migrate_to_after(self):
        self.migrate_apps = self.migrate(AFTER)

    def test_formstack_answers_become_the_new_format(self):
        apps = self.migrate(BEFORE)
        pk = self.make_listing(
            apps,
            "full",
            project_category="Learning & Study Tools AI Projects, Apps, & Other Tools",
            sefaria_tools_used=["Sefaria API", "Text", "/api/v3/texts", "Sefaria-Export"],
            project_reach="~100",
        )

        self.migrate_to_after()

        row = self.row(pk)
        self.assertEqual(row.project_category, "learning,ai")
        self.assertEqual(row.sefaria_tools_used, ["Sefaria API", "Sefaria-Export"])
        self.assertEqual(row.project_reach, "100")
        self.assertIsNone(row.notes)

    def test_text_under_other_is_added_to_the_staff_notes(self):
        apps = self.migrate(BEFORE)
        pk = self.make_listing(
            apps,
            "other",
            project_category="Learning & Study Tools Other: Davening Toolkit",
            sefaria_tools_used=["Other: just website pages!"],
            project_reach="Other: Just launched",
            notes="Checked by staff.",
        )

        self.migrate_to_after()

        row = self.row(pk)
        self.assertEqual(row.project_category, "learning,other")
        self.assertEqual(row.sefaria_tools_used, ["Other"])
        self.assertEqual(row.project_reach, "Just launched")
        self.assertEqual(
            row.notes,
            "Checked by staff.\n\n"
            "Formstack answers that didn't fit the new form (migration 0014):\n"
            "- Category, under Other: Davening Toolkit\n"
            "- Tools, under Other: just website pages!",
        )

    def test_visibility_owner_source_and_updated_at_are_untouched(self):
        apps = self.migrate(BEFORE)
        published = self.make_listing(apps, "published", project_category="Learning & Study Tools")
        hidden = self.make_listing(
            apps,
            "hidden",
            project_category="Learning & Study Tools",
            request_not_to_publish=True,
            is_published=False,
            featured=True,
        )
        manual = self.make_listing(
            apps, "manual", submission_source="manual", project_category="Visualization & Data Analysis"
        )

        self.migrate_to_after()

        self.assertEqual(
            [
                (r.is_published, r.request_not_to_publish, r.featured, r.owner_id, r.submission_source)
                for r in map(self.row, (published, hidden, manual))
            ],
            [
                (True, False, False, None, "formstack"),
                (False, True, True, None, "formstack"),
                (True, False, False, None, "manual"),
            ],
        )
        for pk in (published, hidden, manual):
            self.assertEqual(self.row(pk).updated_at, OLD_UPDATED_AT)

    def test_rows_already_in_the_new_format_and_empty_rows_are_unchanged(self):
        apps = self.migrate(BEFORE)
        new_format = self.make_listing(
            apps,
            "settings",
            submission_source="developer_settings",
            project_category="learning,ai",
            sefaria_tools_used=["Sefaria API", "Sefaria MCP"],
            project_reach="poc",
            notes="Staff note.",
        )
        empty = self.make_listing(apps, "empty", submission_source="in_the_wild")
        before = {pk: self.profile_snapshot(pk) for pk in (new_format, empty)}

        self.migrate_to_after()

        self.assertEqual({pk: self.profile_snapshot(pk) for pk in (new_format, empty)}, before)

    def test_running_the_conversion_again_changes_nothing(self):
        apps = self.migrate(BEFORE)
        pk = self.make_listing(
            apps,
            "twice",
            project_category="Learning & Study Tools Other: Davening Toolkit",
            sefaria_tools_used=["/api/texts", "Other: website"],
            project_reach="~10",
        )
        self.migrate_to_after()
        after_once = self.profile_snapshot(pk)

        with connection.schema_editor() as schema_editor:
            MIGRATION.forward(self.migrate_apps, schema_editor)

        self.assertEqual(self.profile_snapshot(pk), after_once)

    def test_reverse_leaves_the_converted_values(self):
        apps = self.migrate(BEFORE)
        pk = self.make_listing(apps, "reverse", project_category="Learning & Study Tools")
        self.migrate_to_after()

        apps = self.migrate(BEFORE)

        self.assertEqual(apps.get_model("powered_by", "Project").objects.get(pk=pk).project_category, "learning")

    def profile_snapshot(self, pk):
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT project_category, sefaria_tools_used::text, project_reach, notes, updated_at "
                "FROM powered_by_project WHERE id = %s",
                [pk],
            )
            return cursor.fetchone()
