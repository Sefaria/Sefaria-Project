"""Text API endpoint tests."""
import pytest
from urllib.parse import quote


TEXT_CASES = [
    ("Genesis 1:1", "First verse of Torah"),
    ("Genesis 1:1-5", "First 5 verses"),
    ("Exodus 20:1", "10 Commandments start"),
    ("Psalms 23", "Psalm 23"),
    ("Berakhot 2a", "Talmud page"),
]


@pytest.mark.parametrize("ref,description", TEXT_CASES, ids=[t[0] for t in TEXT_CASES])
def test_get_text(api, ref, description):
    r = api.get(f"/api/texts/{quote(ref)}")
    assert r.status_code == 200
    body = r.json()
    assert "ref" in body
    assert "text" in body
    assert "he" in body
    assert "heRef" in body
    assert "sections" in body
    assert body["ref"]


def test_get_text_with_version(api):
    r = api.get(f"/api/texts/{quote('Genesis 1:1')}?version=Leningrad%20Codex")
    assert r.status_code == 200
    assert "ref" in r.json()


def test_get_text_with_commentary(api):
    r = api.get(f"/api/texts/{quote('Genesis 1:1')}?commentary=1", timeout=30)
    assert r.status_code in (200, 404, 504)


def test_get_random_text(api):
    r = api.get("/api/texts/random")
    assert r.status_code == 200
    body = r.json()
    assert "ref" in body
    assert "text" in body


def test_get_versions(api):
    r = api.get("/api/versions")
    assert r.status_code in (200, 404)


def test_get_text_versions(api):
    r = api.get(f"/api/texts/versions/{quote('Genesis 1:1')}")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, (list, dict))


def test_invalid_ref(api):
    r = api.get(f"/api/texts/{quote('InvalidBookName 999:999')}")
    assert r.status_code in (200, 404)
