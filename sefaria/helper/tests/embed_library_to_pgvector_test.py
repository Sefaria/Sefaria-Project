# -*- coding: utf-8 -*-
"""
Tests for scripts/embed_library_to_pgvector.py.

Pure/deterministic helpers (time_period_to_dict, EmbeddingResult) are tested with no
DB access. The context-building helpers (get_index_context, get_version_context,
get_section_context, collect_segment_records_by_section) hit Mongo, so they're tested
against existing, stable library records (Genesis, Mishneh Torah Sabbath, Mishnah
Berakhot) rather than fixtures.
"""
from types import SimpleNamespace

from sefaria.model import *
import sefaria.helper.vector.embed_library_to_pgvector as pgv

import pytest

# Temporarily disabled: these tests depend on the pgvector/vector_db integration
# which is not yet provisioned in CI. Re-enable once pgvector is reachable.
pytestmark = pytest.mark.skip(reason="pgvector/vector_db integration not provisioned in CI; disabled until resolved")


class TestTimePeriodToDict:
    def test_none_returns_none(self):
        assert pgv.time_period_to_dict(None) is None

    def test_full_attrs(self):
        tp = SimpleNamespace(start=1176, end=1178, startIsApprox=True, endIsApprox=False)
        assert pgv.time_period_to_dict(tp) == {
            "start": 1176,
            "end": 1178,
            "startIsApprox": True,
            "endIsApprox": False,
        }

    def test_missing_attrs_use_defaults(self):
        tp = SimpleNamespace(start=100, end=200)
        assert pgv.time_period_to_dict(tp) == {
            "start": 100,
            "end": 200,
            "startIsApprox": False,
            "endIsApprox": False,
        }


class TestEmbeddingResult:
    def test_starts_successful_with_zero_counts(self):
        result = pgv.EmbeddingResult()
        assert result.is_success()
        assert "Failures: 0" in result.get_summary()

    def test_record_failure_marks_unsuccessful(self):
        result = pgv.EmbeddingResult()
        result.record_failure("Genesis", "en", "Some Version", "Genesis 1", ValueError("boom"))

        assert not result.is_success()
        assert len(result.failures) == 1
        summary = result.get_summary()
        assert "Failures: 1" in summary
        assert "Genesis 1" in summary
        assert "boom" in summary


class TestGetIndexContext:
    def test_genesis(self):
        index = library.get_index("Genesis")
        context = pgv.get_index_context(index)

        assert context["primary_category"] == "Tanakh"
        assert context["all_categories"] == ["Tanakh", "Torah"]
        assert context["author_names"] == []
        assert context["author_slugs"] == []

    def test_mishneh_torah_sabbath(self):
        index = library.get_index("Mishneh Torah, Sabbath")
        context = pgv.get_index_context(index)

        assert context["primary_category"] == "Halakhah"
        assert context["all_categories"] == ["Halakhah", "Mishneh Torah", "Sefer Zemanim"]
        assert context["composition_date"] == {
            "start": 1176,
            "end": 1178,
            "startIsApprox": True,
            "endIsApprox": True,
        }
        assert context["composition_place"] == "Middle-Age Egypt"
        assert context["era_name"] == "Rishonim"
        assert context["author_names"] == ["Moses ben Maimon (Rambam)"]
        assert context["author_slugs"] == ["rambam"]


class TestGetVersionContext:
    def test_mishnah_berakhot_hebrew_version(self):
        version = Version().load({"title": "Mishnah Berakhot", "versionTitle": "Torat Emet 357"})
        context = pgv.get_version_context(version)

        assert context["language"] == "he"
        assert context["direction"] == "rtl"
        assert context["is_primary"] is True
        assert context["is_source"] is True


class TestGetChunkContext:
    def test_mishnah_berakhot_1(self):
        section_ref = Ref("Mishnah Berakhot 1")
        context = pgv.get_chunk_context(section_ref)
        assert isinstance(context["pagerank"], float)
        assert context["pagerank"] > 0

        assert "shema" in context["associated_topic_slugs"]
        assert "Shema" in context["associated_topic_names"]
        assert len(context["associated_topic_names"]) == len(context["associated_topic_slugs"])

        assert isinstance(context["linked_refs"], list)
        assert len(context["linked_refs"]) > 0
        assert section_ref.normal() not in context["linked_refs"]

    def test_segment_ref_has_its_own_pagerank(self):
        # RefData entries exist at the segment level too, distinct from the section.
        section_pagerank = pgv.get_chunk_context(Ref("Mishnah Berakhot 1"))["pagerank"]
        segment_pagerank = pgv.get_chunk_context(Ref("Mishnah Berakhot 1:1"))["pagerank"]
        assert isinstance(segment_pagerank, float)
        assert segment_pagerank > 0
        assert segment_pagerank != section_pagerank


class TestCollectSegmentRecordsBySection:
    def test_groups_by_section_and_preserves_order(self):
        version = Version().load({"title": "Mishnah Berakhot", "versionTitle": "Torat Emet 357"})
        index = library.get_index("Mishnah Berakhot")

        records_by_section = pgv.collect_segment_records_by_section(version)

        expected_sections = {section_ref.normal() for section_ref in index.all_section_refs()}
        assert set(records_by_section.keys()) == expected_sections

        first_section_records = records_by_section["Mishnah Berakhot 1"]
        assert len(first_section_records) > 0
        for record in first_section_records:
            assert record.tref.startswith("Mishnah Berakhot 1:")
            assert record.text.strip()

        # segment_index is 0-based and strictly increasing within a section.
        indices = [record.segment_index for record in first_section_records]
        assert indices == sorted(indices)
        assert indices[0] == 0


class TestBuildChunkDataOrdinals:
    """
    chunk_ordinal must be 1 for any chunk spanning one whole segment or more (its ref is
    unique within the unit), and must number pieces sequentially when a single oversized
    segment is hard-split into multiple chunks sharing the same ref (patot's hard_max_split
    pass - see chunker.py's `_apply_hard_max_pass` / `_split_text_evenly_by_max_tokens`).
    """
    def _fake_patot_chunk(self, text, source_segment_refs, kind="single_segment"):
        return SimpleNamespace(
            text=text, source_segment_refs=source_segment_refs, kind=kind,
            pass_number=1, token_count=len(text.split()), triggered=False, score=None,
        )

    def _contexts(self):
        index = library.get_index("Genesis")
        index_context = pgv.get_index_context(index)
        version = Version().load({"title": "Genesis", "language": "en"})
        version_context = pgv.get_version_context(version)
        return version, index_context, version_context

    def _build(self, chunks):
        version, index_context, version_context = self._contexts()
        embedder = SimpleNamespace(embed_text=lambda text, task_type: [0.0, 0.0, 0.0, 0.0])
        result = SimpleNamespace(chunks=chunks)
        return pgv.build_chunk_data(
            Ref("Genesis 1"), version_context["language"], version.versionTitle, "Genesis",
            embedder, result, index_context, version_context,
        )

    def test_chunks_with_distinct_refs_all_get_ordinal_one(self):
        built = self._build([
            self._fake_patot_chunk("verse one", ["Genesis 1:1"]),
            self._fake_patot_chunk("verse two", ["Genesis 1:2"]),
        ])
        assert [b.chunk.chunk_ordinal for b in built] == [1, 1]
        assert len({b.chunk.ref for b in built}) == 2

    def test_hard_split_pieces_of_one_segment_get_incrementing_ordinal(self):
        built = self._build([
            self._fake_patot_chunk("piece one", ["Genesis 1:1"], kind="hard_max_split"),
            self._fake_patot_chunk("piece two", ["Genesis 1:1"], kind="hard_max_split"),
            self._fake_patot_chunk("piece three", ["Genesis 1:1"], kind="hard_max_split"),
        ])
        assert [b.chunk.chunk_ordinal for b in built] == [1, 2, 3]
        assert len({b.chunk.ref for b in built}) == 1
        assert [b.text for b in built] == ["piece one", "piece two", "piece three"]

    def test_mixed_whole_segment_and_split_chunks(self):
        built = self._build([
            self._fake_patot_chunk("verse one", ["Genesis 1:1"]),
            self._fake_patot_chunk("piece a", ["Genesis 1:2"], kind="hard_max_split"),
            self._fake_patot_chunk("piece b", ["Genesis 1:2"], kind="hard_max_split"),
            self._fake_patot_chunk("verse three", ["Genesis 1:3"]),
        ])
        assert [b.chunk.chunk_ordinal for b in built] == [1, 1, 2, 1]
