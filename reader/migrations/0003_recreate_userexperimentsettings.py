from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """
    Recreate the table 0002 dropped.

    CI deploys a sandbox from every non-draft PR, and web pods run `manage.py migrate`
    on boot, so 0002 was applied to the shared cauldron Postgres (and, via pytest's
    --reuse-db setup, to the shared test database) long before this branch's deploy
    slot. This migration lets the same machinery repair both databases: the next CI
    run skips the already-recorded 0002 and applies this recreate.

    The table comes back empty; the shared-DB rows it held were dev data, restorable
    from the weekly production pg dump if ever needed. Before this branch merges,
    squash 0002 + 0003 into a single delete migration under a fresh name — a name
    already recorded in django_migrations would be skipped where this ran.
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('reader', '0002_delete_userexperimentsettings'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserExperimentSettings',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('experiments', models.BooleanField(default=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='experiment_settings', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'User experiment settings',
                'verbose_name_plural': 'User experiment settings',
            },
        ),
    ]
