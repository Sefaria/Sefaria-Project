"""`/sitemap.xml` (contract C9 route `sitemap`; Phase 4 `sitemap_test`): the 129 live URLs, on our host."""

import re

import pytest

from devportal.models import PortalArtifact
from devportal.services.nav import SITEMAP_ORIGIN

from .machine_helpers import LIVE_MACHINE, LIVE_ORIGIN, URLCONF, client, content, origin  # noqa: F401 - fixture

pytestmark = [pytest.mark.django_db, pytest.mark.urls(URLCONF), pytest.mark.usefixtures("content")]

LIVE_URLS = (LIVE_MACHINE / "sitemap_urls.txt").read_text(encoding="utf-8").split()


def locs(xml):
    return re.findall(r"<loc>(.*?)</loc>", xml)


@pytest.fixture
def sitemap():
    response = client().get("/sitemap.xml")
    assert response.status_code == 200
    assert response["Content-Type"] == "application/xml"
    return response.content.decode("utf-8")


def test_every_live_url_is_present(sitemap):
    assert len(LIVE_URLS) == 129
    ours = {loc.replace(origin(), LIVE_ORIGIN) for loc in locs(sitemap)}
    assert set(LIVE_URLS) <= ours
    assert len(ours) == 129


def test_origin_is_the_requests(sitemap):
    assert SITEMAP_ORIGIN not in sitemap
    assert all(loc.startswith(origin() + "/") for loc in locs(sitemap))
    assert sitemap.startswith('<?xml version="1.0" encoding="UTF-8"?>')


def test_hidden_pages_are_left_out(sitemap):
    for path in ("/docs/shape-api", "/reference/authentication", "/page/test-homepage"):
        assert f"{origin()}{path}<" not in sitemap


def test_served_without_an_artifact(sitemap):
    PortalArtifact.objects.filter(name="sitemap.xml").delete()
    assert client().get("/sitemap.xml").content.decode("utf-8") == sitemap
