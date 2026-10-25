"""
Edge cases of the API project model that the other powered_by tests do not prove one by one (model, writer,
admin, public listing, Go fixture parity); the docstring of a test names the case it backs.

The raw SQL tests need PostgreSQL; the migration tests move the real schema and reuse the helpers of
the trigger migration test.
"""
import json
import os
import unittest
from unittest.mock import patch

from django.contrib.auth.models import Permission, User
from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.db.models.deletion import ProtectedError
from django.test import Client, TestCase
from django.utils import timezone

from powered_by import developer
from powered_by.admin import ApiKeyInline, ProjectAdmin
from powered_by.models import ApiKey, ApiProject, Project, SubmissionSource
from powered_by.tests.admin_test import admin_url, form_data
from powered_by.tests.auth_service_schema_test import FIXTURE, normalise
from powered_by.tests.developer_api_test import PROJECT, DeveloperApiTestCase
from powered_by.tests.migration_api_project_backfill_test import MigrationTestCase
from powered_by.tests import migration_api_project_triggers_test as triggers_test
from reader.conftest import create_test_user, purge_test_profiles


POSTGRES = connection.vendor == "postgresql"
AFTER, LATEST, TRIGGERS = triggers_test.AFTER, triggers_test.LATEST, triggers_test.TRIGGERS

API_TABLES = ("api_project", "api_tier", "api_tier_meter_limit")
KEY_TRIGGERS = {
    ("powered_by_apikey", "apikeys_notify_keys_write"),
    ("powered_by_apikey", "apikeys_notify_keys_update"),
    ("powered_by_project", "apikeys_notify_projects_update"),
    ("powered_by_project", "apikeys_notify_projects_delete"),
}
API_TRIGGERS = {
    ("api_project", "apikeys_notify_api_project_update"),
    ("api_project", "apikeys_notify_api_project_delete"),
    ("api_tier", "apikeys_notify_tier_write"),
    ("api_tier", "apikeys_notify_tier_update"),
    ("api_tier_meter_limit", "apikeys_notify_meter_limit_write"),
    ("api_tier_meter_limit", "apikeys_notify_meter_limit_update"),
}
# What the auth service loads from the API tables, as (column, nullable).
LOADER_COLUMNS = {
    "api_project": {"id", "tier_id", "deleted_at"},
    "api_tier": {"id", "per_minute_per_project"},
    "api_tier_meter_limit": {"tier_id", "meter", "monthly_per_project"},
}
# (table, column, referenced table): the foreign keys the loader's joins rely on.
LOADER_FOREIGN_KEYS = {
    ("api_project", "profile_id", "powered_by_project"),
    ("api_project", "tier_id", "api_tier"),
    ("api_tier_meter_limit", "tier_id", "api_tier"),
    ("powered_by_apikey", "project_id", "api_project"),
}


def query(sql, params=None):
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()


def table_columns(table):
    with connection.cursor() as cursor:
        return {column.name for column in connection.introspection.get_table_description(cursor, table)}


def make_profile(name, source=SubmissionSource.MANUAL, **fields):
    return Project.objects.create(submission_source=source, project_name=name, is_published=False, **fields)


def trigger_rows():
    return query("""
        SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid)
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal AND n.nspname = 'public' AND c.relname = ANY(%s)
    """, [["powered_by_apikey", "powered_by_project", *API_TABLES]])


class ApiProjectSchemaEdgesTest(TestCase):
    databases = "__all__"

    def setUp(self):
        self.profile = make_profile("Edge profile")

    def test_new_api_project_defaults_to_developer_in_python_and_raw_insert(self):
        created = ApiProject.objects.create(profile=self.profile)
        self.assertEqual(created.tier_id, "developer")
        self.assertIsNotNone(created.created_at)
        self.assertIsNotNone(created.updated_at)
        self.assertEqual(created.contact_email, "")
        if not POSTGRES:
            return
        other = make_profile("Raw insert profile")
        rows = query(
            "INSERT INTO api_project (profile_id, created_at, updated_at) VALUES (%s, now(), now()) "
            "RETURNING tier_id, contact_email, deleted_at, created_at, updated_at", [other.pk])
        tier_id, contact_email, deleted_at, created_at, updated_at = rows[0]
        self.assertEqual((tier_id, contact_email, deleted_at), ("developer", "", None))
        self.assertIsNotNone(created_at)
        self.assertIsNotNone(updated_at)

    @unittest.skipUnless(POSTGRES, "raw SQL constraint check needs PostgreSQL")
    def test_an_api_project_needs_an_existing_profile(self):
        # The foreign key refuses a row for a profile that does not exist.
        missing = self.profile.pk + 1_000_000
        with self.assertRaises(IntegrityError), transaction.atomic():
            query("INSERT INTO api_project (profile_id, created_at, updated_at) VALUES (%s, now(), now())"
                  " RETURNING id", [missing])
            connection.check_constraints()

    def test_column_inventory_of_the_api_project_and_key_tables(self):
        self.assertEqual(
            table_columns("api_project"),
            {"id", "profile_id", "owner_id", "contact_email", "tier_id", "deleted_at", "created_at", "updated_at"})
        key_columns = table_columns("powered_by_apikey")
        self.assertEqual(
            key_columns,
            {"id", "key", "project_id", "label", "allowed_origins", "created_at", "revoked_at", "last_used_at"})
        self.assertFalse([name for name in key_columns if "tier" in name], "a key has no tier of its own")

    def test_profile_table_keeps_its_metadata_and_the_frozen_columns(self):
        columns = table_columns("powered_by_project")
        for name in ("project_name", "project_link", "project_desc", "organization", "vibe_coded",
                     "consent_to_display", "consent_withdrawn_at", "notes"):
            self.assertIn(name, columns)
        for frozen in ("tier", "owner_id", "deleted_at"):
            self.assertIn(frozen, columns, "an older image still reads and writes " + frozen)

    def test_an_api_project_with_keys_cannot_be_deleted_and_a_profile_with_one_cannot_either(self):
        api_project = ApiProject.objects.create(profile=self.profile)
        ApiKey.objects.create(project=api_project, label="Protects the project")

        with self.assertRaises(ProtectedError):
            api_project.delete()
        with self.assertRaises(ProtectedError):
            self.profile.delete()

        self.assertTrue(ApiProject.objects.filter(pk=api_project.pk).exists())
        self.assertTrue(Project.objects.filter(pk=self.profile.pk).exists())

    @unittest.skipUnless(POSTGRES, "raw SQL constraint check needs PostgreSQL")
    def test_an_old_image_cannot_hard_delete_a_profile_that_has_an_api_project(self):
        # Older code deletes with raw-looking SQL and knows nothing of api_project.
        ApiProject.objects.create(profile=self.profile)

        with self.assertRaises(IntegrityError), transaction.atomic():
            query("DELETE FROM powered_by_project WHERE id = %s RETURNING id", [self.profile.pk])
            connection.check_constraints()

        self.assertTrue(Project.objects.filter(pk=self.profile.pk).exists())

    def test_no_pending_model_changes_in_powered_by(self):
        try:
            call_command("makemigrations", "powered_by", check=True, dry_run=True, verbosity=0)
        except SystemExit:
            self.fail("powered_by has model changes that no migration holds")

    def test_change_tier_permission_is_declared(self):
        self.assertTrue(Permission.objects.filter(
            codename="change_tier", content_type__app_label="powered_by", content_type__model="apiproject").exists())

    def test_the_key_inline_has_no_tier_and_the_profile_admin_does_not_offer_the_frozen_columns(self):
        self.assertNotIn("tier", ApiKeyInline.fields)
        self.assertNotIn("tier", {field.name for field in ApiKey._meta.get_fields()})

        def flatten(fields):
            for field in fields:
                if isinstance(field, (tuple, list)):
                    yield from flatten(field)
                else:
                    yield field

        offered = set(flatten(field for _, options in ProjectAdmin.fieldsets for field in options["fields"]))
        self.assertTrue({"tier", "owner", "deleted_at"}.isdisjoint(offered), offered)

    def test_listing_responses_never_expose_tier_limits_or_keys(self):
        profile = Project.objects.create(
            submission_source=SubmissionSource.FORMSTACK, project_name="Exposure check",
            project_link="https://exposure.example.org", is_published=True, consent_to_display=True)
        api_project = ApiProject.objects.create(profile=profile, tier_id="partner")
        api_key = ApiKey.objects.create(project=api_project, label="Exposure key label")
        staff = Client()
        staff.force_login(User.objects.create_user(username="edgelistingstaff", password="pw", is_staff=True))

        for who, client in (("public", Client()), ("staff", staff)):
            with self.subTest(who=who):
                response = client.get("/api/powered-by")
                self.assertEqual(response.status_code, 200)
                body = response.content.decode()
                self.assertNotIn(api_key.key, body)
                self.assertNotIn("Exposure key label", body)
                listed = [p for p in json.loads(body)["projects"] if p["id"] == profile.pk]
                self.assertEqual(len(listed), 1)
                for forbidden in ("tier", "tier_id", "api_projects", "api_keys", "allowed_origins", "key",
                                  "limits", "per_minute_per_project"):
                    self.assertNotIn(forbidden, listed[0])


class ApiProjectWriterEdgesTest(DeveloperApiTestCase):

    def setUp(self):
        super().setUp()
        self.set_up_developer()

    def test_a_failed_project_create_leaves_neither_profile_nor_api_project(self):
        profiles, api_projects = Project.objects.count(), ApiProject.objects.count()

        with patch.object(ApiProject.objects, "create", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                developer.create_project(self.user, dict(PROJECT))

        self.assertEqual(Project.objects.count(), profiles)
        self.assertEqual(ApiProject.objects.count(), api_projects)

    def test_every_key_of_a_project_has_the_tier_of_its_api_project(self):
        # A key has no tier; the project's tier reaches keys made before and after a change,
        # live or revoked.
        project = self.create_project()
        api_id = int(project["id"])
        first = self.create_key(project["id"], "Before")["keyId"]
        ApiProject.objects.filter(id=api_id).update(tier_id="partner")
        self.create_key(project["id"], "After")
        self.assertEqual(self.call("delete", "keys/" + first)[0], 200)

        keys = ApiKey.objects.filter(project_id=api_id)

        self.assertEqual(keys.count(), 2)
        self.assertEqual(set(keys.values_list("project__tier_id", flat=True)), {"partner"})
        self.assertEqual(keys.filter(revoked_at__isnull=False).count(), 1)

    def test_revoking_every_key_keeps_the_api_project_and_its_tier(self):
        project = self.create_project()
        api_id = int(project["id"])
        ApiProject.objects.filter(id=api_id).update(tier_id="partner")
        key_id = self.create_key(project["id"])["keyId"]

        self.assertEqual(self.call("delete", "keys/" + key_id)[0], 200)

        api_project = ApiProject.objects.get(id=api_id)
        self.assertEqual(api_project.tier_id, "partner")
        self.assertIsNone(api_project.deleted_at)
        self.assertEqual(ApiKey.objects.filter(project_id=api_id, revoked_at__isnull=True).count(), 0)

    def test_the_writer_never_writes_the_frozen_profile_columns(self):
        # Tier, owner and deleted_at of the profile belong to older images.
        project = self.create_project(visibility="public")
        self.assertEqual(self.call("post", "projects/" + project["id"],
                                   {"project": {**PROJECT, "name": "Renamed"}})[0], 200)
        self.assertEqual(self.call("delete", "projects/" + project["id"])[0], 200)
        settings_profile = ApiProject.objects.get(id=int(project["id"])).profile
        listing = Project.objects.create(
            submission_source=SubmissionSource.FORMSTACK, creator_email=self.user.email,
            project_name="Claimable", project_link="https://claimable.example.org",
            consent_to_display=True, is_published=True)
        status, state = self.call("post", "listings/{}/claim".format(listing.id))
        self.assertEqual(status, 200, state)
        self.assertEqual(self.call("post", "projects/" + state["projectId"],
                                   {"project": {**PROJECT, "name": "Claimed", "visibility": "public"}})[0], 200)
        developer.release_account_projects(self.user)

        for profile in (settings_profile, listing):
            profile.refresh_from_db()
            with self.subTest(profile=profile.project_name):
                self.assertEqual(profile.tier, "developer")
                self.assertIsNone(profile.owner_id)
                self.assertIsNone(profile.deleted_at)


class ProfileAdminEdgesTest(TestCase):
    databases = "__all__"

    def setUp(self):
        self.staff = create_test_user("pbedgeadmin", superuser=True)
        purge_test_profiles(self.staff)
        self.client.force_login(self.staff)
        self.listing = Project.objects.create(
            submission_source=SubmissionSource.FORMSTACK, submission_date=timezone.now().replace(microsecond=0),
            creator="Tova Levi", creator_email="tova@example.org", project_name="Tehillim Circle",
            project_link="https://tehillimcircle.org", project_desc="Psalms for a group.",
            sefaria_tools_used=["API"], tags=["Liturgy"], notes="Checked by staff.", consent_to_display=True,
            is_published=True)

    def tearDown(self):
        purge_test_profiles(self.staff)

    def test_saving_a_profile_without_changes_creates_no_api_project(self):
        url = admin_url("change", self.listing.pk)
        data = form_data(self.client.get(url).content.decode())

        response = self.client.post(url, data)

        self.assertEqual(response.status_code, 302, response.content.decode()[:2000])
        self.assertFalse(ApiProject.objects.filter(profile=self.listing).exists())


@unittest.skipUnless(POSTGRES, "triggers and the older-image queries need PostgreSQL")
class TriggerInventoryEdgesTest(TestCase):
    databases = "__all__"

    def test_the_notify_triggers_are_exactly_the_ten_of_the_api_project_design(self):
        names = {(table, name) for table, name, _ in trigger_rows()}

        self.assertEqual(names, KEY_TRIGGERS | API_TRIGGERS)

    def test_api_project_update_notifies_on_tier_or_deletion_and_delete_is_a_statement_trigger(self):
        definitions = {name: definition.lower() for _, name, definition in trigger_rows()}

        update = definitions["apikeys_notify_api_project_update"]
        self.assertIn("after update", update)
        self.assertIn("old.tier_id", update)
        self.assertIn("old.deleted_at", update)
        self.assertNotIn("old.contact_email", update)
        self.assertNotIn("old.owner_id", update)
        delete = definitions["apikeys_notify_api_project_delete"]
        self.assertIn("after delete", delete)
        self.assertIn("for each statement", delete)

    def test_the_profile_triggers_stay_for_older_images(self):
        definitions = {name: definition.lower() for table, name, definition in trigger_rows()
                       if table == "powered_by_project"}

        self.assertEqual(set(definitions), {"apikeys_notify_projects_update", "apikeys_notify_projects_delete"})
        self.assertIn("old.tier", definitions["apikeys_notify_projects_update"])
        self.assertIn("old.deleted_at", definitions["apikeys_notify_projects_update"])


@unittest.skipUnless(POSTGRES, "the older-image queries need PostgreSQL")
class OldImageEdgesTest(TestCase):
    databases = "__all__"

    OLD_LOADER = ("SELECT k.key, p.tier FROM powered_by_apikey k "
                  "JOIN powered_by_project p ON p.id = k.project_id WHERE k.key = %s")

    def make_key_on_a_migrated_project(self, frozen_tier):
        # The backfill gives an API project the id of its profile, so a key keeps pointing at the same number.
        profile = make_profile("Older image", tier=frozen_tier)
        api_project = ApiProject.objects.create(id=profile.pk, profile=profile)
        return api_project, ApiKey.objects.create(project=api_project, label="Older image key")

    def test_old_loader_join_still_returns_a_migrated_key(self):
        _, api_key = self.make_key_on_a_migrated_project("partner")

        self.assertEqual(query(self.OLD_LOADER, [api_key.key]), [(api_key.key, "partner")])

    def test_a_tier_changed_on_the_api_project_is_invisible_to_the_old_query(self):
        # Documented limit. The old query reads the frozen column.
        api_project, api_key = self.make_key_on_a_migrated_project("developer")
        ApiProject.objects.filter(pk=api_project.pk).update(tier_id="partner")

        self.assertEqual(query(self.OLD_LOADER, [api_key.key]), [(api_key.key, "developer")])
        self.assertEqual(ApiProject.objects.get(pk=api_project.pk).tier_id, "partner")


@unittest.skipUnless(POSTGRES, "migration SQL and LISTEN need PostgreSQL")
class MigrationEdgesTest(MigrationTestCase):
    # The LISTEN helpers of the trigger migration test, unbound, so none of its tests run again here.
    listen = triggers_test.ApiProjectTriggersMigrationTest.listen
    notified_tables = triggers_test.ApiProjectTriggersMigrationTest.notified_tables
    listen_ready = triggers_test.ApiProjectTriggersMigrationTest.listen_ready

    def trigger_names(self):
        return {(table, name) for table, name, _ in trigger_rows()}

    def test_applying_the_trigger_step_sends_a_notify(self):
        # A waiting auth service reloads at once when the schema moves.
        apps = self.migrate(LATEST)
        listener = self.listen_ready()

        with connection.schema_editor() as editor:
            TRIGGERS.update_triggers_and_grant(apps, editor)

        self.assertIn("api_project", self.notified_tables(listener))

    def test_reversing_the_trigger_step_restores_the_key_and_profile_triggers_only(self):
        self.migrate(LATEST)
        self.assertEqual(self.trigger_names(), KEY_TRIGGERS | API_TRIGGERS)

        self.migrate(AFTER)

        self.assertEqual(self.trigger_names(), KEY_TRIGGERS)

    def test_a_missing_reader_role_is_not_an_error_but_warns(self):
        apps = self.migrate(LATEST)
        role = "apikeys_test_absent_role_%d" % os.getpid()

        with connection.schema_editor() as editor, self.assertWarnsRegex(UserWarning, role):
            TRIGGERS.update_triggers_and_grant(apps, editor, role=role)

        self.assertEqual(self.trigger_names(), KEY_TRIGGERS | API_TRIGGERS)


@unittest.skipUnless(POSTGRES, "the fixture and the triggers exist on PostgreSQL only")
class FixtureApiTablesTest(TestCase):
    """
    The auth service's Go fixture matches Django for the API tables it reads.
    Tests whose name ends in known_gap_<id> assert the desired behaviour and fail today. They carry the
    `failing` marker, so the default CI run (-m "not failing") leaves them out.
    """
    databases = "__all__"
    SCHEMA = "authsvc_fixture_api_tables"

    @classmethod
    def setUpTestData(cls):
        with connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA " + cls.SCHEMA)
            cursor.execute("SET LOCAL search_path TO " + cls.SCHEMA)
            cursor.execute(FIXTURE.read_text())
            cursor.execute("SET LOCAL search_path TO public")

    def columns(self, schema):
        rows = query("""
            SELECT table_name, column_name, is_nullable FROM information_schema.columns
            WHERE table_schema = %s AND table_name = ANY(%s)
        """, [schema, list(API_TABLES)])
        return {(table, column, nullable) for table, column, nullable in rows}

    def foreign_keys(self, schema):
        rows = query("""
            SELECT rel.relname, att.attname, frel.relname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace ns ON ns.oid = rel.relnamespace
            JOIN pg_class frel ON frel.oid = con.confrelid
            JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
            WHERE con.contype = 'f' AND ns.nspname = %s
        """, [schema])
        return set(rows)

    def triggers(self, schema):
        rows = query("""
            SELECT tg.tgname, pg_get_triggerdef(tg.oid)
            FROM pg_trigger tg JOIN pg_class rel ON rel.oid = tg.tgrelid
            JOIN pg_namespace ns ON ns.oid = rel.relnamespace
            WHERE ns.nspname = %s AND rel.relname = ANY(%s) AND NOT tg.tgisinternal
        """, [schema, list(API_TABLES)])
        return {name: normalise(definition.replace(schema + ".", "")) for name, definition in rows}

    def test_the_columns_the_loader_reads_match(self):
        def loader_columns(schema):
            return {row for row in self.columns(schema) if row[1] in LOADER_COLUMNS[row[0]]}

        fixture, django = loader_columns(self.SCHEMA), loader_columns("public")

        self.assertEqual({(table, column) for table, column, _ in fixture},
                         {(table, column) for table, columns in LOADER_COLUMNS.items() for column in columns})
        self.assertEqual(fixture, django)

    def test_the_foreign_keys_the_loader_joins_on_exist_in_both(self):
        # An unknown tier is refused by the foreign key, in the fixture as in Django.
        self.assertLessEqual(LOADER_FOREIGN_KEYS, self.foreign_keys(self.SCHEMA))
        self.assertLessEqual(LOADER_FOREIGN_KEYS, self.foreign_keys("public"))

    def test_the_api_table_triggers_are_identical(self):
        # The fixture's api_tier and meter-limit triggers match Django's by name and definition.
        fixture, django = self.triggers(self.SCHEMA), self.triggers("public")

        self.assertEqual(fixture, django)
