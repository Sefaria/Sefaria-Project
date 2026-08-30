import pytest
from django.contrib.auth.models import User

from powered_by.models import Project


PRIVATE_FIELDS = Project.PRIVATE_FIELDS


def make_project(**overrides):
    """Create a Project with sane defaults, overridable per-test."""
    defaults = dict(
        submission_source="manual",
        creator="Ada Lovelace",
        creator_email="ada@example.com",
        is_developer=True,
        job_title="Engineer",
        found_sefaria="A friend told me.",
        submitter="Staff Member",
        salesforce_id="SF-123",
        notes="Internal staff note.",
        project_name="Example Project",
        project_link="https://example.com",
        is_published=True,
    )
    defaults.update(overrides)
    return Project.objects.create(**defaults)


# --- model.contents() serialization gating ----------------------------------

@pytest.mark.django_db
def test_contents_omits_private_fields_when_not_authenticated():
    project = make_project()
    contents = project.contents(authenticated=False)
    for field in PRIVATE_FIELDS:
        assert field not in contents
    # Public fields still present.
    assert contents["project_name"] == "Example Project"
    assert contents["project_link"] == "https://example.com"


@pytest.mark.django_db
def test_contents_includes_private_fields_when_authenticated():
    project = make_project()
    contents = project.contents(authenticated=True)
    for field in PRIVATE_FIELDS:
        assert field in contents
    assert contents["creator_email"] == "ada@example.com"
    assert contents["notes"] == "Internal staff note."


@pytest.mark.django_db
def test_contents_defaults_to_unauthenticated():
    project = make_project()
    assert "creator_email" not in project.contents()


# --- view: published filter + PII gating ------------------------------------

@pytest.fixture
def projects(db):
    published = make_project(project_name="Published", is_published=True)
    unpublished = make_project(project_name="Unpublished", is_published=False)
    return {"published": published, "unpublished": unpublished}


@pytest.mark.django_db
def test_anonymous_sees_only_published_without_private_fields(client, projects):
    response = client.get("/api/powered-by")
    assert response.status_code == 200
    data = response.json()["projects"]

    names = {p["project_name"] for p in data}
    assert names == {"Published"}

    for project in data:
        for field in PRIVATE_FIELDS:
            assert field not in project


@pytest.mark.django_db
def test_non_staff_user_sees_only_published_without_private_fields(client, projects):
    user = User.objects.create_user(username="member", password="pw")
    client.force_login(user)

    data = client.get("/api/powered-by").json()["projects"]
    names = {p["project_name"] for p in data}
    assert names == {"Published"}
    for project in data:
        for field in PRIVATE_FIELDS:
            assert field not in project


@pytest.mark.django_db
def test_staff_sees_all_projects_with_private_fields(client, projects):
    staff = User.objects.create_user(username="staff", password="pw", is_staff=True)
    client.force_login(staff)

    data = client.get("/api/powered-by").json()["projects"]
    names = {p["project_name"] for p in data}
    assert names == {"Published", "Unpublished"}
    for project in data:
        for field in PRIVATE_FIELDS:
            assert field in project


# --- clean_and_default_post_body() -------------------------------------------

from powered_by.views import clean_and_default_post_body


def test_clean_rejects_non_dict_body():
    cleaned, error = clean_and_default_post_body(["not", "a", "dict"])
    assert cleaned is None
    assert error == "Request body must be a JSON object"


def test_clean_requires_project_name():
    cleaned, error = clean_and_default_post_body({"project_link": "https://example.com"})
    assert cleaned is None
    assert error == "project_name is required"


def test_clean_requires_project_link():
    cleaned, error = clean_and_default_post_body({"project_name": "Example"})
    assert cleaned is None
    assert error == "project_link is required"


def test_clean_rejects_blank_required_field():
    cleaned, error = clean_and_default_post_body({"project_name": "   ", "project_link": "https://example.com"})
    assert cleaned is None
    assert error == "project_name is required"


def test_clean_does_not_default_submission_source_when_omitted():
    cleaned, error = clean_and_default_post_body({"project_name": "Example", "project_link": "https://example.com"})
    assert error is None
    assert "submission_source" not in cleaned


def test_clean_respects_explicit_submission_source():
    body = {"project_name": "Example", "project_link": "https://example.com", "submission_source": "manual"}
    cleaned, error = clean_and_default_post_body(body)
    assert error is None
    assert cleaned["submission_source"] == "manual"


def test_clean_does_not_default_submission_date_when_omitted():
    cleaned, error = clean_and_default_post_body({"project_name": "Example", "project_link": "https://example.com"})
    assert error is None
    assert "submission_date" not in cleaned


def test_clean_rejects_invalid_submission_source():
    body = {"project_name": "Example", "project_link": "https://example.com", "submission_source": "carrier_pigeon"}
    cleaned, error = clean_and_default_post_body(body)
    assert cleaned is None
    assert "submission_source" in error


def test_clean_rejects_invalid_technical_experience():
    body = {
        "project_name": "Example", "project_link": "https://example.com",
        "technical_experience": "a decade",
    }
    cleaned, error = clean_and_default_post_body(body)
    assert cleaned is None
    assert "technical_experience" in error


def test_clean_rejects_non_boolean_for_boolean_field():
    body = {"project_name": "Example", "project_link": "https://example.com", "vibe_coded": "true"}
    cleaned, error = clean_and_default_post_body(body)
    assert cleaned is None
    assert "vibe_coded" in error


def test_clean_accepts_real_boolean():
    body = {"project_name": "Example", "project_link": "https://example.com", "vibe_coded": True}
    cleaned, error = clean_and_default_post_body(body)
    assert error is None
    assert cleaned["vibe_coded"] is True


def test_clean_rejects_non_list_for_list_field():
    body = {"project_name": "Example", "project_link": "https://example.com", "sefaria_tools_used": "Sefaria API"}
    cleaned, error = clean_and_default_post_body(body)
    assert cleaned is None
    assert "sefaria_tools_used" in error


def test_clean_accepts_real_list():
    body = {"project_name": "Example", "project_link": "https://example.com", "sefaria_tools_used": ["Sefaria API"]}
    cleaned, error = clean_and_default_post_body(body)
    assert error is None
    assert cleaned["sefaria_tools_used"] == ["Sefaria API"]


def test_clean_rejects_invalid_url():
    body = {"project_name": "Example", "project_link": "not-a-url"}
    cleaned, error = clean_and_default_post_body(body)
    assert cleaned is None
    assert "project_link" in error


def test_clean_drops_non_writable_fields():
    body = {
        "project_name": "Example", "project_link": "https://example.com",
        "is_published": True, "featured": True, "tags": ["AI"], "is_buggy": True,
        "id": 999, "status": "live",
    }
    cleaned, error = clean_and_default_post_body(body)
    assert error is None
    for field in ("is_published", "featured", "tags", "is_buggy", "id", "status"):
        assert field not in cleaned


def test_clean_rejects_unparseable_submission_date():
    body = {
        "project_name": "Example", "project_link": "https://example.com",
        "submission_date": "yesterday",
    }
    cleaned, error = clean_and_default_post_body(body)
    assert cleaned is None
    assert error == "submission_date must be a valid ISO 8601 datetime"


def test_clean_accepts_valid_iso_submission_date():
    body = {
        "project_name": "Example", "project_link": "https://example.com",
        "submission_date": "2025-01-01T12:00:00Z",
    }
    cleaned, error = clean_and_default_post_body(body)
    assert error is None
    assert cleaned["submission_date"] is not None


def test_clean_rejects_overlong_field():
    body = {
        "project_name": "X" * 256, "project_link": "https://example.com",
    }
    cleaned, error = clean_and_default_post_body(body)
    assert cleaned is None
    assert error == "project_name must be at most 255 characters"


def test_clean_rejects_invalid_email():
    body = {
        "project_name": "Example", "project_link": "https://example.com",
        "creator_email": "not-an-email",
    }
    cleaned, error = clean_and_default_post_body(body)
    assert cleaned is None
    assert error == "creator_email must be a valid email address"


def test_clean_rejects_non_string_email_without_raising():
    # validate_email(123) raises TypeError (not DjangoValidationError), so a
    # non-string value must be rejected before reaching the validator or this
    # 400 path becomes an unhandled 500.
    body = {
        "project_name": "Example", "project_link": "https://example.com",
        "creator_email": 12345,
    }
    cleaned, error = clean_and_default_post_body(body)
    assert cleaned is None
    assert error == "creator_email must be a valid email address"


# --- view: POST create path ---------------------------------------------------

import hashlib
import hmac
import json as _json
from powered_by.views import translate_formstack_payload


TEST_HMAC_SECRET = "test-hmac-secret"


@pytest.fixture(autouse=True)
def formstack_hmac_secret(settings):
    """POST now requires a valid X-FS-Signature; configure a secret for every test."""
    settings.POWERED_BY_FORMSTACK_HMAC_SECRET = TEST_HMAC_SECRET


def _sign(body_bytes, secret=TEST_HMAC_SECRET):
    digest = hmac.new(secret.encode(), body_bytes, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def post_powered_by(client, body, secret=TEST_HMAC_SECRET):
    """POST to /api/powered-by, signing the body with a valid X-FS-Signature by default."""
    body_bytes = _json.dumps(body).encode()
    headers = {}
    if secret is not None:
        headers["HTTP_X_FS_SIGNATURE"] = _sign(body_bytes, secret)
    return client.post("/api/powered-by", data=body_bytes, content_type="application/json", **headers)


# --- Formstack payload translation -------------------------------------------

def test_translate_formstack_maps_simple_text_fields():
    body = {
        "Field179244264": "ada@example.com",
        "Field179244268": "Software Engineer",
        "Field193691179": "A friend told me.",
        "Field179244711": "My Project",
        "Field179244929": "https://myproject.example.com",
        "Field179355747": "https://github.com/example/myproject",
        "Field179244923": "It does things.",
        "Field193691243": "React, Node",
        "Field196457952": "Wanted to try it out.",
        "Field196457997": "10-50",
        "Field179245600": "No further comments.",
    }
    cleaned = translate_formstack_payload(body)
    assert cleaned["creator_email"] == "ada@example.com"
    assert cleaned["job_title"] == "Software Engineer"
    assert cleaned["found_sefaria"] == "A friend told me."
    assert cleaned["project_name"] == "My Project"
    assert cleaned["project_link"] == "https://myproject.example.com"
    assert cleaned["project_source_code"] == "https://github.com/example/myproject"
    assert cleaned["project_desc"] == "It does things."
    assert cleaned["tech_used_raw"] == "React, Node"
    assert cleaned["project_why"] == "Wanted to try it out."
    assert cleaned["project_reach"] == "10-50"
    assert cleaned["notes"] == "No further comments."


def test_translate_formstack_combines_first_and_last_name_into_creator():
    body = {"Field179244240": "Ada", "Field179244241": "Lovelace"}
    cleaned = translate_formstack_payload(body)
    assert cleaned["creator"] == "Ada Lovelace"


def test_translate_formstack_converts_yes_no_radios_to_booleans():
    body = {
        "Field196457843": "Yes",
        "Field196457992": "No",
        "Field179245509": "Yes",
        "Field191150099": "No",
    }
    cleaned = translate_formstack_payload(body)
    assert cleaned["is_developer"] is True
    assert cleaned["vibe_coded"] is False
    assert cleaned["consent_to_display"] is True
    assert cleaned["has_pbs_logo"] is False


def test_translate_formstack_joins_category_checkbox_values():
    body = {"Field179248693": ["Apps", "AI Projects"]}
    cleaned = translate_formstack_payload(body)
    assert cleaned["project_category"] == "Apps, AI Projects"


def test_translate_formstack_merges_endpoint_checkboxes_into_sefaria_tools_used():
    body = {
        "Field196457970": ["Texts API"],
        "Field196602042": ["Reference resolution"],
        "Field196602151": ["Related endpoint"],
        "Field196602699": ["Topics endpoint"],
    }
    cleaned = translate_formstack_payload(body)
    assert cleaned["sefaria_tools_used"] == [
        "Texts API", "Reference resolution", "Related endpoint", "Topics endpoint",
    ]


def test_translate_formstack_takes_first_checked_technical_experience_value():
    body = {"Field196457848": ["5-10 years", "10+ years"]}
    cleaned = translate_formstack_payload(body)
    assert cleaned["technical_experience"] == "5-10 years"


def test_translate_formstack_omits_fields_not_present_in_payload():
    body = {"Field179244711": "My Project"}
    cleaned = translate_formstack_payload(body)
    assert "creator" not in cleaned
    assert "creator_email" not in cleaned
    assert "is_developer" not in cleaned
    assert "sefaria_tools_used" not in cleaned
    assert "technical_experience" not in cleaned


def test_translate_formstack_handles_comma_separated_checkbox_string():
    body = {"Field179248693": "Apps, AI Projects"}
    cleaned = translate_formstack_payload(body)
    assert cleaned["project_category"] == "Apps, AI Projects"


@pytest.mark.django_db
def test_post_creates_project_from_formstack_payload(client):
    body = {
        "FormID": "12345",
        "UniqueID": "999",
        "Field179244240": "Ada",
        "Field179244241": "Lovelace",
        "Field179244264": "ada@example.com",
        "Field179244711": "Formstack Project",
        "Field179244929": "https://formstackproject.example.com",
        "Field179245509": "Yes",
    }
    response = post_powered_by(client, body)
    assert response.status_code == 201
    project = Project.objects.get(project_link="https://formstackproject.example.com")
    assert project.project_name == "Formstack Project"
    assert project.creator == "Ada Lovelace"
    assert project.creator_email == "ada@example.com"
    assert project.consent_to_display is True
    assert project.submission_source == "formstack"


@pytest.mark.django_db
def test_post_creates_project_and_returns_201(client):
    body = {"project_name": "New Project", "project_link": "https://newproject.example.com"}
    response = post_powered_by(client, body)
    assert response.status_code == 201
    project = response.json()["project"]
    assert project["project_name"] == "New Project"
    assert project["project_link"] == "https://newproject.example.com"
    assert project["submission_source"] == "formstack"
    assert Project.objects.filter(project_link="https://newproject.example.com").exists()


@pytest.mark.django_db
def test_post_missing_project_name_returns_400(client):
    body = {"project_link": "https://newproject.example.com"}
    response = post_powered_by(client, body)
    assert response.status_code == 400
    assert response.json()["error"] == "project_name is required"
    assert not Project.objects.filter(project_link="https://newproject.example.com").exists()


@pytest.mark.django_db
def test_post_invalid_json_returns_400(client):
    body_bytes = b"not json"
    response = client.post(
        "/api/powered-by",
        data=body_bytes,
        content_type="application/json",
        HTTP_X_FS_SIGNATURE=_sign(body_bytes),
    )
    assert response.status_code == 400
    assert "JSON" in response.json()["error"]


# --- view: X-FS-Signature requirement ------------------------------------------

@pytest.mark.django_db
def test_post_missing_signature_returns_401(client):
    body = {"project_name": "New Project", "project_link": "https://unauthorized.example.com"}
    response = post_powered_by(client, body, secret=None)
    assert response.status_code == 401
    assert not Project.objects.filter(project_link="https://unauthorized.example.com").exists()


@pytest.mark.django_db
def test_post_wrong_signature_returns_401(client):
    body = {"project_name": "New Project", "project_link": "https://unauthorized.example.com"}
    response = post_powered_by(client, body, secret="not-the-real-secret")
    assert response.status_code == 401
    assert not Project.objects.filter(project_link="https://unauthorized.example.com").exists()


@pytest.mark.django_db
def test_post_returns_401_when_server_has_no_hmac_secret_configured(client, settings):
    settings.POWERED_BY_FORMSTACK_HMAC_SECRET = None
    body = {"project_name": "New Project", "project_link": "https://unauthorized.example.com"}
    response = post_powered_by(client, body)
    assert response.status_code == 401
    assert not Project.objects.filter(project_link="https://unauthorized.example.com").exists()


@pytest.mark.django_db
def test_post_invalid_submission_source_returns_400(client):
    body = {"project_name": "New Project", "project_link": "https://newproject.example.com", "submission_source": "carrier_pigeon"}
    response = post_powered_by(client, body)
    assert response.status_code == 400
    assert not Project.objects.filter(project_link="https://newproject.example.com").exists()


@pytest.mark.django_db
def test_post_response_strips_private_fields_for_anonymous(client):
    body = {"project_name": "New Project", "project_link": "https://newproject.example.com", "creator_email": "a@example.com"}
    response = post_powered_by(client, body)
    assert response.status_code == 201
    assert "creator_email" not in response.json()["project"]
    assert Project.objects.get(project_link="https://newproject.example.com").creator_email == "a@example.com"


@pytest.mark.django_db
def test_post_response_includes_private_fields_for_staff(client):
    staff = User.objects.create_user(username="staff2", password="pw", is_staff=True)
    client.force_login(staff)
    body = {"project_name": "New Project", "project_link": "https://newproject.example.com", "creator_email": "a@example.com"}
    response = post_powered_by(client, body)
    assert response.status_code == 201
    assert response.json()["project"]["creator_email"] == "a@example.com"


@pytest.mark.django_db
def test_post_ignores_staff_only_fields_on_create(client):
    body = {
        "project_name": "New Project", "project_link": "https://newproject.example.com",
        "is_published": True, "featured": True, "tags": ["AI"], "is_buggy": True,
    }
    response = post_powered_by(client, body)
    assert response.status_code == 201
    project = Project.objects.get(project_link="https://newproject.example.com")
    assert project.is_published is False
    assert project.featured is False
    assert project.tags == []
    assert project.is_buggy is False


# --- view: POST create-only (no upsert) ---------------------------------------

@pytest.mark.django_db
def test_post_same_project_link_creates_a_new_project(client):
    # There is no update/upsert path: project_link is a public field (visible
    # via GET), so keying a write off it would let anyone overwrite an
    # existing project's data by POSTing its project_link back with
    # different content. Every POST inserts a new row; staff are expected to
    # reconcile any resulting project_link duplicates on the admin side.
    body = {"project_name": "Original Name", "project_link": "https://sameproject.example.com"}
    first = post_powered_by(client, body)
    assert first.status_code == 201

    body["project_name"] = "Second Submission"
    second = post_powered_by(client, body)
    assert second.status_code == 201
    assert first.json()["project"]["project_name"] != second.json()["project"]["project_name"]

    matching = Project.objects.filter(project_link="https://sameproject.example.com")
    assert matching.count() == 2
    assert set(matching.values_list("project_name", flat=True)) == {"Original Name", "Second Submission"}


@pytest.mark.django_db
def test_post_cannot_alter_an_existing_published_project(client):
    # Even a POST that reuses a live project's project_link and claims
    # is_published must not touch the existing row -- it just creates a
    # separate, unpublished project of its own.
    project = make_project(
        project_link="https://livesite.example.com",
        project_name="Original Name",
        is_published=True,
    )

    body = {
        "project_name": "Defaced Name",
        "project_link": "https://livesite.example.com",
        "is_published": True,
    }
    response = post_powered_by(client, body)
    assert response.status_code == 201

    project.refresh_from_db()
    assert project.project_name == "Original Name"
    assert project.is_published is True

    new_project = Project.objects.get(id=response.json()["project"]["id"])
    assert new_project.project_name == "Defaced Name"
    assert new_project.is_published is False


@pytest.mark.django_db
def test_post_always_defaults_submission_source_and_date(client):
    body = {"project_name": "New Project", "project_link": "https://freshdefaults.example.com"}
    response = post_powered_by(client, body)
    assert response.status_code == 201

    project = Project.objects.get(project_link="https://freshdefaults.example.com")
    assert project.submission_source == "formstack"
    assert project.submission_date is not None


@pytest.mark.django_db
def test_post_create_still_defaults_unpublished(client):
    body = {"project_name": "Brand New Project", "project_link": "https://brandnew.example.com"}
    response = post_powered_by(client, body)
    assert response.status_code == 201
    project = Project.objects.get(project_link="https://brandnew.example.com")
    assert project.is_published is False


# --- view: HTTP method restriction --------------------------------------------

@pytest.mark.django_db
def test_delete_method_returns_405(client):
    response = client.delete("/api/powered-by")
    assert response.status_code == 405


@pytest.mark.django_db
def test_put_method_returns_405(client):
    response = client.put("/api/powered-by", data=_json.dumps({}), content_type="application/json")
    assert response.status_code == 405
