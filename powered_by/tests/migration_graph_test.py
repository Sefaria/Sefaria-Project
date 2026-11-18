"""
The migration graph has one leaf per app. Two branches that each add the next powered_by number (0010 twice) make
every web pod's startup `migrate` fail, so the pods crash-loop. With two leaves the test database cannot be built
either, so every database test errors; this test needs no database and names the conflict.
"""

from django.db.migrations.loader import MigrationLoader


def test_every_app_has_a_single_leaf_migration():
    conflicts = MigrationLoader(None, ignore_no_migrations=True).detect_conflicts()
    assert conflicts == {}, f"apps with more than one leaf migration: {conflicts}"
