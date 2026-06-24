from sefaria.system.decorators import catch_error_as_json
from sefaria.client.util import jsonResponse
from .models import Project


@catch_error_as_json
def powered_by_api(request):
    """
    Basic GET endpoint returning all Powered by Sefaria projects.

    No filtering or pagination. Returns:
        {"projects": [ { ...all project fields... }, ... ]}
    """
    projects = [project.contents() for project in Project.objects.all()]
    return jsonResponse({"projects": projects})
