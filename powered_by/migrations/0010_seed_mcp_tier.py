"""
Seeds the mcp API tier for databases that already ran 0006, which seeds its tiers only once. The row is
inlined here, not imported from 0006's TIERS list, so this migration stays frozen if a tier is added later.
It uses get_or_create, so a row someone has customised is never overwritten.

Reverse is a no-op. Deleting the tier would cascade its meter limits, and PROTECT on ApiProject.tier would
refuse while any API project is on it, so a rollback leaves the row in place.
"""

from django.db import migrations

MCP_TIER = {"id": "mcp", "name": "MCP server", "per_minute_per_project": 6000}
MCP_SEMANTIC_MONTHLY_PER_PROJECT = 1000000


def seed_mcp_tier(apps, schema_editor):
    using = schema_editor.connection.alias
    ApiTier = apps.get_model("powered_by", "ApiTier")
    ApiTierMeterLimit = apps.get_model("powered_by", "ApiTierMeterLimit")
    tier, _ = ApiTier.objects.using(using).get_or_create(
        id=MCP_TIER["id"],
        defaults={"name": MCP_TIER["name"], "per_minute_per_project": MCP_TIER["per_minute_per_project"]},
    )
    ApiTierMeterLimit.objects.using(using).get_or_create(
        tier=tier,
        meter="semantic",
        defaults={"monthly_per_project": MCP_SEMANTIC_MONTHLY_PER_PROJECT},
    )


class Migration(migrations.Migration):
    dependencies = [
        ("powered_by", "0009_cleanup_abandoned_project_limits"),
    ]

    operations = [
        migrations.RunPython(seed_mcp_tier, migrations.RunPython.noop),
    ]
