"""Seeds Powered by listing rows with master's code: two published, one unpublished, one published row that asked not
to be published (the phase 1 listing filter hides it; written with update() as an old admin edit could leave it).
Prints the counts as JSON."""

import json

import django

django.setup()

from powered_by.models import Project  # noqa: E402

BASE = {"submission_source": "manual", "project_link": "https://example.org/"}
Project.objects.create(project_name="Release test listed A", **BASE)
Project.objects.create(project_name="Release test listed B", **BASE)
Project.objects.create(project_name="Release test unpublished", is_published=False, **BASE)
hidden = Project.objects.create(project_name="Release test asked not to publish", **BASE)
Project.objects.filter(pk=hidden.pk).update(request_not_to_publish=True, is_published=True)
print(json.dumps({"published": Project.objects.filter(is_published=True).count(), "total": Project.objects.count()}))
