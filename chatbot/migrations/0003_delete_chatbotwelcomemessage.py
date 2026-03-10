# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import json

from django.db import migrations


def migrate_to_remote_config(apps, schema_editor):
    """
    Copy the existing ChatbotWelcomeMessage 'default' record into RemoteConfig
    so no data is lost when the table is dropped.
    """
    ChatbotWelcomeMessage = apps.get_model("chatbot", "ChatbotWelcomeMessage")
    RemoteConfigEntry = apps.get_model("remote_config", "RemoteConfigEntry")

    try:
        obj = ChatbotWelcomeMessage.objects.get(key="default")
    except ChatbotWelcomeMessage.DoesNotExist:
        return

    data = {
        "welcome_english": obj.welcome_english,
        "welcome_hebrew": obj.welcome_hebrew,
        "restart_english": obj.restart_english,
        "restart_hebrew": obj.restart_hebrew,
        "new_session_english": getattr(obj, "new_session_english", ""),
        "new_session_hebrew": getattr(obj, "new_session_hebrew", ""),
    }

    RemoteConfigEntry.objects.update_or_create(
        key="feature.chatbot.welcome_messages",
        defaults={
            "raw_value": json.dumps(data),
            "value_type": "json",
            "description": "Chatbot welcome/restart/new-session messages (EN + HE)",
            "is_active": True,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("chatbot", "0002_add_new_session_message"),
        ("remote_config", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(migrate_to_remote_config, migrations.RunPython.noop),
        
        migrations.DeleteModel(name="ChatbotWelcomeMessage"),
        
        migrations.CreateModel(
            name="ChatbotWelcomeMessageProxy",
            fields=[],
            options={
                "proxy": True,
                "verbose_name": "Chatbot welcome message",
                "verbose_name_plural": "Chatbot welcome messages",
            },
            bases=("remote_config.remoteconfigentry",),
        ),
    ]
