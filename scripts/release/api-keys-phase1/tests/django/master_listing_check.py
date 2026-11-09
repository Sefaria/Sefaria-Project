"""Master's code against the restored database: create, list (the public listing view) and delete a listing.
Exits non-zero on any mismatch."""

import json
import sys

import django

django.setup()

from django.contrib.auth.models import AnonymousUser  # noqa: E402
from django.test import RequestFactory  # noqa: E402

from powered_by.models import Project  # noqa: E402
from powered_by.views import powered_by_api  # noqa: E402


def listed():
    request = RequestFactory().get("/api/powered-by")
    request.user = AnonymousUser()
    response = powered_by_api(request)
    assert response.status_code == 200, response.status_code
    return [p["project_name"] for p in json.loads(response.content)["projects"]]


before = listed()
project = Project.objects.create(
    project_name="Release test created by master after restore",
    project_link="https://example.org/after",
    submission_source="manual",
)
during = listed()
project.delete()
after = listed()
ok = project.project_name not in before and project.project_name in during and after == before
print(json.dumps({"listed_before": len(before), "listed_during": len(during), "listed_after": len(after), "ok": ok}))
sys.exit(0 if ok else 1)
