"""
API keys hang on the API project, not the profile. The auth service loads each key with its API
project's tier, so it reloads on changes to api_project, api_tier and api_tier_meter_limit, and its
read-only role may read exactly the columns it loads from those tables.

Operations, in list order:
  0. RunPython(backfill_missing_api_projects, noop): forward only. Re-runs the idempotent 0007 insert, so a
     key an older image wrote after 0007 has an API project to point at, and re-points a key that holds a
     profile id (after a rollback) at its profile's API project.
  1. AlterField: powered_by_apikey.project now references api_project. Every migrated key keeps its
     value, since 0007 gave each API project the id of its profile.
  2. RunPython(noop, remap_keys_to_profile_ids): reverse only. It moves each key on a new API project (id
     not equal to its profile id) back to the profile id, with the FK moved from api_project to
     powered_by_project around the update, so the reverse AlterField sees profile ids.
  3. RunPython(update_triggers_and_grant, restore_triggers_and_revoke): adds six NOTIFY triggers that
     call apikeys_notify(), and grants the auth service reader role SELECT on the columns it loads from
     the three API tables. Every 0004 trigger is kept unchanged.

Reverse leaves api_key_project_remap (key id -> its API project) and the next forward run restores from it, then drops it. Forward operations therefore run the backfill, AlterField, the noop, then the triggers. Django unapplies in reverse
list order: the triggers, then the remap, then the AlterField.

Notifications fire only on changes the auth service reads: an API project's tier or deletion, a tier's
per-minute limit, and a meter limit's tier, meter or monthly value. Descriptive columns (contact_email,
owner_id, profile_id, names, updated_at) never notify.

Expand only: nothing is renamed, dropped or deleted, and no row is written except the remapped key
project ids on reverse. Forward and reverse both end with a MIGRATE notification, so a listening auth
service reloads after the schema moves. Postgres only for the SQL; elsewhere (SQLite in local
development) this migration only changes the foreign key.
"""
import importlib

from django.db import migrations, models
import django.db.models.deletion


READER_ROLE = "auth_service_reader"

_FORWARD_SQL = """
DROP TRIGGER IF EXISTS apikeys_notify_api_project_update ON api_project;
CREATE TRIGGER apikeys_notify_api_project_update AFTER UPDATE ON api_project FOR EACH ROW
  WHEN (OLD.tier_id IS DISTINCT FROM NEW.tier_id OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION apikeys_notify();
DROP TRIGGER IF EXISTS apikeys_notify_api_project_delete ON api_project;
CREATE TRIGGER apikeys_notify_api_project_delete AFTER DELETE ON api_project
  FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
DROP TRIGGER IF EXISTS apikeys_notify_tier_write ON api_tier;
CREATE TRIGGER apikeys_notify_tier_write AFTER INSERT OR DELETE ON api_tier
  FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
DROP TRIGGER IF EXISTS apikeys_notify_tier_update ON api_tier;
CREATE TRIGGER apikeys_notify_tier_update AFTER UPDATE ON api_tier FOR EACH ROW
  WHEN (OLD.per_minute_per_project IS DISTINCT FROM NEW.per_minute_per_project)
  EXECUTE FUNCTION apikeys_notify();
DROP TRIGGER IF EXISTS apikeys_notify_meter_limit_write ON api_tier_meter_limit;
CREATE TRIGGER apikeys_notify_meter_limit_write AFTER INSERT OR DELETE ON api_tier_meter_limit
  FOR EACH STATEMENT EXECUTE FUNCTION apikeys_notify();
DROP TRIGGER IF EXISTS apikeys_notify_meter_limit_update ON api_tier_meter_limit;
CREATE TRIGGER apikeys_notify_meter_limit_update AFTER UPDATE ON api_tier_meter_limit FOR EACH ROW
  WHEN (OLD.tier_id IS DISTINCT FROM NEW.tier_id OR OLD.meter IS DISTINCT FROM NEW.meter
        OR OLD.monthly_per_project IS DISTINCT FROM NEW.monthly_per_project)
  EXECUTE FUNCTION apikeys_notify();
"""

_REVERSE_SQL = """
DROP TRIGGER IF EXISTS apikeys_notify_meter_limit_update ON api_tier_meter_limit;
DROP TRIGGER IF EXISTS apikeys_notify_meter_limit_write ON api_tier_meter_limit;
DROP TRIGGER IF EXISTS apikeys_notify_tier_update ON api_tier;
DROP TRIGGER IF EXISTS apikeys_notify_tier_write ON api_tier;
DROP TRIGGER IF EXISTS apikeys_notify_api_project_delete ON api_project;
DROP TRIGGER IF EXISTS apikeys_notify_api_project_update ON api_project;
"""

_PAYLOAD_NOTIFY_SQL = """
SELECT pg_notify('sefaria_apikeys', json_build_object('table', 'api_project', 'op', 'MIGRATE', 'ts', clock_timestamp())::text);
"""

_API_PROJECT_FK_SQL = """
SELECT conname FROM pg_constraint
WHERE conrelid = 'powered_by_apikey'::regclass AND contype = 'f' AND confrelid = 'api_project'::regclass
"""

# The record the reverse leaves: each key's exact API project, so a rollback and a new forward run put every key
# back where it was (an API project's id need not equal its profile's id, and a profile can have a deleted
# API project beside a replacement). It lives only between the two runs.
_REMAP_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS api_key_project_remap (
  key_id         uuid PRIMARY KEY,
  api_project_id integer NOT NULL
)
"""

_RECORD_REMAP_SQL = """
INSERT INTO api_key_project_remap (key_id, api_project_id)
SELECT id, project_id FROM powered_by_apikey
ON CONFLICT (key_id) DO UPDATE SET api_project_id = EXCLUDED.api_project_id
"""

# Forward: before 0008 every key holds a PROFILE id, so whether an API project with that id exists says nothing.
# A key with a record goes back to its recorded API project, provided that project still belongs to the profile
# the key holds. Any other key goes to an API project of its profile: a live key never to a deleted project,
# then the project that has the profile's own id (what 0007 created), then a live one, then the newest.
_POINT_KEYS_AT_API_PROJECTS_SQL = """
UPDATE powered_by_apikey k
SET project_id = COALESCE(
  (SELECT r.api_project_id FROM api_key_project_remap r JOIN api_project a ON a.id = r.api_project_id
   WHERE r.key_id = k.id AND a.profile_id = k.project_id),
  (SELECT a.id FROM api_project a WHERE a.profile_id = k.project_id
   ORDER BY (a.deleted_at IS NULL OR k.revoked_at IS NOT NULL) DESC, (a.id = k.project_id) DESC,
            (a.deleted_at IS NULL) DESC, a.id DESC LIMIT 1))
WHERE EXISTS (SELECT 1 FROM api_project a WHERE a.profile_id = k.project_id);
"""

_DROP_REMAP_TABLE_SQL = "DROP TABLE IF EXISTS api_key_project_remap"

_PROFILE_FK_SQL = """
SELECT conname FROM pg_constraint
WHERE conrelid = 'powered_by_apikey'::regclass AND contype = 'f' AND confrelid = 'powered_by_project'::regclass
  AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'powered_by_apikey'::regclass AND attname = 'project_id')]
"""

# The key FK of the forward point-at step: AlterField finds exactly this one FK, drops it and builds its own.
_POINT_FK_SQL = """
ALTER TABLE powered_by_apikey ADD CONSTRAINT powered_by_apikey_project_api_project_fk
  FOREIGN KEY (project_id) REFERENCES api_project (id) DEFERRABLE INITIALLY DEFERRED;
"""

_REMAP_SQL = """
UPDATE powered_by_apikey SET project_id = a.profile_id
FROM api_project a
WHERE a.id = powered_by_apikey.project_id AND a.profile_id <> a.id;
"""

# The FK still targets api_project when this runs, and a profile id need not exist there (a profile
# created after 0007 has no api_project row). So the FK moves to powered_by_project around the UPDATE.
# AlterField then drops this FK by its column and recreates it.
_REMAP_FK_SQL = """
ALTER TABLE powered_by_apikey ADD CONSTRAINT powered_by_apikey_project_profile_fk
  FOREIGN KEY (project_id) REFERENCES powered_by_project (id) DEFERRABLE INITIALLY DEFERRED;
"""


def _grant_sql(role):
    return f"""
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = '{role}') THEN
    GRANT SELECT (id, tier_id, deleted_at) ON api_project TO {role};
    GRANT SELECT (id, per_minute_per_project) ON api_tier TO {role};
    GRANT SELECT (tier_id, meter, monthly_per_project) ON api_tier_meter_limit TO {role};
  END IF;
END $$;
"""


def _revoke_sql(role):
    return f"""
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = '{role}') THEN
    REVOKE SELECT (id, tier_id, deleted_at) ON api_project FROM {role};
    REVOKE SELECT (id, per_minute_per_project) ON api_tier FROM {role};
    REVOKE SELECT (tier_id, meter, monthly_per_project) ON api_tier_meter_limit FROM {role};
  END IF;
END $$;
"""


def backfill_missing_api_projects(apps, schema_editor):
    # Forward only. A key an older image wrote after 0007 may point at a profile with no api_project row,
    # and the new FK would refuse it. Re-running the idempotent 0007 insert gives it one. Its deferred FK
    # events must be settled before the ALTER TABLE below. On SQLite the backfill runs through the models,
    # ids stay equal to the profile ids there, and the keys already point at them.
    backfill = importlib.import_module("powered_by.migrations.0007_api_project_backfill")
    backfill.forward(apps, schema_editor)
    if schema_editor.connection.vendor != "postgresql":
        return
    # The key FK still targets powered_by_project and the new ids are not profile ids, so it moves to
    # api_project around the UPDATE, as the reverse remap does the other way.
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(_PROFILE_FK_SQL)
        for (name,) in cursor.fetchall():
            cursor.execute(f'ALTER TABLE powered_by_apikey DROP CONSTRAINT "{name}"')
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cursor.execute(_REMAP_TABLE_SQL)
        cursor.execute(_POINT_KEYS_AT_API_PROJECTS_SQL)
        cursor.execute(_DROP_REMAP_TABLE_SQL)
        cursor.execute(_POINT_FK_SQL)
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")


def remap_keys_to_profile_ids(apps, schema_editor):
    # Reverse only. Drops the FK to api_project, remaps the keys, and points the FK at powered_by_project,
    # so the reverse AlterField finds the key column in its target state.
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(_API_PROJECT_FK_SQL)
        for (name,) in cursor.fetchall():
            cursor.execute(f'ALTER TABLE powered_by_apikey DROP CONSTRAINT "{name}"')
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cursor.execute(_REMAP_TABLE_SQL)
        cursor.execute(_RECORD_REMAP_SQL)
        cursor.execute(_REMAP_SQL)
        cursor.execute(_REMAP_FK_SQL)


def update_triggers_and_grant(apps, schema_editor, role=READER_ROLE):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(_FORWARD_SQL + _grant_sql(role) + _PAYLOAD_NOTIFY_SQL)


def restore_triggers_and_revoke(apps, schema_editor, role=READER_ROLE):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(_REVERSE_SQL + _revoke_sql(role) + _PAYLOAD_NOTIFY_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ("powered_by", "0007_api_project_backfill"),
    ]

    operations = [
        migrations.RunPython(backfill_missing_api_projects, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="apikey",
            name="project",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="api_keys",
                to="powered_by.apiproject",
            ),
        ),
        migrations.RunPython(migrations.RunPython.noop, remap_keys_to_profile_ids),
        migrations.RunPython(update_triggers_and_grant, restore_triggers_and_revoke),
    ]
