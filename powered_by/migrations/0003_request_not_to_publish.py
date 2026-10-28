from django.db import migrations, models


# Why this is an explicit list and not derived from the old columns:
# consent_to_display defaulted to False, so False meant "said No", "left it
# blank" or "staff-created row", and is_published is editorial state that says
# nothing about consent (unanswered rows were unpublished by default before
# 0002; a refusal staff later published would look like consent). Inferring
# opt-outs from either column therefore both invents opt-outs and loses real
# ones. Instead, these are the submitters who explicitly answered "No" to "Do
# you consent to have your project data displayed on our page?" in the
# Formstack export of the original submissions (test entries excluded),
# matched by project name + link (no personal data in the repo). Every other
# row is treated as consenting (request_not_to_publish stays False).
EXPLICIT_REFUSALS = (
    ("daily devrei torah generator for speeches etc", "https://v0.dev/chat/deepseek-coded-v1-9e20jJPdiBT"),
    ("NumenAi", "Creeting"),
    ("No", "No"),
    ("Orayta: Torah in Your Time", "https://preview--orayta-learning-path.lovable.app/"),
)


def consent_to_request_not_to_publish(apps, schema_editor):
    Project = apps.get_model("powered_by", "Project")
    for project_name, project_link in EXPLICIT_REFUSALS:
        # update() bypasses Project.save(), so enforce the is_published invariant here.
        Project.objects.filter(project_name=project_name, project_link=project_link).update(
            request_not_to_publish=True, is_published=False,
        )


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
