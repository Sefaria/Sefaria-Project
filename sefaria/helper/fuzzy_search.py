"""
Query-time semantic/fuzzy search.

Given a user query:
  1. Expand into topical keyphrases via Claude Haiku
  2. Embed each keyphrase with Gemini Embedding 2
  3. Query ChromaDB — top-k per keyphrase
  4. Aggregate scores (additive cosine similarity across matching phrases)
  5. Return ranked refs with snippets
"""

import logging
import os
from collections import defaultdict
from typing import List, Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langsmith import traceable

from sefaria.helper.fuzzy_search_indexer import (
    COLLECTION_NAME,
    GEMINI_EMBED_MODEL,
    HAIKU_MODEL,
    get_chroma_collection,
)

logger = logging.getLogger(__name__)

_TOP_K_PER_PHRASE = 10
_MAX_SNIPPET_CHARS = 300


def _get_haiku():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable is required")
    return ChatAnthropic(model=HAIKU_MODEL, temperature=0, max_tokens=512, api_key=api_key)


def _get_embedding_fn():
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY environment variable is required")
    return GoogleGenerativeAIEmbeddings(model=GEMINI_EMBED_MODEL, google_api_key=api_key)


@traceable(run_type="llm", name="fuzzy_search_expand_query")
def _expand_query(query: str) -> List[str]:
    """Expand a user query into topical keyphrases, prepending the original."""
    llm = _get_haiku()
    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "You are a search assistant for a Jewish text library. "
         "Given a search query, list 3-6 short phrases (English or Hebrew) that capture "
         "the topical intent of the query. Include synonyms, related concepts, and "
         "alternative phrasings a librarian would recognise. "
         "Output one phrase per line, no numbering."),
        ("human", "Query: {query}\n\nExpanded phrases:")
    ])
    chain = prompt | llm
    try:
        response = chain.invoke({"query": query})
        content = getattr(response, "content", "")
        phrases = [line.strip() for line in content.split("\n") if line.strip()][:6]
    except Exception as e:
        logger.warning(f"Query expansion failed: {e}")
        phrases = []

    return [query] + phrases


def _fetch_snippet(ref_str: str) -> str:
    from sefaria.model.text import Ref
    try:
        oref = Ref(ref_str)
        chunk = oref.text("en")
        text = chunk.text
        if isinstance(text, list):
            text = " ".join(str(t) for t in text if t)
        return (text or "")[:_MAX_SNIPPET_CHARS]
    except Exception:
        return ""


def fuzzy_search(query: str, n_results: int = 20) -> List[dict]:
    """
    Semantic search over the ChromaDB keyphrases index.

    Returns a list of dicts: {ref, heRef, snippet, score, keyphrases_matched}
    sorted by descending score.  Returns [] when the collection is empty.
    """
    try:
        collection = get_chroma_collection()
    except Exception as e:
        logger.error(f"ChromaDB unavailable: {e}")
        return []

    if collection.count() == 0:
        return []

    phrases = _expand_query(query)

    embed_fn = _get_embedding_fn()
    try:
        embeddings = [embed_fn.embed_query(p) for p in phrases]
    except Exception as e:
        logger.error(f"Embedding failed: {e}")
        return []

    # Aggregate scores across all phrase queries
    ref_scores: dict[str, float] = defaultdict(float)
    ref_meta: dict[str, dict] = {}
    ref_keyphrases: dict[str, set] = defaultdict(set)

    for phrase, embedding in zip(phrases, embeddings):
        try:
            results = collection.query(
                query_embeddings=[embedding],
                n_results=min(_TOP_K_PER_PHRASE, collection.count()),
                include=["metadatas", "distances"],
            )
        except Exception as e:
            logger.warning(f"ChromaDB query failed for phrase '{phrase}': {e}")
            continue

        for metadata, distance in zip(
            results["metadatas"][0], results["distances"][0]
        ):
            ref = metadata["ref"]
            # ChromaDB cosine distance ∈ [0,2]; convert to similarity ∈ [-1,1]
            similarity = 1.0 - distance
            ref_scores[ref] += similarity
            ref_keyphrases[ref].add(metadata.get("phrase", phrase))
            if ref not in ref_meta:
                ref_meta[ref] = metadata

    if not ref_scores:
        return []

    # Sort by aggregated score descending
    ranked = sorted(ref_scores.items(), key=lambda x: x[1], reverse=True)[:n_results]

    output = []
    for ref_str, score in ranked:
        meta = ref_meta.get(ref_str, {})
        snippet = _fetch_snippet(ref_str)
        output.append({
            "ref": ref_str,
            "heRef": meta.get("heRef", ref_str),
            "snippet": snippet,
            "score": round(score, 4),
            "keyphrases_matched": sorted(ref_keyphrases[ref_str]),
        })

    return output
