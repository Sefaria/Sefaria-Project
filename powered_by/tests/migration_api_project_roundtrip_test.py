"""
Migrations 0007 and 0008 under the awkward cases a shared development database produces: an id that is already
taken when the backfill inserts, a rollback to 0007 followed by a new forward run when API project ids no longer
match profile ids, and a development SQLite database. Keys must end on the API project they started on.
"""
import importlib
from unittest import skipUnless

from django.db import connection, connections
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

from powered_by.tests.migration_api_project_backfill_test import MigrationTestCase


BEFORE = ("powered_by", "0006_api_project_schema")
AFTER = ("powered_by", "0007_api_project_backfill")
LATEST = ("powered_by", "0008_api_key_project_triggers_grants")
BACKFILL = importlib.import_module("powered_by.migrations.0007_api_project_backfill")


@skipUnless(connection.vendor == "postgresql", "the backfill and key remap SQL need PostgreSQL")
class BackfillTakenIdTest(MigrationTestCase):

    def test_a_rerun_with_a_taken_id_inserts_under_another_id(self):
        apps = self.migrate(BEFORE)
        Project, ApiProject = apps.get_model("powered_by", "Project"), apps.get_model("powered_by", "ApiProject")
        wanted = self.make_project(apps, "Wants its own id")
        other = self.make_project(apps, "Holds that id")
        # An API project of another profile already holds the id the backfill would give `wanted`.
        ApiProject.objects.create(id=wanted.pk, profile=other, tier_id="developer")

        self.migrate(AFTER)

        rows = self.api_project_by_profile()
        self.assertEqual(rows[other.pk][0], wanted.pk)
        self.assertIn(wanted.pk, rows)
        self.assertNotEqual(rows[wanted.pk][0], wanted.pk)
        self.assertEqual(len(rows), 2)

        # Idempotent: a second run inserts nothing and moves nothing.
        before = self.api_project_rows()
        with connection.schema_editor() as schema_editor:
            BACKFILL.forward(None, schema_editor)
        self.assertEqual(self.api_project_rows(), before)

    def test_new_rows_after_the_backfill_do_not_collide_with_it(self):
        apps = self.migrate(BEFORE)
        wanted = self.make_project(apps, "Wants its own id")
        other = self.make_project(apps, "Holds that id")
        apps.get_model("powered_by", "ApiProject").objects.create(id=wanted.pk, profile=other, tier_id="developer")
        apps = self.migrate(AFTER)
        late = self.make_project(apps, "Late")

        created = apps.get_model("powered_by", "ApiProject").objects.create(profile=late, tier_id="developer")

        self.assertNotIn(created.pk, {row[0] for row in self.api_project_rows() if row[1] != late.pk})


@skipUnless(connection.vendor == "postgresql", "the backfill and key remap SQL need PostgreSQL")
class KeyRemapRoundTripTest(MigrationTestCase):

    def key_projects(self):
        return dict(self.query("SELECT label, project_id FROM powered_by_apikey ORDER BY label"))

    def query(self, sql, params=None):
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.fetchall()

    def roundtrip(self):
        self.migrate(AFTER)
        return self.migrate(LATEST)

    def test_a_deleted_and_a_replacement_api_project_keep_their_own_keys(self):
        apps = self.migrate(LATEST)
        ApiProject, ApiKey = apps.get_model("powered_by", "ApiProject"), apps.get_model("powered_by", "ApiKey")
        profile = self.make_project(apps, "Replaced")
        deleted = ApiProject.objects.create(id=profile.pk, profile=profile, tier_id="developer", deleted_at=timezone.now())
        replacement = ApiProject.objects.create(id=profile.pk + 100000, profile=profile, tier_id="developer")
        ApiKey.objects.create(project=deleted, label="old", revoked_at=timezone.now())
        ApiKey.objects.create(project=replacement, label="live")
        before = self.key_projects()
        self.assertEqual(before, {"old": deleted.pk, "live": replacement.pk})

        self.roundtrip()

        self.assertEqual(self.key_projects(), before)

    def test_an_unrelated_id_collision_does_not_move_keys_to_another_profile(self):
        apps = self.migrate(LATEST)
        ApiProject, ApiKey = apps.get_model("powered_by", "ApiProject"), apps.get_model("powered_by", "ApiKey")
        first, second = self.make_project(apps, "First"), self.make_project(apps, "Second")
        # Each API project holds the other profile's id.
        on_second_id = ApiProject.objects.create(id=second.pk, profile=first, tier_id="developer")
        on_first_id = ApiProject.objects.create(id=first.pk, profile=second, tier_id="partner")
        ApiKey.objects.create(project=on_second_id, label="first-key")
        ApiKey.objects.create(project=on_first_id, label="second-key")
        before = self.key_projects()

        self.roundtrip()

        self.assertEqual(self.key_projects(), before)
        self.assertEqual(self.query("SELECT label, a.profile_id FROM powered_by_apikey k JOIN api_project a ON a.id = k.project_id ORDER BY label"),
                         [("first-key", first.pk), ("second-key", second.pk)])

    def test_the_remap_record_is_gone_after_the_forward_run(self):
        apps = self.migrate(LATEST)
        profile = self.make_project(apps, "Recorded")
        project = apps.get_model("powered_by", "ApiProject").objects.create(profile=profile, tier_id="developer")
        apps.get_model("powered_by", "ApiKey").objects.create(project=project, label="k")

        self.migrate(AFTER)
        self.assertIsNotNone(self.query("SELECT to_regclass('api_key_project_remap')")[0][0])
        self.migrate(LATEST)

        self.assertIsNone(self.query("SELECT to_regclass('api_key_project_remap')")[0][0])

    def test_keys_without_a_record_go_to_the_live_api_project(self):
        # Rows older images wrote while 0008 was rolled back have no record: a live key must not land on the
        # deleted API project, a revoked one may stay on it.
        apps = self.migrate(AFTER)
        ApiProject, ApiKey = apps.get_model("powered_by", "ApiProject"), apps.get_model("powered_by", "ApiKey")
        profile = self.make_project(apps, "No record")
        deleted = ApiProject.objects.create(id=profile.pk, profile=profile, tier_id="developer", deleted_at=timezone.now())
        live = ApiProject.objects.create(id=profile.pk + 100000, profile=profile, tier_id="developer")
        ApiKey.objects.create(project=profile, label="live")
        ApiKey.objects.create(project=profile, label="revoked", revoked_at=timezone.now())

        self.migrate(LATEST)

        self.assertEqual(self.key_projects(), {"live": live.pk, "revoked": deleted.pk})


class SqliteBackfillTest(TransactionTestCase):
    """A development SQLite database has the same ids and keys after 0006 -> 0008 as the Postgres path gives."""
    databases = "__all__"
    ALIAS = "sqlite_roundtrip"

    def setUp(self):
        from django.db.utils import ConnectionHandler

        self.handler = ConnectionHandler({
            "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"},
            self.ALIAS: {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"},
        })
        self.sqlite = self.handler[self.ALIAS]
        connections[self.ALIAS] = self.sqlite
        self.addCleanup(self.drop_connection)

    def drop_connection(self):
        del connections[self.ALIAS]
        self.sqlite.close()

    def migrate(self, target):
        executor = MigrationExecutor(self.sqlite)
        executor.loader.build_graph()
        executor.migrate([target])
        executor.loader.build_graph()
        return executor.loader.project_state(target).apps

    def test_migrating_with_an_existing_key_gives_it_an_api_project(self):
        apps = self.migrate(BEFORE)
        Project, ApiKey = apps.get_model("powered_by", "Project"), apps.get_model("powered_by", "ApiKey")
        profile = Project.objects.using(self.ALIAS).create(
            project_name="Dev", submission_source="developer_settings", tier="developer")
        listing = Project.objects.using(self.ALIAS).create(
            project_name="Plain listing", submission_source="formstack", tier="developer")
        key = ApiKey.objects.using(self.ALIAS).create(project=profile, label="k")

        apps = self.migrate(LATEST)

        ApiProject, ApiKey = apps.get_model("powered_by", "ApiProject"), apps.get_model("powered_by", "ApiKey")
        rows = list(ApiProject.objects.using(self.ALIAS).values_list("id", "profile_id"))
        self.assertEqual(rows, [(profile.pk, profile.pk)])
        self.assertNotIn(listing.pk, [profile_id for _, profile_id in rows])
        self.assertEqual(ApiKey.objects.using(self.ALIAS).get(id=key.id).project_id, profile.pk)
