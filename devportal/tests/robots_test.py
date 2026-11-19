"""robots.txt (contract C9 route `robots`, PLAN.md §2.4, §2.15, F-11)."""

import pytest
from django.test import override_settings

from .portal_helpers import REPO_ROOT, load_contract, portal_client, portal_origin

LIVE = (REPO_ROOT / "docs" / "dev-portal" / "research" / "site" / "machine" / "robots.txt").read_text(encoding="utf-8")


@pytest.mark.django_db
@override_settings(DEVPORTAL_ALLOW_INDEXING=False)
def test_closed_by_default():
    response = portal_client().get("/robots.txt")
    assert response.status_code == 200
    assert response["Content-Type"] == "text/plain; charset=utf-8"
    assert response.content.decode() == "User-agent: *\nDisallow: /\n"


@pytest.mark.django_db
@override_settings(DEVPORTAL_ALLOW_INDEXING=True)
def test_live_content_with_the_portal_paths_when_indexing_is_allowed():
    body = portal_client().get("/robots.txt").content.decode()
    origin = portal_origin()
    expected_lines = [line.replace("https://developers.sefaria.org", origin) for line in LIVE.splitlines()]
    lines = body.splitlines()
    added = [line for line in lines if line not in expected_lines]
    assert added == [f"Disallow: {path}" for path in load_contract("C9_urls.json")["robots_disallow"]]
    assert [line for line in lines if line not in added] == expected_lines
    # The added rules sit with the other Disallow lines, before the Sitemap line.
    assert lines.index("Disallow: /_portal/") < lines.index(f"Sitemap: {origin}/sitemap.xml")


@pytest.mark.django_db
def test_head_is_allowed_and_post_is_not():
    client = portal_client()
    assert client.head("/robots.txt").status_code == 200
    assert client.post("/robots.txt").status_code == 405
