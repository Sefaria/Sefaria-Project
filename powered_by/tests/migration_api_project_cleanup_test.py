"""
Migration 0009 removes what the abandoned per-project limits design left on a shared development database. The
fixture below recreates that leftover state on top of the real schema, runs the migration's function twice, and
checks the leftovers are gone, the project trigger watches tier OR deleted_at again, and a second run changes nothing.
"""
import importlib
from unittest import skipUnless

from django.db import connection

from powered_by.tests.migration_api_project_backfill_test import MigrationTestCase


CLEANUP = importlib.import_module("powered_by.migrations.0009_cleanup_abandoned_project_limits")
ABANDONED = ("0006_project_limits_schema", "0007_project_limits_backfill", "0008_project_limits_check_triggers")

NARROWED_TRIGGER_SQL = """
DROP TRIGGER IF EXISTS apikeys_notify_projects_update ON powered_by_project;
CREATE TRIGGER apikeys_notify_projects_update AFTER UPDATE ON powered_by_project FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) EXECUTE FUNCTION apikeys_notify();
"""

FAKE_LIMITS_SQL = """
CREATE TABLE powered_by_projectlimits (project_id integer PRIMARY KEY, tier varchar(20) NOT NULL);
CREATE TRIGGER apikeys_notify_limits_write AFTER INSERT OR DELETE ON powered_by_projectlimits
  FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
CREATE TRIGGER apikeys_notify_limits_update AFTER UPDATE ON powered_by_projectlimits
  FOR EACH ROW WHEN (OLD.tier IS DISTINCT FROM NEW.tier) EXECUTE FUNCTION apikeys_notify();
"""


@skipUnless(connection.vendor == "postgresql", "migration 0009 SQL needs PostgreSQL")
class CleanupAbandonedLimitsMigrationTest(MigrationTestCase):

    def execute(self, sql, params=None):
        with connection.cursor() as cursor:
            cursor.execute(sql, params)

    def query(self, sql, params=None):
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.fetchall()

    def run_cleanup(self):
        with connection.schema_editor() as schema_editor:
            CLEANUP.cleanup(None, schema_editor)

    def leave_the_abandoned_state(self):
        self.execute(FAKE_LIMITS_SQL + NARROWED_TRIGGER_SQL)
        for name in ABANDONED:
            self.execute("INSERT INTO django_migrations (app, name, applied) VALUES ('powered_by', %s, now())", [name])

    def abandoned_migration_rows(self):
        return self.query("SELECT name FROM django_migrations WHERE app = 'powered_by' AND name = ANY(%s)", [list(ABANDONED)])

    def project_trigger_when(self):
        (definition,) = self.query(
            "SELECT pg_get_triggerdef(oid) FROM pg_trigger "
            "WHERE tgname = 'apikeys_notify_projects_update' AND tgrelid = 'powered_by_project'::regclass")[0]
        return definition.lower()

    def limits_table_exists(self):
        return self.query("SELECT to_regclass('powered_by_projectlimits')")[0][0] is not None

    def test_cleanup_removes_the_abandoned_design_and_is_idempotent(self):
        self.migrate(("powered_by", "0009_cleanup_abandoned_project_limits"))
        self.leave_the_abandoned_state()
        self.assertTrue(self.limits_table_exists())
        self.assertEqual(len(self.abandoned_migration_rows()), 3)
        self.assertNotIn("old.tier", self.project_trigger_when())

        self.run_cleanup()

        self.assertFalse(self.limits_table_exists())
        self.assertEqual(self.abandoned_migration_rows(), [])
        self.assertEqual(self.query(
            "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'apikeys_notify_limits_%'"), [(0,)])
        when = self.project_trigger_when()
        self.assertIn("old.tier", when)
        self.assertIn("old.deleted_at", when)
        trigger_after_first_run = when

        self.run_cleanup()

        self.assertEqual(self.project_trigger_when(), trigger_after_first_run)
        self.assertFalse(self.limits_table_exists())

    def test_cleanup_is_a_no_op_where_nothing_was_abandoned(self):
        self.migrate(("powered_by", "0009_cleanup_abandoned_project_limits"))
        before = self.project_trigger_when()

        self.run_cleanup()

        self.assertEqual(self.project_trigger_when(), before)
        self.assertEqual(self.abandoned_migration_rows(), [])
