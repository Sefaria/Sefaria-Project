"""Shared setup for the editor's request tests (editor_api_test, permissions_test, revisions_test, upload_test,
slug_redirect_test, publish_pipeline_test).

The editor routes live in `devportal.views.editor_api` (`editor_urlpatterns`, `shell_urlpatterns`). Until the
Integrator includes them in `devportal/urls.py`, the `editor_urls` fixture serves them through
`devportal.tests.editor_urls`, which puts them in front of the portal's own URLconf, exactly where they belong.
"""

import json
from pathlib import Path

import pytest
from django.test import Client
from django.urls import NoReverseMatch, reverse

from .portal_helpers import CONTRACTS, is_standalone, portal_host, skip_unless_full_stack_runs

SCHEMAS = CONTRACTS / "schemas"


def editor_routes_wired():
    try:
        reverse("devportal:editor_tree", kwargs={"section": "docs"})
    except NoReverseMatch:
        return False
    return True


@pytest.fixture
def editor_urls(settings):
    """Make the editor routes reachable (see the module docstring)."""
    skip_unless_full_stack_runs()
    if not editor_routes_wired():
        if not is_standalone():
            pytest.skip("devportal/urls.py does not include the editor routes yet (Integrator)")
        settings.ROOT_URLCONF = "devportal.tests.editor_urls"
    settings.DEVPORTAL_AUTO_SEED = False


@pytest.fixture
def media_storage(tmp_path):
    from devportal.adapters import storage  # noqa: PLC0415

    backend = storage.LocalStorage(root=tmp_path / "media", base_url="/media/")
    storage.set_storage(backend)
    yield backend
    storage.set_storage(None)


def make_user(username, *, staff=False):
    from django.contrib.auth.models import User  # noqa: PLC0415

    return User.objects.create_user(username, f"{username}@example.org", "pw-" + username, is_staff=staff)


class EditorClient:
    """A test client with CSRF checks on. `csrf=False` sends unsafe requests without the token."""

    def __init__(self, user=None, *, csrf=True):
        self.client = Client(HTTP_HOST=portal_host(), enforce_csrf_checks=True)
        if user is not None:
            self.client.force_login(user)
        self.csrf = csrf
        self.token = None
        if csrf:
            response = self.client.get("/_portal/csrf")
            assert response.status_code == 200, response.content
            self.token = response.json()["csrfToken"]

    def _headers(self):
        return {"HTTP_X_CSRFTOKEN": self.token} if self.csrf and self.token else {}

    def get(self, path, **extra):
        return self.client.get(path, **extra)

    def send(self, method, path, data=None, **extra):
        body = json.dumps(data) if data is not None else ""
        handler = getattr(self.client, method.lower())
        return handler(path, data=body, content_type="application/json", **self._headers(), **extra)

    def post(self, path, data=None):
        return self.send("POST", path, data)

    def put(self, path, data=None):
        return self.send("PUT", path, data)

    def patch(self, path, data=None):
        return self.send("PATCH", path, data)

    def delete(self, path):
        return self.send("DELETE", path)

    def upload(self, filename, data, content_type):
        from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: PLC0415

        upload = SimpleUploadedFile(filename, data, content_type=content_type)
        return self.client.post("/_portal/editor/uploads", {"file": upload}, **self._headers())


def schema_validator(name):
    from jsonschema import Draft202012Validator  # noqa: PLC0415
    from referencing import Registry, Resource  # noqa: PLC0415

    schemas = [json.loads(p.read_text(encoding="utf-8")) for p in Path(SCHEMAS).glob("*.schema.json")]
    registry = Registry().with_resources((s["$id"], Resource.from_contents(s)) for s in schemas)
    schema = json.loads((SCHEMAS / f"{name}.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema, registry=registry, format_checker=Draft202012Validator.FORMAT_CHECKER)


def assert_shape(name, payload):
    errors = sorted(schema_validator(name).iter_errors(payload), key=lambda e: list(e.path))
    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors]


def make_docs_tree():
    """A small docs tree: category > welcome (published) > child; and a second category."""
    from devportal.models import Page, PageRevision  # noqa: PLC0415
    from devportal.services import publish  # noqa: PLC0415

    def page(slug, kind="page", parent=None, position=0, title=None, body="Hello", publish_it=True):
        row = Page.objects.create(
            section="docs", kind=kind, slug=slug, parent=parent, position=position, origin="import"
        )
        revision = PageRevision.objects.create(
            page=row, number=1, source="import", title=title or slug.title(), body_md=body
        )
        row.draft_revision = revision
        row.save()
        if publish_it:
            publish.publish(row, revision, rebuild=False)
        row.refresh_from_db()
        return row

    cat = page("technical-docs", kind="category", title="TECHNICAL DOCS")
    welcome = page("welcome", parent=cat, title="Welcome", body="# Welcome\n\nFirst version.\n")
    child = page("child", parent=welcome, title="Child")
    other = page("guides", kind="category", position=1, title="GUIDES")
    return {"category": cat, "welcome": welcome, "child": child, "other": other}
