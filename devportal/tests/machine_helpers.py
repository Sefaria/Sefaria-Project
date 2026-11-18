"""Shared setup for the agent-surface tests (W8). Not a test module.

Until the Integrator wires `devportal.views.machine` into devportal/urls.py, these tests use this
module as their URLconf: devportal.urls with the machine routes in front (C9 order), the fallback
wrapped in `negotiate_markdown`, and `/reference/<slug>` sent to the endpoint view for endpoint pages.

The `imported` fixture (content_helpers) imports the vendored snapshot, publishes it and builds the
artifacts.
"""

import re
import shutil

import pytest
from django.urls import include, re_path

from devportal import urls as portal_urls
from devportal.models import Page, PageKind
from devportal.views import machine, pages, reference

from .content_helpers import LIVE_MACHINE, REPO_ROOT, imported, run_import, source
from .portal_helpers import portal_client, portal_origin

LIVE_ORIGIN = "https://developers.sefaria.org"
LIVE_MARKDOWN = REPO_ROOT / "docs" / "dev-portal" / "research" / "site" / "live-markdown"
LIVE_ENDPOINT_SAMPLE = REPO_ROOT / "docs" / "dev-portal" / "research" / "reference" / "data" / "get-v3-texts.live.md"

__all__ = ["LIVE_MACHINE", "content", "imported", "source"]


@pytest.fixture(scope="module")
def content(django_db_setup, django_db_blocker, tmp_path_factory):  # noqa: ARG001
    """The vendored snapshot imported and published once per test module (the import takes seconds).

    Each test still runs in its own rolled-back transaction (request `db` too, via `pytestmark`). The
    database is flushed when the module finishes, so other modules start from an empty one.
    """
    from django.core.management import call_command  # noqa: PLC0415

    from devportal.services.publish import rebuild_artifacts  # noqa: PLC0415
    from devportal.services.seed import SOURCE_DIR  # noqa: PLC0415

    dest = tmp_path_factory.mktemp("machine") / "migration_source"
    shutil.copytree(SOURCE_DIR, dest, ignore=shutil.ignore_patterns("__pycache__"))
    with django_db_blocker.unblock():
        report = run_import(dest)
        rebuild_artifacts(rerender=False)
        try:
            yield report
        finally:
            call_command("flush", interactive=False, verbosity=0)


def _reference_or_page(request, slug):
    if Page.objects.filter(section="reference", slug=slug, kind=PageKind.ENDPOINT).exists():
        return reference.reference_page(request, slug)
    return pages.portal_page(request)


_portal = [
    *portal_urls.urlpatterns[:-1],
    re_path(r"^reference/(?P<slug>[^/]+)$", machine.negotiate_markdown(_reference_or_page), name="reference_page"),
    re_path(r"^.*$", machine.negotiate_markdown(pages.portal_page), name="page"),
]
urlpatterns = [re_path(r"", include(([*machine.url_patterns(), *_portal], "devportal")))]
URLCONF = __name__


def client(**kwargs):
    return portal_client(**kwargs)


def origin():
    return portal_origin()


def to_live_host(text):
    """Our output with the test host written as live's."""
    return text.replace(origin(), LIVE_ORIGIN)


def without_updated_at(text):
    return re.sub(r"^updatedAt: .*$", "updatedAt: <normalized>", text, count=1, flags=re.MULTILINE)


def unmirror_images(text):
    """Mirrored image URLs (MediaAsset.url) written back as the originals they replaced (PLAN.md §7.3)."""
    from devportal.models import MediaAsset  # noqa: PLC0415

    for url, source_url in MediaAsset.objects.exclude(source_url=None).values_list("url", "source_url"):
        text = text.replace(url, source_url)
    return text
