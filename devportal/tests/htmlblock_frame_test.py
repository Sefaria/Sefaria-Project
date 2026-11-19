"""/_portal/htmlblock/<revision>/<n> (PLAN.md §2.6, contract C10 §2, security check S-9).

The frame answers with exactly the frame CSP of contracts/security.json, the renderer's frames carry the
sandbox without `allow-scripts`, and a block holding scripts and event handlers serves nothing that
could execute. devportal/urls.py is the Integrator's; these tests route the view themselves.
"""

import json
import re
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.urls import path

from devportal.markdown import render
from devportal.models import Page, PageRevision
from devportal.views.htmlblock import FRAME_CSP, FRAME_SANDBOX, htmlblock_frame, neutralize_scripts

REPO = Path(__file__).resolve().parents[2]
SECURITY = json.loads((REPO / "devportal/contracts/security.json").read_text(encoding="utf-8"))["htmlblock_frame"]

urlpatterns = [path("_portal/htmlblock/<str:revision>/<str:n>", htmlblock_frame)]

pytestmark = [pytest.mark.django_db, pytest.mark.urls(__name__)]

HOSTILE_BLOCK = """<HTMLBlock>{`
<style>.cta { color: #612854; }</style>
<div class="cta" onclick="alert(1)">Community showcase</div>
<script>alert('x')</script>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onerror="alert(2)" alt="">
<a href="javascript:alert(3)">bad</a>
<a href="https://powered-by.sefaria.org" target="_blank">Explore the projects</a>
<iframe srcdoc="<script>alert(4)</script>"></iframe>
<svg><script>alert(5)</script></svg>
`}</HTMLBlock>

Text between.

<HTMLBlock>{`<div dir="rtl"><h2>איך ליצור</h2></div>`}</HTMLBlock>
"""


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


def _page(body, *, publish=True, slug="powered-by-sefaria"):
    page = Page.objects.create(section="docs", kind="page", slug=slug)
    rev = PageRevision.objects.create(page=page, number=1, source="import", title="T", body_md=body)
    if publish:
        page.published_revision = rev
        page.save()
    return rev


def _get(client, rev, n=0):
    return client.get(f"/_portal/htmlblock/{rev.pk}/{n}")


# ------------------------------------------------------------------ the policy


def test_frame_csp_is_exactly_the_contract():
    assert SECURITY["csp"] == FRAME_CSP
    assert SECURITY["iframe_sandbox"] == FRAME_SANDBOX
    for never in SECURITY["never"]:
        assert never not in FRAME_CSP


def test_response_headers(client):
    rev = _page(HOSTILE_BLOCK)
    response = _get(client, rev)
    assert response.status_code == 200
    assert response["Content-Type"] == "text/html; charset=utf-8"
    assert response["Content-Security-Policy"] == SECURITY["csp"]
    assert response["X-Content-Type-Options"] == "nosniff"
    # The page that embeds the frame is same-origin; nothing else may frame it.
    assert response["X-Frame-Options"] == "SAMEORIGIN"
    assert not response.cookies


def test_head_is_allowed_and_post_is_not(client):
    rev = _page(HOSTILE_BLOCK)
    assert client.head(f"/_portal/htmlblock/{rev.pk}/0").status_code == 200
    assert client.post(f"/_portal/htmlblock/{rev.pk}/0").status_code == 405


def test_renderer_frames_carry_the_sandbox_without_allow_scripts():
    result = render(HOSTILE_BLOCK, revision="7")
    frames = re.findall(r"<iframe[^>]*>", result.html)
    assert len(frames) == 2
    for n, frame in enumerate(frames):
        assert f'sandbox="{SECURITY["iframe_sandbox"]}"' in frame
        assert "allow-scripts" not in frame
        assert f'src="{SECURITY["iframe_src_prefix"]}7/{n}"' in frame


# ------------------------------------------------------------------ S-9


def test_scripts_in_a_block_are_not_executable(client):
    rev = _page(HOSTILE_BLOCK)
    html = _get(client, rev).content.decode()
    lowered = html.lower()
    assert "<script" not in lowered
    assert "onclick" not in lowered and "onerror" not in lowered
    assert "javascript:" not in lowered
    assert "srcdoc" not in lowered
    assert "<iframe" not in lowered
    # The block's own content and styles survive.
    assert "<style>.cta { color: #612854; }</style>" in html
    assert "Community showcase" in html
    assert 'href="https://powered-by.sefaria.org"' in html
    # And even if something slipped through, the policy forbids running it.
    csp = _get(client, rev)["Content-Security-Policy"]
    assert csp.startswith("sandbox ") and "allow-scripts" not in csp
    assert "default-src 'none'" in csp and "script-src" not in csp


def test_frame_document_shape(client):
    rev = _page(HOSTILE_BLOCK)
    html = _get(client, rev, 1).content.decode()
    assert html.lstrip().lower().startswith("<!doctype html>")
    assert '<base target="_blank" />' in html
    assert '<body class="dp-htmlblock-body">' in html
    assert (
        '<div class="dp-markdown dp-htmlblock-document"><div class="dp-htmlblock-html"><div dir="rtl"><h2>איך ליצור</h2></div></div></div>'
        in html
    )
    assert " style=" not in html.split("<body", 1)[0]


def test_frame_links_the_entry_css_from_the_vite_manifest(client, tmp_path):
    manifest = tmp_path / "bundles/devportal/.vite/manifest.json"
    manifest.parent.mkdir(parents=True)
    manifest.write_text(json.dumps({"src/app/main.tsx": {"file": "assets/main.js", "css": ["assets/main-abc.css"]}}))
    rev = _page(HOSTILE_BLOCK)
    with override_settings(STATIC_ROOT=str(tmp_path), STATICFILES_DIRS=[], STATIC_URL="/static/"):
        html = _get(client, rev).content.decode()
    assert '<link rel="stylesheet" href="/static/bundles/devportal/assets/main-abc.css" />' in html


# ------------------------------------------------------------------ who may read what


def test_unknown_blocks_and_revisions_are_404(client):
    rev = _page(HOSTILE_BLOCK)
    assert _get(client, rev, 2).status_code == 404
    assert client.get(f"/_portal/htmlblock/{rev.pk}/-1").status_code == 404
    assert client.get("/_portal/htmlblock/abc/0").status_code == 404
    assert client.get("/_portal/htmlblock/999999/0").status_code == 404
    no_blocks = _page("Just text.", slug="plain")
    assert _get(client, no_blocks).status_code == 404


def test_drafts_are_for_staff_only(client):
    draft = _page(HOSTILE_BLOCK, publish=False, slug="draft")
    assert _get(client, draft).status_code == 404
    user = get_user_model().objects.create_user("plain", password="x")
    client.force_login(user)
    assert _get(client, draft).status_code == 404
    staff = get_user_model().objects.create_user("staff", password="x", is_staff=True)
    client.force_login(staff)
    assert _get(client, draft).status_code == 200


def test_deleted_pages_are_404(client):
    rev = _page(HOSTILE_BLOCK)
    Page.objects.filter(pk=rev.page_id).update(deleted_at="2026-11-18T00:00:00Z")
    assert _get(client, rev).status_code == 404


# ------------------------------------------------------------------ the stripper


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("<p onmouseover='x()'>a</p>", "<p>a</p>"),
        ("<a HREF=' JaVaScRiPt:alert(1)'>a</a>", "<a>a</a>"),
        ("<a href='https://x.org/?a=1&amp;b=2'>a</a>", '<a href="https://x.org/?a=1&amp;b=2">a</a>'),
        ("<script>1</script><b>ok</b>", "<b>ok</b>"),
        ("<noscript><img src=x onerror=y></noscript>ok", "ok"),
        ("<object data='x'><embed src='y'></object>t", "t"),
        ("<base href='https://evil'><meta http-equiv='refresh' content='0'><link rel=import href=x>t", "t"),
        ("<style>p{color:red}</style>&nbsp;&#x5D0;", "<style>p{color:red}</style>&nbsp;&#x5D0;"),
        ("<!-- c --><br/>", "<br />"),
        ("<img src='data:text/html,<script>' alt=''>", '<img alt="">'),
    ],
)
def test_neutralize_scripts(source, expected):
    assert neutralize_scripts(source) == expected
