"""
Change broadcast for the auth service: every committed change to a key's identity, revocation
or origins, or to a project's tier, sends a NOTIFY on 'sefaria_apikeys', whoever the writer is.
Auth services LISTEN and reload the full key set. The payload is table + op + time only, never a
key. Updates notify only when a column the auth service reads actually changes, so saving a
Powered by row or touching last_used_at sends nothing.

The auth service rejects a load with an origins value that is not an array, so a check keeps such
a row from ever being written. Postgres only; elsewhere (SQLite in local development) this migration does nothing.
"""
from django.db import migrations


CREATE_SQL = """
ALTER TABLE powered_by_apikey DROP CONSTRAINT IF EXISTS powered_by_apikey_allowed_origins_array;
ALTER TABLE powered_by_apikey ADD CONSTRAINT powered_by_apikey_allowed_origins_array
  CHECK (jsonb_typeof(allowed_origins) = 'array');
CREATE OR REPLACE FUNCTION apikeys_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('sefaria_apikeys', json_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'ts', clock_timestamp())::text);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS apikeys_notify_keys_write ON powered_by_apikey;
CREATE TRIGGER apikeys_notify_keys_write AFTER INSERT OR DELETE ON powered_by_apikey
  FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
DROP TRIGGER IF EXISTS apikeys_notify_keys_update ON powered_by_apikey;
CREATE TRIGGER apikeys_notify_keys_update AFTER UPDATE ON powered_by_apikey FOR EACH ROW
  WHEN (OLD.key IS DISTINCT FROM NEW.key OR OLD.project_id IS DISTINCT FROM NEW.project_id OR OLD.label IS DISTINCT FROM NEW.label
        OR OLD.revoked_at IS DISTINCT FROM NEW.revoked_at OR OLD.allowed_origins IS DISTINCT FROM NEW.allowed_origins)
  EXECUTE FUNCTION apikeys_notify();
DROP TRIGGER IF EXISTS apikeys_notify_projects_update ON powered_by_project;
CREATE TRIGGER apikeys_notify_projects_update AFTER UPDATE ON powered_by_project FOR EACH ROW
  WHEN (OLD.tier IS DISTINCT FROM NEW.tier) EXECUTE FUNCTION apikeys_notify();
DROP TRIGGER IF EXISTS apikeys_notify_projects_delete ON powered_by_project;
CREATE TRIGGER apikeys_notify_projects_delete AFTER DELETE ON powered_by_project
  FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
"""

DROP_SQL = """
DROP TRIGGER IF EXISTS apikeys_notify_projects_delete ON powered_by_project;
DROP TRIGGER IF EXISTS apikeys_notify_projects_update ON powered_by_project;
DROP TRIGGER IF EXISTS apikeys_notify_keys_update ON powered_by_apikey;
DROP TRIGGER IF EXISTS apikeys_notify_keys_write ON powered_by_apikey;
DROP FUNCTION IF EXISTS apikeys_notify();
ALTER TABLE powered_by_apikey DROP CONSTRAINT IF EXISTS powered_by_apikey_allowed_origins_array;
"""


def create_triggers(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(CREATE_SQL)


def drop_triggers(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(DROP_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ("powered_by", "0002_developer_settings"),
    ]

    operations = [
        migrations.RunPython(create_triggers, drop_triggers),
    ]
