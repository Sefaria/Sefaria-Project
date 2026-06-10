from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="RemoteConfigEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.CharField(max_length=100, unique=True)),
                ("raw_value", models.TextField(help_text="Stored as text; parsed via value_type.")),
                (
                    "value_type",
                    models.CharField(
                        choices=[
                            ("string", "String"),
                            ("int", "Integer"),
                            ("bool", "Boolean"),
                            ("json", "JSON"),
                        ],
                        default="string",
                        max_length=10,
                    ),
                ),
                ("description", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Remote Config Entry",
                "verbose_name_plural": "Remote Config Entries",
            },
        ),
    ]
