"""Search API endpoint tests."""


def test_search_page(api):
    r = api.get("/search?q=Torah")
    assert r.status_code == 200


def test_search_genesis(api):
    r = api.get("/search?q=Genesis")
    assert r.status_code == 200


def test_search_wrapper_es8(api):
    r = api.get("/api/search-wrapper/es8")
    assert r.status_code == 200


def test_search_wrapper(api):
    r = api.get("/api/search-wrapper")
    assert r.status_code == 200


def test_opensearch_suggestions(api):
    r = api.get("/api/opensearch-suggestions?q=Gene")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_search_with_limit(api):
    r = api.get("/search?q=Torah&size=5")
    assert r.status_code == 200
