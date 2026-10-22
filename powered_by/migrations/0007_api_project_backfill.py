"""
Creates one api_project row per existing API project profile, with the row's id equal to the profile's
id, so keys can keep pointing at the profile id until the key FK moves in 0008.

A profile is an API project when it has an owner, a developer-settings submission, or a key. Ownerless
keyless listings get no row. Forward only inserts missing rows, so a row an old image wrote, or a tier
changed later on the api_project row, survives a re-run. Reverse deletes every api_project row; the
profiles and keys are untouched.

A tier outside developer, partner, internal is normalised to developer with a warning. The sequence of
api_project.id is moved past the copied ids, so a row created afterwards cannot collide with one.

Nothing here touches the key table, and no trigger watches api_project until 0008, so this sends no
NOTIFY. The inserts queue deferred foreign-key checks, so no ALTER TABLE may run in this migration
(the key FK and triggers are 0008).
"""
import warnings

from django.db import migrations


API_PROJECT = """(p.owner_id IS NOT NULL
    OR p.submission_source = 'developer_settings'
    OR EXISTS (SELECT 1 FROM powered_by_apikey k WHERE k.project_id = p.id))"""

NO_API_PROJECT = "NOT EXISTS (SELECT 1 FROM api_project a WHERE a.profile_id = p.id)"

KNOWN_TIERS = "('developer', 'partner', 'internal')"

COUNT_UNKNOWN_SQL = f"""
SELECT count(*) FROM powered_by_project p
WHERE {API_PROJECT} AND {NO_API_PROJECT} AND p.tier NOT IN {KNOWN_TIERS}
"""

FORWARD_SQL = f"""
INSERT INTO api_project (id, profile_id, owner_id, contact_email, tier_id, deleted_at, created_at, updated_at)
SELECT p.id, p.id, p.owner_id, '',
       CASE WHEN p.tier IN {KNOWN_TIERS} THEN p.tier ELSE 'developer' END,
       p.deleted_at, now(), now()
FROM powered_by_project p
WHERE {API_PROJECT} AND {NO_API_PROJECT}
ORDER BY p.id
"""

# The explicit ids above do not advance the serial sequence, so move it past the largest id.
SEQUENCE_SQL = """
SELECT setval(pg_get_serial_sequence('api_project', 'id'), GREATEST((SELECT COALESCE(max(id), 1) FROM api_project), 1))
"""

REVERSE_SQL = "DELETE FROM api_project"


def forward(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(COUNT_UNKNOWN_SQL)
        (unknown,) = cursor.fetchone()
    if unknown:
        warnings.warn(
            f"{unknown} API project(s) have a tier outside developer, partner, internal; "
            "their api_project rows are set to developer",
            stacklevel=2,
        )
    schema_editor.execute(FORWARD_SQL)
    schema_editor.execute(SEQUENCE_SQL)


def reverse(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(REVERSE_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ("powered_by", "0006_api_project_schema"),
    ]

    operations = [
        migrations.RunPython(forward, reverse),
    ]
