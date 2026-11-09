"""Writes phase 1 rows with phase 1's code: a tier, a project with an API project, and a key (only its 4-character
prefix is printed)."""

import django

django.setup()

from powered_by.models import ApiKey, ApiProject, ApiTier, Project  # noqa: E402

tier = ApiTier.objects.create(id="releasetest", name="Release test tier", per_minute_per_project=5)
profile = Project.objects.create(
    project_name="Release test developer project", project_link="https://example.org/dev", submission_source="manual"
)
api_project = ApiProject.objects.create(profile=profile, tier=tier)
key = ApiKey.objects.create(project=api_project, label="release test key")
print(f"tier {tier.id}, profile {profile.pk}, api_project {api_project.pk}, key {key.key[:4]}...")
