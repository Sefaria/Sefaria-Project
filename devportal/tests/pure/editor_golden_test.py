"""editor_golden (PLAN Phase 7): the editor's HTML (TipTap's renderHTML of the parsed document plus the server's
finishing steps, devportal-ui/src/editor/html/export.ts) equals the Python renderer's after normalization:

- for every C4 fixture, against its golden (devportal/contracts/golden/markdown/);
- for every one of the 152 source files, against `render()` — the canvas shows each page as the public page does;
- the editor's copies of the dialect tables equal the renderer's.
"""

import json
from pathlib import Path

import pytest

from devportal.contracts.normalize import normalize
from devportal.markdown import emoji, render, renderer

from .editor_corpus import CONTRACTS, SOURCE, manifest, outputs, source_files

FIXTURES = sorted(p.stem for p in (CONTRACTS / "fixtures" / "markdown").glob("*.md"))


def test_every_fixture_was_rendered_by_the_editor():
    assert sorted(manifest()["golden"]) == FIXTURES


@pytest.mark.parametrize("name", FIXTURES)
def test_fixture_html_equals_the_golden(name):
    golden = (CONTRACTS / "golden" / "markdown" / f"{name}.html").read_text(encoding="utf-8")
    editor = (outputs() / "golden" / f"{name}.html").read_text(encoding="utf-8")
    assert normalize(editor) == normalize(golden)


@pytest.mark.parametrize("rel", source_files())
def test_corpus_page_html_equals_the_server_rendering(rel):
    server = render((SOURCE / rel).read_text(encoding="utf-8"), revision="1").html
    editor = (outputs() / "corpus-html" / Path(rel).with_suffix(".html")).read_text(encoding="utf-8")
    assert normalize(editor) == normalize(server)


def test_dialect_tables_match_the_renderer():
    tables = json.loads((outputs() / "dialect.json").read_text(encoding="utf-8"))
    assert tables["SHORTCODES"] == emoji.SHORTCODES
    assert tables["LANG_LABELS"] == renderer.LANG_LABELS
    assert tables["CALLOUT_EMOJI"] == renderer.CALLOUT_EMOJI
    assert tables["THEME_ALIASES"] == renderer.THEME_ALIASES
    assert tables["THEME_ICONS"] == renderer.THEME_ICONS
