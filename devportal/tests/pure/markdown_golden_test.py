"""Every Markdown fixture renders to its golden HTML, after normalization (PLAN §2.5, contract C4)."""

import pytest

from devportal.contracts.normalize import normalize, self_test
from devportal.markdown import golden

FIXTURES = golden.fixtures()


def test_normalize_shared_self_test():
    assert self_test() == []


def test_every_fixture_has_a_golden_and_every_golden_a_fixture():
    fixture_stems = {f.stem for f in FIXTURES}
    golden_stems = {g.stem for g in golden.GOLDEN.glob("*.html")}
    assert fixture_stems
    assert fixture_stems == golden_stems


@pytest.mark.parametrize("fixture", FIXTURES, ids=[f.stem for f in FIXTURES])
def test_fixture_matches_golden(fixture):
    rendered = golden.render_fixture(fixture).html
    expected = golden.golden_path(fixture).read_text(encoding="utf-8")
    assert normalize(rendered) == normalize(expected)


@pytest.mark.parametrize("fixture", FIXTURES, ids=[f.stem for f in FIXTURES])
def test_rendering_is_deterministic(fixture):
    assert golden.render_fixture(fixture).html == golden.render_fixture(fixture).html
