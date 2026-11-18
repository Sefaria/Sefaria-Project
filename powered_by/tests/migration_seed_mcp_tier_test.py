"""
Migration 0010 gives a database that already ran 0006 the mcp tier. The autouse tier fixture in conftest.py
seeds the same rows before every test, so a plain assertion on the rows cannot tell whether 0010 does anything.
These tests remove the mcp rows first (the state of a database that ran 0006 before the mcp row existed), then
apply 0010 through the migration executor and check what it creates and what it leaves alone.
"""

from unittest import skipUnless

from django.db import connection

from powered_by.tests.migration_api_project_backfill_test import MigrationTestCase

BEFORE = ("powered_by", "0009_cleanup_abandoned_project_limits")
AFTER = ("powered_by", "0010_seed_mcp_tier")


@skipUnless(connection.vendor == "postgresql", "migrating back through 0006-0009 needs PostgreSQL")
class SeedMcpTierMigrationTest(MigrationTestCase):
    def drop_mcp_tier(self, apps):
        # Deleting the tier cascades its meter limits.
        apps.get_model("powered_by", "ApiTier").objects.filter(id="mcp").delete()

    def migrate_to_a_database_without_the_mcp_tier(self):
        apps = self.migrate(BEFORE)
        self.drop_mcp_tier(apps)
        ApiTier = apps.get_model("powered_by", "ApiTier")
        ApiTierMeterLimit = apps.get_model("powered_by", "ApiTierMeterLimit")
        self.assertFalse(ApiTier.objects.filter(id="mcp").exists())
        self.assertFalse(ApiTierMeterLimit.objects.filter(tier_id="mcp").exists())
        return apps

    def test_0010_creates_the_mcp_tier_and_its_semantic_limit(self):
        self.migrate_to_a_database_without_the_mcp_tier()

        apps = self.migrate(AFTER)

        tier = apps.get_model("powered_by", "ApiTier").objects.get(id="mcp")
        self.assertEqual(tier.name, "MCP server")
        self.assertEqual(tier.per_minute_per_project, 6000)
        limits = apps.get_model("powered_by", "ApiTierMeterLimit").objects.filter(tier_id="mcp")
        self.assertEqual([(limit.meter, limit.monthly_per_project) for limit in limits], [("semantic", 1000000)])

    def test_0010_does_not_overwrite_a_customized_mcp_tier(self):
        apps = self.migrate_to_a_database_without_the_mcp_tier()
        ApiTier = apps.get_model("powered_by", "ApiTier")
        ApiTierMeterLimit = apps.get_model("powered_by", "ApiTierMeterLimit")
        ApiTier.objects.create(id="mcp", name="Custom MCP", per_minute_per_project=7)
        ApiTierMeterLimit.objects.create(tier_id="mcp", meter="semantic", monthly_per_project=11)

        apps = self.migrate(AFTER)

        tier = apps.get_model("powered_by", "ApiTier").objects.get(id="mcp")
        self.assertEqual((tier.name, tier.per_minute_per_project), ("Custom MCP", 7))
        limit = apps.get_model("powered_by", "ApiTierMeterLimit").objects.get(tier_id="mcp", meter="semantic")
        self.assertEqual(limit.monthly_per_project, 11)
