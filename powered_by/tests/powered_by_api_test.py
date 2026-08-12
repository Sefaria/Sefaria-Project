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


# --- view: POST create path ---------------------------------------------------

import json as _json


@pytest.mark.django_db
def test_post_creates_project_and_returns_201(client):
    body = {"project_name": "New Project", "project_link": "https://newproject.example.com"}
    response = client.post("/api/powered-by", data=_json.dumps(body), content_type="application/json")
    assert response.status_code == 201
    project = response.json()["project"]
    assert project["project_name"] == "New Project"
    assert project["project_link"] == "https://newproject.example.com"
    assert project["submission_source"] == "formstack"
    assert Project.objects.filter(project_link="https://newproject.example.com").exists()


@pytest.mark.django_db
def test_post_missing_project_name_returns_400(client):
    body = {"project_link": "https://newproject.example.com"}
    response = client.post("/api/powered-by", data=_json.dumps(body), content_type="application/json")
    assert response.status_code == 400
    assert response.json()["error"] == "project_name is required"
    assert not Project.objects.filter(project_link="https://newproject.example.com").exists()


@pytest.mark.django_db
def test_post_invalid_json_returns_400(client):
    response = client.post("/api/powered-by", data="not json", content_type="application/json")
    assert response.status_code == 400
    assert "JSON" in response.json()["error"]


@pytest.mark.django_db
def test_post_invalid_submission_source_returns_400(client):
    body = {"project_name": "New Project", "project_link": "https://newproject.example.com", "submission_source": "carrier_pigeon"}
    response = client.post("/api/powered-by", data=_json.dumps(body), content_type="application/json")
    assert response.status_code == 400
    assert not Project.objects.filter(project_link="https://newproject.example.com").exists()


@pytest.mark.django_db
def test_post_response_strips_private_fields_for_anonymous(client):
    body = {"project_name": "New Project", "project_link": "https://newproject.example.com", "creator_email": "a@example.com"}
    response = client.post("/api/powered-by", data=_json.dumps(body), content_type="application/json")
    assert response.status_code == 201
    assert "creator_email" not in response.json()["project"]
    assert Project.objects.get(project_link="https://newproject.example.com").creator_email == "a@example.com"


@pytest.mark.django_db
def test_post_response_includes_private_fields_for_staff(client):
    staff = User.objects.create_user(username="staff2", password="pw", is_staff=True)
    client.force_login(staff)
    body = {"project_name": "New Project", "project_link": "https://newproject.example.com", "creator_email": "a@example.com"}
    response = client.post("/api/powered-by", data=_json.dumps(body), content_type="application/json")
    assert response.status_code == 201
    assert response.json()["project"]["creator_email"] == "a@example.com"


@pytest.mark.django_db
def test_post_ignores_staff_only_fields_on_create(client):
    body = {
        "project_name": "New Project", "project_link": "https://newproject.example.com",
        "is_published": True, "featured": True, "tags": ["AI"], "is_buggy": True,
    }
    response = client.post("/api/powered-by", data=_json.dumps(body), content_type="application/json")
    assert response.status_code == 201
    project = Project.objects.get(project_link="https://newproject.example.com")
    assert project.is_published is False
    assert project.featured is False
    assert project.tags == []
    assert project.is_buggy is False


# --- view: POST idempotency / update path ------------------------------------

@pytest.mark.django_db
def test_post_same_project_link_updates_not_duplicates(client):
    body = {"project_name": "Original Name", "project_link": "https://sameproject.example.com"}
    first = client.post("/api/powered-by", data=_json.dumps(body), content_type="application/json")
    assert first.status_code == 201

    body["project_name"] = "Updated Name"
    second = client.post("/api/powered-by", data=_json.dumps(body), content_type="application/json")
    assert second.status_code == 200

    matching = Project.objects.filter(project_link="https://sameproject.example.com")
    assert matching.count() == 1
    assert matching.get().project_name == "Updated Name"


@pytest.mark.django_db
def test_post_partial_update_does_not_clobber_omitted_fields(client):
    create_body = {
        "project_name": "Original Name",
        "project_link": "https://partialupdate.example.com",
        "project_desc": "Original description.",
    }
    client.post("/api/powered-by", data=_json.dumps(create_body), content_type="application/json")

    update_body = {"project_name": "New Name", "project_link": "https://partialupdate.example.com"}
    response = client.post("/api/powered-by", data=_json.dumps(update_body), content_type="application/json")
    assert response.status_code == 200

    project = Project.objects.get(project_link="https://partialupdate.example.com")
    assert project.project_name == "New Name"
    assert project.project_desc == "Original description."


@pytest.mark.django_db
def test_post_update_preserves_staff_only_fields(client):
    project = make_project(
        project_link="https://staffcurated.example.com",
        is_published=True, featured=True, tags=["AI"], is_buggy=True,
    )

    update_body = {
        "project_name": "Resubmitted Name",
        "project_link": "https://staffcurated.example.com",
        "is_published": False, "featured": False, "tags": [], "is_buggy": False,
    }
    response = client.post("/api/powered-by", data=_json.dumps(update_body), content_type="application/json")
    assert response.status_code == 200

    project.refresh_from_db()
    assert project.project_name == "Resubmitted Name"
    assert project.is_published is True
    assert project.featured is True
    assert project.tags == ["AI"]
    assert project.is_buggy is True


@pytest.mark.django_db
def test_post_update_does_not_reset_submission_source_or_date(client):
    # Create project via direct DB insert with specific submission_source and submission_date.
    from datetime import datetime, timezone as dt_timezone
    past_date = datetime(2025, 1, 1, 12, 0, 0, tzinfo=dt_timezone.utc)
    project = make_project(
        project_link="https://submissiontracking.example.com",
        submission_source="manual",
        submission_date=past_date,
    )

    # POST an update that omits submission_source and submission_date entirely.
    update_body = {
        "project_name": "Updated Project",
        "project_link": "https://submissiontracking.example.com",
    }
    response = client.post("/api/powered-by", data=_json.dumps(update_body), content_type="application/json")
    assert response.status_code == 200

    # Verify submission_source and submission_date were NOT reset to defaults.
    project.refresh_from_db()
    assert project.submission_source == "manual"  # NOT reset to "formstack"
    assert project.submission_date == past_date  # NOT bumped to "now"
