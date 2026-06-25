from django.views.decorators.http import require_GET

from sefaria.system.decorators import catch_error_as_json
from sefaria.client.util import jsonResponse
from .models import Project


@require_GET
@catch_error_as_json
def powered_by_api(request):
    """
    Basic GET endpoint returning Powered by Sefaria projects.

    Non-staff callers see only published projects, with PII / internal fields
    (Project.PRIVATE_FIELDS) stripped. Staff see all projects with all fields.
    No pagination. Returns:
        {"projects": [ { ...project fields... }, ... ]}
    """
    authenticated = request.user.is_staff
    queryset = Project.objects.all() if authenticated else Project.objects.filter(is_published=True)
    projects = [project.contents(authenticated=authenticated) for project in queryset]
    return jsonResponse({"projects": projects})
