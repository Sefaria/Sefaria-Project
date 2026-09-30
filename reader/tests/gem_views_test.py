import json
import re

from django.test import RequestFactory

from reader.gem_views import gem_home


def _render(path, **kwargs):
    request = RequestFactory().get(path)
    return gem_home(request, **kwargs)


def _config(html):
    m = re.search(r'<script id="gem-config" type="application/json">(.*?)</script>', html, re.S)
    assert m, "config script missing"
    return json.loads(m.group(1))


def test_gem_home_is_standalone_page():
    response = _render("/")
    assert response.status_code == 200
    html = response.content.decode("utf-8")
    # The tool does not reuse the site chrome.
    assert 'id="s2"' not in html
    assert "gem/js/main.js" in html
    assert '<script type="importmap">' in html
    assert _config(html)["initialRef"] is None


def test_gem_import_map_versions_every_module():
    html = _render("/").content.decode("utf-8")
    m = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
    imports = json.loads(m.group(1))["imports"]
    assert any(k.endswith("gem/js/reader.js") for k in imports)
    assert all("?v=" in v for v in imports.values())


def test_gem_deep_link_and_query_ref():
    assert _config(_render("/gem/Shabbat.31a", tref="Shabbat.31a").content.decode("utf-8"))["initialRef"] == "Shabbat.31a"
    assert _config(_render("/?ref=Berakhot.2a").content.decode("utf-8"))["initialRef"] == "Berakhot.2a"
