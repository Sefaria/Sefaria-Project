"""Regression tests for disambiguating citations to refs that cannot be expanded.

A ref to a complex text whose schema node has named children and no default child
(for example "Sefer Mitzvot Gadol") has no expandable state, so
``Ref.all_segment_refs`` refuses it with ``InputError``. The non-segment
disambiguator used to treat that expected, unsupported ref as an unhandled error
and log an ERROR traceback. It must skip the ref instead, the same way it skips
an empty segment list.
"""

import logging

from sefaria.helper.linker import disambiguator
from sefaria.helper.linker.disambiguator import NonSegmentResolutionPayload
from sefaria.system.exceptions import InputError


def _payload() -> NonSegmentResolutionPayload:
    return NonSegmentResolutionPayload(
        ref="Some Commentary on Genesis 1:1",
        versionTitle="v",
        language="he",
        charRange=[0, 4],
        text="טקסט",
        resolved_non_segment_ref="Sefer Mitzvot Gadol",
    )


class _UnsupportedRef:
    """A Ref whose index node cannot be expanded, like a complex text's root node."""

    def __init__(self, ref_str):
        self.ref_str = ref_str

    def all_segment_refs(self):
        raise InputError(
            "all_segment_refs() doesn't support Sefer Mitzvot Gadol: its node (SchemaNode) "
            "is not one of ['JaggedArrayNode', 'DictionaryEntryNode', 'SheetNode'] and has no "
            "default child."
        )


def test_skips_unexpandable_non_segment_ref_without_error(monkeypatch, caplog):
    monkeypatch.setattr(disambiguator, "_get_ref_text", lambda *args, **kwargs: "citing text")
    monkeypatch.setattr(disambiguator, "Ref", _UnsupportedRef)

    with caplog.at_level(logging.WARNING, logger="sefaria.helper.linker.disambiguator"):
        result = disambiguator.disambiguate_non_segment_ref(_payload())

    assert result is None
    assert [r for r in caplog.records if r.levelno >= logging.ERROR] == []
