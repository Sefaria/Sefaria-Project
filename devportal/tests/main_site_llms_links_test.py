"""Every developers.sefaria.org URL in the main site's `static/llms.txt` resolves on our host (PLAN.md §2.10)."""

import re
from urllib.parse import urlsplit

import pytest

from .machine_helpers import REPO_ROOT, URLCONF, client, content  # noqa: F401 - fixture

pytestmark = [pytest.mark.django_db, pytest.mark.urls(URLCONF), pytest.mark.usefixtures("content")]

MAIN_SITE_LLMS = REPO_ROOT / "static" / "llms.txt"
URLS = sorted(set(re.findall(r"https?://developers\.sefaria\.org[^\s)>\"\]]*", MAIN_SITE_LLMS.read_text("utf-8"))))


def test_the_file_links_to_the_portal():
    assert len(URLS) >= 30
    assert sum(1 for u in URLS if u.endswith(".md")) >= 30


@pytest.mark.parametrize("url", URLS)
def test_url_resolves(url):
    path = urlsplit(url).path or "/"
    response = client().get(path)
    assert response.status_code == 200, f"{url} -> {response.status_code}"
    if path.endswith(".md"):
        assert response["Content-Type"] == "text/markdown; charset=utf-8"
        assert response.content.decode("utf-8").split("\n", 7)[6].startswith("# ")
