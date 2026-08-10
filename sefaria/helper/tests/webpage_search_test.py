from datetime import datetime
from types import SimpleNamespace

import pytest

from sefaria.helper import webpage_search
from sefaria.helper.webpage_search import WebPageSearchFilters


def test_chunk_text_uses_overlap_and_cleans_html():
    chunks = webpage_search.chunk_text(
        "<p>one two three four five six</p>",
        chunk_words=4,
        overlap_words=1,
    )
    assert chunks == ["one two three four", "four five six"]


def test_make_documents_copies_page_filters_to_each_chunk(monkeypatch):
    monkeypatch.setattr(webpage_search, "_website_metadata", lambda url: ("example.com", "site-1"))
    webpage_text = SimpleNamespace(
        url="https://example.com/article",
        title="<b>Creation</b>",
        body="one two three four five six",
    )
    webpage = SimpleNamespace(
        _id="page-1",
        refs=["Genesis 1:1-2"],
        expandedRefs=["Genesis 1:1", "Genesis 1:2"],
        lastUpdated=datetime(2026, 8, 10),
    )

    documents = webpage_search.make_webpage_search_documents(
        webpage_text,
        webpage,
        embeddings=[[0.1], [0.2]],
        chunk_words=4,
        overlap_words=1,
    )

    assert len(documents) == 2
    assert documents[0]["title"] == "Creation"
    assert documents[0]["website_id"] == "site-1"
    assert documents[0]["domain"] == "example.com"
    assert documents[0]["expanded_refs"] == ["Genesis 1:1", "Genesis 1:2"]
    assert documents[1]["embedding"] == [0.2]
    assert documents[0]["chunk_id"] != documents[1]["chunk_id"]


def test_build_request_combines_website_domain_and_ref_filters():
    request = webpage_search.build_webpage_search_request(
        "creation of light",
        WebPageSearchFilters(
            website_id="site-1",
            domain="example.com",
            ref="Genesis 1:1-2",
            language="en",
        ),
        limit=5,
        mode="lexical",
    )

    filters = request["query"]["bool"]["filter"]
    assert {"term": {"website_id": "site-1"}} in filters
    assert {"term": {"domain": "example.com"}} in filters
    assert {"term": {"language": "en"}} in filters
    assert {"terms": {"expanded_refs": ["Genesis 1:1", "Genesis 1:2"]}} in filters
    assert request["collapse"] == {"field": "url"}


def test_build_hybrid_request_applies_filters_to_lexical_and_vector_search():
    request = webpage_search.build_webpage_search_request(
        "creation",
        WebPageSearchFilters(domain="example.com"),
        query_vector=[0.1, 0.2],
        mode="hybrid",
    )

    expected_filter = [{"term": {"domain": "example.com"}}]
    assert request["query"]["bool"]["filter"] == expected_filter
    assert request["knn"]["filter"] == expected_filter


def test_invalid_ref_is_rejected():
    with pytest.raises(ValueError, match="Invalid ref"):
        webpage_search.build_webpage_search_request(
            "query",
            WebPageSearchFilters(ref="definitely not a ref"),
            mode="lexical",
        )


def test_search_formats_highlight_as_agent_passage(monkeypatch):
    client = SimpleNamespace(search=lambda **kwargs: {
        "hits": {"hits": [{
            "_score": 1.5,
            "_source": {"url": "https://example.com", "content": "full content"},
            "highlight": {"content": ["matching <em>passage</em>"]},
        }]}
    })
    monkeypatch.setattr(webpage_search, "get_elasticsearch_client", lambda: client)

    results = webpage_search.search_webpages("passage", index_name="webpage-test", mode="lexical")

    assert results[0]["score"] == 1.5
    assert results[0]["passage"] == "matching <em>passage</em>"


def test_semantic_request_does_not_add_lexical_query():
    request = webpage_search.build_webpage_search_request(
        "conceptual query",
        query_vector=[0.1, 0.2],
        mode="semantic",
    )
    assert "query" not in request
    assert request["knn"]["query_vector"] == [0.1, 0.2]
