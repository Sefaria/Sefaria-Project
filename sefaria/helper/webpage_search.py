"""Elasticsearch indexing and retrieval for content collected by the Linker."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Callable, Optional

import bleach
from django.conf import settings
from elasticsearch.helpers import bulk

from sefaria.helper.search import get_elasticsearch_client, get_elasticsearch_client_for_indexer
from sefaria.helper.webpages import domain_for_url
from sefaria.model import Ref, WebPage
from sefaria.model.webpage import WebSite
from sefaria.model.webpage_text import WebPageText, WebPageTextSet
from sefaria.system.exceptions import InputError
from sefaria.utils.hebrew import is_mostly_hebrew


DEFAULT_CHUNK_WORDS = 500
DEFAULT_CHUNK_OVERLAP_WORDS = 75
DEFAULT_VECTOR_DIMS = 1536


@dataclass(frozen=True)
class WebPageSearchFilters:
    website_id: Optional[str] = None
    domain: Optional[str] = None
    ref: Optional[str] = None
    language: Optional[str] = None


def get_webpage_search_index_name() -> str:
    return getattr(settings, "SEARCH_INDEX_NAME_WEBPAGE", "webpage")


def _plain_text(value: str) -> str:
    value = bleach.clean(value or "", tags=(), strip=True)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def chunk_text(
    text: str,
    chunk_words: int = DEFAULT_CHUNK_WORDS,
    overlap_words: int = DEFAULT_CHUNK_OVERLAP_WORDS,
) -> list[str]:
    """Split cleaned page text into deterministic, overlapping word windows."""
    if chunk_words <= 0:
        raise ValueError("chunk_words must be positive")
    if overlap_words < 0 or overlap_words >= chunk_words:
        raise ValueError("overlap_words must be non-negative and smaller than chunk_words")

    words = _plain_text(text).split()
    if not words:
        return []
    step = chunk_words - overlap_words
    return [" ".join(words[start:start + chunk_words]) for start in range(0, len(words), step)]


def _website_metadata(url: str) -> tuple[str, Optional[str]]:
    domain = domain_for_url(url)
    website = WebSite().load({"domains": domain})
    website_id = str(website._id) if website and getattr(website, "_id", None) else None
    return domain, website_id


def _chunk_id(url: str, chunk_number: int) -> str:
    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return f"{url_hash}:{chunk_number}"


def make_webpage_search_documents(
    webpage_text: WebPageText,
    webpage: Optional[WebPage] = None,
    embeddings: Optional[list[list[float]]] = None,
    chunk_words: int = DEFAULT_CHUNK_WORDS,
    overlap_words: int = DEFAULT_CHUNK_OVERLAP_WORDS,
) -> list[dict]:
    """Create one denormalized Elasticsearch document per page chunk."""
    webpage = webpage or WebPage().load(webpage_text.url)
    chunks = chunk_text(webpage_text.body, chunk_words, overlap_words)
    if embeddings is not None and len(embeddings) != len(chunks):
        raise ValueError("embeddings must contain one vector per chunk")

    domain, website_id = _website_metadata(webpage_text.url)
    refs = list(getattr(webpage, "refs", [])) if webpage else []
    expanded_refs = list(getattr(webpage, "expandedRefs", [])) if webpage else []
    page_id = str(webpage._id) if webpage and getattr(webpage, "_id", None) else None
    last_updated = getattr(webpage, "lastUpdated", None) if webpage else None

    documents = []
    for chunk_number, content in enumerate(chunks):
        document = {
            "page_id": page_id,
            "chunk_id": _chunk_id(webpage_text.url, chunk_number),
            "chunk_number": chunk_number,
            "url": webpage_text.url,
            "domain": domain,
            "website_id": website_id,
            "title": _plain_text(webpage_text.title),
            "content": content,
            "refs": refs,
            "expanded_refs": expanded_refs,
            "language": "he" if is_mostly_hebrew(content) else "en",
            "last_updated": last_updated,
        }
        if embeddings is not None:
            document["embedding"] = embeddings[chunk_number]
        documents.append(document)
    return documents


def create_webpage_search_index(index_name: Optional[str] = None, force: bool = False) -> str:
    """Create the dedicated webpage index with lexical and vector mappings."""
    index_name = index_name or get_webpage_search_index_name()
    client = get_elasticsearch_client_for_indexer()
    if client.indices.exists(index=index_name):
        if not force:
            raise ValueError(f"Index {index_name} already exists; pass force=True to recreate it")
        client.indices.delete(index=index_name)

    client.indices.create(index=index_name, mappings={
        "properties": {
            "page_id": {"type": "keyword"},
            "chunk_id": {"type": "keyword"},
            "chunk_number": {"type": "integer"},
            "url": {"type": "keyword"},
            "domain": {"type": "keyword"},
            "website_id": {"type": "keyword"},
            "title": {"type": "text", "fields": {"keyword": {"type": "keyword"}}},
            "content": {"type": "text"},
            "refs": {"type": "keyword"},
            "expanded_refs": {"type": "keyword"},
            "language": {"type": "keyword"},
            "last_updated": {"type": "date"},
            "embedding": {
                "type": "dense_vector",
                "dims": getattr(settings, "WEBPAGE_SEARCH_VECTOR_DIMS", DEFAULT_VECTOR_DIMS),
                "index": True,
                "similarity": "cosine",
            },
        }
    })
    return index_name


def _delete_page_chunks(client, index_name: str, url: str) -> None:
    client.delete_by_query(
        index=index_name,
        query={"term": {"url": url}},
        conflicts="proceed",
        refresh=True,
    )


def index_webpage_text(
    url: str,
    index_name: Optional[str] = None,
    embed_documents: Optional[Callable[[list[str]], list[list[float]]]] = None,
) -> int:
    """Replace all indexed chunks for a URL and return the new chunk count."""
    webpage_text = WebPageText().load(url)
    if not webpage_text:
        return 0
    webpage = WebPage().load(webpage_text.url)
    chunks = chunk_text(webpage_text.body)
    embeddings = embed_documents(chunks) if embed_documents and chunks else None
    documents = make_webpage_search_documents(webpage_text, webpage, embeddings)
    index_name = index_name or get_webpage_search_index_name()
    client = get_elasticsearch_client_for_indexer()
    _delete_page_chunks(client, index_name, webpage_text.url)
    if documents:
        bulk(client, ({"_op_type": "index", "_index": index_name, "_id": d["chunk_id"], "_source": d} for d in documents), refresh=True)
    return len(documents)


def index_all_webpage_texts(
    index_name: Optional[str] = None,
    embed_documents: Optional[Callable[[list[str]], list[list[float]]]] = None,
) -> int:
    total = 0
    for webpage_text in WebPageTextSet():
        total += index_webpage_text(webpage_text.url, index_name, embed_documents)
    return total


def _expanded_ref_filter(tref: str) -> dict:
    try:
        refs = [oref.normal() for oref in Ref(tref).all_segment_refs()]
    except InputError as exc:
        raise ValueError(f"Invalid ref: {tref}") from exc
    return {"terms": {"expanded_refs": refs}}


def build_webpage_search_request(
    query: str,
    filters: Optional[WebPageSearchFilters] = None,
    limit: int = 10,
    query_vector: Optional[list[float]] = None,
    mode: str = "hybrid",
) -> dict:
    """Build a filtered lexical request, optionally blended with vector retrieval."""
    if not query or not query.strip():
        raise ValueError("query is required")
    if limit < 1 or limit > 100:
        raise ValueError("limit must be between 1 and 100")
    if mode not in {"lexical", "hybrid", "semantic"}:
        raise ValueError("mode must be lexical, hybrid, or semantic")
    if mode in {"hybrid", "semantic"} and query_vector is None:
        raise ValueError(f"query_vector is required for {mode} search")
    filters = filters or WebPageSearchFilters()
    clauses = []
    for field, value in (("website_id", filters.website_id), ("domain", filters.domain), ("language", filters.language)):
        if value:
            clauses.append({"term": {field: value}})
    if filters.ref:
        clauses.append(_expanded_ref_filter(filters.ref))

    lexical_query = {
        "bool": {
            "must": [{"multi_match": {"query": query, "fields": ["title^3", "content"]}}],
            "filter": clauses,
        }
    }
    request = {
        "size": limit,
        "collapse": {"field": "url"},
        "highlight": {"fields": {"content": {"fragment_size": 300, "number_of_fragments": 1}}},
    }
    if mode in {"lexical", "hybrid"}:
        request["query"] = lexical_query
    if mode in {"hybrid", "semantic"}:
        request["knn"] = {
            "field": "embedding",
            "query_vector": query_vector,
            "k": limit,
            "num_candidates": max(100, limit * 10),
        }
        if clauses:
            request["knn"]["filter"] = clauses
    return request


def search_webpages(
    query: str,
    filters: Optional[WebPageSearchFilters] = None,
    limit: int = 10,
    query_vector: Optional[list[float]] = None,
    index_name: Optional[str] = None,
    mode: str = "hybrid",
) -> list[dict]:
    client = get_elasticsearch_client()
    response = client.search(
        index=index_name or get_webpage_search_index_name(),
        **build_webpage_search_request(query, filters, limit, query_vector, mode),
    )
    results = []
    for hit in response["hits"]["hits"]:
        source = hit["_source"]
        source["score"] = hit.get("_score")
        highlights = hit.get("highlight", {}).get("content")
        source["passage"] = highlights[0] if highlights else source.get("content")
        results.append(source)
    return results
