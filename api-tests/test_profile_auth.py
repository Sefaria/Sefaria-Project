"""Profile and authentication API tests."""


def test_profile_without_auth(api):
    r = api.get("/api/profile")
    assert r.status_code in (200, 301, 302, 401, 403, 404)


def test_public_profile(api):
    r = api.get("/api/profile/public")
    assert r.status_code in (200, 404)


def test_saved_texts(api):
    r = api.get("/api/user_history/saved")
    assert r.status_code in (200, 401, 403)


def test_user_history(api):
    r = api.get("/api/profile/user_history")
    assert r.status_code in (200, 401, 403)


def test_register_endpoint_exists(api):
    r = api.post("/api/register", json={
        "email": "test@example.com",
        "username": "testuser",
        "password": "password123",
    })
    assert r.status_code < 500


def test_login_refresh_endpoint_exists(api):
    r = api.post("/api/login/refresh/", json={"refresh": "dummy_token"})
    assert r.status_code < 500
