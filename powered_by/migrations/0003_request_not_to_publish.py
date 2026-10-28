from django.db import migrations, models


def consent_to_request_not_to_publish(apps, schema_editor):
    """
    consent_to_display defaulted to False for every record not submitted via
    the form, so False is only a real opt-out for Formstack submissions that
    were kept unpublished. Everything else starts at the new default (False).
    """
    Project = apps.get_model("powered_by", "Project")
    Project.objects.filter(
        submission_source="formstack", consent_to_display=False, is_published=False,
    ).update(request_not_to_publish=True)


def request_not_to_publish_to_consent(apps, schema_editor):
    Project = apps.get_model("powered_by", "Project")
    Project.objects.filter(request_not_to_publish=False).update(consent_to_display=True)


class Migration(migrations.Migration):

    dependencies = [
        ('powered_by', '0002_is_published_default_true'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='request_not_to_publish',
            field=models.BooleanField(default=False, help_text='Submitter asked not to be displayed publicly. Consent is assumed unless this is set; setting it forces is_published to False.'),
        ),
        migrations.RunPython(consent_to_request_not_to_publish, request_not_to_publish_to_consent),
        migrations.RemoveField(
            model_name='project',
            name='consent_to_display',
        ),
    ]
