from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("powered_by", "0005_api_key_origins_strings"),
    ]

    operations = [
        migrations.AlterField(
            model_name="project",
            name="tier",
            field=models.CharField(
                choices=[("developer", "Developer"), ("internal", "Internal")],
                db_default="developer",
                default="developer",
                help_text="API access tier of the project's keys.",
                max_length=20,
            ),
        ),
    ]
