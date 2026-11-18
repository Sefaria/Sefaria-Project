"""Helpers shared by the portal's request tests. They run under both settings modules:

- devportal.dev.settings_standalone: no ModuleMiddleware, every request is a portal request, and the
  test client's default host is used;
- sefaria.settings: requests go to the developers host of DOMAIN_MODULES (developers.localhost:8000 in
  local_settings_example.py and local_settings_ci.py), through django_hosts and ModuleMiddleware.
"""

import json
from pathlib import Path
from urllib.parse import urlparse

from django.conf import settings
from django.test import Client
from django.utils import timezone

CONTRACTS = Path(__file__).resolve().parents[1] / "contracts"
REPO_ROOT = Path(__file__).resolve().parents[2]


def load_contract(name):
    return json.loads((CONTRACTS / name).read_text(encoding="utf-8"))


def is_standalone():
    return "sefaria.system.middleware.ModuleMiddleware" not in settings.MIDDLEWARE


def portal_host():
    if is_standalone():
        return "testserver"
    url = (getattr(settings, "DOMAIN_MODULES", {}) or {}).get("en", {}).get("developers")
    assert url, "sefaria.settings without an en developers module in DOMAIN_MODULES"
    return urlparse(url).netloc


_mongo_reachable = None


def skip_unless_full_stack_runs():
    """Under sefaria.settings a request passes through sefaria.system.middleware, which imports the
    library and so needs MongoDB. Skip (rather than hang for a minute) when it is not reachable; the
    sandbox CI job has it, the standalone settings never need it."""
    global _mongo_reachable  # noqa: PLW0603
    if is_standalone():
        return
    if _mongo_reachable is None:
        import socket  # noqa: PLC0415

        host = getattr(settings, "MONGO_HOST", "localhost")
        host = host[0] if isinstance(host, list | tuple) else host
        host, _, port = str(host).partition(":")
        port = int(port or getattr(settings, "MONGO_PORT", 27017) or 27017)
        try:
            with socket.create_connection((host, port), timeout=1):
                _mongo_reachable = True
        except OSError:
            _mongo_reachable = False
    if not _mongo_reachable:
        import pytest  # noqa: PLC0415

        pytest.skip("request tests under sefaria.settings need MongoDB (sefaria.system.middleware loads the library)")


def portal_client(**kwargs):
    skip_unless_full_stack_runs()
    return Client(HTTP_HOST=portal_host(), **kwargs)


def portal_origin():
    return f"http://{portal_host()}"


def make_page(
    section, slug, *, title="A page", kind="page", body_html="<p>Body</p>", hidden=False, parent=None, position=0, **rev
):
    """A Page with one published revision."""
    from devportal.models import Page, PageRevision  # noqa: PLC0415

    page = Page.objects.create(section=section, slug=slug, kind=kind, parent=parent, position=position, origin="import")
    revision = PageRevision.objects.create(
        page=page,
        number=1,
        source="import",
        title=title,
        body_md="Body",
        rendered_html=body_html,
        hidden=hidden,
        **rev,
    )
    page.published_revision = revision
    page.content_updated_at = timezone.now()
    page.save()
    return page


def page_payload_validator():
    from jsonschema import Draft202012Validator  # noqa: PLC0415
    from referencing import Registry, Resource  # noqa: PLC0415

    schemas = [json.loads(p.read_text(encoding="utf-8")) for p in (CONTRACTS / "schemas").glob("*.schema.json")]
    registry = Registry().with_resources((s["$id"], Resource.from_contents(s)) for s in schemas)
    schema = json.loads((CONTRACTS / "schemas" / "page-payload.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema, registry=registry, format_checker=Draft202012Validator.FORMAT_CHECKER)
