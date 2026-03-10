# -*- coding: utf-8 -*-
# Reverts 0002_add_chatbot_welcome_message - removes ChatbotWelcomeMessage from reader app.
# ChatbotWelcomeMessage now lives in the chatbot app.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('reader', '0002_add_chatbot_welcome_message'),
    ]

    operations = [
        migrations.DeleteModel(name='ChatbotWelcomeMessage'),
    ]
