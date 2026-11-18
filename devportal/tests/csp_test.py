"""Content Security Policy and security headers (contract C10 §1, PLAN.md §2.12, §6.7 S-4).

The exact policy, its conditional parts, a fresh nonce on every response that every <script> carries,
and no inline style on public templates.
"""

import re

import pytest
from django.http import HttpResponse
from django.test import RequestFactory, override_settings

from devportal.security.csp import build_policy
from devportal.security.headers import apply_portal_headers

from .portal_helpers import REPO_ROOT, load_contract, make_page, portal_client, skip_unless_full_stack_runs

SECURITY = load_contract("security.json")
NONCE = "dGVzdC1ub25jZS0xMjM0"


def _policy_from_contract(nonce, api_origin="https://www.sefaria.org"):
    directives = SECURITY["csp"]["directives"]
    return "; ".join(
        " ".join([name, *(s.replace("{nonce}", nonce).replace("{api_origin}", api_origin) for s in sources)])
        for name, *sources in directives
    )


@override_settings(DEVPORTAL_ALLOW_README_IMAGES=False, DEVPORTAL_API_ORIGIN="https://www.sefaria.org")
def test_default_policy_is_exactly_the_contract():
    expected = SECURITY["csp"]["expected_default"].replace("{nonce}", NONCE)
    assert build_policy(NONCE) == expected
    assert build_policy(NONCE) == _policy_from_contract(NONCE)


@override_settings(DEVPORTAL_ALLOW_README_IMAGES=False, DEVPORTAL_API_ORIGIN="https://api.example.org/")
def test_connect_src_takes_the_api_origin_from_settings():
    assert " https://api.example.org " in build_policy(NONCE).split("connect-src", 1)[1]


@override_settings(DEVPORTAL_ALLOW_README_IMAGES=True)
def test_readme_images_are_appended_to_img_src_only():
    policy = build_policy(NONCE)
    img_src = next(d for d in policy.split("; ") if d.startswith("img-src "))
    assert img_src.endswith(" https://files.readme.io")
    assert policy.count("files.readme.io") == 1


@override_settings(DEVPORTAL_ALLOW_README_IMAGES=False)
def test_editor_policy_adds_only_style_src_attr():
    public, editor = build_policy(NONCE), build_policy(NONCE, editor=True)
    assert editor == public + "; style-src-attr 'unsafe-inline'"


@pytest.mark.parametrize("editor", [False, True])
@pytest.mark.parametrize("readme", [False, True])
def test_script_and_style_src_are_never_unsafe(editor, readme):
    with override_settings(DEVPORTAL_ALLOW_README_IMAGES=readme, DEBUG=False, DEVPORTAL_VITE_DEV_SERVER=""):
        directives = dict(d.split(" ", 1) for d in build_policy(NONCE, editor=editor).split("; "))
    assert "unsafe" not in directives["script-src"]
    assert "unsafe" not in directives["style-src"]
    assert "unsafe-eval" not in "; ".join(directives.values())


def test_vite_dev_server_allowances_need_debug():
    with override_settings(DEBUG=False, DEVPORTAL_VITE_DEV_SERVER="http://localhost:5173"):
        assert "localhost:5173" not in build_policy(NONCE)
    with override_settings(DEBUG=True, DEVPORTAL_VITE_DEV_SERVER="http://localhost:5173"):
        directives = dict(d.split(" ", 1) for d in build_policy(NONCE).split("; "))
    assert directives["script-src"].endswith(" http://localhost:5173")
    assert "'unsafe-inline'" not in directives["script-src"]
    assert directives["style-src"] == "'self' http://localhost:5173 'unsafe-inline'"
    assert "ws://localhost:5173" in directives["connect-src"]


def test_security_headers_and_an_existing_policy_is_kept():
    request = RequestFactory().get("/_portal/htmlblock/1/0")
    frame = HttpResponse("x")
    frame["Content-Security-Policy"] = SECURITY["htmlblock_frame"]["csp"]
    apply_portal_headers(request, frame, NONCE)
    assert frame["Content-Security-Policy"] == SECURITY["htmlblock_frame"]["csp"]
    for name in ("X-Content-Type-Options", "Referrer-Policy", "Cross-Origin-Opener-Policy", "Content-Language"):
        assert frame[name] == SECURITY["response_headers"][name]


def _nonce(response):
    match = re.search(r"'nonce-([A-Za-z0-9_\-+/=]+)'", response["Content-Security-Policy"])
    assert match, response["Content-Security-Policy"]
    return match.group(1)


@pytest.mark.django_db
@override_settings(DEVPORTAL_ALLOW_README_IMAGES=False)
@pytest.mark.parametrize("path", ["/", "/docs/welcome", "/page/contact-us", "/no-such-page", "/robots.txt"])
def test_every_portal_response_carries_the_policy(path):
    make_page("docs", "welcome", title="Welcome")
    make_page("page", "contact-us", title="Get in Touch")
    response = portal_client().get(path)
    assert response.status_code in (200, 404)
    assert response["Content-Security-Policy"] == SECURITY["csp"]["expected_default"].replace(
        "{nonce}", _nonce(response)
    )
    for name, value in SECURITY["response_headers"].items():
        if name.startswith("$"):
            continue
        assert response[name] == value


@pytest.mark.django_db
def test_every_script_carries_the_response_nonce_and_nonces_are_fresh(tmp_path):
    make_page("docs", "welcome", title="Welcome")
    bundle = tmp_path / "bundle"
    (bundle / ".vite").mkdir(parents=True)
    (bundle / ".vite" / "manifest.json").write_text(
        '{"src/app/main.tsx": {"file": "assets/main-abc.js", "isEntry": true, "css": ["assets/main.css"]}}'
    )
    from devportal.templatetags import devportal_assets  # noqa: PLC0415

    devportal_assets.clear_caches()
    client = portal_client()
    nonces = []
    with override_settings(DEVPORTAL_BUNDLE_DIR=str(bundle)):
        for path in ("/", "/docs/welcome", "/no-such-page"):
            response = client.get(path)
            nonce = _nonce(response)
            nonces.append(nonce)
            scripts = re.findall(r"<script\b[^>]*>", response.content.decode())
            assert len(scripts) == 2, scripts  # the bundle and the data island
            for tag in scripts:
                assert f'nonce="{nonce}"' in tag, tag
    devportal_assets.clear_caches()
    assert len(set(nonces)) == len(nonces)
    assert all(len(n) >= 22 for n in nonces)  # at least 128 bits


def test_public_templates_have_no_inline_style():
    templates = sorted((REPO_ROOT / "devportal" / "templates" / "devportal").glob("*.html"))
    assert templates
    for template in templates:
        if template.name.startswith("editor"):
            continue
        text = template.read_text(encoding="utf-8")
        assert "<style" not in text.lower(), template.name
        assert not re.search(r"\sstyle\s*=", text, re.I), template.name
        assert not re.search(r"<script(?![^>]*nonce)", text, re.I), f"{template.name}: a <script> without nonce"


@pytest.mark.django_db
def test_staff_api_wrapper_answers_401_403_and_refuses_csrf_exempt_views():
    from django.contrib.auth.models import AnonymousUser, User  # noqa: PLC0415
    from django.views.decorators.csrf import csrf_exempt  # noqa: PLC0415

    from devportal.security.permissions import staff_api  # noqa: PLC0415

    skip_unless_full_stack_runs()  # under sefaria.settings, user signals load the library
    view = staff_api(lambda request: HttpResponse("ok"))
    request = RequestFactory().get("/_portal/editor/tree")
    request.user = AnonymousUser()
    assert view(request).status_code == 401
    request.user = User.objects.create_user("reader", "reader@example.org", "x")
    assert view(request).status_code == 403
    request.user = User.objects.create_user("staff", "staff@example.org", "x", is_staff=True)
    assert view(request).status_code == 200
    assert not getattr(view, "csrf_exempt", False)
    with pytest.raises(TypeError):
        staff_api(csrf_exempt(lambda request: HttpResponse("ok")))
