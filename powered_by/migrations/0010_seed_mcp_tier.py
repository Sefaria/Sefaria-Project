"""
Seeds the mcp API tier for databases that already ran 0006, which seeds its tiers only once. The row
lives in 0006's TIERS list (the tests reseed from it), and this migration runs the same idempotent
seed_api_tiers, so a database that ran 0006 before the mcp row existed gets it here.

Reverse is a no-op. Deleting the tier would cascade its meter limits, and PROTECT on ApiProject.tier would
refuse while any API project is on it, so a rollback leaves the row in place.
"""
import importlib

from django.db import migrations

SEED = importlib.import_module("powered_by.migrations.0006_api_project_schema")


def seed_mcp_tier(apps, schema_editor):
    SEED.seed_api_tiers(apps, using=schema_editor.connection.alias)


class Migration(migrations.Migration):

    dependencies = [
        ("powered_by", "0009_cleanup_abandoned_project_limits"),
    ]

    operations = [
        migrations.RunPython(seed_mcp_tier, migrations.RunPython.noop),
    ]
