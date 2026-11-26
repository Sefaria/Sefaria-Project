"""V-security review findings (PLAN.md §6.7, S-5 and S-15): regression tests for the issues fixed on the branch.

- Open redirect: `/v1.0//evil.example` answered `302 Location: //evil.example`.
- Rate limits keyed on the proxy's address: behind the gateway every visitor shared one feedback and MCP bucket.
- SSRF in the image mirror: any URL in page content was downloaded from inside the cluster.
- S-5 over all of devportal/: the only server-side HTTP clients are the three reviewed ones.
"""

import json
import re
import socket
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from django.core.cache import cache
from django.test import Client, RequestFactory, override_settings

from devportal.security.client_ip import client_ip
from devportal.services import images

from .portal_helpers import is_standalone, portal_client

DEVPORTAL = Path(__file__).resolve().parents[1]


# --- open redirects ------------------------------------------------------------------------------------------------


OFF_SITE = [
    "/v1.0//evil.example",
    "/v1.0///evil.example",
    "/v1.0//evil.example.md",
    "/v1.0//evil.example/docs/welcome?x=1",
    "/v1.0/%2F%2Fevil.example",
    "/v1.0/\\evil.example",
    "/v1.0//\\evil.example",
]


def _stays_on_this_host(location):
    # A browser reads `//host`, `///host`, `/\host` (and `\` anywhere in the authority) as another host.
    return location.startswith("/") and not re.match(r"^/[/\\]", location) and "%5C%5C" not in location[:4]


@pytest.mark.django_db
@pytest.mark.parametrize("path", OFF_SITE)
def test_versioned_fallback_cannot_redirect_off_site(path):
    response = portal_client().get(path)
    assert response.status_code == 302
    assert _stays_on_this_host(response["Location"]), response["Location"]


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["/v1.0//evil.example", "/v1.0///evil.example/x"])
def test_page_json_redirect_payload_stays_on_this_host(path):
    response = portal_client().get("/_portal/page.json", {"path": path})
    payload = response.json()
    assert payload["kind"] == "redirect"
    assert _stays_on_this_host(payload["location"]), payload["location"]


@pytest.mark.django_db
def test_versioned_fallback_still_redirects_ordinary_paths():
    response = portal_client().get("/v1.0/docs/welcome?ref=x")
    assert (response.status_code, response["Location"]) == (302, "/docs/welcome?ref=x")


@pytest.mark.django_db
@pytest.mark.parametrize("next_path", ["//evil.example", "/\\evil.example", "https://evil.example", "/%0d%0aX: y"])
def test_login_next_is_never_another_host(next_path):
    response = portal_client().get("/login", {"next": next_path})
    assert response.status_code == 302
    location = urlsplit(response["Location"])
    assert "\r" not in response["Location"] and "\n" not in response["Location"]
    for value in parse_qs(location.query).get("next", []):
        assert urlsplit(value).hostname not in (None, "evil.example")
        assert urlsplit(value).netloc == response.wsgi_request.get_host()


# --- the visitor's address for rate limits -------------------------------------------------------------------------


def _request(**meta):
    return RequestFactory().get("/", **meta)


def test_client_ip_ignores_the_gateway_header_unless_trusted():
    request = _request(REMOTE_ADDR="10.0.0.9", HTTP_X_ORIGINAL_FORWARDED_FOR="203.0.113.7")
    assert client_ip(request) == "10.0.0.9"


@override_settings(DEVPORTAL_TRUST_GATEWAY_CLIENT_IP=True)
def test_client_ip_uses_the_gateway_header_when_trusted():
    request = _request(REMOTE_ADDR="10.0.0.9", HTTP_X_ORIGINAL_FORWARDED_FOR="203.0.113.7")
    assert client_ip(request) == "203.0.113.7"


@override_settings(DEVPORTAL_TRUST_GATEWAY_CLIENT_IP=True)
@pytest.mark.parametrize("value", ["", "not-an-ip", "203.0.113.7, 198.51.100.1", "x" * 100])
def test_client_ip_falls_back_when_the_gateway_header_is_malformed(value):
    request = _request(REMOTE_ADDR="10.0.0.9", HTTP_X_ORIGINAL_FORWARDED_FOR=value)
    assert client_ip(request) == "10.0.0.9"


@pytest.mark.django_db
@pytest.mark.skipif(not is_standalone(), reason="standalone URLconf")
@override_settings(DEVPORTAL_TRUST_GATEWAY_CLIENT_IP=True)
def test_feedback_limit_is_per_visitor_behind_one_proxy():
    """Twenty votes from one visitor do not block another visitor who reaches the app through the same proxy."""
    from devportal.views.api import FEEDBACK_PER_VISITOR_PER_HOUR  # noqa: PLC0415

    cache.clear()
    try:
        client = Client(enforce_csrf_checks=True, REMOTE_ADDR="10.0.0.9")
        token = client.get("/_portal/csrf").json()["csrfToken"]

        def vote(visitor):
            return client.post(
                "/_portal/feedback",
                data=json.dumps({"path": "/docs/welcome", "helpful": True, "comment": ""}),
                content_type="application/json",
                HTTP_X_CSRFTOKEN=token,
                HTTP_X_ORIGINAL_FORWARDED_FOR=visitor,
            )

        statuses = [vote("203.0.113.7").status_code for _ in range(FEEDBACK_PER_VISITOR_PER_HOUR + 1)]
        assert statuses[-1] == 429
        assert set(statuses[:-1]) == {201}
        assert vote("198.51.100.1").status_code == 201
    finally:
        cache.clear()


@override_settings(DEVPORTAL_TRUST_GATEWAY_CLIENT_IP=True)
def test_mcp_view_rate_limits_on_the_visitor_address():
    from devportal.mcp import django_view  # noqa: PLC0415

    request = _request(REMOTE_ADDR="10.0.0.9", HTTP_X_ORIGINAL_FORWARDED_FOR="2001:db8::1")
    assert django_view.client_ip(request) == "2001:db8::1"


# --- SSRF: the image mirror ----------------------------------------------------------------------------------------


def _resolver(*addresses):
    def resolve(host, port, proto=0):  # noqa: ARG001
        return [(socket.AF_INET, socket.SOCK_STREAM, proto, "", (a, port)) for a in addresses]

    return resolve


@pytest.mark.parametrize(
    "url,addresses",
    [
        ("http://169.254.169.254/computeMetadata/v1/", ("169.254.169.254",)),
        ("http://localhost:8000/admin/", ("127.0.0.1",)),
        ("https://internal.example/x.png", ("10.1.2.3",)),
        ("https://mixed.example/x.png", ("93.184.216.34", "192.168.0.1")),
        ("https://v6.example/x.png", ("::1",)),
        ("https://v6mapped.example/x.png", ("::ffff:127.0.0.1",)),
        ("ftp://files.example/x.png", ("93.184.216.34",)),
        ("file:///etc/passwd", ()),
        ("https://user:pw@files.example/x.png", ("93.184.216.34",)),
    ],
)
def test_image_mirror_refuses_non_public_urls(url, addresses):
    with pytest.raises(images.RefusedImage):
        images.check_public_url(url, _resolver(*addresses))


def test_image_mirror_allows_public_hosts():
    images.check_public_url("https://files.readme.io/a.png", _resolver("93.184.216.34"))


class _FakeResponse:
    def __init__(self, status=200, location=None, body=b"img"):
        self.status_code = status
        self.headers = {"Location": location} if location else {}
        self.is_redirect = location is not None
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def raise_for_status(self):
        pass

    def iter_content(self, _size):
        yield self.body


def test_image_mirror_checks_every_redirect_hop():
    calls = []

    def get(url, **kwargs):
        calls.append((url, kwargs))
        return _FakeResponse(302, location="http://169.254.169.254/latest/meta-data/")

    def resolve(host, port, proto=0):
        address = "169.254.169.254" if host == "169.254.169.254" else "93.184.216.34"
        return [(socket.AF_INET, socket.SOCK_STREAM, proto, "", (address, port))]

    with pytest.raises(images.RefusedImage):
        images.fetch_url("https://files.readme.io/a.png", get=get, resolve=resolve)
    assert [c[0] for c in calls] == ["https://files.readme.io/a.png"]
    assert calls[0][1]["allow_redirects"] is False


def test_image_mirror_follows_public_redirects_and_stops_after_five():
    def get(url, **_kwargs):
        if url.endswith("/final.png"):
            return _FakeResponse(body=b"PNGDATA")
        return _FakeResponse(302, location="/final.png")

    assert images.fetch_url("https://a.example/start", get=get, resolve=_resolver("93.184.216.34")) == b"PNGDATA"

    def loop(url, **_kwargs):  # noqa: ARG001
        return _FakeResponse(302, location="/again")

    with pytest.raises(images.RefusedImage, match="too many redirects"):
        images.fetch_url("https://a.example/start", get=loop, resolve=_resolver("93.184.216.34"))


# --- S-5: server-side HTTP clients in devportal/ --------------------------------------------------------------------

HTTP_CLIENT = re.compile(
    r"\b(requests\.(get|post|put|delete|head|patch|request|Session)|urllib\.request|urlopen|httpx|http\.client|aiohttp)"
)
# Each reviewed: the MCP execute-request lock (S-6); the image mirror (public hosts only, every hop checked); the
# operator-run snapshot command, whose base URL is a command-line option.
ALLOWED_HTTP_CLIENTS = {
    ("mcp/execute.py", "session = requests.Session()"),
    ("services/images.py", "get = requests.get"),
    (
        "management/commands/devportal_fetch_source.py",
        'response = requests.get(url, timeout=30, headers={"Accept": "application/json"})',
    ),
}


def test_s5_no_other_server_side_http_client_in_devportal():
    found = set()
    for path in DEVPORTAL.rglob("*.py"):
        rel = path.relative_to(DEVPORTAL).as_posix()
        if rel.startswith("tests/") or "/tests/" in rel:
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if HTTP_CLIENT.search(line):
                found.add((rel, line.strip()))
    assert found == ALLOWED_HTTP_CLIENTS
