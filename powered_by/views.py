import json

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from sefaria.system.decorators import catch_error_as_json
from sefaria.client.util import jsonResponse
from .models import Project, SubmissionSource, TechnicalExperience


REQUIRED_FIELDS = ("project_name", "project_link")

WRITABLE_FIELDS = (
    "submission_date", "submission_source", "sefaria_tools_used", "tech_used_raw",
    "technical_experience", "vibe_coded", "project_why", "project_name", "project_link",
    "project_source_code", "project_reach", "project_desc", "project_category",
    "image_url", "has_pbs_logo", "consent_to_display", "creator", "creator_email",
    "is_developer", "job_title", "found_sefaria", "submitter", "salesforce_id", "notes",
)

BOOLEAN_FIELDS = ("vibe_coded", "is_developer", "consent_to_display", "has_pbs_logo")

LIST_FIELDS = ("sefaria_tools_used",)

URL_FIELDS = ("project_link", "project_source_code", "image_url")

CHOICE_FIELDS = {
    "submission_source": SubmissionSource,
    "technical_experience": TechnicalExperience,
}

_url_validator = URLValidator()


def clean_and_default_post_body(body):
    """
    Validate a POST body against the Project writable-field rules.

    Returns (cleaned, error). On success `cleaned` is a dict of field name ->
    validated value, containing only allowlisted fields present in `body`
    (plus submission_source/submission_date defaulted if omitted), and
    `error` is None. On failure `cleaned` is None and `error` is a
    human-readable message naming the offending field.
    """
    if not isinstance(body, dict):
        return None, "Request body must be a JSON object"

    for field in REQUIRED_FIELDS:
        value = body.get(field)
        if not isinstance(value, str) or not value.strip():
            return None, f"{field} is required"

    cleaned = {}
    for field in WRITABLE_FIELDS:
        if field not in body:
            continue
        value = body[field]

        if field in CHOICE_FIELDS and value not in CHOICE_FIELDS[field].values:
            return None, f"{field} must be one of {list(CHOICE_FIELDS[field].values)}"

        if field in BOOLEAN_FIELDS and not isinstance(value, bool):
            return None, f"{field} must be true or false"

        if field in LIST_FIELDS and not isinstance(value, list):
            return None, f"{field} must be a list"

        if field in URL_FIELDS:
            try:
                _url_validator(value)
            except DjangoValidationError:
                return None, f"{field} must be a valid URL"

        cleaned[field] = value

    cleaned.setdefault("submission_source", SubmissionSource.FORMSTACK)
    cleaned.setdefault("submission_date", timezone.now())

    return cleaned, None


@csrf_exempt
@catch_error_as_json
def powered_by_api(request):
    """
    GET: list Powered by Sefaria projects. Non-staff callers see only
    published projects, with PII / internal fields (Project.PRIVATE_FIELDS)
    stripped. Staff see all projects with all fields. No pagination.
        {"projects": [ { ...project fields... }, ... ]}

    POST: create a Powered by Sefaria project from a JSON body (see
    clean_and_default_post_body for field rules and defaults).
        {"project": { ...project fields... }}
    """
    if request.method == "POST":
        return _powered_by_post(request)

    authenticated = request.user.is_staff
    queryset = Project.objects.all() if authenticated else Project.objects.filter(is_published=True)
    projects = [project.contents(authenticated=authenticated) for project in queryset]
    return jsonResponse({"projects": projects})


def _powered_by_post(request):
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return jsonResponse({"error": "Request body must be valid JSON"}, status=400)

    cleaned, error = clean_and_default_post_body(body)
    if error:
        return jsonResponse({"error": error}, status=400)

    project_link = cleaned.pop("project_link")
    project, created = Project.objects.update_or_create(
        project_link=project_link,
        defaults=cleaned,
    )
    authenticated = request.user.is_staff
    status = 201 if created else 200
    return jsonResponse({"project": project.contents(authenticated=authenticated)}, status=status)
