from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reader", "0001_user_experiment_settings"),
    ]

    operations = [
        migrations.AlterField(
            model_name="userexperimentsettings",
            name="experiments",
            field=models.BooleanField(default=True),
        ),
    ]
