"""S-10 (PLAN.md §2.3.5, §6.7): every /_portal/editor/ route answers 401 to anonymous users, 403 to signed-in users
who are not staff, and 403 to staff without a CSRF token; none is csrf_exempt. Also the /editor shell (contract C9):
anonymous -> 302 /login?next=, non-staff -> 403, staff -> 200 with the editor CSP."""

import re

import pytest
from django.urls import URLPattern, URLResolver

from devportal.views import editor_api

from .editor_helpers import EditorClient, editor_urls, make_docs_tree, make_user  # noqa: F401

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("editor_urls")]

SAMPLE_ARGS = {"section": "docs", "page_id": "{page}", "number": "1"}
METHODS = {
    "editor_tree": ["GET"],
    "editor_pages": ["POST"],
    "editor_page": ["GET", "PATCH", "DELETE"],
    "editor_draft": ["PUT"],
    "editor_publish": ["POST"],
    "editor_revisions": ["GET"],
    "editor_restore": ["POST"],
    "editor_move": ["POST"],
    "editor_preview": ["POST"],
    "editor_uploads": ["POST"],
    "editor_not_found": ["GET", "POST"],
}
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


def _walk(patterns, prefix=""):
    for entry in patterns:
        if isinstance(entry, URLResolver):
            yield from _walk(entry.url_patterns, prefix + str(entry.pattern))
        elif isinstance(entry, URLPattern):
            yield prefix + str(entry.pattern), entry


def editor_routes():
    """(name, sample path, view) for every editor API pattern."""
    out = []
    for route, pattern in _walk(editor_api.editor_urlpatterns):
        path = "/" + route.lstrip("^")
        path = re.sub(r"<(?:\w+:)?(\w+)>", lambda m: SAMPLE_ARGS[m.group(1)], path)
        if path.endswith("/editor/"):
            path += "anything"
        out.append((pattern.name, path, pattern.callback))
    return out


ROUTES = editor_routes()
CASES = [(name, path, method) for name, path, _view in ROUTES for method in METHODS[name]]


def test_every_route_is_listed_here():
    assert {name for name, _path, _view in ROUTES} == set(METHODS)


@pytest.mark.parametrize(("name", "view"), [(n, v) for n, _p, v in ROUTES])
def test_every_view_is_staff_api_and_not_csrf_exempt(name, view):
    assert getattr(view, "devportal_staff_api", False), name
    assert not getattr(view, "csrf_exempt", False), name


def test_every_editor_path_is_under_portal_editor():
    for _name, path, _view in ROUTES:
        assert path.startswith("/_portal/editor/"), path


@pytest.fixture
def page_id():
    return make_docs_tree()["welcome"].pk


def _request(client, method, path, page_id):
    path = path.replace("{page}", str(page_id))
    if method == "GET":
        return client.get(path)
    return client.send(method, path, {})


@pytest.mark.parametrize(("name", "path", "method"), CASES)
def test_anonymous_gets_401(name, path, method, page_id):
    response = _request(EditorClient(None), method, path, page_id)
    assert response.status_code == 401, (name, method, response.content)
    assert response.json()["error"]["code"] == "not_authenticated"


@pytest.mark.parametrize(("name", "path", "method"), CASES)
def test_non_staff_gets_403(name, path, method, page_id):
    response = _request(EditorClient(make_user("reader")), method, path, page_id)
    assert response.status_code == 403, (name, method, response.content)
    assert response.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize(("name", "path", "method"), [c for c in CASES if c[2] in UNSAFE])
def test_staff_without_csrf_token_gets_403(name, path, method, page_id):
    from devportal.models import EditorAuditLog, Page, PageRevision  # noqa: PLC0415

    before = (Page.objects.count(), PageRevision.objects.count(), EditorAuditLog.objects.count())
    response = _request(EditorClient(make_user("staffer", staff=True), csrf=False), method, path, page_id)
    assert response.status_code == 403, (name, method, response.content)
    assert (Page.objects.count(), PageRevision.objects.count(), EditorAuditLog.objects.count()) == before


def test_staff_with_csrf_token_reaches_the_views(page_id):
    client = EditorClient(make_user("staffer", staff=True))
    assert client.get("/_portal/editor/tree/docs").status_code == 200
    assert client.get(f"/_portal/editor/pages/{page_id}").status_code == 200


# --- the shell page -----------------------------------------------------------------------------------------------


@pytest.mark.parametrize("path", ["/editor", "/editor/docs/welcome"])
def test_shell_redirects_anonymous_to_login(path):
    response = EditorClient(None, csrf=False).get(path)
    assert response.status_code == 302
    assert response["Location"] == "/login?next=" + path.replace("/", "%2F")


def test_shell_is_403_for_non_staff():
    response = EditorClient(make_user("reader"), csrf=False).get("/editor")
    assert response.status_code == 403
    assert b"Staff only" in response.content


def test_shell_for_staff_has_boot_data_and_the_editor_csp():
    from devportal.security.csp import build_policy  # noqa: PLC0415

    response = EditorClient(make_user("staffer", staff=True), csrf=False).get("/editor/docs/welcome")
    assert response.status_code == 200
    html = response.content.decode()
    assert 'id="dp-editor-root"' in html
    nonce = re.search(r'id="dp-editor-data" nonce="([^"]+)"', html).group(1)
    assert '"initial": {"section": "docs", "slug": "welcome"}' in html
    policy = response["Content-Security-Policy"]
    assert policy == build_policy(nonce, editor=True)
    directives = dict(d.split(" ", 1) for d in policy.split("; "))
    assert directives["style-src-attr"] == "'unsafe-inline'"
    assert directives["style-src"] == build_policy(nonce).split("style-src ", 1)[1].split(";", 1)[0]
    assert "'unsafe-inline'" not in directives["style-src"]
    assert "'unsafe-inline'" not in directives["script-src"] and "'unsafe-eval'" not in directives["script-src"]
    for tag in re.findall(r"<script\b[^>]*>", html):
        assert f'nonce="{nonce}"' in tag, tag
    assert "style=" not in html and "<style" not in html


def test_editor_api_responses_do_not_get_the_editor_style_allowance(page_id):
    response = EditorClient(make_user("staffer", staff=True)).get("/_portal/editor/tree/docs")
    assert "style-src-attr" not in response["Content-Security-Policy"]


def test_public_pages_keep_the_public_csp():
    response = EditorClient(None, csrf=False).get("/docs/welcome")
    assert "style-src-attr" not in response["Content-Security-Policy"]
