"""
Migration 0008 points each key at its API project and adds the NOTIFY triggers for api_project, api_tier
and api_tier_meter_limit, plus the auth service reader's column grants. These tests move the real schema
between migrations and assert on the NOTIFY traffic, the grants and the key foreign key.
"""
import importlib
import json
import os
import select
from unittest import skipUnless

from django.db import connection

from powered_by.tests.migration_api_project_backfill_test import MigrationTestCase


AFTER = ("powered_by", "0007_api_project_backfill")
LATEST = ("powered_by", "0008_api_key_project_triggers_grants")
OLD_0005 = ("powered_by", "0005_api_key_origins_strings")
NOTIFY_CHANNEL = "sefaria_apikeys"
READER_ROLE_PREFIX = "apikeys_test_reader_"
TRIGGERS = importlib.import_module("powered_by.migrations.0008_api_key_project_triggers_grants")

KEY_FK_TARGET_SQL = """
SELECT c.confrelid::regclass::text FROM pg_constraint c
WHERE c.conrelid = 'powered_by_apikey'::regclass AND c.contype = 'f'
  AND c.conkey = ARRAY(SELECT a.attnum FROM pg_attribute a
                       WHERE a.attrelid = 'powered_by_apikey'::regclass AND a.attname = 'project_id')
"""


@skipUnless(connection.vendor == "postgresql", "migration 0008 triggers, grants and FK need PostgreSQL")
class ApiProjectTriggersMigrationTest(MigrationTestCase):

    def listen(self):
        import psycopg2
        settings = connection.settings_dict
        listener = psycopg2.connect(
            host=settings["HOST"], port=settings["PORT"], user=settings["USER"],
            password=settings["PASSWORD"], dbname=settings["NAME"])
        listener.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        with listener.cursor() as cursor:
            cursor.execute(f"LISTEN {NOTIFY_CHANNEL}")
        self.addCleanup(listener.close)
        return listener

    def notified_tables(self, listener, wait_seconds=0.5):
        if select.select([listener], [], [], wait_seconds) == ([], [], []):
            return []
        listener.poll()
        notifications = list(listener.notifies)
        listener.notifies.clear()
        return [json.loads(notification.payload)["table"] for notification in notifications]

    def listen_ready(self):
        # Control: a NOTIFY from this connection must arrive, so an empty result later means something.
        listener = self.listen()
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_notify(%s, %s)", [NOTIFY_CHANNEL, json.dumps({"table": "control"})])
        self.assertEqual(self.notified_tables(listener), ["control"])
        return listener

    def execute(self, sql, params=None):
        with connection.cursor() as cursor:
            cursor.execute(sql, params)

    def query(self, sql, params=None):
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.fetchall()

    def make_api_project(self, apps, profile, tier="developer", owner=None, **fields):
        ApiProject = apps.get_model("powered_by", "ApiProject")
        return ApiProject.objects.create(profile=profile, tier_id=tier, owner=owner, **fields)

    def make_meter_limit(self, apps, tier="developer", meter="extra", monthly=100):
        ApiTierMeterLimit = apps.get_model("powered_by", "ApiTierMeterLimit")
        return ApiTierMeterLimit.objects.create(tier_id=tier, meter=meter, monthly_per_project=monthly)

    def throwaway_role(self, name):
        self.execute(f"CREATE ROLE {name}")
        self.addCleanup(self.drop_role, name)
        return name

    def drop_role(self, name):
        self.execute(f"DROP OWNED BY {name}")
        self.execute(f"DROP ROLE {name}")

    def has_privilege(self, role, table, column):
        ((granted,),) = self.query("SELECT has_column_privilege(%s, %s, %s, 'SELECT')", [role, table, column])
        return granted

    def test_tier_change_notifies_once(self):
        apps = self.migrate(LATEST)
        api_project = self.make_api_project(apps, self.make_project(apps, "Tier change"))
        listener = self.listen_ready()

        self.execute("UPDATE api_project SET tier_id = 'partner' WHERE id = %s", [api_project.pk])

        self.assertEqual(self.notified_tables(listener), ["api_project"])

    def test_tier_limit_edit_notifies(self):
        apps = self.migrate(LATEST)
        limit = self.make_meter_limit(apps)
        listener = self.listen_ready()

        self.execute("UPDATE api_tier_meter_limit SET monthly_per_project = 200 WHERE id = %s", [limit.pk])
        self.assertEqual(self.notified_tables(listener), ["api_tier_meter_limit"])

        self.execute("UPDATE api_tier SET per_minute_per_project = 99 WHERE id = 'developer'")
        self.assertEqual(self.notified_tables(listener), ["api_tier"])

        partner_limit = self.make_meter_limit(apps, tier="partner", monthly=1)
        self.assertEqual(self.notified_tables(listener), ["api_tier_meter_limit"])

        partner_limit.delete()
        self.assertEqual(self.notified_tables(listener), ["api_tier_meter_limit"])

    def test_descriptive_edit_does_not_notify(self):
        apps = self.migrate(LATEST)
        owner = self.make_user(apps)
        profile = self.make_project(apps, "Descriptive")
        other_profile = self.make_project(apps, "Other profile")
        api_project = self.make_api_project(apps, profile, owner=owner, contact_email="before@example.invalid")
        limit = self.make_meter_limit(apps)
        listener = self.listen_ready()

        self.execute(
            "UPDATE api_project SET contact_email = 'after@example.invalid', owner_id = NULL, "
            "profile_id = %s, updated_at = now() WHERE id = %s",
            [other_profile.pk, api_project.pk])
        self.execute("UPDATE api_tier SET name = 'Renamed' WHERE id = 'developer'")
        self.execute("UPDATE api_tier_meter_limit SET updated_at = now() WHERE id = %s", [limit.pk])

        self.assertEqual(self.notified_tables(listener), [])

    def test_reader_grants(self):
        apps = self.migrate(LATEST)
        role = self.throwaway_role(f"{READER_ROLE_PREFIX}{os.getpid()}")

        with connection.schema_editor() as editor:
            TRIGGERS.update_triggers_and_grant(apps, editor, role=role)

        self.assertTrue(self.has_privilege(role, "api_project", "id"))
        self.assertTrue(self.has_privilege(role, "api_project", "tier_id"))
        self.assertTrue(self.has_privilege(role, "api_project", "deleted_at"))
        self.assertTrue(self.has_privilege(role, "api_tier", "per_minute_per_project"))
        self.assertTrue(self.has_privilege(role, "api_tier_meter_limit", "tier_id"))
        self.assertTrue(self.has_privilege(role, "api_tier_meter_limit", "meter"))
        self.assertTrue(self.has_privilege(role, "api_tier_meter_limit", "monthly_per_project"))
        self.assertFalse(self.has_privilege(role, "api_project", "profile_id"))
        self.assertFalse(self.has_privilege(role, "api_project", "owner_id"))
        self.assertFalse(self.has_privilege(role, "api_project", "contact_email"))

    def test_key_project_fk_points_at_api_project_and_migration_round_trips(self):
        apps = self.migrate(AFTER)
        profile = self.make_project(apps, "Keyed")
        apps.get_model("powered_by", "ApiKey").objects.create(project=profile, label="before")

        apps = self.migrate(LATEST)

        self.assertEqual(self.query(KEY_FK_TARGET_SQL), [("api_project",)])
        self.assertEqual(self.query("SELECT project_id FROM powered_by_apikey"), [(profile.pk,)])
        # The key was written after 0007 (an older image), so 0008 gave its profile an api_project row.
        self.assertEqual(self.query("SELECT id FROM api_project WHERE profile_id = %s", [profile.pk]), [(profile.pk,)])
        keys_at_latest = self.query("SELECT * FROM powered_by_apikey ORDER BY id")

        self.migrate(OLD_0005)
        self.migrate(LATEST)

        self.assertEqual(self.query("SELECT * FROM powered_by_apikey ORDER BY id"), keys_at_latest)

        # A profile with no api_project row yet, then an API project whose id differs from the profile id.
        apps = self.migrate(LATEST)
        newcomer = self.make_project(apps, "Newcomer")
        new_project = self.make_api_project(apps, newcomer, tier="developer", id=newcomer.pk + 1000000)
        self.assertNotEqual(new_project.pk, newcomer.pk)
        apps.get_model("powered_by", "ApiKey").objects.create(project=new_project, label="new api project")

        self.migrate(AFTER)

        self.assertEqual(self.query(KEY_FK_TARGET_SQL), [("powered_by_project",)])
        self.assertEqual(
            self.query("SELECT project_id FROM powered_by_apikey WHERE label = %s", ["new api project"]),
            [(newcomer.pk,)],
        )
