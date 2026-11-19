"""
Create the remote config entry for who may opt in to the new reader (sefaria/helper/reader_choice.py), so admins find it in
the admin with its safe value. Code treats a missing or unknown value as "staff" too.
"""

from django.db import migrations

KEY = "feature.reader.optin.audience"


def create_entry(apps, schema_editor):
    RemoteConfigEntry = apps.get_model("remote_config", "RemoteConfigEntry")
    # Never overwrite a value an admin already set.
    RemoteConfigEntry.objects.get_or_create(
        key=KEY,
        defaults={
            "raw_value": "staff",
            "value_type": "string",
            "description": (
                'Who may switch to the new reader while it is offered (READER_OPTIN): "staff" (only staff users) or "all" '
                "(every signed-in user). Anything else counts as staff."
            ),
            "is_active": True,
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ("remote_config", "0002_chatbot_anonymous_free_answers"),
    ]

    operations = [
        # Reverse does nothing, so an admin's value is never deleted.
        migrations.RunPython(create_entry, migrations.RunPython.noop),
    ]
