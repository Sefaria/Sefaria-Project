from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="UserExperimentSettings",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("experiments", models.BooleanField(default=False)),
                ("user", models.OneToOneField(on_delete=models.deletion.CASCADE, related_name="experiment_settings", to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
