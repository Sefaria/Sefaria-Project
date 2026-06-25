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
