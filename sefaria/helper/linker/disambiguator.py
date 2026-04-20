"""
Disambiguator implementations for resolving ambiguous and non-segment-level references.
Based on LLM resolver that uses Dicta API and Sefaria search API.
"""

import json
import structlog
import os
import re
import requests
from dataclasses import dataclass, field, asdict
from functools import lru_cache
from typing import Dict, Any, Optional, List, Tuple
from html import unescape

# Configure LangSmith integration BEFORE any LangChain imports
os.environ["LANGSMITH_TRACING_V2"] = "true"
os.environ["LANGSMITH_ENDPOINT"] = "https://api.smith.langchain.com"
os.environ["LANGSMITH_PROJECT"] = "citation-disambiguator"
# LANGSMITH_API_KEY should be set in your environment

from sefaria.settings import SEARCH_URL

from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langsmith import traceable
from sefaria.model.text import Ref
from sefaria.model.schema import AddressType
from sefaria.helper.normalization import NormalizerComposer

logger = structlog.get_logger(__name__)
LANGSMITH_DEBUG_TAG = "test_reduced_tokens2"


# ---------------------------------------------------------------------------
# Public payload / result dataclasses (stable API — used by tasks.py & tests)
# ---------------------------------------------------------------------------

class DictaAPIError(RuntimeError):
    def __init__(self, info: Dict[str, Any]):
        super().__init__("Dicta API returned non-200")
        self.info = info


@dataclass(frozen=True)
class AmbiguousResolutionPayload:
    ref: str
    versionTitle: str
    language: str
    charRange: list[int]
    text: str
    ambiguous_refs: list[str]


@dataclass(frozen=True)
class NonSegmentResolutionPayload:
    ref: str
    versionTitle: str
    language: str
    charRange: list[int]
    text: str
    resolved_non_segment_ref: str


@dataclass(frozen=True)
class AmbiguousResolutionResult:
    resolved_ref: Optional[str] = None
    matched_segment: Optional[str] = None
    method: Optional[str] = None
    llm_resolved_phrase: Optional[str] = None


@dataclass(frozen=True)
class NonSegmentResolutionResult:
    resolved_ref: Optional[str] = None
    method: Optional[str] = None
    llm_resolved_phrase: Optional[str] = None


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DICTA_URL = os.getenv("DICTA_PARALLELS_URL", "https://parallels-3-0a.loadbalancer.dicta.org.il/parallels/api/findincorpus")
SEFARIA_SEARCH_URL = f"{SEARCH_URL}/text/_search"
MIN_THRESHOLD = 1.0
MAX_DISTANCE = 10.0
REQUEST_TIMEOUT = 30
WINDOW_WORDS = 120

# LLM role → (env_var_for_model, default_model, provider)
_LLM_CONFIGS: Dict[str, Tuple[str, str, str]] = {
    "default":      ("ANTHROPIC_MODEL",         "claude-sonnet-4-6",  "anthropic"),
    "confirmation": ("ANTHROPIC_CONFIRM_MODEL",  "claude-sonnet-4-6",  "anthropic"),
    "prior":        ("ANTHROPIC_CONFIRM_MODEL",  "claude-sonnet-4-6",  "anthropic"),
    "keyword":      ("LLM_KEYWORD_MODEL",        "gpt-4o-mini",        "openai"),
}


# ---------------------------------------------------------------------------
# Candidate dataclass — replaces loose Dict[str, Any] throughout
# ---------------------------------------------------------------------------

@dataclass
class Candidate:
    resolved_ref: str
    score: Optional[float] = None
    source: Optional[str] = None
    raw: Any = None
    query: Optional[str] = None
    queries: List[str] = field(default_factory=list)
    # Only used in ambiguous flow: the top-level candidate ref that contains resolved_ref
    parent_ref: Optional[str] = None
    llm_choice_reason: Optional[str] = None
    highlight: Optional[str] = None

    def resolution_phrase(self) -> Optional[str]:
        """Extract a key phrase used to resolve this candidate."""
        if self.queries:
            unique = list(dict.fromkeys(q for q in self.queries if q))
            if unique:
                return "; ".join(unique)
        if self.query:
            return self.query
        raw = self.raw
        if isinstance(raw, dict) and "raw" in raw and isinstance(raw["raw"], dict):
            raw = raw["raw"]
        if isinstance(raw, dict):
            base_matched = raw.get("baseMatchedText")
            if base_matched:
                return base_matched
        return None

    def merge_queries_from(self, other: "Candidate") -> None:
        """Merge query lists from another candidate into this one."""
        merged: List[str] = list(self.queries)
        if other.queries:
            merged.extend(other.queries)
        if other.query and other.query not in merged:
            merged.append(other.query)
        self.queries = sorted({q for q in merged if q})


def _dedupe_candidates(candidates: List[Candidate]) -> List[Candidate]:
    """Deduplicate candidates by resolved_ref, keeping highest score and merging queries."""
    seen: Dict[str, Candidate] = {}
    for cand in candidates:
        ref = cand.resolved_ref
        if not ref:
            continue
        if ref not in seen:
            seen[ref] = cand
        else:
            prev = seen[ref]
            if cand.score is not None and (prev.score is None or cand.score > prev.score):
                # Keep the higher-scored candidate but still merge queries
                cand.merge_queries_from(prev)
                seen[ref] = cand
            else:
                prev.merge_queries_from(cand)
    return list(seen.values())


# ---------------------------------------------------------------------------
# Helpers — LLM, text, formatting
# ---------------------------------------------------------------------------

def _get_llm(role: str = "default"):
    """Get a configured LLM instance by role."""
    env_var, default_model, provider = _LLM_CONFIGS[role]
    model = os.getenv(env_var, default_model)

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY environment variable is required")
        return ChatOpenAI(model=model, temperature=0, max_tokens=1024, api_key=api_key)

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable is required")
    return ChatAnthropic(model=model, temperature=0, max_tokens=1024, api_key=api_key)


def _escape_template_braces(text: str) -> str:
    """Escape curly braces so ChatPromptTemplate doesn't interpret them as variables."""
    if not text:
        return text
    return text.replace('{', '{{').replace('}', '}}')


@lru_cache(maxsize=2)
def _get_normalizer(lang: str = 'he') -> NormalizerComposer:
    """Build the same normalizer used by LinkerEntityRecognizer to reduce token usage."""
    steps = ['unidecode', 'fn-marker', 'html', 'double-space']
    if lang == 'he':
        steps += ['maqaf', 'cantillation']
    return NormalizerComposer(steps)


def _normalize_for_llm(text: Optional[str], lang: str = 'he') -> Optional[str]:
    """Normalize text for LLM prompts (removes cantillation, HTML, footnotes, etc.)."""
    if not text:
        return text
    return _get_normalizer(lang).normalize(text)


def _normalize_citing_input(
    citing_text: str,
    char_range: List[int],
    text_snippet: str,
    lang: str = 'he',
) -> Tuple[str, List[int], str]:
    """Normalize the citing text and map charRange from original to normalized coordinates.

    Uses NormalizerComposer.norm_to_unnorm_indices with reverse=True to map
    unnormalized indices → normalized indices.
    """
    normalizer = _get_normalizer(lang)
    mapped = normalizer.norm_to_unnorm_indices(
        citing_text, [(char_range[0], char_range[1])], reverse=True,
    )
    norm_start, norm_end = mapped[0]
    return (
        normalizer.normalize(citing_text),
        [norm_start, norm_end],
        normalizer.normalize(text_snippet),
    )


def _format_base_block(base_ref: Optional[str], base_text: Optional[str]) -> str:
    """Build the 'Base text (...):\\n...' block used in multiple LLM prompts."""
    if not base_ref or not base_text:
        return ""
    return f"Base text ({base_ref}):\n{_escape_template_braces(_normalize_for_llm(base_text))}\n\n"


def _get_ref_text(ref_str: str, lang: str = None, vtitle: str = None) -> Optional[str]:
    """Get text for a reference, falling back to the other language."""
    try:
        oref = Ref(ref_str)
        if vtitle:
            vtitle = unescape(vtitle)
        primary = lang or "en"
        text = oref.text(primary, vtitle=vtitle).as_string()
        if text:
            return text
        fallback = "he" if primary == "en" else "en"
        return oref.text(fallback).as_string()
    except Exception as e:
        logger.debug(f"Could not get text for {ref_str}: {e}")
        return None


def _window_around_span(text: str, span: dict, window_words: int) -> Tuple[str, dict]:
    """Extract a window of text around a span."""
    if not text or not span:
        return text, span

    char_range = span.get('charRange')
    if not char_range or len(char_range) != 2:
        return text, span

    start, end = char_range
    if start < 0 or end > len(text) or start >= end:
        return text, span

    tokens = [(m.start(), m.end()) for m in re.finditer(r'\S+', text)]
    if not tokens:
        return text, span

    first_idx = last_idx = None
    for i, (s, e) in enumerate(tokens):
        if first_idx is None and e > start:
            first_idx = i
        if s < end:
            last_idx = i
        if e >= end and first_idx is not None:
            break

    if first_idx is None or last_idx is None:
        return text, span

    left = max(0, first_idx - window_words)
    right = min(len(tokens) - 1, last_idx + window_words)

    w_start = tokens[left][0]
    w_end = tokens[right][1]
    windowed_text = text[w_start:w_end]

    new_span = dict(span)
    new_span['charRange'] = [start - w_start, end - w_start]
    return windowed_text, new_span


def _mark_citation(text: str, span: dict) -> str:
    """Mark the citation in the text with XML tags."""
    if not span or not text:
        return text

    char_range = span.get('charRange')
    if not char_range or len(char_range) != 2:
        return text

    start, end = char_range
    if start < 0 or end > len(text) or start >= end:
        return text

    citation_text = text[start:end]
    before = text[:start]
    after = text[end:]
    open_tag = "<citation"
    ref_attr = span.get("ref")
    if ref_attr:
        open_tag += f' ref="{ref_attr}"'
    open_tag += ">"
    return f"{before}{open_tag}{citation_text}</citation>{after}"


def _prepare_citing_context(
    citing_text_full: str,
    char_range: list,
    text_snippet: str,
    window_words: int = WINDOW_WORDS,
) -> Tuple[str, str, dict]:
    """Build windowed text + marked text from full citing text and span info.

    Returns (windowed_text, marked_text, windowed_span).
    """
    span = {'charRange': char_range, 'text': text_snippet}
    windowed_text, windowed_span = _window_around_span(citing_text_full, span, window_words)
    marked_text = _mark_citation(windowed_text, windowed_span)
    return windowed_text, marked_text, windowed_span


# ---------------------------------------------------------------------------
# External API helpers — Dicta & Sefaria Search
# ---------------------------------------------------------------------------

_DICTA_HEADERS = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Origin': 'https://parallels.dicta.org.il',
    'Referer': 'https://parallels.dicta.org.il/',
}

_SEARCH_HEADERS = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Accept': 'application/json',
    'Origin': 'https://www.sefaria.org',
    'Referer': 'https://www.sefaria.org/texts',
}


def _normalize_dicta_url_to_ref(url: str) -> Optional[str]:
    """Convert Dicta URL to normalized Sefaria ref."""
    if not url:
        return None
    match = re.search(r'/([^/]+)$', url)
    if not match:
        return None
    try:
        return Ref(match.group(1)).normal()
    except Exception:
        return None


def _dicta_post(query_text: str) -> List[dict]:
    """Low-level Dicta HTTP call. Returns the raw 'results' list."""
    params = {'minthreshold': int(MIN_THRESHOLD), 'maxdistance': int(MAX_DISTANCE)}
    try:
        resp = requests.post(
            DICTA_URL,
            params=params,
            data=f"text={query_text}".encode('utf-8'),
            headers=_DICTA_HEADERS,
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            raise DictaAPIError({
                "status_code": resp.status_code,
                "url": resp.url,
                "query_text": query_text,
                "response_text": resp.text,
            })
        data = json.loads(resp.content.decode('utf-8-sig'))
    except DictaAPIError:
        raise
    except Exception as e:
        logger.warning(f"Dicta API request failed: {e}")
        return []
    return data.get('results', [])


def _parse_dicta_results(raw_results: List[dict], target_oref: Optional[Ref] = None) -> List[Candidate]:
    """Parse Dicta raw results into Candidates, optionally filtering by target ref."""
    candidates: List[Candidate] = []
    for entry in raw_results:
        for cand in entry.get('data', []):
            url = cand.get('url') or cand.get('compUrl') or ''
            normalized = _normalize_dicta_url_to_ref(url)
            if not normalized:
                continue
            try:
                oref = Ref(normalized)
                if not oref.is_segment_level():
                    continue
                if target_oref and not target_oref.contains(oref):
                    continue
                candidates.append(Candidate(
                    resolved_ref=normalized,
                    source='dicta',
                    score=cand.get('score'),
                    raw=cand,
                ))
            except Exception:
                continue
    return candidates


@traceable(run_type="tool", name="query_dicta", tags=[LANGSMITH_DEBUG_TAG])
def _query_dicta(query_text: str, target_ref: str = None) -> List[Candidate]:
    """Query Dicta parallels API, optionally filtering by target ref."""
    target_oref = None
    if target_ref:
        try:
            target_oref = Ref(target_ref)
        except Exception:
            logger.warning(f"Could not create Ref for target: {target_ref}")
            return []

    raw_results = _dicta_post(query_text)
    return _parse_dicta_results(raw_results, target_oref)


def _build_search_payload(query_text: str, path_filters: Optional[List[str]] = None, slop: int = 20) -> dict:
    """Build an Elasticsearch payload for Sefaria search."""
    bool_query: Dict[str, Any] = {
        'must': {'match_phrase': {'naive_lemmatizer': {'query': query_text, 'slop': slop}}}
    }
    if path_filters:
        bool_query['filter'] = {
            'bool': {'should': [{'regexp': {'path': regex}} for regex in path_filters]}
        }
    return {
        'from': 0,
        'size': 500,
        'highlight': {
            'pre_tags': ['<b>'],
            'post_tags': ['</b>'],
            'fields': {'naive_lemmatizer': {'fragment_size': 200}},
        },
        'query': {
            'function_score': {
                'field_value_factor': {'field': 'pagesheetrank', 'missing': 0.04},
                'query': {'bool': bool_query},
            }
        },
    }


def _extract_ref_from_search_hit(hit: Dict[str, Any]) -> Optional[str]:
    """Extract ref from search API hit."""
    for source in (hit, hit.get('_source', {})):
        for key in ('ref', 'he_ref', 'sourceRef'):
            val = source.get(key)
            if not val:
                continue
            try:
                return Ref(val).normal()
            except Exception:
                continue
    return None


def _parse_search_hits(
    hits: List[dict],
    target_oref: Optional[Ref] = None,
    query_text: Optional[str] = None,
) -> List[Candidate]:
    """Parse Elasticsearch hits into Candidates, optionally filtering by target ref."""
    candidates: List[Candidate] = []
    for entry in hits:
        normalized = _extract_ref_from_search_hit(entry)
        if not normalized:
            continue
        try:
            cand_oref = Ref(normalized)
            if not cand_oref.is_segment_level():
                continue
            if target_oref and not target_oref.contains(cand_oref):
                continue
            highlight_fragments = (entry.get('highlight') or {}).get('naive_lemmatizer') or []
            highlight = " ... ".join(highlight_fragments) if highlight_fragments else None
            candidates.append(Candidate(
                resolved_ref=normalized,
                source='sefaria_search',
                query=query_text,
                queries=[query_text] if query_text else [],
                raw=entry,
                highlight=highlight,
            ))
        except Exception:
            continue
    return candidates


@traceable(run_type="tool", name="query_sefaria_search", tags=[LANGSMITH_DEBUG_TAG])
def _query_sefaria_search(
    query_text: str,
    target_ref: str = None,
    path_filters: Optional[List[str]] = None,
    slop: int = 20,
) -> List[Candidate]:
    """Query Sefaria search API with optional target-ref or path filters."""
    target_oref = None
    if target_ref:
        try:
            target_oref = Ref(target_ref)
        except Exception:
            logger.warning(f"Could not create Ref for target: {target_ref}")
            return []
        if path_filters is None:
            path_filters = _path_filters_for_ref(target_ref)

    payload = _build_search_payload(query_text, path_filters, slop)
    try:
        resp = requests.post(SEFARIA_SEARCH_URL, json=payload, headers=_SEARCH_HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning(f"Sefaria search API request failed: {e}")
        return []

    hits = (data.get('hits') or {}).get('hits', [])
    return _parse_search_hits(hits, target_oref, query_text)


def _path_filters_for_ref(ref_str: str) -> Optional[List[str]]:
    """Generate path regex filters for Sefaria search."""
    try:
        book = Ref(ref_str).index.title
        return [f".*{re.escape(book)}.*"]
    except Exception:
        return None


def _path_filters_for_books(books: List[str]) -> List[str]:
    """Generate path regex filters for a list of book titles."""
    return [f".*{re.escape(book)}.*" for book in books]


# ---------------------------------------------------------------------------
# LLM-powered steps
# ---------------------------------------------------------------------------

@traceable(run_type="llm", name="llm_form_prior", tags=[LANGSMITH_DEBUG_TAG])
def _llm_form_prior(marked_text: str, base_ref: str = None, base_text: str = None) -> str:
    """Use LLM to form a prior about what the target segment should contain."""
    llm = _get_llm("prior")
    base_block = _format_base_block(base_ref, base_text)

    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You form a prior expectation about what the target text likely contains, "
            "based only on the citing passage and any base text. Do NOT guess a specific ref."
        ),
        (
            "human",
            "Citing passage (the citation span is wrapped in <citation ...></citation>):\n"
            "{citing}\n\n"
            "{base_block}"
            "Describe what the target segment should be about, key themes or phrases to expect, "
            "and any constraints implied by the citation. Keep it concise and concrete.\n"
            "Return 2-3 bullet points."
        ),
    ])

    try:
        response = (prompt | llm).invoke({
            "citing": _escape_template_braces(marked_text),
            "base_block": base_block,
        })
        return getattr(response, 'content', '').strip()
    except Exception as e:
        logger.warning(f"LLM prior formation failed: {e}")
        return ""


@traceable(run_type="llm", name="llm_form_search_query", tags=[LANGSMITH_DEBUG_TAG])
def _llm_form_search_query(marked_text: str, base_ref: str = None, base_text: str = None) -> List[str]:
    """Use LLM to generate search queries from marked citing text."""
    llm = _get_llm("keyword")

    context_redacted = re.sub(r'<citation>.*?</citation>', '[REDACTED]', marked_text, flags=re.DOTALL)

    base_block = ""
    if base_ref and base_text:
        base_block = f"Base text being commented on ({base_ref}):\n{_normalize_for_llm(base_text)}\n\n"

    prior = _llm_form_prior(marked_text, base_ref=base_ref, base_text=base_text)

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You extract concise search phrases that are likely to appear verbatim in the target text."),
        ("human",
         "Citing passage (citation wrapped in <citation ...></citation>):\n{citing}\n\n"
         "Context with citation redacted:\n{context}\n\n"
         "{base_block}"
         "Prior expectations about the target (formed without seeing it):\n{prior}\n\n"
         "Return 5-6 short lexical search queries (<=6 words each), taken from surrounding context "
         "outside the citation span.\n"
         "- Prefer phrases that you expect to appear verbatim in the target text.\n"
         "- If base text is provided, prefer keywords that appear verbatim in the base text.\n"
         "- If the context contains distinctive Hebrew content words (especially nouns), prefer them verbatim.\n"
         "- Do NOT translate Hebrew into English. Avoid paraphrases.\n"
         "- Prefer specific/rare tokens over generic ones.\n"
         "- Include at least one single-word query (preferably a distinctive Hebrew noun).\n"
         "- Include at least one 2-3 word query.\n"
         "- Do NOT copy words that appear inside <citation>...</citation>.\n"
         "- You may slightly alter spelling of keywords to more standard spelling (e.g. text says ירושלם you can change to ירושלים). HOWEVER, when you do, still include the original spelling as a separate query, because the target may use that exact non-standard spelling.\n"
         "Strict output: one per line, numbered 1) ... through 6) ... or a single line 'NONE'."
         )
    ])

    try:
        response = (prompt | llm).invoke({
            "citing": _escape_template_braces(marked_text),
            "context": _escape_template_braces(context_redacted),
            "base_block": _escape_template_braces(base_block),
            "prior": _escape_template_braces(prior),
        })
        content = getattr(response, 'content', '')

        if content.strip().upper() == 'NONE':
            logger.info("LLM returned NONE - no suitable queries found")
            return []

        queries = []
        for line in content.split('\n'):
            line = line.strip()
            if not line:
                continue
            match = re.match(r'^\d+[\)\.]\s*(.+)$', line)
            if match:
                query = match.group(1).strip()
                if query:
                    queries.append(query)
        return queries[:6]
    except Exception as e:
        logger.warning(f"LLM query generation failed: {e}")
        return []


@traceable(run_type="llm", name="llm_confirm_candidate", tags=[LANGSMITH_DEBUG_TAG])
def _llm_confirm_candidate(
    marked_text: str,
    candidate_ref: str,
    candidate_text: str,
    base_ref: str = None,
    base_text: str = None,
) -> Tuple[bool, str]:
    """Use LLM to confirm if a candidate is the correct resolution."""
    llm = _get_llm("confirmation")
    prior = _llm_form_prior(marked_text, base_ref=base_ref, base_text=base_text)
    base_block = _format_base_block(base_ref, base_text)

    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You verify whether one Jewish text is genuinely citing or closely paraphrasing a specific target segment. "
            "Be strict in your evaluation."
        ),
        (
            "human",
            "Citing passage (the citation span is wrapped in <citation ...></citation>):\n"
            "{citing}\n\n"
            "{base_block}"
            "Prior expectations (formed without seeing the candidate):\n{prior}\n\n"
            "Candidate segment ref (retrieved by similarity):\n{candidate_ref}\n\n"
            "Candidate segment text:\n{candidate_text}\n\n"
            "Determine whether the citing passage is actually referring to this candidate segment.\n"
            "If base text is provided, consider whether the commentary is discussing that base passage.\n\n"
            "Answer in exactly two lines (no preamble):\n"
            "Reason: <brief rationale>\n"
            "Verdict: YES or NO",
        ),
    ])

    try:
        response = (prompt | llm).invoke({
            "citing": _escape_template_braces(marked_text),
            "base_block": base_block,
            "prior": _escape_template_braces(prior),
            "candidate_ref": candidate_ref,
            "candidate_text": _escape_template_braces(_normalize_for_llm(candidate_text)),
        })
        content = getattr(response, 'content', '')
        verdict = "YES" if re.search(r'\bYES\b', content, re.IGNORECASE) else "NO"
        return verdict == "YES", content
    except Exception as e:
        logger.warning(f"LLM confirmation failed: {e}")
        return False, str(e)


@traceable(run_type="llm", name="llm_choose_base_vs_commentary", tags=[LANGSMITH_DEBUG_TAG])
def _llm_choose_base_vs_commentary(
    marked_text: str,
    base_ref: str,
    base_text: str,
    commentary_ref: str,
    commentary_text: str,
) -> Optional[str]:
    """Choose whether the citation refers to the base text or the commentary."""
    llm = _get_llm("default")

    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You decide whether a citation is referring to the base text itself or to a commentary on that base text. "
            "Be strict and choose the most likely target."
        ),
        (
            "human",
            "Citing passage (the citation span is wrapped in <citation ...></citation>):\n"
            "{citing}\n\n"
            "Option A (Base text): {base_ref}\n{base_text}\n\n"
            "Option B (Commentary): {commentary_ref}\n{commentary_text}\n\n"
            "Which is more likely being referred to? Answer in exactly two lines:\n"
            "Reason: <brief rationale>\n"
            "Choice: BASE or COMMENTARY",
        ),
    ])

    try:
        response = (prompt | llm).invoke({
            "citing": _escape_template_braces(marked_text),
            "base_ref": base_ref,
            "base_text": _escape_template_braces(_normalize_for_llm(base_text)),
            "commentary_ref": commentary_ref,
            "commentary_text": _escape_template_braces(_normalize_for_llm(commentary_text)),
        })
        content = getattr(response, 'content', '')
        if re.search(r"\bBASE\b", content, re.IGNORECASE):
            return "BASE"
        if re.search(r"\bCOMMENTARY\b", content, re.IGNORECASE):
            return "COMMENTARY"
        return None
    except Exception as e:
        logger.warning(f"LLM base vs commentary choice failed: {e}")
        return None


@traceable(run_type="llm", name="llm_choose_best_candidate", tags=[LANGSMITH_DEBUG_TAG])
def _llm_choose_best_candidate(
    marked_text: str,
    candidates: List[Candidate],
    base_ref: Optional[str] = None,
    base_text: Optional[str] = None,
    lang: Optional[str] = None,
) -> Optional[Candidate]:
    """Use LLM to choose the best candidate from multiple options."""
    if not candidates:
        return None

    deduped = _dedupe_candidates(candidates)
    if len(deduped) == 0:
        return None
    if len(deduped) == 1:
        return deduped[0]

    # Build numbered candidate list with text previews
    numbered: List[str] = []
    payloads: List[Tuple[int, Candidate]] = []

    for i, cand in enumerate(deduped, 1):
        if cand.highlight:
            preview = _normalize_for_llm(cand.highlight)
        else:
            txt = _get_ref_text(cand.resolved_ref, lang=lang)
            preview = _normalize_for_llm((txt or "").strip()) if txt else ""
        numbered.append(f"{i}) {cand.resolved_ref}\n{preview}")
        payloads.append((i, cand))

    base_block = _format_base_block(base_ref, base_text)

    llm = _get_llm("default")
    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You choose the single best candidate ref that the citing text most directly quotes/paraphrases. "
            "You must respond with an actual number, not a placeholder or variable."
        ),
        (
            "human",
            "Citing passage (citation wrapped in <citation ...></citation>):\n{citing}\n\n"
            f"{base_block}"
            "Candidate refs:\n{candidates}\n\n"
            "Pick exactly ONE number from the list above (e.g., 1, 2, 3, etc.).\n\n"
            "Output format (replace with actual content, do NOT use placeholders):\n"
            "Reason: Your brief explanation here\n"
            "Choice: 1\n\n"
            "Now provide your answer:"
        ),
    ])

    try:
        resp = (prompt | llm).invoke({
            "citing": _escape_template_braces(marked_text),
            "candidates": _escape_template_braces("\n\n".join(numbered)),
        })
        content = getattr(resp, "content", "")
    except Exception as exc:
        logger.warning(f"LLM choose-best failed: {exc}")
        return None

    # Parse the choice
    m = re.search(r"choice\s*:\s*(\d+)", content, re.IGNORECASE)
    if not m:
        nums = re.findall(r"\d+", content or "")
        if not nums:
            logger.warning(f"Could not parse choice from LLM response: {content}")
            return None
        choice = int(nums[0])
    else:
        choice = int(m.group(1))

    for idx, cand in payloads:
        if idx == choice:
            cand.llm_choice_reason = content
            logger.info(f"LLM chose candidate {choice}: {cand.resolved_ref}")
            return cand

    logger.warning(f"LLM chose index {choice} but no matching candidate found")
    return None


# ---------------------------------------------------------------------------
# Shared pipeline helpers
# ---------------------------------------------------------------------------

def _get_commentary_base_context(citing_ref: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Get the base text context if citing ref is a commentary."""
    if not citing_ref:
        return None, None
    try:
        citing_oref = Ref(citing_ref)
        base_titles = getattr(citing_oref.index, "base_text_titles", []) or []
        if not base_titles:
            return None, None

        base_title = base_titles[0]
        section_ref = citing_oref.section_ref()
        for sec, addr_type in zip(section_ref.sections, section_ref.index_node.addressTypes):
            address = AddressType.to_str_by_address_type(addr_type, "en", sec)
            base_title += f" {address}"

        base_ref = Ref(base_title).normal()
        base_text = _get_ref_text(base_ref, lang="he") or _get_ref_text(base_ref, lang="en")
        return base_ref, base_text
    except Exception:
        return None, None


def _confirm_candidate(
    candidate: Candidate,
    marked_text: str,
    lang: str,
    base_ref: Optional[str] = None,
    base_text: Optional[str] = None,
    auto_approve_prefix: Optional[str] = None,
    citing_ref: Optional[str] = None,
) -> Tuple[bool, Optional[str]]:
    """Confirm a candidate with LLM, with optional auto-approve for specific citing refs.

    Returns (approved, reason_if_rejected).
    """
    resolved_ref = candidate.resolved_ref
    if auto_approve_prefix and citing_ref and citing_ref.startswith(auto_approve_prefix):
        logger.info(f"Auto-approved {auto_approve_prefix} (skipped LLM): {resolved_ref}")
        return True, None

    candidate_text = _get_ref_text(resolved_ref, lang)
    ok, reason = _llm_confirm_candidate(marked_text, resolved_ref, candidate_text, base_ref, base_text)
    if ok:
        logger.info(f"Candidate {resolved_ref} confirmed by LLM")
    else:
        logger.info(f"Candidate {resolved_ref} rejected by LLM: {reason}")
    return ok, reason


def _fallback_search_pipeline(
    marked_citing_text: str,
    citing_text: str,
    span: Optional[dict],
    non_segment_ref: str,
    citing_ref: Optional[str] = None,
    lang: Optional[str] = None,
    vtitle: Optional[str] = None,
    base_ref: Optional[str] = None,
    base_text: Optional[str] = None,
) -> Optional[Candidate]:
    """
    Multi-stage search pipeline with LLM-generated queries.

    Stages:
    A) Normal window queries (text-only)
    B) Base-text seeded queries (if base_text available)
    C) Expanded window queries (if no candidates yet)
    D) Expanded base-seeded queries (if base_text available and no candidates)
    """
    searched: set = set()
    candidates: List[Candidate] = []

    def run_queries(queries: List[str], label: str) -> None:
        for q in queries:
            q = (q or "").strip()
            if not q or q in searched:
                continue
            searched.add(q)

            logger.info(f"Trying {label} query: '{q}'")
            hits = _query_sefaria_search(q, target_ref=non_segment_ref)

            if hits:
                logger.info(f"Sefaria search {label} succeeded: '{q}' -> {len(hits)} hits")
                candidates.extend(hits)
                continue

            # One retry for failed queries
            logger.info(f"Sefaria search {label} failed: '{q}', retrying once...")
            retry_hits = _query_sefaria_search(q, target_ref=non_segment_ref)
            if retry_hits:
                logger.info(f"Sefaria search {label} retry succeeded: '{q}' -> {len(retry_hits)} hits")
                candidates.extend(retry_hits)

    # A) Normal window queries
    logger.info("Stage A: Normal window text-only queries")
    run_queries(_llm_form_search_query(marked_citing_text) or [], label="(text-only)")

    # B) Base-text seeded queries
    if base_text:
        logger.info("Stage B: Base-text seeded queries")
        run_queries(
            _llm_form_search_query(marked_citing_text, base_ref=base_ref, base_text=base_text) or [],
            label="(base-seeded)",
        )

    if not candidates:
        logger.info("No candidates found in search pipeline")
        return None

    deduped = _dedupe_candidates(candidates)
    logger.info(f"Found {len(candidates)} candidates, {len(deduped)} after deduplication")

    if len(deduped) == 1:
        logger.info(f"Single candidate after deduplication: {deduped[0].resolved_ref}")
        return deduped[0]

    logger.info(f"Multiple candidates ({len(deduped)}), using LLM to choose best")
    chosen = _llm_choose_best_candidate(marked_citing_text, deduped, base_ref=base_ref, base_text=base_text, lang=lang)

    if chosen:
        logger.info(f"LLM chose {chosen.resolved_ref} from {len(deduped)} candidates")
    else:
        logger.warning("LLM failed to choose a candidate")
    return chosen


# ---------------------------------------------------------------------------
# Ambiguous-ref helpers
# ---------------------------------------------------------------------------

def _is_base_vs_commentary_ambiguous(
    citing_ref: str,
    base_ref: Optional[str],
    valid_candidates: List[Dict[str, Any]],
) -> bool:
    """Detect base-text vs commentary ambiguity when citing ref is the commentary."""
    if not base_ref or len(valid_candidates) != 2:
        return False
    try:
        base_index = Ref(base_ref).index.title
    except Exception:
        return False
    try:
        citing_index = Ref(citing_ref).index.title
    except Exception:
        return False

    cand_indexes = []
    for cand in valid_candidates:
        try:
            cand_indexes.append(Ref(cand["ref"]).index.title)
        except Exception:
            cand_indexes.append(None)
    return base_index in cand_indexes and citing_index in cand_indexes


def _try_dicta_for_candidates(
    query_text: str,
    candidates: List[Dict[str, Any]],
    marked_text: Optional[str] = None,
    lang: Optional[str] = None,
    base_ref: Optional[str] = None,
    base_text: Optional[str] = None,
) -> Optional[Candidate]:
    """Query Dicta and check if any results match the ambiguous candidates."""
    dicta_results = _query_dicta(query_text)  # no target filter — match against candidate list
    if not dicta_results:
        return None

    matching: List[Candidate] = []
    for result in dicta_results:
        try:
            result_oref = Ref(result.resolved_ref)
            for cand in candidates:
                if cand['oref'].contains(result_oref):
                    logger.info(f"Dicta result {result.resolved_ref} matches candidate {cand['ref']}")
                    matching.append(Candidate(
                        resolved_ref=result.resolved_ref,
                        parent_ref=cand['ref'],
                        score=result.score,
                        raw=result.raw,
                    ))
                    break
        except Exception:
            continue

    if not matching:
        logger.info("Dicta found no matches among candidates")
        return None

    deduped = _dedupe_candidates(matching)
    if len(deduped) == 1:
        return deduped[0]

    if marked_text:
        logger.info(f"Dicta found {len(deduped)} unique segments, using LLM to choose best")
        chosen = _llm_choose_best_candidate(marked_text, deduped, base_ref=base_ref, base_text=base_text, lang=lang)
        if chosen:
            return chosen

    logger.info(f"Dicta found {len(deduped)} unique segments, returning first")
    return deduped[0]


def _try_search_for_candidates(
    marked_text: str,
    candidates: List[Dict[str, Any]],
    lang: str,
    base_ref: str = None,
    base_text: str = None,
) -> Optional[Candidate]:
    """Generate search queries and check if results match ambiguous candidates."""
    queries = _llm_form_search_query(marked_text, base_ref, base_text)
    if not queries:
        logger.info("Could not generate search queries")
        return None

    logger.info(f"Generated {len(queries)} search queries: {queries}")

    candidate_books = set()
    for cand in candidates:
        try:
            oref = cand.get('oref')
            if oref:
                candidate_books.add(oref.index.title)
        except Exception:
            continue

    if candidate_books:
        logger.info(f"Filtering search to books: {list(candidate_books)}")

    path_filters = _path_filters_for_books(list(candidate_books)) if candidate_books else None

    matching: List[Candidate] = []
    seen_refs: set = set()

    for query in queries:
        results = _query_sefaria_search(query, path_filters=path_filters, slop=10)
        for result in results:
            if result.resolved_ref in seen_refs:
                continue
            try:
                result_oref = Ref(result.resolved_ref)
                if not result_oref.is_segment_level():
                    continue
                for cand in candidates:
                    if cand['oref'].contains(result_oref):
                        logger.info(
                            "Search result %s matches candidate %s for query: %s",
                            result.resolved_ref, cand["ref"], query,
                        )
                        seen_refs.add(result.resolved_ref)
                        matching.append(Candidate(
                            resolved_ref=result.resolved_ref,
                            parent_ref=cand['ref'],
                            query=query,
                            queries=[query],
                            raw=result.raw,
                        ))
                        break
            except Exception:
                continue

    if not matching:
        logger.info("Search found no matches among candidates")
        return None

    deduped = _dedupe_candidates(matching)
    if len(deduped) == 1:
        return deduped[0]

    logger.info(f"Search found {len(deduped)} unique segments, using LLM to choose best")
    chosen = _llm_choose_best_candidate(marked_text, deduped, base_ref=base_ref, base_text=base_text, lang=lang)
    if chosen:
        return chosen

    logger.warning(f"LLM failed to choose, returning first of {len(deduped)} segments")
    return deduped[0]


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

@traceable(run_type="chain", name="disambiguate_non_segment_ref", tags=[LANGSMITH_DEBUG_TAG])
def disambiguate_non_segment_ref(
    resolution_data: NonSegmentResolutionPayload,
) -> Optional[NonSegmentResolutionResult]:
    """
    Disambiguate a non-segment-level reference to a specific segment.

    Algorithm:
    1. If only 1 segment: auto-resolve
    2. If 2-3 segments: use LLM to pick directly
    3. If more segments and Hebrew text: try Dicta API
    4. Fallback to Sefaria search with LLM-generated queries
    5. Confirm candidate with LLM
    """
    try:
        logger.info("Non-segment payload", payload=asdict(resolution_data))
        citing_ref = resolution_data.ref
        citing_text_snippet = resolution_data.text
        citing_lang = resolution_data.language
        non_segment_ref_str = resolution_data.resolved_non_segment_ref
        vtitle = resolution_data.versionTitle

        logger.info(f"Disambiguating non-segment ref: {non_segment_ref_str}")

        citing_text_full = _get_ref_text(citing_ref, citing_lang, vtitle)
        if not citing_text_full:
            logger.warning(f"Could not get text for citing ref: {citing_ref}")
            return None

        non_segment_oref = Ref(non_segment_ref_str)
        segment_refs = non_segment_oref.all_segment_refs()

        if not segment_refs:
            logger.warning(f"No segment refs found for: {non_segment_ref_str}")
            return None

        # Case 1: Only one segment — auto resolve
        if len(segment_refs) == 1:
            resolved_ref = segment_refs[0].normal()
            logger.info(f"Auto-resolved single segment: {resolved_ref}")
            return NonSegmentResolutionResult(
                resolved_ref=resolved_ref,
                method='auto_single_segment',
            )

        # Normalize citing text and map charRange to normalized coordinates
        citing_text_norm, char_range_norm, text_snippet_norm = _normalize_citing_input(
            citing_text_full, resolution_data.charRange, citing_text_snippet, citing_lang,
        )

        # Case 2: 2-3 segments — LLM picks directly from text previews
        if len(segment_refs) in (2, 3):
            return _resolve_small_range(
                segment_refs, citing_text_norm, char_range_norm, text_snippet_norm,
            )

        # Case 3: Many segments — Hebrew only
        if citing_lang != 'he':
            logger.info(f"Non-Hebrew text with {len(segment_refs)} segments - not supported")
            return None

        windowed_text, marked_text, windowed_span = _prepare_citing_context(
            citing_text_norm, char_range_norm, text_snippet_norm,
        )

        # Try Dicta
        logger.info("Querying Dicta API...")
        dicta_candidates = _query_dicta(windowed_text, target_ref=non_segment_ref_str)

        if dicta_candidates:
            logger.info(f"Dicta found {len(dicta_candidates)} candidates")
            if len(dicta_candidates) == 1:
                candidate = dicta_candidates[0]
            else:
                base_ref_temp, base_text_temp = _get_commentary_base_context(citing_ref)
                candidate = _llm_choose_best_candidate(
                    marked_text, dicta_candidates,
                    base_ref=base_ref_temp, base_text=base_text_temp, lang=citing_lang,
                )

            if candidate:
                # Note: Dicta confirmation intentionally omits base context
                # to avoid false positives on adjacent verses
                ok, _ = _confirm_candidate(
                    candidate, marked_text, citing_lang,
                    auto_approve_prefix="Metzudat Zion", citing_ref=citing_ref,
                )
                if ok:
                    return NonSegmentResolutionResult(
                        resolved_ref=candidate.resolved_ref,
                        method='dicta_auto_approved' if citing_ref.startswith("Metzudat Zion") else 'dicta_llm_confirmed',
                        llm_resolved_phrase=candidate.resolution_phrase(),
                    )

        # Fallback: Sefaria search pipeline
        logger.info("Falling back to Sefaria search pipeline...")
        base_ref, base_text = _get_commentary_base_context(citing_ref)

        search_result = _fallback_search_pipeline(
            marked_citing_text=marked_text,
            citing_text=citing_text_norm,
            span={'charRange': char_range_norm, 'text': text_snippet_norm},
            non_segment_ref=non_segment_ref_str,
            citing_ref=citing_ref,
            lang=citing_lang,
            vtitle=vtitle,
            base_ref=base_ref,
            base_text=base_text,
        )

        if search_result:
            ok, _ = _confirm_candidate(
                search_result, marked_text, citing_lang,
                base_ref=base_ref, base_text=base_text,
                auto_approve_prefix="Metzudat Zion", citing_ref=citing_ref,
            )
            if ok:
                return NonSegmentResolutionResult(
                    resolved_ref=search_result.resolved_ref,
                    method='search_auto_approved' if citing_ref.startswith("Metzudat Zion") else 'search_llm_confirmed',
                    llm_resolved_phrase=search_result.resolution_phrase(),
                )

        logger.info("No resolution found via Dicta or Search")
        return None

    except DictaAPIError:
        raise
    except Exception as e:
        logger.error(f"Error in disambiguate_non_segment_ref: {e}", exc_info=True)
        return None


def _resolve_small_range(
    segment_refs: List[Ref],
    citing_text_full: str,
    char_range: list,
    text_snippet: str,
) -> Optional[NonSegmentResolutionResult]:
    """Resolve when there are only 2-3 segment candidates by asking LLM directly."""
    candidates = []
    for i, seg_ref in enumerate(segment_refs, 1):
        seg_text = _get_ref_text(seg_ref.normal(), lang="he") or _get_ref_text(seg_ref.normal(), lang="en")
        if seg_text:
            candidates.append({
                'index': i,
                'resolved_ref': seg_ref.normal(),
                'preview': _normalize_for_llm(seg_text),
            })

    if not candidates:
        logger.warning("Could not load text for any segments")
        return None

    _, marked_text, _ = _prepare_citing_context(citing_text_full, char_range, text_snippet)

    llm = _get_llm("default")
    candidate_list = "\n\n".join([
        f"{c['index']}) {c['resolved_ref']}\n   {_escape_template_braces(c['preview'])}"
        for c in candidates
    ])
    escaped_marked_text = _escape_template_braces(marked_text)

    prompt = ChatPromptTemplate.from_messages([
        ("system", "Choose the segment being cited."),
        ("human", f"Citing text:\n{escaped_marked_text}\n\nSegments:\n{candidate_list}\n\n"
                  "Format: Reason: <explanation>\nChoice: <number>"),
    ])

    response = (prompt | llm).invoke({})
    content = getattr(response, "content", "")

    match = re.search(r"choice\s*:\s*(\d+)", content, re.IGNORECASE)
    if match:
        choice = int(match.group(1))
        for cand in candidates:
            if cand['index'] == choice:
                logger.info(f"LLM resolved to: {cand['resolved_ref']}")
                return NonSegmentResolutionResult(
                    resolved_ref=cand['resolved_ref'],
                    method='llm_small_range',
                )

    logger.warning(f"Could not parse LLM response: {content}")
    return None


@traceable(run_type="chain", name="disambiguate_ambiguous_ref", tags=[LANGSMITH_DEBUG_TAG])
def disambiguate_ambiguous_ref(
    resolution_data: AmbiguousResolutionPayload,
) -> Optional[AmbiguousResolutionResult]:
    """
    Disambiguate between multiple possible reference resolutions.

    Algorithm:
    1. Use Dicta API to see if it matches any of the ambiguous candidates
    2. If Dicta finds matches, dedupe and pick best (via LLM if multiple)
    3. If Dicta fails, use Sefaria search with LLM-generated queries
    4. Confirm final candidate with LLM
    """
    try:
        logger.info("Ambiguous payload", payload=asdict(resolution_data))
        citing_ref = resolution_data.ref
        citing_text_snippet = resolution_data.text
        citing_lang = resolution_data.language
        ambiguous_refs = resolution_data.ambiguous_refs
        vtitle = resolution_data.versionTitle

        logger.info(f"Disambiguating ambiguous ref with {len(ambiguous_refs)} options: {ambiguous_refs}")

        if len(ambiguous_refs) < 2:
            logger.warning("Less than 2 ambiguous refs provided")
            return None

        if citing_lang != 'he':
            logger.info(f"Non-Hebrew ambiguous resolution not supported (lang={citing_lang})")
            return None

        citing_text_full = _get_ref_text(citing_ref, citing_lang, vtitle)
        if not citing_text_full:
            logger.warning(f"Could not get text for citing ref: {citing_ref}")
            return None

        # Normalize citing text and map charRange to normalized coordinates
        citing_text_norm, char_range_norm, text_snippet_norm = _normalize_citing_input(
            citing_text_full, resolution_data.charRange, citing_text_snippet, citing_lang,
        )

        # Normalize candidates
        valid_candidates = []
        for ref_str in ambiguous_refs:
            try:
                oref = Ref(ref_str)
                valid_candidates.append({'ref': oref.normal(), 'oref': oref})
            except Exception as e:
                logger.warning(f"Invalid ambiguous ref: {ref_str}, error: {e}")

        if len(valid_candidates) < 2:
            logger.warning(f"Not enough valid candidates: {len(valid_candidates)}")
            return None

        logger.info(f"Valid candidates: {[c['ref'] for c in valid_candidates]}")

        windowed_text, marked_text, _ = _prepare_citing_context(
            citing_text_norm, char_range_norm, text_snippet_norm,
        )

        base_ref, base_text = _get_commentary_base_context(citing_ref)

        # Special case: base text vs commentary ambiguity
        if _is_base_vs_commentary_ambiguous(citing_ref, base_ref, valid_candidates):
            result = _resolve_base_vs_commentary(
                citing_ref, base_ref, valid_candidates, marked_text, citing_lang,
            )
            if result:
                return result

        # Step 1: Try Dicta
        logger.info("Trying Dicta to find match among ambiguous candidates...")
        dicta_match = _try_dicta_for_candidates(
            windowed_text, valid_candidates,
            marked_text=marked_text, lang=citing_lang, base_ref=base_ref, base_text=base_text,
        )

        if dicta_match:
            result = _confirm_ambiguous_candidate(
                dicta_match, marked_text, citing_lang, base_ref, base_text, method='dicta_llm_confirmed',
            )
            if result:
                return result

        # Step 2: Try Sefaria search
        logger.info("Trying Sefaria search to find match among ambiguous candidates...")
        search_match = _try_search_for_candidates(marked_text, valid_candidates, citing_lang, base_ref, base_text)

        if search_match:
            result = _confirm_ambiguous_candidate(
                search_match, marked_text, citing_lang, base_ref, base_text, method='search_llm_confirmed',
            )
            if result:
                return result

        logger.info("Could not find valid match among ambiguous candidates")
        return None

    except DictaAPIError:
        raise
    except Exception as e:
        logger.error(f"Error in disambiguate_ambiguous_ref: {e}", exc_info=True)
        return None


def _confirm_ambiguous_candidate(
    candidate: Candidate,
    marked_text: str,
    lang: str,
    base_ref: Optional[str],
    base_text: Optional[str],
    method: str,
) -> Optional[AmbiguousResolutionResult]:
    """Confirm an ambiguous candidate with LLM, returning a result or None."""
    match_ref = candidate.resolved_ref
    parent_ref = candidate.parent_ref or match_ref
    logger.info(f"Found match: {parent_ref} -> {match_ref}, confirming with LLM...")

    candidate_text = _get_ref_text(match_ref, lang)
    ok, reason = _llm_confirm_candidate(marked_text, match_ref, candidate_text, base_ref, base_text)

    if ok:
        logger.info(f"LLM confirmed match: {match_ref}")
        return AmbiguousResolutionResult(
            resolved_ref=parent_ref,
            matched_segment=match_ref,
            method=method,
            llm_resolved_phrase=candidate.resolution_phrase(),
        )
    logger.info(f"LLM rejected match: {reason}")
    return None


def _resolve_base_vs_commentary(
    citing_ref: str,
    base_ref: str,
    valid_candidates: List[Dict[str, Any]],
    marked_text: str,
    citing_lang: str,
) -> Optional[AmbiguousResolutionResult]:
    """Handle the special case where ambiguity is between base text and its commentary."""
    logger.info(
        "Detected ambiguous base-text vs commentary case",
        citing_ref=citing_ref, base_ref=base_ref,
        options=[c["ref"] for c in valid_candidates],
    )

    try:
        base_index = Ref(base_ref).index.title
    except Exception:
        base_index = None
    try:
        citing_index = Ref(citing_ref).index.title
    except Exception:
        citing_index = None

    base_cand = comm_cand = None
    for cand in valid_candidates:
        try:
            idx_title = Ref(cand["ref"]).index.title
        except Exception:
            continue
        if base_index and idx_title == base_index:
            base_cand = cand
        if citing_index and idx_title == citing_index:
            comm_cand = cand

    if not (base_cand and comm_cand):
        return None

    base_text_full = _get_ref_text(base_cand["ref"], citing_lang)
    comm_text_full = _get_ref_text(comm_cand["ref"], citing_lang)
    if not (base_text_full and comm_text_full):
        return None

    choice = _llm_choose_base_vs_commentary(
        marked_text, base_cand["ref"], base_text_full, comm_cand["ref"], comm_text_full,
    )

    if choice == "BASE":
        return AmbiguousResolutionResult(
            resolved_ref=base_cand["ref"], method="llm_base_vs_commentary",
        )
    if choice == "COMMENTARY":
        return AmbiguousResolutionResult(
            resolved_ref=comm_cand["ref"], method="llm_base_vs_commentary",
        )
    return None
