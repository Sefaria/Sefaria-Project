"""Health and connectivity checks."""


def test_healthz(api):
    r = api.get("/healthz")
    assert r.status_code in (200, 403)
    if r.status_code == 200:
        assert len(r.text) > 0


def test_health_check(api):
    r = api.get("/health-check")
    assert r.status_code == 200


def test_index_returns_toc(api):
    r = api.get("/api/index")
    assert r.status_code == 200
    body = r.json()
    if isinstance(body, list):
        assert len(body) > 0
        assert "contents" in body[0]
    else:
        assert "contents" in body
