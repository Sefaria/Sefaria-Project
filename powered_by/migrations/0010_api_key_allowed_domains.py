"""
allowed_origins now holds domains (example.org), not origins (https://example.org): the auth service accepts a
request whose Origin host is the domain or a subdomain of it. Rewrites any stored origin to its domain, so keys
restricted before this change keep working. The column keeps its name, which the NOTIFY trigger and the auth
service's loader use. Not reversed: an origin can't be rebuilt from a domain, and the old auth service refuses a
domain, which fails closed.
"""
from urllib.parse import urlsplit

from django.db import migrations, models

import powered_by.models


def _domain(origin):
    if "://" not in origin:
        return origin
    netloc = urlsplit(origin).netloc.lower()
    host = netloc[:netloc.index("]") + 1] if netloc.startswith("[") else netloc.split(":")[0]
    return host[len("www."):] if host.startswith("www.") else host


def to_domains(apps, schema_editor):
    ApiKey = apps.get_model("powered_by", "ApiKey")
    for api_key in ApiKey.objects.using(schema_editor.connection.alias).exclude(allowed_origins=[]):
        domains = list(dict.fromkeys(_domain(o) for o in api_key.allowed_origins))
        if domains != api_key.allowed_origins:
            api_key.allowed_origins = domains
            api_key.save(update_fields=["allowed_origins"])


class Migration(migrations.Migration):

    dependencies = [
        ("powered_by", "0009_cleanup_abandoned_project_limits"),
    ]

    operations = [
        migrations.AlterField(
            model_name="apikey",
            name="allowed_origins",
            field=models.JSONField(
                blank=True, db_default=[], default=list,
                help_text='Domains (e.g. "example.org") whose sites, and their subdomains, may call with this key. Empty allows any.',
                validators=[powered_by.models.validate_allowed_origins],
            ),
        ),
        migrations.RunPython(to_domains, migrations.RunPython.noop),
    ]
