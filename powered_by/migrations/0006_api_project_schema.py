"""
Expand-only: adds the API tier and API project tables, and seeds the three tiers.

Nothing existing changes here. ApiKey.project still points at Project, and Project keeps its
tier and owner columns; moving keys onto api_project is a later migration. Reversing this drops
the three new tables and leaves the seeded rows with them.

The meter limits are placeholders. Daniel sets the real numbers.
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


# Placeholder limits. Daniel sets the real numbers; edit these rows, not this migration.
TIERS = [
    # (slug, name, per_minute_per_project, semantic-meter monthly_per_project)
    ("developer", "Developer", 600, 100000),
    ("partner", "Partner", 6000, 1000000),
    ("internal", "Internal", 60000, 100000000),
]


def seed_api_tiers(apps, using="default"):
    """Idempotently create the TIERS rows and their semantic meter limits.

    The migration calls this with its historical models. Tests call it with the live app registry
    (django.apps.apps) before each test, because --reuse-db keeps the test database without rerunning
    migrations, and a TransactionTestCase flush empties these tables. Both paths share this code.
    """
    ApiTier = apps.get_model("powered_by", "ApiTier")
    ApiTierMeterLimit = apps.get_model("powered_by", "ApiTierMeterLimit")
    for slug, name, per_minute, monthly in TIERS:
        tier, _ = ApiTier.objects.using(using).get_or_create(
            id=slug, defaults={"name": name, "per_minute_per_project": per_minute},
        )
        ApiTierMeterLimit.objects.using(using).get_or_create(
            tier=tier, meter="semantic", defaults={"monthly_per_project": monthly},
        )


def seed_tiers(apps, schema_editor):
    seed_api_tiers(apps, using=schema_editor.connection.alias)


class Migration(migrations.Migration):

    dependencies = [
        ("powered_by", "0005_api_key_origins_strings"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ApiTier",
            fields=[
                ("id", models.CharField(help_text="Slug, e.g. developer.", max_length=20, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=100)),
                ("per_minute_per_project", models.PositiveIntegerField(help_text="Requests per minute allowed for each API project on this tier.")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "API tier",
                "db_table": "api_tier",
                "ordering": ["id"],
            },
        ),
        migrations.CreateModel(
            name="ApiTierMeterLimit",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("meter", models.SlugField(help_text="Meter name, e.g. semantic.", max_length=50)),
                ("monthly_per_project", models.BigIntegerField(help_text="Units of this meter allowed per API project per month.")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("tier", models.ForeignKey(help_text="The tier this limit belongs to.", on_delete=django.db.models.deletion.CASCADE, related_name="meter_limits", to="powered_by.apitier")),
            ],
            options={
                "verbose_name": "API tier meter limit",
                "db_table": "api_tier_meter_limit",
            },
        ),
        migrations.CreateModel(
            name="ApiProject",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("contact_email", models.EmailField(blank=True, db_default="", default="", help_text="Contact address for this API project.", max_length=254)),
                ("deleted_at", models.DateTimeField(blank=True, help_text="When the API project was deleted. The row stays; a deleted project is not live.", null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.ForeignKey(blank=True, help_text="The account that manages this API project.", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="api_projects", to=settings.AUTH_USER_MODEL)),
                ("profile", models.ForeignKey(help_text="The Powered by Sefaria profile this API project belongs to.", on_delete=django.db.models.deletion.PROTECT, related_name="api_projects", to="powered_by.project")),
                ("tier", models.ForeignKey(db_default="developer", default="developer", help_text="API access tier of this project.", on_delete=django.db.models.deletion.PROTECT, to="powered_by.apitier")),
            ],
            options={
                "verbose_name": "API project",
                "db_table": "api_project",
                "ordering": ["-created_at"],
                "permissions": [("change_tier", "Can change an API project's tier")],
            },
        ),
        migrations.AddConstraint(
            model_name="apitiermeterlimit",
            constraint=models.UniqueConstraint(fields=("tier", "meter"), name="api_tier_meter_limit_unique"),
        ),
        migrations.AddConstraint(
            model_name="apiproject",
            constraint=models.UniqueConstraint(condition=models.Q(("deleted_at__isnull", True)), fields=("profile",), name="api_project_one_live_per_profile"),
        ),
        migrations.RunPython(seed_tiers, migrations.RunPython.noop),
    ]
