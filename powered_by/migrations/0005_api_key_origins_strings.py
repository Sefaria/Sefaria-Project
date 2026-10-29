"""
allowed_origins must be an array of strings, and a project's deletion must notify the auth service.

Migration 0004 only checked that allowed_origins is an array, which admits [1] and ["a", {}].
This tightens the check to an array whose elements are all strings. It also recreates the project
UPDATE trigger so that setting deleted_at notifies, since the auth service skips deleted projects.

Adding the constraint fails if a malformed row already exists: find them first with
SELECT id FROM powered_by_apikey WHERE jsonb_typeof(allowed_origins) <> 'array'
OR jsonb_path_exists(allowed_origins, '$[*] ? (@.type() != "string")');
Postgres only (jsonpath needs 12+); elsewhere (SQLite in local development) this migration only
alters the field.
"""
from django.db import migrations, models

import powered_by.models


FORWARD_SQL = """
ALTER TABLE powered_by_apikey DROP CONSTRAINT IF EXISTS powered_by_apikey_allowed_origins_array;
ALTER TABLE powered_by_apikey ADD CONSTRAINT powered_by_apikey_allowed_origins_array
  CHECK (jsonb_typeof(allowed_origins) = 'array'
         AND NOT jsonb_path_exists(allowed_origins, '$[*] ? (@.type() != "string")'));
DROP TRIGGER IF EXISTS apikeys_notify_projects_update ON powered_by_project;
CREATE TRIGGER apikeys_notify_projects_update AFTER UPDATE ON powered_by_project FOR EACH ROW
  WHEN (OLD.tier IS DISTINCT FROM NEW.tier OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION apikeys_notify();
"""

REVERSE_SQL = """
ALTER TABLE powered_by_apikey DROP CONSTRAINT IF EXISTS powered_by_apikey_allowed_origins_array;
ALTER TABLE powered_by_apikey ADD CONSTRAINT powered_by_apikey_allowed_origins_array
  CHECK (jsonb_typeof(allowed_origins) = 'array');
DROP TRIGGER IF EXISTS apikeys_notify_projects_update ON powered_by_project;
CREATE TRIGGER apikeys_notify_projects_update AFTER UPDATE ON powered_by_project FOR EACH ROW
  WHEN (OLD.tier IS DISTINCT FROM NEW.tier) EXECUTE FUNCTION apikeys_notify();
"""


def tighten(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(FORWARD_SQL)


def loosen(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(REVERSE_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ("powered_by", "0004_api_key_notify_triggers"),
    ]

    operations = [
        migrations.AlterField(
            model_name="apikey",
            name="allowed_origins",
            field=models.JSONField(
                blank=True, db_default=[], default=list,
                help_text='Origins (e.g. "https://example.org") allowed to call with this key. Empty allows any.',
                validators=[powered_by.models.validate_allowed_origins],
            ),
        ),
        migrations.RunPython(tighten, loosen),
    ]
