"""All 152 developer-docs source files render without exception (PLAN §3 Phase 3)."""

import pytest

from devportal.contracts.normalize import normalize
from devportal.markdown import parse_front_matter, render

from .markdown_source import require_source_root, source_files


def test_corpus_has_152_files():
    root = require_source_root()
    assert len(source_files(root)) == 152


def test_every_file_renders():
    root = require_source_root()
    failures = []
    for path in source_files(root):
        text = path.read_text(encoding="utf-8")
        try:
            front, _body = parse_front_matter(text)
            result = render(text)
        except Exception as exc:  # noqa: BLE001 - collect every failure, then report them together
            failures.append(f"{path.relative_to(root)}: {exc!r}")
            continue
        if text.startswith("---"):
            assert isinstance(front, dict), path
        assert isinstance(result.html, str)
        assert isinstance(result.text, str)
    assert failures == []


@pytest.mark.parametrize("name", ["contact-us.html"])
def test_contact_page_keeps_its_form(name):
    root = require_source_root()
    html = normalize(render((root / "custom_pages" / name).read_text(encoding="utf-8")).html)
    assert '<iframe height="1000" src="https://sefaria.formstack.com/forms/developer_contact"></iframe>' in html
    assert "style=" not in html


def test_htmlblocks_in_the_corpus():
    root = require_source_root()
    counts = {}
    for path in source_files(root):
        blocks = render(path.read_text(encoding="utf-8")).htmlblocks
        if blocks:
            counts[path.name] = len(blocks)
    assert sorted(counts) == [
        "index.md",
        "test-homepage.md",
        "test-landing-page-for-mobile.md",
        "איך-ליצור-מראי-מקורות-להפניה.md",
    ]
