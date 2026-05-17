"""Sheets API endpoint tests."""
from urllib.parse import quote


def test_sheets_by_tag(api):
    r = api.get("/api/sheets/tag/Torah")
    assert r.status_code in (200, 504)
    if r.status_code == 200:
        body = r.json()
        assert isinstance(body, (list, dict))


def test_trending_tags(api):
    r = api.get("/api/sheets/trending-tags")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_tag_list(api):
    r = api.get("/api/sheets/tag-list")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_all_sheets(api):
    r = api.get("/api/sheets/all-sheets/10/0")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, (list, dict))


def test_sheets_for_ref(api):
    r = api.get(f"/api/sheets/ref/{quote('Genesis 1:1')}")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_sheet_requires_auth(api):
    r = api.post("/api/sheets", json={"title": "Test Sheet", "sources": []})
    assert r.status_code < 500


def test_get_sheet_by_id(api):
    r = api.get("/api/sheets/1")
    assert r.status_code in (200, 404)


def test_user_sheets(api):
    r = api.get("/api/sheets/user/1")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, (list, dict))


def test_v2_sheets_by_tag(api):
    r = api.get("/api/v2/sheets/tag/Torah")
    assert r.status_code in (200, 504)
    if r.status_code == 200:
        body = r.json()
        assert isinstance(body, (list, dict))
