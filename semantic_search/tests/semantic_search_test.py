"""
Unit tests for the semantic_search app.

All tests run without a live pgvector connection and without a Gemini API key.
ORM-touching code is mocked at the DjangoSemanticTextChunk.objects boundary.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from semantic_search.query_embedding import embed_query
from semantic_search.linked_refs import get_linked_ref_enhancements
from semantic_search.router import SemanticSearchRouter
from semantic_search.search import semantic_search
from semantic_search.semantic_text_chunk import (
    SemanticTextChunk,
    SemanticTextChunkData,
    _to_dataclass,
    _to_model,
)


def make_chunk_data(**overrides):
    defaults = dict(
        doc_id="genesis-1-1-en-sct",
        index_title="Genesis",
        ref="Genesis 1:1",
        url="/Genesis.1.1",
        chunked_from_ref="Genesis 1",
        language="en",
        version_title="Sefaria Community Translation",
        direction="ltr",
        text="In the beginning...",
        embedding=[0.1] * 1536,
        primary_category="Tanakh",
        all_categories=["Tanakh", "Torah"],
        is_primary=True,
        is_source=False,
        composition_date=None,
        composition_place=None,
        era_name=None,
        pagerank=0.5,
        author_names=[],
        author_slugs=[],
        associated_topic_names=[],
        associated_topic_slugs=[],
        linked_refs=[],
        chunker_metadata={"chunker": "patot", "version": "1.0"},
    )
    defaults.update(overrides)
    return SemanticTextChunkData(**defaults)


def _fake_orm_obj(**overrides):
    defaults = dict(
        doc_id="test-id",
        index_title="Genesis",
        ref="Genesis 1:1",
        url="/Genesis.1.1",
        chunked_from_ref="Genesis 1",
        language="en",
        version_title="Sefaria Community Translation",
        direction="ltr",
        text="In the beginning...",
        embedding=[0.1, 0.2, 0.3],
        primary_category="Tanakh",
        all_categories=["Tanakh", "Torah"],
        is_primary=True,
        is_source=False,
        composition_date=None,
        composition_place=None,
        era_name=None,
        pagerank=0.5,
        author_names=["Moses"],
        author_slugs=["moses"],
        associated_topic_names=["Creation"],
        associated_topic_slugs=["creation"],
        linked_refs=["Genesis 1:2"],
        chunker_metadata={"v": "1"},
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
# SemanticTextChunkData construction
# ---------------------------------------------------------------------------

class TestSemanticTextChunkData:
    def test_fields_set_correctly(self):
        chunk = make_chunk_data()
        assert chunk.doc_id == "genesis-1-1-en-sct"
        assert chunk.language == "en"
        assert len(chunk.embedding) == 1536

    def test_nullable_fields_accept_none(self):
        chunk = make_chunk_data(composition_date=None, primary_category=None, era_name=None)
        assert chunk.composition_date is None
        assert chunk.primary_category is None
        assert chunk.era_name is None

    def test_list_fields_accept_empty_list(self):
        chunk = make_chunk_data(all_categories=[], author_names=[], linked_refs=[])
        assert chunk.all_categories == []
        assert chunk.author_names == []
        assert chunk.linked_refs == []

    def test_chunker_metadata_is_dict(self):
        chunk = make_chunk_data(chunker_metadata={"version": "2.0", "extra": True})
        assert chunk.chunker_metadata["version"] == "2.0"


# ---------------------------------------------------------------------------
# _to_model
# ---------------------------------------------------------------------------

class TestToModel:
    def test_sets_scalar_fields(self):
        chunk = make_chunk_data()
        with patch("semantic_search.semantic_text_chunk.DjangoSemanticTextChunk") as mock_cls:
            mock_cls.return_value = MagicMock()
            _to_model(chunk)
            _, kwargs = mock_cls.call_args
            assert kwargs["doc_id"] == chunk.doc_id
            assert kwargs["text"] == chunk.text
            assert kwargs["embedding"] == chunk.embedding

    def test_passes_dict_fields_directly(self):
        meta = {"tool": "patot", "v": "3"}
        chunk = make_chunk_data(chunker_metadata=meta, composition_date={"start": 100, "end": 200})
        with patch("semantic_search.semantic_text_chunk.DjangoSemanticTextChunk") as mock_cls:
            mock_cls.return_value = MagicMock()
            _to_model(chunk)
            _, kwargs = mock_cls.call_args
            assert kwargs["chunker_metadata"] == meta
            assert kwargs["composition_date"] == {"start": 100, "end": 200}


# ---------------------------------------------------------------------------
# _to_dataclass
# ---------------------------------------------------------------------------

class TestToDataclass:
    def test_converts_embedding_to_list(self):
        obj = _fake_orm_obj(embedding=(0.1, 0.2))
        result = _to_dataclass(obj)
        assert isinstance(result.embedding, list)
        assert result.embedding == [0.1, 0.2]

    def test_coerces_null_array_fields_to_empty_list(self):
        obj = _fake_orm_obj(all_categories=None, author_names=None, linked_refs=None)
        result = _to_dataclass(obj)
        assert result.all_categories == []
        assert result.author_names == []
        assert result.linked_refs == []

    def test_preserves_none_for_nullable_scalars(self):
        obj = _fake_orm_obj(primary_category=None, composition_date=None, era_name=None)
        result = _to_dataclass(obj)
        assert result.primary_category is None
        assert result.composition_date is None
        assert result.era_name is None

    def test_preserves_all_non_null_fields(self):
        obj = _fake_orm_obj()
        result = _to_dataclass(obj)
        assert result.doc_id == "test-id"
        assert result.ref == "Genesis 1:1"
        assert result.author_names == ["Moses"]
        assert result.chunker_metadata == {"v": "1"}


# ---------------------------------------------------------------------------
# search_by_embedding filter allowlist
# ---------------------------------------------------------------------------

class TestSearchByEmbeddingFilters:
    def _run(self, filters):
        mock_objects = MagicMock()
        mock_objects.filter.return_value.order_by.return_value.__getitem__.return_value = []
        with patch(
            "semantic_search.semantic_text_chunk.DjangoSemanticTextChunk.objects",
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
        with patch("semantic_search.semantic_text_chunk.DjangoSemanticTextChunk") as mock_cls:
            SemanticTextChunk().upsert([])
            mock_cls.objects.bulk_create.assert_not_called()

    def test_calls_bulk_create_with_conflict_args(self):
        chunk = make_chunk_data()
        with patch("semantic_search.semantic_text_chunk.DjangoSemanticTextChunk") as mock_cls:
            mock_cls.return_value = MagicMock()
            SemanticTextChunk().upsert([chunk])
            _, kwargs = mock_cls.objects.bulk_create.call_args
            assert kwargs["update_conflicts"] is True
            assert kwargs["unique_fields"] == ["doc_id"]

    def test_update_fields_excludes_doc_id_and_created_at(self):
        chunk = make_chunk_data()
        with patch("semantic_search.semantic_text_chunk.DjangoSemanticTextChunk") as mock_cls:
            mock_cls.return_value = MagicMock()
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
        with patch("semantic_search.semantic_text_chunk.DjangoSemanticTextChunk.objects", mock_objects):
            result = SemanticTextChunk().get_indexed_unit_refs("Genesis", "en", "SCT")
        assert isinstance(result, set)
        assert result == {"Genesis 1", "Genesis 2"}

    def test_filters_by_all_three_params(self):
        mock_objects = MagicMock()
        mock_objects.filter.return_value.values_list.return_value.distinct.return_value = []
        with patch("semantic_search.semantic_text_chunk.DjangoSemanticTextChunk.objects", mock_objects):
            SemanticTextChunk().get_indexed_unit_refs("Mishnah Berakhot", "he", "Torat Emet 357")
        mock_objects.filter.assert_called_once_with(
            index_title="Mishnah Berakhot",
            language="he",
            version_title="Torat Emet 357",
        )

    def test_empty_queryset_returns_empty_set(self):
        mock_objects = MagicMock()
        mock_objects.filter.return_value.values_list.return_value.distinct.return_value = []
        with patch("semantic_search.semantic_text_chunk.DjangoSemanticTextChunk.objects", mock_objects):
            result = SemanticTextChunk().get_indexed_unit_refs("Genesis", "en", "SCT")
        assert result == set()


# ---------------------------------------------------------------------------
# filter_by_refs
# ---------------------------------------------------------------------------

class TestFilterByRefs:
    def test_empty_refs_skips_query(self):
        with patch("semantic_search.semantic_text_chunk.DjangoSemanticTextChunk.objects") as mock_objects:
            assert SemanticTextChunk().filter_by_refs([]) == []
        mock_objects.filter.assert_not_called()

    def test_filters_by_ref_or_chunked_from_ref(self):
        mock_objects = MagicMock()
        mock_objects.filter.return_value = []
        with patch("semantic_search.semantic_text_chunk.DjangoSemanticTextChunk.objects", mock_objects):
            SemanticTextChunk().filter_by_refs(["Genesis 1:1", "Exodus 2:2"])
        query_arg = mock_objects.filter.call_args.args[0]
        assert "OR" in str(query_arg)
        assert "ref__in" in str(query_arg)
        assert "chunked_from_ref__in" in str(query_arg)


# ---------------------------------------------------------------------------
# linked ref enhancement
# ---------------------------------------------------------------------------

class TestLinkedRefEnhancement:
    def test_counts_direct_linked_refs_and_applies_threshold(self):
        chunks = [
            make_chunk_data(ref="Genesis 1:1", linked_refs=["Ref A", "Ref B"]),
            make_chunk_data(ref="Genesis 1:2", linked_refs=["Ref B", "Ref C"]),
        ]
        result = get_linked_ref_enhancements(chunks, link_depth=1, min_link_count=2)
        assert result.appended_refs == ["Ref B"]
        assert result.ref_counts == {"Ref B": 2}

    def test_excludes_original_result_refs(self):
        chunks = [
            make_chunk_data(ref="Genesis 1:1", chunked_from_ref="Genesis 1", linked_refs=["Genesis 1:1", "Genesis 1", "Ref B"]),
            make_chunk_data(ref="Genesis 1:2", linked_refs=["Ref B"]),
        ]
        result = get_linked_ref_enhancements(chunks, link_depth=1, min_link_count=1)
        assert result.appended_refs == ["Ref B"]

    def test_depth_two_fetches_and_counts_next_hop_links(self):
        first_hop = make_chunk_data(ref="Ref B", linked_refs=["Ref D", "Ref E"])
        chunk_store = MagicMock()
        chunk_store.filter_by_refs.return_value = [first_hop]
        chunks = [
            make_chunk_data(ref="Genesis 1:1", linked_refs=["Ref B", "Ref D"]),
        ]

        result = get_linked_ref_enhancements(
            chunks,
            link_depth=2,
            min_link_count=2,
            chunk_store=chunk_store,
        )

        chunk_store.filter_by_refs.assert_called_once_with(["Ref B", "Ref D"])
        assert result.appended_refs == ["Ref D"]
        assert result.ref_counts == {"Ref D": 2}

    def test_invalid_params_return_no_appended_refs(self):
        chunk = make_chunk_data(linked_refs=["Ref B"])
        assert get_linked_ref_enhancements([chunk], link_depth=0, min_link_count=1).appended_refs == []
        assert get_linked_ref_enhancements([chunk], link_depth=1, min_link_count=0).appended_refs == []


# ---------------------------------------------------------------------------
# delete
# ---------------------------------------------------------------------------

class TestDelete:
    def test_filters_by_doc_ids(self):
        mock_objects = MagicMock()
        with patch("semantic_search.semantic_text_chunk.DjangoSemanticTextChunk.objects", mock_objects):
            SemanticTextChunk().delete(["id1", "id2"])
        mock_objects.filter.assert_called_once_with(doc_id__in=["id1", "id2"])
        mock_objects.filter.return_value.delete.assert_called_once()

    def test_empty_list_still_calls_filter(self):
        mock_objects = MagicMock()
        with patch("semantic_search.semantic_text_chunk.DjangoSemanticTextChunk.objects", mock_objects):
            SemanticTextChunk().delete([])
        mock_objects.filter.assert_called_once_with(doc_id__in=[])


# ---------------------------------------------------------------------------
# embed_query
# ---------------------------------------------------------------------------

class TestEmbedQuery:
    def test_missing_api_key_raises_value_error(self):
        with patch("semantic_search.query_embedding.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = ""
            with pytest.raises(ValueError, match="GEMINI_API_KEY"):
                embed_query("test query")

    @patch("semantic_search.query_embedding.l2_normalize_vector")
    @patch("semantic_search.query_embedding.GeminiEmbedder")
    def test_calls_embed_text_with_correct_params(self, mock_embedder_cls, mock_norm):
        mock_embedder_cls.return_value.embed_text.return_value = [0.1] * 1536
        mock_norm.return_value = [0.2] * 1536
        with patch("semantic_search.query_embedding.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = "test-key"
            embed_query("love thy neighbor")
        mock_embedder_cls.return_value.embed_text.assert_called_once_with(
            model="gemini-embedding-001",
            text="love thy neighbor",
            output_dimensionality=1536,
            task_type="RETRIEVAL_QUERY",
        )

    @patch("semantic_search.query_embedding.l2_normalize_vector")
    @patch("semantic_search.query_embedding.GeminiEmbedder")
    def test_result_passes_through_l2_normalize(self, mock_embedder_cls, mock_norm):
        raw = [0.3] * 1536
        normalized = [0.4] * 1536
        mock_embedder_cls.return_value.embed_text.return_value = raw
        mock_norm.return_value = normalized
        with patch("semantic_search.query_embedding.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = "key"
            result = embed_query("query")
        mock_norm.assert_called_once_with(raw)
        assert result == normalized

    @patch("semantic_search.query_embedding.l2_normalize_vector")
    @patch("semantic_search.query_embedding.GeminiEmbedder")
    def test_embedder_initialized_with_api_key(self, mock_embedder_cls, mock_norm):
        mock_embedder_cls.return_value.embed_text.return_value = [0.0] * 1536
        mock_norm.return_value = [0.0] * 1536
        with patch("semantic_search.query_embedding.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = "my-secret-key"
            embed_query("test")
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
        mock_embed.assert_called_once_with("what is shabbat")
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
        expected = [make_chunk_data()]
        mock_chunk_cls.return_value.search_by_embedding.return_value = expected
        assert semantic_search("query") == expected
