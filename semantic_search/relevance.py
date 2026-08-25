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
    "query, on a scale from 1 to 5. Use judgement -- the same work can be authoritative "
    "for one query and merely tangential for another, depending on whether it is actually "
    "the source being asked about. The passage may be preceded by its Ref and/or Work -- "
    "use that to identify what the source actually is; judge the work's authoritativeness "
    "by its identity, not by the register or style of the (possibly loosely translated or "
    "paraphrased) passage text.\n\n"
    "5 - An authoritative source directly relevant to the query: the passage is actually "
    "the source for the law or idea the query asks about, AND it is authoritative.\n"
    "Authoritative is a question about the nature of the WORK, not about how well it "
    "answers the query (that's the level-4 test) and not about matching its name against a "
    "fixed list. Ask: is this passage itself one of the formative texts in the chain of "
    "transmission that Orthodox rabbis treat as mesora -- Tanakh, Mishnah, Tosefta, Talmud "
    "Bavli and Yerushalmi, halachic and aggadic Midrash, and the classical codes (e.g. "
    "Mishneh Torah, Shulchan Arukh) -- or a source of comparable formative standing? Or is "
    "it a later work that explains, popularizes, applies, or responds based on those "
    "formative texts? A contemporary halachic guide, a responsum, or an inspirational essay "
    "does not become authoritative by being accurate, thorough, or correctly citing the "
    "right primary sources -- however well it answers the question, it stays at level 4 "
    "because it is not itself a formative source. When more than one authoritative source "
    "addresses the same law, the more foundational one is the better level-5 candidate (e.g. "
    "a Mishnah over a Tosefta or Talmudic discussion restating the same law), but any of "
    "them can earn 5 if it is genuinely the source being asked about. (Example: for \"can I "
    "eat meat with milk?\", Exodus 23:19 is a level 5 source.) Only use this level when the "
    "passage is actually the source for the query's subject -- an authoritative work that "
    "merely touches on the topic without being the source for it is not a 5.\n"
    "4 - A non-authoritative source directly relevant to the question, OR an authoritative "
    "source that is merely adjacent to the question rather than being the actual source for "
    "it: it fully or mostly answers the user's question, or contains all the information "
    "needed to construct an answer.\n"
    "3 - A partially relevant source, authoritative or not: touches on themes relevant to "
    "the question and may spark follow-up questions, but does not itself answer the "
    "question.\n"
    "2 - Mentions ideas related to the query but does not spark follow-up questions -- it "
    "happens to touch on similar themes without being useful to the query.\n"
    "1 - Not at all relevant: a false positive the user would not be interested in reading "
    "based on their query."
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


def _format_passage_message(query: str, result_text: str, ref: str = "", index_title: str = "") -> str:
    source_lines = []
    if ref:
        source_lines.append(f"Ref: {ref}")
    if index_title and index_title != ref:
        source_lines.append(f"Work: {index_title}")
    source_block = ("\n".join(source_lines) + "\n\n") if source_lines else ""
    return f"Query: {query}\n\n{source_block}Passage:\n{result_text}"


def score_result(query: str, result_text: str, ref: str = "", index_title: str = "") -> int:
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
            HumanMessage(content=_format_passage_message(query, result_text, ref, index_title)),
        ])
        score = int(result.get("score") or 0)
        return max(0, min(score, MAX_SCORE))
    except Exception as e:
        logger.warning(f"score_result failed: {e}")
        return 0


def summarize_result(query: str, result_text: str, ref: str = "", index_title: str = "") -> str:
    """Returns "" (rather than raising) on any failure -- see score_result."""
    try:
        llm = get_chat_llm()
        result = llm.invoke([
            SystemMessage(content=_SUMMARY_SYSTEM_PROMPT),
            HumanMessage(content=_format_passage_message(query, result_text, ref, index_title)),
        ])
        return (result.content or "").strip()
    except Exception as e:
        logger.warning(f"summarize_result failed: {e}")
        return ""


def _run_parallel(
    fn: Callable[..., object],
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
            executor.submit(
                fn,
                query,
                item.get(text_key, ""),
                ref=item.get("ref", ""),
                index_title=item.get("index_title", ""),
            ): i
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
