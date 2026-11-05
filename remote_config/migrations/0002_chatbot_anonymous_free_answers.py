"""
Create the remote config entry for the Library Assistant's free answers for a
logged-out visitor, so the default lives in the admin rather than in code. The
chatbot server reads it from /api/remote-config and has no default of its own.
"""
from django.db import migrations

KEY = "feature.chatbot.anonymous_free_answers"
DEFAULT_FREE_ANSWERS = "2"


def create_entry(apps, schema_editor):
    RemoteConfigEntry = apps.get_model("remote_config", "RemoteConfigEntry")
    # Never overwrite a value an admin already set.
    RemoteConfigEntry.objects.get_or_create(
        key=KEY,
        defaults={
            "raw_value": DEFAULT_FREE_ANSWERS,
            "value_type": "int",
            "description": "Free Library Assistant answers for a logged-out visitor; read by the chatbot server.",
            "is_active": True,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("remote_config", "0001_initial"),
    ]

    operations = [
        # Reverse does nothing, so an admin's value is never deleted.
        migrations.RunPython(create_entry, migrations.RunPython.noop),
    ]
