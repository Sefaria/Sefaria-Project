"""
Give the clients' remote config (`feature.client.remote_config_json`, a JSON object both clients read) a `webVitals` entry, off, so
admins find the switch for the new reader's web_vitals event (reader-next/src/lib/analytics/web-vitals.ts: on only when
`webVitals.enabled` is 1, sampled at `webVitals.sampleRate`). Missing means off too.

Idempotent and never overwrites an admin's value: the row is created when missing; an existing JSON object gets `webVitals` only
when it has none; a row that is not JSON or not an object is left untouched. Reverse does nothing.
"""

import json

from django.db import migrations

KEY = "feature.client.remote_config_json"
WEB_VITALS_OFF = {"enabled": 0, "sampleRate": 0.1}


def with_web_vitals(raw_value):
    """The row's new raw value, or None when it must stay as it is."""
    try:
        value = json.loads(raw_value)
    except (TypeError, ValueError):
        return None
    if not isinstance(value, dict) or "webVitals" in value:
        return None
    return json.dumps({**value, "webVitals": WEB_VITALS_OFF})


def add_web_vitals(apps, schema_editor):
    RemoteConfigEntry = apps.get_model("remote_config", "RemoteConfigEntry")
    entry, created = RemoteConfigEntry.objects.get_or_create(
        key=KEY,
        defaults={
            "raw_value": json.dumps({"webVitals": WEB_VITALS_OFF}),
            "value_type": "json",
            "description": (
                "Settings the browser clients read. webVitals: the new reader's web_vitals event, enabled 1 = on, sampleRate "
                "0..1 = share of page loads measured (missing = off)."
            ),
            "is_active": True,
        },
    )
    if created or entry.value_type != "json":
        return
    new_raw = with_web_vitals(entry.raw_value)
    if new_raw is not None:
        entry.raw_value = new_raw
        entry.save(update_fields=["raw_value", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("remote_config", "0004_reader_next_disabled"),
    ]

    operations = [
        migrations.RunPython(add_web_vitals, migrations.RunPython.noop),
    ]
