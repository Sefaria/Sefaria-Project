"""
Ensures the local stack's sentinel key exists (CONTRACT.md section 3): the auth service's empty-reload guard needs a
non-empty registry, so a suite that revokes every key of its own still sees revocations applied at once.
Idempotent. Run through `manage.py shell` with the stack's settings; never on a cluster.
"""
from django.conf import settings
from django.contrib.auth.models import User

from emailusernames.utils import _email_to_username
from powered_by.models import ApiKey, ApiProject, Project, SubmissionSource

SENTINEL_ID = 2_098_000_901
SENTINEL_EMAIL = "apikeys-e2e-stack-sentinel@example.com"
SENTINEL_NOTES = "E2E api-keys stack sentinel (local only)"

db = settings.DATABASES["default"]
assert db["HOST"] == "127.0.0.1" and str(db["PORT"]) == "55432", "sentinel seeding is for the local stack only"

user = User.objects.filter(id=SENTINEL_ID).first()
if user is None:
    user = User(id=SENTINEL_ID, email=SENTINEL_EMAIL, username=_email_to_username(SENTINEL_EMAIL),
                first_name="Stack", last_name="Sentinel")
    user.set_unusable_password()
    user.save()

profile = Project.objects.filter(notes=SENTINEL_NOTES).first()
if profile is None:
    profile = Project.objects.create(
        submission_source=SubmissionSource.DEVELOPER_SETTINGS, creator="Stack Sentinel",
        creator_email=SENTINEL_EMAIL, project_name="Stack sentinel", notes=SENTINEL_NOTES,
        is_published=False, consent_to_display=False,
    )

project = profile.api_projects.filter(deleted_at__isnull=True).first()
if project is None:
    project = ApiProject.objects.create(profile=profile, owner=user)
elif project.owner_id != user.id:
    project.owner = user
    project.save(update_fields=["owner"])

if not project.api_keys.filter(revoked_at__isnull=True).exists():
    ApiKey.objects.create(project=project, label="sentinel")

print("sentinel ok: user=%d project=%d live_keys=%d" % (
    user.id, project.id, project.api_keys.filter(revoked_at__isnull=True).count()))
