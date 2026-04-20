"""Core API endpoint tests."""
from urllib.parse import quote


def test_index_titles(api):
    r = api.get("/api/index/titles")
    assert r.status_code == 200
    body = r.json()
    titles = body if isinstance(body, list) else body.get("books", [])
    assert isinstance(titles, list)
    assert len(titles) > 0


def test_index_by_title(api):
    r = api.get("/api/index/Genesis")
    assert r.status_code == 200
    body = r.json()
    assert "title" in body
    assert "categories" in body


def test_links(api):
    r = api.get(f"/api/links/{quote('Genesis 1:1')}")
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert isinstance(r.json(), list)


def test_related(api):
    r = api.get(f"/api/related/{quote('Genesis 1:1')}")
    assert r.status_code in (200, 404)


def test_terms(api):
    r = api.get("/api/terms/Torah")
    assert r.status_code in (200, 404)


def test_category(api):
    r = api.get("/api/category")
    assert r.status_code in (200, 404)


def test_translations(api):
    r = api.get("/api/texts/translations")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, (list, dict))


def test_counts(api):
    r = api.get("/api/counts/Genesis")
    assert r.status_code in (200, 404)


def test_shape(api):
    r = api.get("/api/shape/Genesis")
    assert r.status_code in (200, 404)


def test_preview(api):
    r = api.get("/api/preview/Genesis")
    assert r.status_code in (200, 404)


def test_name(api):
    r = api.get("/api/name/Genesis")
    assert r.status_code in (200, 404)


def test_topics_list(api):
    r = api.get("/api/topics")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_topic_by_slug(api):
    r = api.get("/api/topics/torah")
    assert r.status_code in (200, 404)


def test_calendars(api):
    r = api.get("/api/calendars")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, (list, dict))
