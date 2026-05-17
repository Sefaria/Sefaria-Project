"""
Index-time pipeline for semantic/fuzzy search.

For each text segment:
  1. Generate topical keyphrases via Claude Haiku (what would a user search to find this?)
  2. Rate each keyphrase 1-5 for relevance to the text
  3. Embed keyphrases rated >= 3 with Gemini Embedding 2
  4. Upsert into ChromaDB collection `sefaria_keyphrases`
"""

import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Optional, Tuple

from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langsmith import traceable

logger = logging.getLogger(__name__)

HAIKU_MODEL = "claude-haiku-4-5-20251001"
GEMINI_EMBED_MODEL = "models/gemini-embedding-2"
COLLECTION_NAME = "sefaria_keyphrases"
MIN_RATING = 3


def _get_haiku():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable is required")
    return ChatAnthropic(model=HAIKU_MODEL, temperature=0, max_tokens=1024, api_key=api_key)


def get_chroma_collection():
    import chromadb
    from django.conf import settings

    if getattr(settings, "CHROMA_HOST", ""):
        client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
    else:
        client = chromadb.PersistentClient(path=settings.CHROMA_DB_PATH)

    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def _get_embedding_fn():
    from langchain_google_genai import GoogleGenerativeAIEmbeddings
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY environment variable is required")
    return GoogleGenerativeAIEmbeddings(model=GEMINI_EMBED_MODEL, google_api_key=api_key)


@traceable(run_type="llm", name="fuzzy_search_generate_keyphrases")
def _generate_keyphrases(ref_str: str, en_text: str, he_text: str) -> List[str]:
    llm = _get_haiku()
    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "You are a search query expert for a Jewish text library. "
         "Given a text passage and its source reference, list 5-8 short phrases (in English or Hebrew) "
         "that a user might type into a search box when looking for this passage. "
         "Think about: topics, key figures, rituals, concepts, emotions, or events in the text. "
         "Output one phrase per line, no numbering, no explanation."),
        ("human",
         "Reference: {ref_str}\n\nEnglish text:\n{en_text}\n\nHebrew text:\n{he_text}\n\nSearch phrases:")
    ])
    chain = prompt | llm
    try:
        response = chain.invoke({"ref_str": ref_str, "en_text": en_text[:800], "he_text": he_text[:800]})
        content = getattr(response, "content", "")
        phrases = [line.strip() for line in content.split("\n") if line.strip()]
        return phrases[:10]
    except Exception as e:
        logger.warning(f"Keyphrase generation failed: {e}")
        return []


@traceable(run_type="llm", name="fuzzy_search_rate_keyphrases")
def _rate_keyphrases(ref_str: str, en_text: str, phrases: List[str]) -> List[dict]:
    if not phrases:
        return []
    llm = _get_haiku()
    phrase_list = "\n".join(f"- {p}" for p in phrases)
    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "You rate search phrases for relevance to a text passage. "
         "Rating scale: 5=someone searching this phrase almost certainly wants this text, "
         "3=plausible match, 1=unrelated. "
         'Return a JSON array: [{{"phrase": "...", "rating": N}}]. '
         "No markdown, no explanation."),
        ("human",
         "Reference: {ref_str}\n\nText passage:\n{en_text}\n\nPhrases to rate:\n{phrases}")
    ])
    chain = prompt | llm
    try:
        response = chain.invoke({
            "ref_str": ref_str,
            "en_text": en_text[:600],
            "phrases": phrase_list,
        })
        content = getattr(response, "content", "").strip()
        # Strip markdown code fences if present
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
        rated = json.loads(content)
        return [r for r in rated if isinstance(r.get("rating"), (int, float))]
    except Exception as e:
        logger.warning(f"Keyphrase rating failed: {e}")
        return []


def _embed_phrases(phrases: List[str], embed_fn) -> List[List[float]]:
    return [embed_fn.embed_query(phrase) for phrase in phrases]


def index_ref(ref_str: str, collection, embed_fn) -> int:
    """Index a single ref. Returns number of keyphrases indexed."""
    from sefaria.model.text import Ref

    existing = collection.get(where={"ref": ref_str}, limit=1)
    if existing["ids"]:
        return 0

    try:
        oref = Ref(ref_str)
    except Exception:
        logger.warning(f"Invalid ref: {ref_str}")
        return 0

    def _flatten(val) -> str:
        if isinstance(val, str):
            return val
        if isinstance(val, list):
            return " ".join(_flatten(v) for v in val if v)
        return ""

    try:
        he_chunk = oref.text("he")
        en_chunk = oref.text("en")
        he_text = _flatten(he_chunk.text)
        en_text = _flatten(en_chunk.text)
    except Exception as e:
        logger.warning(f"Failed to fetch text for {ref_str}: {e}")
        return 0

    if not (he_text or en_text):
        return 0

    phrases = _generate_keyphrases(ref_str, en_text, he_text)
    if not phrases:
        return 0

    rated = _rate_keyphrases(ref_str, en_text, phrases)
    good_phrases = [r["phrase"] for r in rated if r["rating"] >= MIN_RATING]
    if not good_phrases:
        return 0

    try:
        embeddings = _embed_phrases(good_phrases, embed_fn)
    except Exception as e:
        logger.warning(f"Embedding failed for {ref_str}: {e}")
        return 0

    try:
        he_ref = oref.he_normal()
    except Exception:
        he_ref = ref_str

    phrase_ratings = {r["phrase"]: r["rating"] for r in rated}
    ids = [f"{ref_str}::{p}" for p in good_phrases]
    metadatas = [
        {
            "ref": ref_str,
            "heRef": he_ref,
            "phrase": p,
            "rating": phrase_ratings.get(p, MIN_RATING),
            "en_text": en_text[:500],
            "he_text": he_text[:500],
        }
        for p in good_phrases
    ]
    documents = good_phrases

    collection.upsert(ids=ids, embeddings=embeddings, metadatas=metadatas, documents=documents)
    return len(good_phrases)


def index_refs(refs: List[str], batch_size: int = 50, max_workers: int = 4) -> int:
    """Index a list of refs. Returns total keyphrases indexed."""
    logging.getLogger("httpx").setLevel(logging.WARNING)

    from tqdm import tqdm

    collection = get_chroma_collection()
    embed_fn = _get_embedding_fn()
    total = 0
    errors = 0

    with tqdm(total=len(refs), unit="ref") as pbar:
        for i in range(0, len(refs), batch_size):
            batch = refs[i:i + batch_size]
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(index_ref, r, collection, embed_fn): r for r in batch}
                for future in as_completed(futures):
                    ref_str = futures[future]
                    try:
                        count = future.result()
                        total += count
                    except Exception as e:
                        errors += 1
                        logger.warning(f"index_ref failed for {ref_str}: {e}")
                    pbar.update(1)
                    pbar.set_postfix(keyphrases=total, errors=errors)

    return total
