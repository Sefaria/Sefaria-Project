from sefaria.system.decorators import catch_error_as_json
from sefaria.client.util import jsonResponse
from .models import Project


@catch_error_as_json
def powered_by_api(request):
    """
    Basic GET endpoint returning all Powered by Sefaria projects.

    PII / internal fields (Project.PRIVATE_FIELDS) are only included for staff.
    No filtering or pagination. Returns:
        {"projects": [ { ...public project fields... }, ... ]}
    """
    authenticated = request.user.is_staff
    projects = [project.contents(authenticated=authenticated) for project in Project.objects.all()]
    return jsonResponse({"projects": projects})
