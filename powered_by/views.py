import hmac
import json

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator, validate_email
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

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

# --- Formstack payload translation -------------------------------------------
#
# Field IDs below are from the live "Powered by Sefaria" Formstack form. The
# webhook isn't wired up yet, so the exact payload shape (Field<ID> vs bare ID
# keys, checkbox values as a list vs a comma-joined string) is an assumption
# based on Formstack's documented options; _formstack_checkbox_values() and
# _formstack_field() tolerate the reasonable variants. Once the webhook is
# live, sanity-check a real payload against these assumptions.

FORMSTACK_FIRST_NAME_FIELD = "179244240"
FORMSTACK_LAST_NAME_FIELD = "179244241"
FORMSTACK_CATEGORY_FIELD = "179248693"
FORMSTACK_TECHNICAL_EXPERIENCE_FIELD = "196457848"

# Simple 1:1 copy fields: Formstack field ID -> Project field name.
FORMSTACK_FIELD_MAP = {
    "179244264": "creator_email",
    "179244268": "job_title",
    "193691179": "found_sefaria",
    "179244711": "project_name",
    "179244929": "project_link",
    "179355747": "project_source_code",
    "179244923": "project_desc",
    "193691243": "tech_used_raw",
    "196457952": "project_why",
    "196457997": "project_reach",
    "179245600": "notes",
}

# Yes/No radio fields: Formstack field ID -> Project boolean field name.
FORMSTACK_BOOLEAN_FIELD_MAP = {
    "196457843": "is_developer",
    "196457992": "vibe_coded",
    "179245509": "consent_to_display",
    "191150099": "has_pbs_logo",
}

# "Which Sefaria data or tools did you use?", "Which categories of endpoints
# did you utilize?", and the 11 conditional "Which specific endpoints did you
# use?" fields all merge into Project.sefaria_tools_used.
FORMSTACK_TOOLS_USED_FIELDS = (
    "196457970", "196602042",
    "196602151", "196602402", "196602409", "196602439", "196602489",
    "196602566", "196602632", "196602641", "196602679", "196602688", "196602699",
)


def _formstack_field(body, field_id):
    """Formstack fields may arrive with an upper/lowercase prefix or as bare IDs."""
    return body.get(f"Field{field_id}", body.get(f"field{field_id}", body.get(field_id)))


def _formstack_checkbox_values(value):
    """Normalize a Formstack checkbox value into a list of selected strings."""
    if value is None:
        return []
    if isinstance(value, list):
        return [v for v in value if v]
    if isinstance(value, str):
        return [v.strip() for v in value.split(",") if v.strip()]
    return [value]


def _formstack_yes_no(value):
    return str(value).strip().lower() in ("yes", "true", "1")


def translate_formstack_payload(body):
    """
    Translate a raw Formstack webhook body (keyed by field ID) into the clean
    field-name dict that clean_and_default_post_body expects. Fields absent
    from the payload are omitted from the result (same partial-update
    semantics as a normal POST body).
    """
    cleaned = {}

    first = _formstack_field(body, FORMSTACK_FIRST_NAME_FIELD)
    last = _formstack_field(body, FORMSTACK_LAST_NAME_FIELD)
    if first or last:
        cleaned["creator"] = " ".join(part for part in (first, last) if part).strip()

    for field_id, project_field in FORMSTACK_FIELD_MAP.items():
        value = _formstack_field(body, field_id)
        if value:
            cleaned[project_field] = value

    for field_id, project_field in FORMSTACK_BOOLEAN_FIELD_MAP.items():
        value = _formstack_field(body, field_id)
        if value not in (None, ""):
            cleaned[project_field] = _formstack_yes_no(value)

    category_values = _formstack_checkbox_values(_formstack_field(body, FORMSTACK_CATEGORY_FIELD))
    if category_values:
        cleaned["project_category"] = ", ".join(category_values)

    tools_used = []
    for field_id in FORMSTACK_TOOLS_USED_FIELDS:
        tools_used.extend(_formstack_checkbox_values(_formstack_field(body, field_id)))
    if tools_used:
        cleaned["sefaria_tools_used"] = tools_used

    technical_experience_values = _formstack_checkbox_values(
        _formstack_field(body, FORMSTACK_TECHNICAL_EXPERIENCE_FIELD)
    )
    if technical_experience_values:
        cleaned["technical_experience"] = technical_experience_values[0]

    return cleaned


def _writable_char_field_max_lengths():
    """
    Map of writable CharField name -> model max_length, introspected from
    Project so this stays correct if the model changes.
    """
    from django.db.models import CharField

    lengths = {}
    for field_name in WRITABLE_FIELDS:
        try:
            field = Project._meta.get_field(field_name)
        except Exception:
            continue
        if isinstance(field, CharField) and field.max_length:
            lengths[field_name] = field.max_length
    return lengths


_CHAR_FIELD_MAX_LENGTHS = _writable_char_field_max_lengths()


def clean_and_default_post_body(body):
    """
    Validate a POST body against the Project writable-field rules.

    Returns (cleaned, error). On success `cleaned` is a dict of field name ->
    validated value, containing only allowlisted fields actually present in
    `body` (no additional defaults — defaulting of submission_source/submission_date
    is the caller's responsibility). On failure `cleaned` is None and `error`
    is a human-readable message naming the offending field.
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

        if field == "submission_date":
            parsed = None
            try:
                parsed = parse_datetime(value) if isinstance(value, str) else None
            except (TypeError, ValueError):
                parsed = None
            if parsed is None:
                return None, "submission_date must be a valid ISO 8601 datetime"
            value = parsed

        if field == "creator_email":
            try:
                validate_email(value)
            except DjangoValidationError:
                return None, "creator_email must be a valid email address"

        max_length = _CHAR_FIELD_MAX_LENGTHS.get(field)
        if max_length is not None and isinstance(value, str) and len(value) > max_length:
            return None, f"{field} must be at most {max_length} characters"

        cleaned[field] = value

    return cleaned, None


@csrf_exempt
@catch_error_as_json
@require_http_methods(["GET", "POST"])
def powered_by_api(request):
    """
    GET: list Powered by Sefaria projects. Non-staff callers see only
    published projects, with PII / internal fields (Project.PRIVATE_FIELDS)
    stripped. Staff see all projects with all fields. No pagination.
        {"projects": [ { ...project fields... }, ... ]}

    POST: create a new Powered by Sefaria project from a JSON body (see
    clean_and_default_post_body for field rules and defaults). Requires a
    valid Formstack "HandshakeKey" field in the body matching
    settings.FORMSTACK_HANDSHAKE_KEY (see _valid_handshake_key) -- unrelated
    to the project_link exposure concern, this rejects any POST that didn't
    come from the configured Formstack webhook. Always inserts a new row,
    even if project_link matches an existing project -- there is no
    update/upsert path, so a caller cannot alter another project's data by
    re-submitting its project_link. Any resulting duplicates are expected to
    be resolved by staff on the admin side.
        {"project": { ...project fields... }}
    """
    if request.method == "POST":
        return _powered_by_post(request)

    authenticated = request.user.is_staff
    queryset = Project.objects.all() if authenticated else Project.objects.filter(is_published=True)
    projects = [project.contents(authenticated=authenticated) for project in queryset]
    return jsonResponse({"projects": projects})


def _valid_handshake_key(body):
    """
    Formstack includes the webhook's configured "Handshake Key" as a
    top-level "HandshakeKey" field in the POST body (alongside "FormID"),
    not as a header. FORMSTACK_HANDSHAKE_KEY lives only in the untracked
    sefaria/local_settings.py / env, never in source control.
    """
    expected = getattr(settings, "FORMSTACK_HANDSHAKE_KEY", None)
    provided = body.get("HandshakeKey") if isinstance(body, dict) else None
    return bool(expected) and isinstance(provided, str) and hmac.compare_digest(provided, expected)


def _powered_by_post(request):
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return jsonResponse({"error": "Request body must be valid JSON"}, status=400)

    if not _valid_handshake_key(body):
        return jsonResponse({"error": "Unauthorized"}, status=401)

    # "FormID" is part of Formstack's webhook envelope and never appears in
    # the clean-field POST contract, so its presence identifies a raw
    # Formstack submission that needs translating first.
    if isinstance(body, dict) and "FormID" in body:
        body = translate_formstack_payload(body)

    cleaned, error = clean_and_default_post_body(body)
    if error:
        return jsonResponse({"error": error}, status=400)

    cleaned.setdefault("submission_source", SubmissionSource.FORMSTACK)
    cleaned.setdefault("submission_date", timezone.now())

    # No upsert: project_link is a public field (visible via GET), so keying
    # a write off it would let anyone overwrite an existing project's data by
    # POSTing its project_link back with different content. Every POST
    # inserts a new row instead; is_published defaults to False (model
    # default) pending staff review, and staff are expected to reconcile any
    # resulting project_link duplicates on the admin side.
    project = Project.objects.create(**cleaned)
    authenticated = request.user.is_staff
    return jsonResponse({"project": project.contents(authenticated=authenticated)}, status=201)
