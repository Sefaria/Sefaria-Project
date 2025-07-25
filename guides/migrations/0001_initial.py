# -*- coding: utf-8 -*-
# Generated by Django 1.11.29 on 2025-01-21 00:00
from __future__ import unicode_literals

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Guide',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(help_text="Unique identifier for the guide (e.g., 'sheets', 'topics')", max_length=100, unique=True, verbose_name='Guide Key')),
                ('title_prefix_en', models.CharField(help_text="Prefix shown before tips (e.g., 'Quick Start:')", max_length=255, verbose_name='Title Prefix (EN)')),
                ('title_prefix_he', models.CharField(help_text='Prefix shown before tips in Hebrew', max_length=255, verbose_name='Title Prefix (HE)')),
                ('footer_link_1_text_en', models.CharField(blank=True, help_text='Text for the first footer link in English (optional)', max_length=255, verbose_name='Footer Link 1 Text (EN)')),
                ('footer_link_1_text_he', models.CharField(blank=True, help_text='Text for the first footer link in Hebrew (optional)', max_length=255, verbose_name='Footer Link 1 Text (HE)')),
                ('footer_link_1_url', models.URLField(blank=True, help_text='URL for the first footer link (optional)', verbose_name='Footer Link 1 URL')),
                ('footer_link_2_text_en', models.CharField(blank=True, help_text='Text for the second footer link in English (optional)', max_length=255, verbose_name='Footer Link 2 Text (EN)')),
                ('footer_link_2_text_he', models.CharField(blank=True, help_text='Text for the second footer link in Hebrew (optional)', max_length=255, verbose_name='Footer Link 2 Text (HE)')),
                ('footer_link_2_url', models.URLField(blank=True, help_text='URL for the second footer link (optional)', verbose_name='Footer Link 2 URL')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Guide',
                'verbose_name_plural': 'Guides',
                'ordering': ['key'],
            },
        ),
        migrations.CreateModel(
            name='InfoCard',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.PositiveIntegerField(default=0, blank=False, null=False)),
                ('title_en', models.CharField(max_length=255, verbose_name='Title (EN)')),
                ('title_he', models.CharField(max_length=255, verbose_name='Title (HE)')),
                ('text_en', models.TextField(verbose_name='Text (EN)')),
                ('text_he', models.TextField(verbose_name='Text (HE)')),
                ('video_en', models.URLField(help_text="Upload the video via Google Cloud to the Bucket 'guides-resources'and provide the URL here.", verbose_name='Video URL (EN)')),
                ('video_he', models.URLField(help_text="Upload the video via Google Cloud to the Bucket 'guides-resources' and provide the URL here.", verbose_name='Video URL (HE)')),
                ('guide', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='info_cards', to='guides.Guide', verbose_name='Guide')),
            ],
            options={
                'verbose_name': 'Info Card',
                'verbose_name_plural': 'Info Cards',
                'ordering': ['order'],
                'abstract': False,
            },
        ),
    ] 