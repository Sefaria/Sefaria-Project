"""
Migration 0007 creates one powered_by api_project row per existing API project profile, with the row id
equal to the profile id. These tests move the real schema between 0006 and 0007 and assert on the rows,
the profile and key counts, and the reverse.
"""
import importlib
import warnings
from unittest import skipUnless

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


BEFORE = ("powered_by", "0006_api_project_schema")
AFTER = ("powered_by", "0007_api_project_backfill")
BACKFILL = importlib.import_module("powered_by.migrations.0007_api_project_backfill")


class MigrationTestCase(TransactionTestCase):
    databases = "__all__"

    def ensure_tiers(self):
        # A TransactionTestCase flush empties every table after each test, seeded tiers included, and
        # api_project rows need them. Same slugs 0006 seeds.
        with connection.cursor() as cursor:
            cursor.execute("SELECT to_regclass('api_tier')")
            if cursor.fetchone()[0] is None:
                return
            cursor.execute(
                "INSERT INTO api_tier (id, name, per_minute_per_project, created_at, updated_at) "
                "SELECT t.id, t.name, 1, now(), now() "
                "FROM (VALUES ('developer', 'Developer'), ('partner', 'Partner'), ('internal', 'Internal')) AS t(id, name) "
                "ON CONFLICT (id) DO NOTHING"
            )

    def migrate(self, target):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate([target])
        executor.loader.build_graph()
        self.ensure_tiers()
        return executor.loader.project_state(target).apps

    def tearDown(self):
        # Always back at the leaf, so a failed test never leaves the reused test database behind.
        self.ensure_tiers()
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def make_user(self, apps):
        User = apps.get_model("auth", "User")
        return User.objects.create(username=f"owner-{User.objects.count()}", password="!", email="owner@example.invalid")

    def make_project(self, apps, name, tier="developer", owner=None, **fields):
        Project = apps.get_model("powered_by", "Project")
        fields.setdefault("submission_source", "developer_settings")
        return Project.objects.create(project_name=name, tier=tier, owner=owner, **fields)

    def make_key(self, apps, project, label="key", revoked=False):
        ApiKey = apps.get_model("powered_by", "ApiKey")
        return ApiKey.objects.create(project=project, label=label, revoked_at=timezone.now() if revoked else None)

    def api_project_rows(self):
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, profile_id, owner_id, tier_id, deleted_at IS NOT NULL "
                           "FROM api_project ORDER BY id")
            return cursor.fetchall()

    def api_project_by_profile(self):
        return {row[1]: row for row in self.api_project_rows()}

    def profile_rows(self):
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM powered_by_project ORDER BY id")
            return cursor.fetchall()

    def key_rows(self):
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM powered_by_apikey ORDER BY id")
            return cursor.fetchall()

    def execute(self, sql, params=None):
        with connection.cursor() as cursor:
            cursor.execute(sql, params)


@skipUnless(connection.vendor == "postgresql", "migration 0007 SQL needs PostgreSQL")
class ApiProjectBackfillMigrationTest(MigrationTestCase):

    def test_prod_shape_creates_none(self):
        # Prod has 152 ownerless keyless Formstack listings and no key rows at all.
        apps = self.migrate(BEFORE)
        Project = apps.get_model("powered_by", "Project")
        Project.objects.bulk_create(
            [Project(project_name=f"Listing {i}", submission_source="formstack", tier="developer")
             for i in range(152)]
        )

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            self.migrate(AFTER)

        self.assertEqual(self.api_project_rows(), [])
        self.assertEqual([w for w in caught if issubclass(w.category, UserWarning)], [])

    def test_dev_shape_ids_and_keys_preserved(self):
        apps = self.migrate(BEFORE)
        owner = self.make_user(apps)
        owned = self.make_project(apps, "Owner with keys", owner=owner)
        self.make_key(apps, owned, label="owned live")
        self.make_key(apps, owned, label="owned second")
        owned_no_keys = self.make_project(apps, "Owner without keys", owner=owner)
        partner = self.make_project(apps, "Partner", tier="partner", owner=owner)
        self.make_key(apps, partner, label="partner live")
        deleted = self.make_project(apps, "Soft deleted", owner=owner, deleted_at=timezone.now())
        private = self.make_project(apps, "Private settings")
        claimed = self.make_project(apps, "Claimed legacy", owner=owner, submission_source="formstack")
        mock = self.make_project(apps, "Mock row", submission_source="manual")
        self.make_key(apps, mock, label="mock key")
        self.make_project(apps, "Ownerless listing", submission_source="formstack")
        gold = self.make_project(apps, "Legacy gold", tier="gold", submission_source="developer_settings")
        keys_before = self.key_rows()

        with self.assertWarnsRegex(UserWarning, r"1 API project\(s\) have a tier outside"):
            self.migrate(AFTER)

        rows = self.api_project_by_profile()
        self.assertEqual(
            sorted(rows),
            sorted([owned.pk, owned_no_keys.pk, partner.pk, deleted.pk, private.pk, claimed.pk, mock.pk, gold.pk]),
        )
        for project in (owned, owned_no_keys, partner, deleted, private, claimed, mock, gold):
            self.assertEqual(rows[project.pk][0], project.pk)
        self.assertEqual(rows[partner.pk][3], "partner")
        self.assertEqual(rows[gold.pk][3], "developer")
        self.assertTrue(rows[deleted.pk][4])
        self.assertFalse(rows[owned.pk][4])
        self.assertEqual(rows[owned.pk][2], owner.pk)
        # Keys still reference their profile id, which is now also the api_project id.
        self.assertEqual(self.key_rows(), keys_before)
        with connection.cursor() as cursor:
            cursor.execute("SELECT project_id FROM powered_by_apikey ORDER BY project_id")
            self.assertEqual([row[0] for row in cursor.fetchall()], sorted([owned.pk, owned.pk, partner.pk, mock.pk]))

    def test_rerun_picks_up_rows_old_images_wrote(self):
        apps = self.migrate(BEFORE)
        existing = self.make_project(apps, "Existing", owner=self.make_user(apps))
        apps = self.migrate(AFTER)
        ApiProject = apps.get_model("powered_by", "ApiProject")
        ApiProject.objects.filter(profile_id=existing.pk).update(tier="partner")
        rows_before = self.api_project_rows()

        # A profile an old image created after the forward migration: no api_project row yet.
        newcomer = self.make_project(apps, "Newcomer", owner=self.make_user(apps))
        with connection.schema_editor() as editor:
            BACKFILL.forward(apps, editor)

        rows_after = self.api_project_rows()
        self.assertEqual(
            [row for row in rows_after if row[1] != newcomer.pk],
            rows_before,
        )
        self.assertEqual([row[1] for row in rows_after if row[1] == newcomer.pk], [newcomer.pk])
        self.assertEqual(len(rows_after), len(rows_before) + 1)
        self.assertEqual(self.api_project_by_profile()[existing.pk][3], "partner")

    def test_reverse_roundtrip(self):
        apps = self.migrate(BEFORE)
        owner = self.make_user(apps)
        partner = self.make_project(apps, "Partner", tier="partner", owner=owner)
        self.make_key(apps, partner, label="live")
        self.make_key(apps, partner, label="revoked", revoked=True)
        self.make_project(apps, "Developer")
        self.make_project(apps, "Listing", submission_source="formstack")
        profiles_before, keys_before = self.profile_rows(), self.key_rows()

        self.migrate(AFTER)
        first = self.api_project_rows()
        self.assertEqual(len(first), 2)

        self.migrate(BEFORE)

        self.assertEqual(self.api_project_rows(), [])
        self.assertEqual(self.profile_rows(), profiles_before)
        self.assertEqual(self.key_rows(), keys_before)

        self.migrate(AFTER)

        self.assertEqual(self.api_project_rows(), first)

    def test_reverse_refuses_rows_the_backfill_cannot_rebuild(self):
        apps = self.migrate(BEFORE)
        rebuilt = self.make_project(apps, "Backfilled", owner=self.make_user(apps))
        created = self.make_project(apps, "Made in settings after the deploy")
        apps = self.migrate(AFTER)
        ApiProject = apps.get_model("powered_by", "ApiProject")
        # What new code writes only on api_project: an owner, a contact email, a tier, a soft-delete.
        ApiProject.objects.filter(profile_id=created.pk).update(
            owner=self.make_user(apps), contact_email="dev@example.invalid", tier="partner", deleted_at=timezone.now())
        rows_before = self.api_project_rows()

        with self.assertRaisesRegex(Exception, r"1 api_project row\(s\) \(ids \[%d\]\)" % self.api_project_by_profile()[created.pk][0]):
            self.migrate(BEFORE)

        self.assertEqual(self.api_project_rows(), rows_before)
        self.assertIn(rebuilt.pk, self.api_project_by_profile())

    def test_reverse_refuses_each_field_the_backfill_does_not_copy(self):
        for field, value in (("contact_email", "dev@example.invalid"), ("tier_id", "partner"),
                             ("deleted_at", timezone.now())):
            with self.subTest(field=field):
                apps = self.migrate(BEFORE)
                profile = self.make_project(apps, "Project " + field, owner=self.make_user(apps))
                apps = self.migrate(AFTER)
                self.execute(f"UPDATE api_project SET {field} = %s WHERE profile_id = %s", [value, profile.pk])

                with self.assertRaisesRegex(Exception, r"api_project row\(s\)"):
                    self.migrate(BEFORE)

                self.execute("DELETE FROM api_project")
                self.migrate(BEFORE)
