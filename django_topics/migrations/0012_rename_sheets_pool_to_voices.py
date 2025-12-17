# Generated migration to rename sheets pool to voices

from django.db import migrations

import structlog
logger = structlog.get_logger(__name__)



def rename_sheets_to_voices(apps, schema_editor):
    """Rename the 'sheets' pool to 'voices' in the database."""
    TopicPool = apps.get_model('django_topics', 'TopicPool')
    
    try:
        sheets_pool = TopicPool.objects.get(name='sheets')
        sheets_pool.name = 'voices'
        sheets_pool.save()
        logger.info("Successfully renamed 'sheets' pool to 'voices'")
    except TopicPool.DoesNotExist:
        logger.warning("No 'sheets' pool found to rename")


def reverse_voices_to_sheets(apps, schema_editor):
    """Reverse migration: rename 'voices' pool back to 'sheets'."""
    TopicPool = apps.get_model('django_topics', 'TopicPool')
    
    try:
        voices_pool = TopicPool.objects.get(name='voices')
        voices_pool.name = 'sheets'
        voices_pool.save()
        logger.info("Successfully renamed 'voices' pool back to 'sheets'")
    except TopicPool.DoesNotExist:
        logger.warning("No 'voices' pool found to rename back")


class Migration(migrations.Migration):

    dependencies = [
        ('django_topics', '0010_auto_20250216_0639'),  # Latest migration
    ]

    operations = [
        # migrations.RunPython(rename_sheets_to_voices, reverse_voices_to_sheets),
    ]
