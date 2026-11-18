"""RT-2, the editor round trip's meaning test (PLAN §2.11, I-1).

`devportal-ui/scripts/roundtrip-corpus.ts` forces every block of each of the 152 source files through the editor's
serializer. Rendered by the server's renderer, the result must equal the original's rendering after normalization,
and serializing it a second time must give the same text. RT-1 (identity) and RT-3 (locality) are Vitest tests
in devportal-ui/src/editor/markdown/roundtrip.test.ts.
"""

import pytest

from devportal.contracts.normalize import normalize
from devportal.markdown import render

from .editor_corpus import SOURCE, manifest, outputs, source_files

FILES = source_files()


def test_the_corpus_is_the_152_files():
    assert len(FILES) == 152
    assert sorted(manifest()["roundtrip"]) == FILES


def test_no_block_falls_back_to_raw_source():
    assert manifest()["fallbacks"] == []


@pytest.mark.parametrize("rel", FILES)
def test_forced_serialization_renders_the_same(rel):
    original = (SOURCE / rel).read_text(encoding="utf-8")
    rewritten = (outputs() / "roundtrip" / rel).read_text(encoding="utf-8")
    before, after = render(original, revision="1"), render(rewritten, revision="1")
    assert normalize(after.html) == normalize(before.html)
    assert after.toc == before.toc
    assert after.htmlblocks == before.htmlblocks


@pytest.mark.parametrize("rel", FILES)
def test_serializing_twice_gives_the_same_text(rel):
    once = (outputs() / "roundtrip" / rel).read_text(encoding="utf-8")
    twice = (outputs() / "roundtrip" / rel.replace(".md", ".twice.md")).read_text(encoding="utf-8")
    assert twice == once
