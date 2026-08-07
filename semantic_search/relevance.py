import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from semantic_search.llm import get_chat_llm

logger = logging.getLogger(__name__)

MIN_RELEVANT_SCORE = 3
MAX_SCORE = 5

_SCORE_SYSTEM_PROMPT = (
    "You rate how relevant a passage from a Jewish text library is to a user's search "
    "query, on a scale from 1 to 5: 1 means not at all relevant, 5 means highly relevant. "
    "Judge relevance to the query's subject matter and intent, not merely keyword overlap."
)

_SCORE_SCHEMA = {
    "title": "RelevanceScore",
    "description": "A 1-5 relevance rating of a search result against a query.",
    "type": "object",
    "properties": {
        "score": {
            "type": "integer",
            "description": "Relevance rating from 1 (not at all relevant) to 5 (highly relevant).",
        },
    },
    "required": ["score"],
}

_SUMMARY_SYSTEM_PROMPT = (
    "You write a one or two sentence summary explaining why a passage from a Jewish text "
    "library is relevant to a user's search query. Be concise and specific to this passage; "
    "do not restate the query verbatim."
)


def score_result(query: str, result_text: str) -> int:
    """
    Returns 0 (rather than raising) on any failure, so a single bad LLM call
    can't take down the whole search -- 0 is below MIN_RELEVANT_SCORE and gets
    filtered out downstream like a genuinely irrelevant result.
    """
    try:
        llm = get_chat_llm()
        structured_llm = llm.with_structured_output(_SCORE_SCHEMA)
        result = structured_llm.invoke([
            SystemMessage(content=_SCORE_SYSTEM_PROMPT),
            HumanMessage(content=f"Query: {query}\n\nPassage:\n{result_text}"),
        ])
        score = int(result.get("score") or 0)
        return max(0, min(score, MAX_SCORE))
    except Exception as e:
        logger.warning(f"score_result failed: {e}")
        return 0


def summarize_result(query: str, result_text: str) -> str:
    """Returns "" (rather than raising) on any failure -- see score_result."""
    try:
        llm = get_chat_llm()
        result = llm.invoke([
            SystemMessage(content=_SUMMARY_SYSTEM_PROMPT),
            HumanMessage(content=f"Query: {query}\n\nPassage:\n{result_text}"),
        ])
        return (result.content or "").strip()
    except Exception as e:
        logger.warning(f"summarize_result failed: {e}")
        return ""


def _run_parallel(
    fn: Callable[[str, str], object],
    query: str,
    items: list[dict],
    text_key: str = "text",
    max_workers: int = 25,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> list:
    total = len(items)
    results: list = [None] * total
    if total == 0:
        return results

    completed = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_index = {
            executor.submit(fn, query, item.get(text_key, "")): i
            for i, item in enumerate(items)
        }
        for future in as_completed(future_to_index):
            results[future_to_index[future]] = future.result()
            completed += 1
            if on_progress:
                on_progress(completed, total)
    return results


def score_results_parallel(
    query: str,
    items: list[dict],
    max_workers: int = 25,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> list[int]:
    return _run_parallel(score_result, query, items, max_workers=max_workers, on_progress=on_progress)


def summarize_results_parallel(
    query: str,
    items: list[dict],
    max_workers: int = 25,
    on_progress: Optional[Callable[[int, int], None]] = None,
) -> list[str]:
    return _run_parallel(summarize_result, query, items, max_workers=max_workers, on_progress=on_progress)
