"""
Regression tests for refs whose text state cannot be expanded.

A complex text has no aggregate "availableTexts" state, so
``Ref.all_segment_refs`` used to raise a raw ``KeyError`` from
``StateNode.var`` for its refs. ``Ref.expand_refs`` only tolerates
``InputError``, so the ``KeyError`` escaped and failed the whole
``/api/find-refs`` task. ``all_segment_refs`` now raises ``InputError`` for
that case, so callers skip the ref and keep the refs they can expand.
"""

from unittest import mock

import pytest

import sefaria.model.text as tm
from sefaria.system.exceptions import InputError


def _complex_ref():
    """A Ref-like object that reaches the state-based branch of
    ``all_segment_refs`` and fails there the way a complex text does."""
    ref = mock.MagicMock(spec=tm.Ref)
    ref.index_node = mock.MagicMock(spec=tm.JaggedArrayNode)
    ref.__str__.return_value = "Seeds"
    ref.is_range.return_value = False
    ref.is_segment_level.return_value = False
    ref.is_section_level.return_value = True
    ref.all_subrefs.side_effect = KeyError(
        "Failed in StateNode.var(), in node: Seeds, language: all, key: availableTexts"
    )
    return ref


def test_all_segment_refs_raises_input_error_for_unexpandable_state():
    """A missing availableTexts state must surface as InputError, not KeyError."""
    with pytest.raises(InputError):
        tm.Ref.all_segment_refs(_complex_ref())


def test_expand_refs_keeps_refs_when_one_cannot_be_expanded():
    """expand_refs skips the unexpandable ref and still returns the others."""
    expand_refs = tm.Ref.expand_refs
    real_all_segment_refs = tm.Ref.all_segment_refs

    complex_ref = _complex_ref()
    complex_ref.all_segment_refs = lambda: real_all_segment_refs(complex_ref)

    segment = mock.MagicMock()
    segment.normal.return_value = "Genesis 1:1"
    simple_ref = mock.MagicMock(spec=tm.Ref)
    simple_ref.all_segment_refs.return_value = [segment]

    with mock.patch.object(tm, "Ref") as MockRef:
        MockRef.side_effect = [complex_ref, simple_ref]
        result = expand_refs(["Seeds", "Genesis 1:1"])

    assert result == ["Genesis 1:1"]


def test_all_segment_refs_still_returns_subrefs_for_supported_ref():
    """The new error handling must not change the normal return path."""
    ref = _complex_ref()
    sub1 = mock.MagicMock()
    sub1.normal.return_value = "Genesis 1:1"
    sub2 = mock.MagicMock()
    sub2.normal.return_value = "Genesis 1:2"
    ref.all_subrefs.side_effect = None
    ref.all_subrefs.return_value = [sub1, sub2]

    assert tm.Ref.all_segment_refs(ref) == [sub1, sub2]
