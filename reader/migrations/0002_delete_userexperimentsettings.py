from django.db import migrations


class Migration(migrations.Migration):
    """
    Drop the experiments whitelist.

    Nothing has read this table since the experiments framework was removed. Reversing
    this migration recreates the schema, not the rows — run
    scripts/migrations/archive_user_experiment_settings.py first, and restore from that
    archive if the rows are ever needed again.
    """

    dependencies = [
        ('reader', '0001_initial'),
    ]

    operations = [
        migrations.DeleteModel(
            name='UserExperimentSettings',
        ),
    ]
