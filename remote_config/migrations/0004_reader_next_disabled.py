"""
Create the remote config entry for the new reader's kill switch (sefaria/helper/reader_choice.py next_disabled), off, so admins
find it in the admin. Code treats a missing or unknown value as off too. Remote config reloads only in the process that saves
it: restart the web pods after changing it.
"""

from django.db import migrations

KEY = "feature.reader.next.disabled"


def create_entry(apps, schema_editor):
    RemoteConfigEntry = apps.get_model("remote_config", "RemoteConfigEntry")
    # Never overwrite a value an admin already set.
    RemoteConfigEntry.objects.get_or_create(
        key=KEY,
        defaults={
            "raw_value": "0",
            "value_type": "bool",
            "description": (
                "Kill switch for the new reader: 1 sends everyone back to the classic reader (the client clears its cookie; "
                "Django refuses the switch to it and clears the cookie). Restart the web pods after changing it."
            ),
            "is_active": True,
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ("remote_config", "0003_reader_optin_audience"),
    ]

    operations = [
        # Reverse does nothing, so an admin's value is never deleted.
        migrations.RunPython(create_entry, migrations.RunPython.noop),
    ]
