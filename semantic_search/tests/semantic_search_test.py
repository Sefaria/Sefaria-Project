"""
Unit tests for the semantic_search app.

All tests run without a live pgvector connection and without a Gemini API key.
ORM-touching code is mocked at the SemanticTextChunk.objects boundary.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from semantic_search.embedder import embed_query, l2_normalize_vector
from semantic_search.linked_refs import (
    _is_dictionary_oref,
    get_linked_ref_counts,
    get_linked_ref_enhancements,
    get_mean_std_linked_ref_enhancements,
)
from semantic_search.router import SemanticSearchRouter
from semantic_search.search import semantic_search
from semantic_search.models import SemanticTextChunk


def make_chunk(**overrides):
    defaults = dict(
        ref="Genesis 1:1",
        chunked_from_ref="Genesis 1",
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

class TestSemanticSearchRouter:
    def _model(self, app_label):
        return SimpleNamespace(_meta=SimpleNamespace(app_label=app_label))

    def test_db_for_read_returns_vector_db(self):
        assert SemanticSearchRouter().db_for_read(self._model("semantic_search")) == "vector_db"

    def test_db_for_read_returns_none_for_other_apps(self):
        assert SemanticSearchRouter().db_for_read(self._model("auth")) is None

    def test_db_for_write_returns_vector_db(self):
        assert SemanticSearchRouter().db_for_write(self._model("semantic_search")) == "vector_db"

    def test_db_for_write_returns_none_for_other_apps(self):
        assert SemanticSearchRouter().db_for_write(self._model("sefaria")) is None

    def test_allow_migrate_blocks_semantic_search_on_any_db(self):
        router = SemanticSearchRouter()
        assert router.allow_migrate("default", "semantic_search") is False
        assert router.allow_migrate("vector_db", "semantic_search") is False

    def test_allow_migrate_does_not_block_other_apps(self):
        assert SemanticSearchRouter().allow_migrate("default", "auth") is None


# ---------------------------------------------------------------------------
# search_by_embedding filter allowlist
# ---------------------------------------------------------------------------

class TestSearchByEmbeddingFilters:
    def _run(self, filters):
        mock_objects = MagicMock()
        mock_objects.filter.return_value.order_by.return_value.__getitem__.return_value = []
        with patch(
            "semantic_search.models.SemanticTextChunk.objects",
            mock_objects,
        ):
            SemanticTextChunk().search_by_embedding([0.0] * 1536, filters=filters)
        return mock_objects.filter.call_args.kwargs

    def test_known_field_passes_through(self):
        kwargs = self._run({"language": "en"})
        assert kwargs == {"language": "en"}

    def test_unknown_field_is_dropped(self):
        kwargs = self._run({"bad__inject": "x"})
        assert "bad__inject" not in kwargs

    def test_mixed_keeps_known_drops_unknown(self):
        kwargs = self._run({"language": "en", "evil": "x", "index_title": "Genesis"})
        assert "language" in kwargs
        assert "index_title" in kwargs
        assert "evil" not in kwargs

    def test_none_filters_calls_filter_with_no_kwargs(self):
        assert self._run(None) == {}

    def test_empty_dict_calls_filter_with_no_kwargs(self):
        assert self._run({}) == {}


# ---------------------------------------------------------------------------
# upsert
# ---------------------------------------------------------------------------

class TestUpsert:
    def test_empty_list_skips_bulk_create(self):
        with patch("semantic_search.models.SemanticTextChunk") as mock_cls:
            SemanticTextChunk().upsert([])
            mock_cls.objects.bulk_create.assert_not_called()

    def test_calls_bulk_create_with_conflict_args(self):
        chunk = MagicMock()
        with patch("semantic_search.models.SemanticTextChunk") as mock_cls:
            SemanticTextChunk().upsert([chunk])
            _, kwargs = mock_cls.objects.bulk_create.call_args
            assert kwargs["update_conflicts"] is True
            assert kwargs["unique_fields"] == ["doc_id"]

    def test_update_fields_excludes_doc_id_and_created_at(self):
        chunk = MagicMock()
        with patch("semantic_search.models.SemanticTextChunk") as mock_cls:
            SemanticTextChunk().upsert([chunk])
            _, kwargs = mock_cls.objects.bulk_create.call_args
            update_fields = kwargs["update_fields"]
            assert "doc_id" not in update_fields
            assert "created_at" not in update_fields
            assert "updated_at" in update_fields
            assert "embedding" in update_fields


# ---------------------------------------------------------------------------
# get_indexed_unit_refs
# ---------------------------------------------------------------------------

class TestGetIndexedUnitRefs:
    def test_returns_a_set(self):
        mock_objects = MagicMock()
        mock_objects.filter.return_value.values_list.return_value.distinct.return_value = [
            "Genesis 1", "Genesis 1", "Genesis 2"
        ]
        with patch("semantic_search.models.SemanticTextChunk.objects", mock_objects):
            result = SemanticTextChunk().get_indexed_unit_refs("Genesis", "en", "SCT")
        assert isinstance(result, set)
        assert result == {"Genesis 1", "Genesis 2"}

    def test_filters_by_all_three_params(self):
        mock_objects = MagicMock()
        mock_objects.filter.return_value.values_list.return_value.distinct.return_value = []
        with patch("semantic_search.models.SemanticTextChunk.objects", mock_objects):
            SemanticTextChunk().get_indexed_unit_refs("Mishnah Berakhot", "he", "Torat Emet 357")
        mock_objects.filter.assert_called_once_with(
            index_title="Mishnah Berakhot",
            language="he",
            version_title="Torat Emet 357",
        )

    def test_empty_queryset_returns_empty_set(self):
        mock_objects = MagicMock()
        mock_objects.filter.return_value.values_list.return_value.distinct.return_value = []
        with patch("semantic_search.models.SemanticTextChunk.objects", mock_objects):
            result = SemanticTextChunk().get_indexed_unit_refs("Genesis", "en", "SCT")
        assert result == set()


# ---------------------------------------------------------------------------
# bulk_delete
# ---------------------------------------------------------------------------

class TestBulkDelete:
    def test_filters_by_doc_ids(self):
        mock_objects = MagicMock()
        with patch("semantic_search.models.SemanticTextChunk.objects", mock_objects):
            SemanticTextChunk().bulk_delete(["id1", "id2"])
        mock_objects.filter.assert_called_once_with(doc_id__in=["id1", "id2"])
        mock_objects.filter.return_value.delete.assert_called_once()

    def test_empty_list_still_calls_filter(self):
        mock_objects = MagicMock()
        with patch("semantic_search.models.SemanticTextChunk.objects", mock_objects):
            SemanticTextChunk().bulk_delete([])
        mock_objects.filter.assert_called_once_with(doc_id__in=[])


# ---------------------------------------------------------------------------
# linked ref enhancement
# ---------------------------------------------------------------------------

class TestLinkedRefEnhancement:
    def test_dictionary_ref_detection_matches_dictionary_node_types(self):
        DictionaryNode = type("DictionaryNode", (), {})
        DictionaryEntryNode = type("DictionaryEntryNode", (), {})

        assert _is_dictionary_oref(SimpleNamespace(index_node=DictionaryNode()))
        assert _is_dictionary_oref(SimpleNamespace(index_node=DictionaryEntryNode()))

    def test_dictionary_ref_detection_matches_dictionary_categories(self):
        assert _is_dictionary_oref(
            SimpleNamespace(
                index_node=object(),
                index=SimpleNamespace(categories=["Reference", "Dictionary"]),
            )
        )
        assert not _is_dictionary_oref(
            SimpleNamespace(
                index_node=object(),
                index=SimpleNamespace(categories=["Tanakh"]),
            )
        )

    def test_collects_full_count_distribution(self):
        link_source = MagicMock()
        link_source.linked_refs_for.side_effect = {
            "Genesis 1:1": ["Ref A", "Ref B"],
            "Genesis 1:2": ["Ref B", "Ref C"],
        }.get
        chunks = [
            make_chunk(ref="Genesis 1:1"),
            make_chunk(ref="Genesis 1:2"),
        ]
        assert dict(get_linked_ref_counts(chunks, link_source=link_source)) == {
            "Ref A": 1,
            "Ref B": 2,
            "Ref C": 1,
        }

    def test_counts_direct_linked_refs_and_applies_threshold(self):
        link_source = MagicMock()
        link_source.linked_refs_for.side_effect = {
            "Genesis 1:1": ["Ref A", "Ref B"],
            "Genesis 1:2": ["Ref B", "Ref C"],
        }.get
        chunks = [
            make_chunk(ref="Genesis 1:1"),
            make_chunk(ref="Genesis 1:2"),
        ]
        result = get_linked_ref_enhancements(
            chunks,
            link_depth=1,
            min_link_count=2,
            link_source=link_source,
        )
        assert result.appended_refs == ["Ref B"]
        assert result.ref_counts == {"Ref B": 2}

    def test_mean_2std_threshold_returns_statistical_outliers(self):
        link_source = MagicMock()
        link_source.linked_refs_for.side_effect = {
            "Genesis 1:1": ["Ref A", "Ref Outlier"],
            "Genesis 1:2": ["Ref B", "Ref Outlier"],
            "Genesis 1:3": ["Ref C", "Ref Outlier"],
            "Genesis 1:4": ["Ref D", "Ref Outlier"],
            "Genesis 1:5": ["Ref E", "Ref Outlier"],
            "Genesis 1:6": ["Ref F", "Ref Outlier"],
            "Genesis 1:7": ["Ref G", "Ref Outlier"],
            "Genesis 1:8": ["Ref H", "Ref Outlier"],
            "Genesis 1:9": ["Ref I", "Ref Outlier"],
            "Genesis 1:10": ["Ref J", "Ref Outlier"],
        }.get
        chunks = [
            make_chunk(ref=f"Genesis 1:{i}", chunked_from_ref="Genesis 1")
            for i in range(1, 11)
        ]

        result = get_mean_std_linked_ref_enhancements(chunks, link_source=link_source)

        assert result.threshold_method == "mean_plus_std_multiplier"
        assert result.appended_refs == ["Ref Outlier"]
        assert result.ref_counts == {"Ref Outlier": 10}
        assert result.count_threshold > result.mean_count

    def test_mean_std_threshold_uses_min_count_floor_when_counts_have_no_variance(self):
        link_source = MagicMock()
        link_source.linked_refs_for.side_effect = {
            "Genesis 1:1": ["Ref A"],
            "Genesis 1:2": ["Ref B"],
        }.get
        chunks = [
            make_chunk(ref="Genesis 1:1"),
            make_chunk(ref="Genesis 1:2"),
        ]

        result = get_mean_std_linked_ref_enhancements(chunks, link_source=link_source)

        assert result.appended_refs == []
        assert result.ref_counts == {}
        assert result.std_count == 0
        assert result.count_threshold == 3
        assert result.min_count == 3

    def test_mean_std_threshold_accepts_std_multiplier(self):
        link_source = MagicMock()
        link_source.linked_refs_for.side_effect = {
            "Genesis 1:1": ["Ref A", "Ref SemiOutlier"],
            "Genesis 1:2": ["Ref B", "Ref SemiOutlier"],
            "Genesis 1:3": ["Ref C", "Ref SemiOutlier"],
        }.get
        chunks = [
            make_chunk(ref=f"Genesis 1:{i}", chunked_from_ref="Genesis 1")
            for i in range(1, 4)
        ]

        stricter = get_mean_std_linked_ref_enhancements(
            chunks,
            std_threshold=2,
            link_source=link_source,
        )
        looser = get_mean_std_linked_ref_enhancements(
            chunks,
            std_threshold=1,
            link_source=link_source,
        )

        assert stricter.appended_refs == []
        assert looser.appended_refs == ["Ref SemiOutlier"]

    def test_mean_std_threshold_allows_min_count_override(self):
        link_source = MagicMock()
        link_source.linked_refs_for.side_effect = {
            "Genesis 1:1": ["Ref A"],
            "Genesis 1:2": ["Ref B"],
        }.get
        chunks = [
            make_chunk(ref="Genesis 1:1"),
            make_chunk(ref="Genesis 1:2"),
        ]

        result = get_mean_std_linked_ref_enhancements(
            chunks,
            min_count=1,
            link_source=link_source,
        )

        assert result.appended_refs == ["Ref A", "Ref B"]
        assert result.count_threshold == 1

    def test_excludes_original_result_refs(self):
        link_source = MagicMock()
        link_source.linked_refs_for.side_effect = {
            "Genesis 1:1": ["Genesis 1:1", "Genesis 1", "Ref B"],
            "Genesis 1:2": ["Ref B"],
        }.get
        chunks = [
            make_chunk(ref="Genesis 1:1", chunked_from_ref="Genesis 1"),
            make_chunk(ref="Genesis 1:2"),
        ]
        result = get_linked_ref_enhancements(
            chunks,
            link_depth=1,
            min_link_count=1,
            link_source=link_source,
        )
        assert result.appended_refs == ["Ref B"]

    def test_depth_two_fetches_and_counts_next_hop_links_from_source(self):
        link_source = MagicMock()
        link_source.linked_refs_for.side_effect = {
            "Genesis 1:1": ["Ref B", "Ref D"],
            "Ref B": ["Ref D", "Ref E"],
            "Ref D": [],
        }.get
        chunks = [
            make_chunk(ref="Genesis 1:1"),
        ]

        result = get_linked_ref_enhancements(
            chunks,
            link_depth=2,
            min_link_count=2,
            link_source=link_source,
        )

        link_source.linked_refs_for.assert_any_call("Ref B")
        link_source.linked_refs_for.assert_any_call("Ref D")
        assert result.appended_refs == ["Ref D"]
        assert result.ref_counts == {"Ref D": 2}

    def test_invalid_params_return_no_appended_refs(self):
        chunk = make_chunk()
        assert get_linked_ref_enhancements([chunk], link_depth=0, min_link_count=1).appended_refs == []
        assert get_linked_ref_enhancements([chunk], link_depth=1, min_link_count=0).appended_refs == []


# ---------------------------------------------------------------------------
# l2_normalize_vector
# ---------------------------------------------------------------------------

class TestL2NormalizeVector:
    def test_unit_vector_unchanged(self):
        v = [1.0, 0.0, 0.0]
        assert l2_normalize_vector(v) == pytest.approx([1.0, 0.0, 0.0])

    def test_normalizes_to_unit_length(self):
        v = [3.0, 4.0]
        result = l2_normalize_vector(v)
        norm = sum(x * x for x in result) ** 0.5
        assert norm == pytest.approx(1.0)

    def test_zero_vector_returned_unchanged(self):
        v = [0.0, 0.0, 0.0]
        assert l2_normalize_vector(v) == [0.0, 0.0, 0.0]


# ---------------------------------------------------------------------------
# embed_query
# ---------------------------------------------------------------------------

class TestEmbedQuery:
    @patch("semantic_search.embedder.l2_normalize_vector")
    @patch("semantic_search.embedder.GeminiEmbedder")
    def test_calls_embed_text_with_retrieval_query_task_type(self, mock_embedder_cls, mock_norm):
        mock_embedder_cls.return_value.embed_text.return_value = [0.1] * 1536
        mock_norm.return_value = [0.2] * 1536
        embed_query("love thy neighbor", api_key="test-key")
        mock_embedder_cls.return_value.embed_text.assert_called_once_with(
            "love thy neighbor", "RETRIEVAL_QUERY"
        )

    @patch("semantic_search.embedder.l2_normalize_vector")
    @patch("semantic_search.embedder.GeminiEmbedder")
    def test_result_passes_through_l2_normalize(self, mock_embedder_cls, mock_norm):
        raw = [0.3] * 1536
        normalized = [0.4] * 1536
        mock_embedder_cls.return_value.embed_text.return_value = raw
        mock_norm.return_value = normalized
        result = embed_query("query", api_key="key")
        mock_norm.assert_called_once_with(raw)
        assert result == normalized

    @patch("semantic_search.embedder.l2_normalize_vector")
    @patch("semantic_search.embedder.GeminiEmbedder")
    def test_embedder_initialized_with_api_key(self, mock_embedder_cls, mock_norm):
        mock_embedder_cls.return_value.embed_text.return_value = [0.0] * 1536
        mock_norm.return_value = [0.0] * 1536
        embed_query("test", api_key="my-secret-key")
        mock_embedder_cls.assert_called_once_with(api_key="my-secret-key")


# ---------------------------------------------------------------------------
# semantic_search helper
# ---------------------------------------------------------------------------

class TestSemanticSearch:
    @patch("semantic_search.search.SemanticTextChunk")
    @patch("semantic_search.search.embed_query")
    def test_calls_embed_query_then_search_by_embedding(self, mock_embed, mock_chunk_cls):
        mock_embed.return_value = [0.5] * 1536
        mock_chunk_cls.return_value.search_by_embedding.return_value = []
        semantic_search("what is shabbat")
        mock_embed.assert_called_once()
        assert mock_embed.call_args[0][0] == "what is shabbat"
        mock_chunk_cls.return_value.search_by_embedding.assert_called_once_with(
            [0.5] * 1536, limit=10, filters=None
        )

    @patch("semantic_search.search.SemanticTextChunk")
    @patch("semantic_search.search.embed_query")
    def test_forwards_filters_and_limit(self, mock_embed, mock_chunk_cls):
        mock_embed.return_value = [0.1] * 1536
        mock_chunk_cls.return_value.search_by_embedding.return_value = []
        semantic_search("query", filters={"language": "en"}, limit=5)
        mock_chunk_cls.return_value.search_by_embedding.assert_called_once_with(
            [0.1] * 1536, limit=5, filters={"language": "en"}
        )

    @patch("semantic_search.search.SemanticTextChunk")
    @patch("semantic_search.search.embed_query")
    def test_returns_search_results(self, mock_embed, mock_chunk_cls):
        mock_embed.return_value = [0.0] * 1536
        expected = [MagicMock()]
        mock_chunk_cls.return_value.search_by_embedding.return_value = expected
        assert semantic_search("query") == expected
