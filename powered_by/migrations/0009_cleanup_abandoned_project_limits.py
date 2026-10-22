"""
Cleans up after an abandoned design that reached the shared development database: a per-project limits
table (powered_by_projectlimits) with its own migrations, 0006_project_limits_schema, 0007_project_limits_backfill
and 0008_project_limits_check_triggers. The tier now lives on api_project and api_tier, so this migration:

  1. drops powered_by_projectlimits (its two NOTIFY triggers and any grants on it go with it);
  2. puts the powered_by_project NOTIFY trigger back to watching tier OR deleted_at, as migration 0004 made it,
     because older images still write powered_by_project.tier;
  3. forgets the three abandoned migration names in django_migrations.

Idempotent, and a no-op where none of that exists (production): every statement is IF EXISTS or matches no row.
Not reversible: the abandoned table is not worth rebuilding, so the reverse does nothing. Postgres only; elsewhere
(SQLite in local development) it does nothing.
"""
from django.db import migrations


_CLEANUP_SQL = """
DROP TABLE IF EXISTS powered_by_projectlimits CASCADE;
DROP TRIGGER IF EXISTS apikeys_notify_projects_update ON powered_by_project;
CREATE TRIGGER apikeys_notify_projects_update AFTER UPDATE ON powered_by_project FOR EACH ROW
  WHEN (OLD.tier IS DISTINCT FROM NEW.tier OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION apikeys_notify();
DELETE FROM django_migrations
WHERE app = 'powered_by'
  AND name IN ('0006_project_limits_schema', '0007_project_limits_backfill', '0008_project_limits_check_triggers');
"""


def cleanup(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(_CLEANUP_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ("powered_by", "0008_api_key_project_triggers_grants"),
    ]

    operations = [
        migrations.RunPython(cleanup, migrations.RunPython.noop),
    ]
