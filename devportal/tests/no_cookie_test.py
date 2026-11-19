"""Public pages set no cookie (PLAN.md §2.2 "Cookies and sessions", §6.7 S-12, contract C10 `cookies`).

The session cookie is shared with the library host, so the portal must not create sessions or CSRF
cookies for anonymous visitors. The CSRF cookie is set only by GET /_portal/csrf.
"""

import pytest
from django.conf import settings

from .portal_helpers import make_page, portal_client

PUBLIC_ROUTES = [
    "/",
    "/docs",
    "/docs/",
    "/docs/welcome",
    "/docs/welcome/",
    "/docs/getting-started",
    "/reference",
    "/reference/getting-started",
    "/page/contact-us",
    "/page/contact-us/",
    "/v1.0",
    "/v1.0/docs/welcome?x=1",
    "/no-such-page",
    "/DOCS/WELCOME",
    "/robots.txt",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/icon-512.png",
    "/site.webmanifest",
    "/login",
    "/login?next=/docs/welcome",
    "/mcp",
    "/_portal/page.json?path=/docs/welcome",
    "/_portal/page.json?path=/no-such-page",
    "/_portal/no-such-endpoint",
]


@pytest.fixture
def pages(db):
    make_page("docs", "welcome", title="Welcome")
    make_page("reference", "getting-started", title="Getting Started")
    make_page("page", "contact-us", title="Get in Touch")


@pytest.mark.parametrize("route", PUBLIC_ROUTES)
def test_anonymous_get_sets_no_cookie(pages, route):
    response = portal_client().get(route)
    assert response.status_code < 500, route
    assert not response.cookies, f"{route} set {list(response.cookies)}"
    assert "Set-Cookie" not in response.headers


@pytest.mark.parametrize("route", ["/", "/docs/welcome", "/robots.txt"])
def test_anonymous_head_sets_no_cookie(pages, route):
    response = portal_client().head(route)
    assert not response.cookies


def test_the_csrf_endpoint_is_the_one_that_sets_a_cookie(pages):
    response = portal_client().get("/_portal/csrf")
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert set(response.cookies) == {settings.CSRF_COOKIE_NAME}
    assert response.json()["csrfToken"]
