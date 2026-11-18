"""The asset template tags (PLAN.md §2.8 "How Django finds the assets", contract C1)."""

import json
import os

import pytest
from django.template import Context, Template
from django.test import override_settings

from devportal.templatetags import devportal_assets

from .portal_helpers import skip_unless_full_stack_runs

NONCE = "bm9uY2UtdmFsdWUtMTIz"

MANIFEST = {
    "src/app/main.tsx": {
        "file": "assets/main-AbC123.js",
        "src": "src/app/main.tsx",
        "isEntry": True,
        "imports": ["_vendor-XyZ.js", "_shared-Q1.js"],
        "dynamicImports": ["src/editor/index.tsx"],
        "css": ["assets/main-Def.css"],
    },
    "_vendor-XyZ.js": {"file": "assets/vendor-XyZ.js", "css": ["assets/vendor-1.css"], "imports": ["_shared-Q1.js"]},
    "_shared-Q1.js": {"file": "assets/shared-Q1.js"},
    "src/editor/index.tsx": {"file": "assets/editor-9.js", "isDynamicEntry": True, "css": ["assets/editor.css"]},
}


@pytest.fixture
def bundle(tmp_path):
    root = tmp_path / "devportal"
    (root / ".vite").mkdir(parents=True)
    (root / ".vite" / "manifest.json").write_text(json.dumps(MANIFEST))
    devportal_assets.clear_caches()
    with override_settings(DEVPORTAL_BUNDLE_DIR=str(root), DEVPORTAL_VITE_DEV_SERVER="", DEBUG=False):
        yield root
    devportal_assets.clear_caches()


def render(source, **context):
    # Under sefaria.settings the template engine loads every app's tag libraries, and reader's need
    # MongoDB.
    skip_unless_full_stack_runs()
    return Template("{% load devportal_assets %}" + source).render(Context({"csp_nonce": NONCE, **context}))


def test_entry_emits_css_preloads_and_the_module_script(bundle):
    html = render("{% devportal_entry %}")
    assert html.splitlines() == [
        '<link rel="stylesheet" href="/static/bundles/devportal/assets/vendor-1.css">',
        '<link rel="stylesheet" href="/static/bundles/devportal/assets/main-Def.css">',
        '<link rel="modulepreload" href="/static/bundles/devportal/assets/vendor-XyZ.js">',
        '<link rel="modulepreload" href="/static/bundles/devportal/assets/shared-Q1.js">',
        f'<script type="module" nonce="{NONCE}" src="/static/bundles/devportal/assets/main-AbC123.js"></script>',
    ]
    assert "editor" not in html  # lazy chunks load on demand


def test_entry_is_same_origin_whatever_static_url_says(bundle):
    with override_settings(STATIC_URL="https://www.sefaria.org/static/"):
        html = render("{% devportal_entry %}")
    assert "sefaria.org" not in html
    assert 'src="/static/bundles/devportal/' in html


def test_missing_manifest_renders_a_comment_and_warns(tmp_path, caplog):
    devportal_assets.clear_caches()
    with override_settings(DEVPORTAL_BUNDLE_DIR=str(tmp_path / "nothing"), DEVPORTAL_VITE_DEV_SERVER=""):
        html = render("{% devportal_entry %}")
    assert html == "<!-- devportal bundle not built -->"
    assert "no Vite manifest entry" in caplog.text


def test_manifest_is_read_once_unless_debug(bundle):
    assert "main-AbC123.js" in render("{% devportal_entry %}")
    path = bundle / ".vite" / "manifest.json"
    changed = dict(MANIFEST)
    changed["src/app/main.tsx"] = dict(MANIFEST["src/app/main.tsx"], file="assets/main-NEW.js")
    path.write_text(json.dumps(changed))
    stat = path.stat()
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 10_000_000))
    assert "main-AbC123.js" in render("{% devportal_entry %}")  # cached in production
    with override_settings(DEBUG=True):
        assert "main-NEW.js" in render("{% devportal_entry %}")  # re-read on change when DEBUG


def test_vite_dev_server_replaces_the_bundle_only_with_debug(bundle):
    with override_settings(DEBUG=True, DEVPORTAL_VITE_DEV_SERVER="http://localhost:5173"):
        html = render("{% devportal_entry %}")
    assert 'src="http://localhost:5173/static/bundles/devportal/@vite/client"' in html
    assert 'src="http://localhost:5173/static/bundles/devportal/src/app/main.tsx"' in html
    assert html.count(f'nonce="{NONCE}"') == html.count("<script")
    with override_settings(DEBUG=False, DEVPORTAL_VITE_DEV_SERVER="http://localhost:5173"):
        assert "localhost:5173" not in render("{% devportal_entry %}")


def _write_prerender(bundle, mapping, files):
    root = bundle / "prerender"
    root.mkdir(exist_ok=True)
    (root / "manifest.json").write_text(json.dumps(mapping))
    for name, content in files.items():
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_text(content)


def test_prerendered_file_is_included(bundle):
    _write_prerender(
        bundle,
        {"header": {"docs": "header-docs.html"}, "endpoint": {"get-v3-texts": "endpoint/get-v3-texts.html"}},
        {"header-docs.html": '<header class="dp-header">docs</header>', "endpoint/get-v3-texts.html": "<article>"},
    )
    assert render('{% devportal_prerendered "header" tab %}', tab="docs") == '<header class="dp-header">docs</header>'
    assert render('{% devportal_prerendered "endpoint" "get-v3-texts" %}') == "<article>"


def test_missing_prerendered_file_falls_back_to_plain_markup(bundle, caplog):
    header = render('{% devportal_prerendered "header" tab %}', tab="reference")
    assert header.startswith('<header class="dp-header dp-header-fallback">')
    assert '<a href="/reference" aria-current="page">API Reference</a>' in header
    assert header.count("<a ") == 7  # the logo and the six primary links
    assert "no prerendered header" in caplog.text
    no_tab = render('{% devportal_prerendered "header" tab %}', tab=None)
    assert "aria-current" not in no_tab
    endpoint = render('{% devportal_prerendered "endpoint" "get-v3-texts" %}')
    assert 'data-operation-id="get-v3-texts"' in endpoint


def test_prerender_manifest_cannot_point_outside_its_directory(bundle):
    (bundle / "secret.html").write_text("SECRET")
    _write_prerender(bundle, {"header": {"home": "../secret.html"}}, {})
    assert "SECRET" not in render('{% devportal_prerendered "header" "home" %}')


def test_data_island_is_json_script_with_the_nonce():
    payload = {"title": "</script><script>alert(1)</script>", "kind": "doc", "amp": "a&b"}
    html = render("{% devportal_data_island payload %}", payload=payload)
    assert html.startswith(f'<script type="application/json" id="dp-data" nonce="{NONCE}">')
    assert html.endswith("</script>")
    body = html[html.index(">") + 1 : -len("</script>")]
    assert "<" not in body and ">" not in body and "&" not in body
    assert json.loads(body) == payload
