import json

import pytest
from django.urls import resolve

from powered_by import poc_views
from powered_by.models import Project


SUBMISSIONS_URL = "/api/developer-poc/powered-by-submissions"


def post_submission(client, submission):
    return client.post(SUBMISSIONS_URL, data=json.dumps(submission), content_type="application/json")


def test_form_route_resolves_to_the_form_page():
    for path in ("/powered-by/form", "/powered-by/form/"):
        assert resolve(path, urlconf="sefaria.urls_library").func is poc_views.powered_by_form_page


@pytest.mark.django_db
def test_form_page_renders_the_form_menu(client):
    response = client.get("/powered-by/form")
    assert response.status_code == 200
    assert b"poweredByForm" in response.content


@pytest.mark.django_db
def test_powered_by_still_redirects_to_the_developer_portal(client):
    response = client.get("/powered-by")
    assert response.status_code == 301
    assert response["Location"] == "https://developers.sefaria.org/docs/powered-by-sefaria"


@pytest.mark.django_db
def test_logged_out_submission_is_kept_in_the_session_only(client):
    before = Project.objects.count()
    response = post_submission(client, {"kind": "new", "answers": {"projectName": "Example"}})
    assert response.status_code == 200
    submissions = client.get(SUBMISSIONS_URL).json()["submissions"]
    assert [s["answers"]["projectName"] for s in submissions] == ["Example"]
    assert Project.objects.count() == before


@pytest.mark.django_db
def test_submissions_append_and_clear(client):
    post_submission(client, {"kind": "new", "answers": {"projectName": "One"}})
    post_submission(client, {"kind": "update", "answers": {"projectName": "Two"}})
    kinds = [s["kind"] for s in client.get(SUBMISSIONS_URL).json()["submissions"]]
    assert kinds == ["new", "update"]
    assert client.delete(SUBMISSIONS_URL).status_code == 200
    assert client.get(SUBMISSIONS_URL).json()["submissions"] == []


@pytest.mark.django_db
def test_submission_list_is_capped(client):
    for i in range(poc_views.POWERED_BY_POC_MAX_SUBMISSIONS + 3):
        post_submission(client, {"answers": {"projectName": str(i)}})
    submissions = client.get(SUBMISSIONS_URL).json()["submissions"]
    assert len(submissions) == poc_views.POWERED_BY_POC_MAX_SUBMISSIONS
    assert submissions[-1]["answers"]["projectName"] == str(poc_views.POWERED_BY_POC_MAX_SUBMISSIONS + 2)


@pytest.mark.django_db
@pytest.mark.parametrize("body", ["not json", "[]", json.dumps({"kind": "new"})])
def test_malformed_submissions_are_rejected(client, body):
    response = client.post(SUBMISSIONS_URL, data=body, content_type="application/json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_oversized_submissions_are_rejected(client):
    response = post_submission(client, {"answers": {"notes": "x" * poc_views.POWERED_BY_POC_MAX_BYTES}})
    assert response.status_code == 400
