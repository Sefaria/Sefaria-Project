"""
Disambiguator implementations for resolving ambiguous and non-segment-level references.
Based on LLM resolver that uses Dicta API and Sefaria search API.
"""

import structlog
import os
import re
import requests
from typing import Dict, Any, Optional, List, Tuple
from html import unescape
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from sefaria.model.text import Ref

logger = structlog.get_logger(__name__)

# Configuration
DICTA_URL = os.getenv("DICTA_PARALLELS_URL", "https://parallels-3-0a.loadbalancer.dicta.org.il/parallels/api/findincorpus")
SEFARIA_SEARCH_URL = os.getenv("SEFARIA_SEARCH_URL", "https://www.sefaria.org/api/search/text/_search")
MIN_THRESHOLD = 1.0
MAX_DISTANCE = 8.0
REQUEST_TIMEOUT = 30
WINDOW_WORDS = 120


def _get_llm():
    """Get configured LLM instance."""
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY environment variable is required")

    return ChatOpenAI(model=model, temperature=0, max_tokens=1024, api_key=api_key)


def _get_ref_text(ref_str: str, lang: str = None, vtitle: str = None) -> Optional[str]:
    """Get text for a reference."""
    try:
        oref = Ref(ref_str)

        if vtitle:
            vtitle = unescape(vtitle)

        primary = lang or "en"
        text = oref.text(primary, vtitle=vtitle).as_string()
        if text:
            return text

        fallback = "he" if primary == "en" else "en"
        return None
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

    # Find word boundaries
    tokens = [(m.start(), m.end()) for m in re.finditer(r'\S+', text)]
    if not tokens:
        return text, span

    # Find tokens overlapping with span
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

    # Expand window
    left = max(0, first_idx - window_words)
    right = min(len(tokens) - 1, last_idx + window_words)

    w_start = tokens[left][0]
    w_end = tokens[right][1]
    windowed_text = text[w_start:w_end]

    # Adjust span char range to new window
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

    return f"{before}<citation>{citation_text}</citation>{after}"


def _query_dicta(query_text: str, target_ref: str) -> List[Dict[str, Any]]:
    """Query Dicta parallels API for matching segments."""
    params = {
        'minthreshold': int(MIN_THRESHOLD),
        'maxdistance': int(MAX_DISTANCE)
    }
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://parallels.dicta.org.il',
        'Referer': 'https://parallels.dicta.org.il/'
    }

    try:
        target_oref = Ref(target_ref)
    except Exception:
        logger.warning(f"Could not create Ref for target: {target_ref}")
        return []

    try:
        resp = requests.post(
            DICTA_URL,
            params=params,
            data=f"text={query_text}".encode('utf-8'),
            headers=headers,
            timeout=REQUEST_TIMEOUT
        )
        resp.raise_for_status()

        # Handle UTF-8 BOM by decoding with utf-8-sig
        text = resp.content.decode('utf-8-sig')

        # Parse JSON
        import json
        data = json.loads(text)
    except Exception as e:
        logger.warning(f"Dicta API request failed: {e}")
        return []

    candidates = []
    results = data.get('results', [])

    for entry in results:
        for cand in entry.get('data', []):
            url = cand.get('url') or cand.get('compUrl') or ''
            normalized = _normalize_dicta_url_to_ref(url)
            if not normalized:
                continue

            try:
                oref = Ref(normalized)
                if not oref.is_segment_level():
                    continue
                if target_oref.contains(oref):
                    score = cand.get('score')
                    candidates.append({
                        'resolved_ref': normalized,
                        'source': 'dicta',
                        'score': score,
                        'raw': cand
                    })
            except Exception:
                continue

    return candidates


def _normalize_dicta_url_to_ref(url: str) -> Optional[str]:
    """Convert Dicta URL to normalized Sefaria ref."""
    if not url:
        return None

    # Extract ref from URL like: /Genesis.1.1 or /Berakhot.2a.1
    match = re.search(r'/([^/]+)$', url)
    if not match:
        return None

    ref_part = match.group(1)

    try:
        return Ref(ref_part).normal()
    except Exception:
        return None


def _query_sefaria_search(query_text: str, target_ref: str, slop: int = 10) -> Optional[Dict[str, Any]]:
    """Query Sefaria search API for matching segments."""
    try:
        target_oref = Ref(target_ref)
        path_regex = _path_regex_for_ref(target_ref)
    except Exception:
        logger.warning(f"Could not create Ref for target: {target_ref}")
        return None

    bool_query = {
        'must': {'match_phrase': {'naive_lemmatizer': {'query': query_text, 'slop': slop}}}
    }

    if path_regex:
        bool_query['filter'] = {'bool': {'should': [{'regexp': {'path': path_regex}}]}}

    payload = {
        'from': 0,
        'size': 500,
        'highlight': {
            'pre_tags': ['<b>'],
            'post_tags': ['</b>'],
            'fields': {'naive_lemmatizer': {'fragment_size': 200}}
        },
        'query': {
            'function_score': {
                'field_value_factor': {'field': 'pagesheetrank', 'missing': 0.04},
                'query': {'bool': bool_query}
            }
        }
    }

    headers = {
        'Content-Type': 'application/json; charset=UTF-8',
        'Accept': 'application/json',
        'Origin': 'https://www.sefaria.org',
        'Referer': 'https://www.sefaria.org/texts'
    }

    try:
        resp = requests.post(SEFARIA_SEARCH_URL, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning(f"Sefaria search API request failed: {e}")
        return None

    hits = (data.get('hits') or {}).get('hits', [])

    for entry in hits:
        normalized = _extract_ref_from_search_hit(entry)
        if not normalized:
            continue

        try:
            cand_oref = Ref(normalized)
            if not cand_oref.is_segment_level():
                continue
            if target_oref.contains(cand_oref):
                return {
                    'resolved_ref': normalized,
                    'source': 'sefaria_search',
                    'query': query_text,
                    'raw': entry
                }
        except Exception:
            continue

    return None


def _extract_ref_from_search_hit(hit: Dict[str, Any]) -> Optional[str]:
    """Extract ref from search API hit."""
    candidates = []
    for k in ('ref', 'he_ref', 'sourceRef'):
        if k in hit:
            candidates.append(hit.get(k))

    src = hit.get('_source', {})
    for k in ('ref', 'he_ref', 'sourceRef'):
        if k in src:
            candidates.append(src.get(k))

    for c in candidates:
        if not c:
            continue
        try:
            return Ref(c).normal()
        except Exception:
            continue

    return None


def _path_regex_for_ref(ref_str: str) -> Optional[str]:
    """Generate path regex for Sefaria search filtering."""
    try:
        oref = Ref(ref_str)
        book = oref.index.title
        # Simple regex: just the book name
        return f".*{re.escape(book)}.*"
    except Exception:
        return None


def _llm_form_search_query(marked_text: str, base_ref: str = None, base_text: str = None) -> List[str]:
    """Use LLM to generate search queries from marked citing text."""
    llm = _get_llm()

    # Create context with citation redacted
    context_redacted = re.sub(r'<citation>.*?</citation>', '[REDACTED]', marked_text, flags=re.DOTALL)

    base_block = ""
    if base_ref and base_text:
        base_block = f"Base text being commented on ({base_ref}):\n{base_text[:1000]}\n\n"

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are extracting a concise citation phrase to search for parallels."),
        ("human",
         "Citing passage (citation wrapped in <citation ...></citation>):\n{citing}\n\n"
         "Context with citation redacted:\n{context}\n\n"
         "{base_block}"
         "Return 5-6 short lexical search queries (<=6 words each), taken from surrounding context "
         "outside the citation span.\n"
         "- If base text is provided, prefer keywords that appear verbatim in the base text.\n"
         "- Include at least one 2-3 word query.\n"
         "- Do NOT copy words that appear inside <citation>...</citation>.\n"
         "Strict output: one per line, numbered 1) ... through 6) ... or a single line 'NONE'."
        )
    ])

    chain = prompt | llm
    try:
        response = chain.invoke({
            "citing": marked_text[:2000],
            "context": context_redacted[:2000],
            "base_block": base_block
        })
        content = getattr(response, 'content', '')

        # Check for NONE response
        if content.strip().upper() == 'NONE':
            logger.info("LLM returned NONE - no suitable queries found")
            return []

        # Parse numbered queries
        queries = []
        for line in content.split('\n'):
            line = line.strip()
            if not line:
                continue
            # Match patterns like "1) query text" or "1. query text"
            match = re.match(r'^\d+[\)\.]\s*(.+)$', line)
            if match:
                query = match.group(1).strip()
                if query:
                    queries.append(query)

        return queries[:6]  # Max 6 queries
    except Exception as e:
        logger.warning(f"LLM query generation failed: {e}")
        return []


def _llm_confirm_candidate(marked_text: str, candidate_ref: str, candidate_text: str,
                          base_ref: str = None, base_text: str = None) -> Tuple[bool, str]:
    """Use LLM to confirm if a candidate is the correct resolution."""

    llm = _get_llm()

    base_block = ""
    if base_ref and base_text:
        base_block = f"\n\nBase text ({base_ref}):\n{base_text[:1000]}"

    prompt = ChatPromptTemplate.from_messages([
        ("system", "Is the candidate passage the one being cited? Respond YES or NO with brief reason."),
        ("human",
         f"Citing text (citation in <citation> tags):\n{marked_text[:2000]}{base_block}\n\n"
         f"Candidate ({candidate_ref}):\n{candidate_text[:500]}\n\n"
         "Format: YES/NO\nReason: <explanation>")
    ])

    chain = prompt | llm
    try:
        response = chain.invoke({})
        content = getattr(response, 'content', '')
        verdict = "YES" if re.search(r'\bYES\b', content, re.IGNORECASE) else "NO"
        return verdict == "YES", content
    except Exception as e:
        logger.warning(f"LLM confirmation failed: {e}")
        return False, str(e)


def _llm_choose_best_candidate(
    marked_text: str,
    candidates: List[Dict[str, Any]],
    base_ref: Optional[str] = None,
    base_text: Optional[str] = None,
    lang: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Use LLM to choose the best candidate from multiple options.

    Deduplicates candidates by resolved_ref (keeping highest score),
    presents them with text previews, and uses LLM to select the best match.
    """
    if not candidates:
        return None

    # Deduplicate by resolved_ref, keeping highest score
    unique: Dict[str, Dict[str, Any]] = {}
    for c in candidates:
        r = c.get("resolved_ref")
        if not r:
            continue
        if r not in unique:
            unique[r] = c
        else:
            prev_score = unique[r].get("score")
            new_score = c.get("score")
            if new_score is not None and (prev_score is None or new_score > prev_score):
                unique[r] = c

    if len(unique) == 0:
        return None

    if len(unique) == 1:
        # Only one unique candidate, return it
        return list(unique.values())[0]

    # Build numbered candidate list with text previews
    numbered: List[str] = []
    payloads: List[Tuple[int, Dict[str, Any]]] = []

    for i, (ref, cand) in enumerate(unique.items(), 1):
        txt = _get_ref_text(ref, lang=lang)
        preview = (txt or "").strip()[:400]
        if txt and len(txt) > 400:
            preview += "..."

        score_str = f"(score={cand.get('score')})" if cand.get('score') is not None else ""
        numbered.append(f"{i}) {ref} {score_str}\n{preview}")
        payloads.append((i, cand))

    # Build base text block if available
    base_block = ""
    if base_ref and base_text:
        base_block = f"Base text of commentary target ({base_ref}):\n{base_text[:2000]}\n\n"

    # Create LLM prompt
    llm = _get_llm()
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
        )
    ])

    chain = prompt | llm
    try:
        resp = chain.invoke({
            "citing": marked_text[:6000],
            "candidates": "\n\n".join(numbered)
        })
        content = getattr(resp, "content", "")
    except Exception as exc:
        logger.warning(f"LLM choose-best failed: {exc}")
        return None

    # Parse the choice from LLM response
    m = re.search(r"choice\s*:\s*(\d+)", content, re.IGNORECASE)
    if not m:
        # Fallback: extract first number found in response
        nums = re.findall(r"\d+", content or "")
        if not nums:
            logger.warning(f"Could not parse choice from LLM response: {content}")
            return None
        choice = int(nums[0])
    else:
        choice = int(m.group(1))

    # Find the selected candidate
    for idx, cand in payloads:
        if idx == choice:
            # Add LLM reasoning to the candidate
            cand["llm_choice_reason"] = content

            # Log matched text if available (from Dicta results)
            raw = cand.get("raw", {})
            if isinstance(raw, dict):
                base_matched = raw.get("baseMatchedText")
                comp_matched = raw.get("compMatchedText")
                if base_matched or comp_matched:
                    logger.info("Selected candidate matched text:")
                    if base_matched:
                        logger.info(f"  baseMatchedText: {base_matched}")
                    if comp_matched:
                        logger.info(f"  compMatchedText: {comp_matched}")

            logger.info(f"LLM chose candidate {choice}: {cand.get('resolved_ref')}")
            return cand

    logger.warning(f"LLM chose index {choice} but no matching candidate found")
    return None


def _dedupe_candidates_by_ref(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate candidates by resolved_ref, keeping the one with highest score."""
    seen = {}
    for cand in candidates:
        ref = cand.get('resolved_ref')
        if not ref:
            continue

        # Keep the candidate with the highest score, or first if no score
        if ref not in seen:
            seen[ref] = cand
        else:
            old_score = seen[ref].get('score', 0)
            new_score = cand.get('score', 0)
            if new_score > old_score:
                seen[ref] = cand

    return list(seen.values())


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
) -> Optional[Dict[str, Any]]:
    """
    Run a multi-stage search pipeline with LLM-generated queries.

    Pipeline stages:
    A) Normal window queries (text-only)
    B) Base-text seeded queries (if base_text available)
    C) Expanded window queries (if no candidates yet)
    D) Expanded base-seeded queries (if base_text available and no candidates)

    Returns the best candidate after deduplication and LLM selection.
    """
    searched: set = set()
    candidates: List[Dict[str, Any]] = []

    def run_queries(queries: List[str], label: str) -> None:
        """Run a list of queries and collect candidates."""
        for q in queries:
            q = (q or "").strip()
            if not q or q in searched:
                continue
            searched.add(q)

            logger.info(f"Trying {label} query: '{q}'")
            hit = _query_sefaria_search(q, non_segment_ref)

            if hit:
                logger.info(f"Sefaria search {label} succeeded: '{q}' -> {hit.get('resolved_ref')}")
                candidates.append(hit)
                continue

            # One retry for failed queries
            logger.info(f"Sefaria search {label} failed: '{q}', retrying once...")
            retry = _query_sefaria_search(q, non_segment_ref)

            if retry:
                logger.info(f"Sefaria search {label} retry succeeded: '{q}' -> {retry.get('resolved_ref')}")
                candidates.append(retry)

    # A) Normal window queries (text-only)
    logger.info("Stage A: Normal window text-only queries")
    q1 = _llm_form_search_query(marked_citing_text) or []
    run_queries(q1, label="(text-only)")

    # B) Base-text seeded queries
    if base_text:
        logger.info("Stage B: Base-text seeded queries")
        q2 = _llm_form_search_query(marked_citing_text, base_ref=base_ref, base_text=base_text) or []
        run_queries(q2, label="(base-seeded)")

    # C) Expanded window queries (if no candidates yet)
    if not candidates:
        logger.info("Stage C: Expanded window queries")
        expanded_words = max(WINDOW_WORDS * 2, WINDOW_WORDS + 1)
        expanded_window, expanded_span = _window_around_span(citing_text, span, expanded_words)
        expanded_marked = _mark_citation(expanded_window, expanded_span)

        q3 = _llm_form_search_query(expanded_marked) or []
        run_queries(q3, label="(expanded text-only)")

        # D) Expanded base-seeded queries
        if base_text:
            logger.info("Stage D: Expanded base-seeded queries")
            q4 = _llm_form_search_query(expanded_marked, base_ref=base_ref, base_text=base_text) or []
            run_queries(q4, label="(expanded base-seeded)")

    if not candidates:
        logger.info("No candidates found in search pipeline")
        return None

    # Dedupe candidates
    deduped = _dedupe_candidates_by_ref(candidates)
    logger.info(f"Found {len(candidates)} candidates, {len(deduped)} after deduplication")

    if len(deduped) == 1:
        logger.info(f"Single candidate after deduplication: {deduped[0].get('resolved_ref')}")
        return deduped[0]

    # Use LLM to choose best candidate
    logger.info(f"Multiple candidates ({len(deduped)}), using LLM to choose best")
    chosen = _llm_choose_best_candidate(
        marked_citing_text,
        deduped,
        base_ref=base_ref,
        base_text=base_text,
        lang=lang,
    )

    if chosen:
        logger.info(f"LLM chose {chosen.get('resolved_ref')} from {len(deduped)} candidates")
    else:
        logger.warning("LLM failed to choose a candidate")

    return chosen


def disambiguate_non_segment_ref(resolution_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Disambiguate a non-segment-level reference to a specific segment.

    Algorithm (from LLM repo):
    1. If only 1 segment: auto-resolve
    2. If 2-3 segments: use LLM to pick directly
    3. If more segments and Hebrew text: try Dicta API
    4. Fallback to Sefaria search with LLM-generated queries
    5. Confirm candidate with LLM

    Args:
        resolution_data: dict with structure:
            {
                'ref': str,  # The citing ref
                'versionTitle': str,
                'language': str,
                'charRange': [int, int],
                'text': str,  # The citing text
                'resolved_ref': str,  # The non-segment ref to resolve
                'ref_level': str
            }

    Returns:
        Dict with resolved reference or None if resolution failed
    """
    try:

        citing_ref = resolution_data['ref']
        citing_text_snippet = resolution_data['text']
        citing_lang = resolution_data['language']
        non_segment_ref_str = resolution_data['resolved_ref']
        vtitle = resolution_data.get('versionTitle')

        logger.info(f"Disambiguating non-segment ref: {non_segment_ref_str}")

        # Get full citing text
        citing_text_full = _get_ref_text(citing_ref, citing_lang, vtitle)
        if not citing_text_full:
            logger.warning(f"Could not get text for citing ref: {citing_ref}")
            return None

        # Get the non-segment ref
        non_segment_oref = Ref(non_segment_ref_str)
        segment_refs = non_segment_oref.all_segment_refs()

        if not segment_refs:
            logger.warning(f"No segment refs found for: {non_segment_ref_str}")
            return None

        # Case 1: Only one segment - auto resolve
        if len(segment_refs) == 1:
            resolved_ref = segment_refs[0].normal()
            logger.info(f"Auto-resolved single segment: {resolved_ref}")
            return {
                'resolved_ref': resolved_ref,
                'confidence': 1.0,
                'method': 'auto_single_segment'
            }

        # Case 2: 2-3 segments - use LLM to pick directly
        if len(segment_refs) in [2, 3]:
            candidates = []
            for i, seg_ref in enumerate(segment_refs, 1):
                seg_text = _get_ref_text(seg_ref.normal())
                if seg_text:
                    preview = seg_text[:300] + ("..." if len(seg_text) > 300 else "")
                    candidates.append({
                        'index': i,
                        'resolved_ref': seg_ref.normal(),
                        'text': seg_text,
                        'preview': preview
                    })

            if not candidates:
                logger.warning("Could not load text for any segments")
                return None

            # Create marked text
            span = {'charRange': resolution_data['charRange'], 'text': citing_text_snippet}
            windowed_text, windowed_span = _window_around_span(citing_text_full, span, WINDOW_WORDS)
            marked_text = _mark_citation(windowed_text, windowed_span)

            # Ask LLM to pick
            llm = _get_llm()
            candidate_list = "\n\n".join([
                f"{c['index']}) {c['resolved_ref']}\n   {c['preview']}"
                for c in candidates
            ])

            prompt = ChatPromptTemplate.from_messages([
                ("system", "Choose the segment being cited."),
                ("human", f"Citing text:\n{marked_text}\n\nSegments:\n{candidate_list}\n\n"
                         "Format: Reason: <explanation>\nChoice: <number>")
            ])

            chain = prompt | llm
            response = chain.invoke({})
            content = getattr(response, "content", "")

            match = re.search(r"choice\s*:\s*(\d+)", content, re.IGNORECASE)
            if match:
                choice = int(match.group(1))
                for cand in candidates:
                    if cand['index'] == choice:
                        logger.info(f"LLM resolved to: {cand['resolved_ref']}")
                        return {
                            'resolved_ref': cand['resolved_ref'],
                            'confidence': 0.8,
                            'method': 'llm_small_range'
                        }

            logger.warning(f"Could not parse LLM response: {content}")
            return None

        # Case 3: Many segments - use Dicta/Search pipeline (Hebrew only)
        if citing_lang != 'he':
            logger.info(f"Non-Hebrew text with {len(segment_refs)} segments - not supported")
            return None

        # Create windowed and marked text
        span = {'charRange': resolution_data['charRange'], 'text': citing_text_snippet}
        windowed_text, windowed_span = _window_around_span(citing_text_full, span, WINDOW_WORDS)
        marked_text = _mark_citation(windowed_text, windowed_span)

        # Try Dicta API
        logger.info("Querying Dicta API...")
        dicta_candidates = _query_dicta(windowed_text, non_segment_ref_str)

        if dicta_candidates:
            logger.info(f"Dicta found {len(dicta_candidates)} candidates")

            if len(dicta_candidates) == 1:
                candidate = dicta_candidates[0]
            else:
                # Get base context for LLM selection
                base_ref_temp, base_text_temp = _get_commentary_base_context(citing_ref)
                candidate = _llm_choose_best_candidate(
                    marked_text,
                    dicta_candidates,
                    base_ref=base_ref_temp,
                    base_text=base_text_temp,
                    lang=citing_lang,
                )

            if candidate:
                resolved_ref = candidate['resolved_ref']
                candidate_text = _get_ref_text(resolved_ref, citing_lang)

                # Confirm with LLM
                ok, reason = _llm_confirm_candidate(marked_text, resolved_ref, candidate_text)
                if ok:
                    logger.info(f"Dicta candidate {resolved_ref} confirmed by LLM")
                    return {
                        'resolved_ref': resolved_ref,
                        'confidence': 0.9,
                        'method': 'dicta_llm_confirmed'
                    }
                else:
                    logger.info(f"Dicta candidate {resolved_ref} rejected by LLM: {reason}")

        # Fallback: Sefaria search pipeline with LLM-generated queries
        logger.info("Falling back to Sefaria search pipeline...")

        # Get base text context if available
        base_ref, base_text = _get_commentary_base_context(citing_ref)

        # Run the search pipeline
        search_result = _fallback_search_pipeline(
            marked_citing_text=marked_text,
            citing_text=citing_text_full,
            span={'charRange': resolution_data['charRange'], 'text': citing_text_snippet},
            non_segment_ref=non_segment_ref_str,
            citing_ref=citing_ref,
            lang=citing_lang,
            vtitle=vtitle,
            base_ref=base_ref,
            base_text=base_text,
        )

        if search_result:
            resolved_ref = search_result['resolved_ref']
            candidate_text = _get_ref_text(resolved_ref, citing_lang)

            # Confirm with LLM
            ok, reason = _llm_confirm_candidate(marked_text, resolved_ref, candidate_text, base_ref, base_text)
            if ok:
                logger.info(f"Search candidate {resolved_ref} confirmed by LLM")
                return {
                    'resolved_ref': resolved_ref,
                    'confidence': 0.8,
                    'method': 'search_llm_confirmed'
                }
            else:
                logger.info(f"Search candidate {resolved_ref} rejected by LLM: {reason}")

        logger.info("No resolution found via Dicta or Search")
        return None

    except Exception as e:
        logger.error(f"Error in disambiguate_non_segment_ref: {e}", exc_info=True)
        return None


def disambiguate_ambiguous_ref(resolution_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Disambiguate between multiple possible reference resolutions.

    Algorithm (from LLMParallelAmbiguousResolver):
    1. Use Dicta API to see if it matches any of the ambiguous candidates
    2. If Dicta finds matches, dedupe and pick best (via LLM if multiple)
    3. If Dicta fails, use Sefaria search with LLM-generated queries
    4. Confirm final candidate with LLM

    Args:
        resolution_data: dict with structure:
            {
                'ref': str,  # The citing ref
                'versionTitle': str,
                'language': str,
                'charRange': [int, int],
                'text': str,  # The ambiguous citation text
                'ambiguous_refs': [str, str, ...]  # List of possible refs
            }

    Returns:
        Dict with resolved reference or None if resolution failed
    """
    try:

        citing_ref = resolution_data['ref']
        citing_text_snippet = resolution_data['text']
        citing_lang = resolution_data['language']
        ambiguous_refs = resolution_data['ambiguous_refs']
        vtitle = resolution_data.get('versionTitle')

        logger.info(f"Disambiguating ambiguous ref with {len(ambiguous_refs)} options: {ambiguous_refs}")

        if len(ambiguous_refs) < 2:
            logger.warning("Less than 2 ambiguous refs provided")
            return None

        # Only support Hebrew for now (Dicta/Search requirement)
        if citing_lang != 'he':
            logger.info(f"Non-Hebrew ambiguous resolution not supported (lang={citing_lang})")
            return None

        # Get full citing text
        citing_text_full = _get_ref_text(citing_ref, citing_lang, vtitle)
        if not citing_text_full:
            logger.warning(f"Could not get text for citing ref: {citing_ref}")
            return None

        # Normalize all candidate refs
        valid_candidates = []
        for ref_str in ambiguous_refs:
            try:
                oref = Ref(ref_str)
                valid_candidates.append({
                    'ref': oref.normal(),
                    'oref': oref
                })
            except Exception as e:
                logger.warning(f"Invalid ambiguous ref: {ref_str}, error: {e}")
                continue

        if len(valid_candidates) < 2:
            logger.warning(f"Not enough valid candidates: {len(valid_candidates)}")
            return None

        logger.info(f"Valid candidates: {[c['ref'] for c in valid_candidates]}")

        # Create windowed and marked text
        span = {'charRange': resolution_data['charRange'], 'text': citing_text_snippet}
        windowed_text, windowed_span = _window_around_span(citing_text_full, span, WINDOW_WORDS)
        marked_text = _mark_citation(windowed_text, windowed_span)

        # Get base context if commentary
        base_ref, base_text = _get_commentary_base_context(citing_ref)

        # Step 1: Try Dicta to find match among candidates
        logger.info("Trying Dicta to find match among ambiguous candidates...")
        dicta_match = _try_dicta_for_candidates(
            windowed_text,
            valid_candidates,
            marked_text=marked_text,
            lang=citing_lang,
            base_ref=base_ref,
            base_text=base_text,
        )

        if dicta_match:
            match_ref = dicta_match.get('resolved_ref', dicta_match['ref'])
            logger.info(f"Dicta found match: {dicta_match['ref']} → {match_ref}, confirming with LLM...")

            candidate_text = _get_ref_text(match_ref, citing_lang)
            ok, reason = _llm_confirm_candidate(marked_text, match_ref, candidate_text, base_ref, base_text)

            if ok:
                logger.info(f"LLM confirmed Dicta match: {match_ref}")
                return {
                    'resolved_ref': dicta_match['ref'],  # Return the candidate ref, not the segment
                    'matched_segment': match_ref if match_ref != dicta_match['ref'] else None,
                    'confidence': 0.9,
                    'method': 'dicta_llm_confirmed'
                }
            else:
                logger.info(f"LLM rejected Dicta match: {reason}")

        # Step 2: Try Sefaria search
        logger.info("Trying Sefaria search to find match among ambiguous candidates...")
        search_match = _try_search_for_candidates(marked_text, valid_candidates, citing_lang, base_ref, base_text)

        if search_match:
            match_ref = search_match.get('resolved_ref', search_match['ref'])
            logger.info(f"Search found match: {search_match['ref']} → {match_ref}, confirming with LLM...")

            candidate_text = _get_ref_text(match_ref, citing_lang)
            ok, reason = _llm_confirm_candidate(marked_text, match_ref, candidate_text, base_ref, base_text)

            if ok:
                logger.info(f"LLM confirmed search match: {match_ref}")
                return {
                    'resolved_ref': search_match['ref'],  # Return the candidate ref, not the segment
                    'matched_segment': match_ref if match_ref != search_match['ref'] else None,
                    'confidence': 0.8,
                    'method': 'search_llm_confirmed'
                }
            else:
                logger.info(f"LLM rejected search match: {reason}")

        logger.info("Could not find valid match among ambiguous candidates")
        return None

    except Exception as e:
        logger.error(f"Error in disambiguate_ambiguous_ref: {e}", exc_info=True)
        return None


def _get_commentary_base_context(citing_ref: str) -> Tuple[Optional[str], Optional[str]]:
    """Get the base text context if citing ref is a commentary."""
    try:
        oref = Ref(citing_ref)

        # Check if this is a commentary
        if not oref.index.is_commentary():
            return None, None

        # Get the base ref
        base_refs = oref.index.base_text_titles
        if not base_refs:
            return None, None

        # Try to get the specific base passage being commented on
        # This is a simplification - real implementation would be more sophisticated
        base_title = base_refs[0]
        base_ref_str = f"{base_title} 1:1"  # Simplified

        base_text = _get_ref_text(base_ref_str)
        return base_ref_str if base_text else None, base_text

    except Exception:
        return None, None


def _try_dicta_for_candidates(
    query_text: str,
    candidates: List[Dict[str, Any]],
    marked_text: Optional[str] = None,
    lang: Optional[str] = None,
    base_ref: Optional[str] = None,
    base_text: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Query Dicta and check if any results match the candidates."""
    # Get Dicta results
    all_dicta_results = _query_dicta_raw(query_text)
    if not all_dicta_results:
        return None

    # Check which Dicta results match our candidates
    matching_candidates = []

    for result in all_dicta_results:
        result_ref = result['resolved_ref']

        try:
            result_oref = Ref(result_ref)

            # Check if this result is contained within any candidate
            for cand in candidates:
                cand_oref = cand['oref']
                if cand_oref.contains(result_oref):
                    logger.info(f"Dicta result {result_ref} matches candidate {cand['ref']}")
                    matching_candidates.append({
                        'ref': cand['ref'],  # The candidate ref
                        'resolved_ref': result_ref,  # The specific segment from Dicta
                        'score': result.get('score'),
                        'raw': result
                    })
                    break  # Only match to first candidate
        except Exception:
            continue

    if not matching_candidates:
        logger.info("Dicta found no matches among candidates")
        return None

    # Dedupe by resolved_ref (segment level)
    deduped = {}
    for match in matching_candidates:
        segment_ref = match['resolved_ref']
        if segment_ref not in deduped or match.get('score', 0) > deduped[segment_ref].get('score', 0):
            deduped[segment_ref] = match

    deduped_matches = list(deduped.values())

    if len(deduped_matches) == 1:
        return deduped_matches[0]

    # Multiple matches - use LLM to choose best
    if marked_text:
        logger.info(f"Dicta found {len(deduped_matches)} unique segments, using LLM to choose best")
        chosen = _llm_choose_best_candidate(
            marked_text,
            deduped_matches,
            base_ref=base_ref,
            base_text=base_text,
            lang=lang,
        )
        if chosen:
            return chosen

    # Fallback: return first if no marked_text provided or LLM failed
    logger.info(f"Dicta found {len(deduped_matches)} unique segments, returning first")
    return deduped_matches[0]


def _query_dicta_raw(query_text: str) -> List[Dict[str, Any]]:
    """Query Dicta and return all results (not filtered by target ref)."""
    params = {
        'minthreshold': int(MIN_THRESHOLD),
        'maxdistance': int(MAX_DISTANCE)
    }
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://parallels.dicta.org.il',
        'Referer': 'https://parallels.dicta.org.il/'
    }

    try:
        resp = requests.post(
            DICTA_URL,
            params=params,
            data=f"text={query_text}".encode('utf-8'),
            headers=headers,
            timeout=REQUEST_TIMEOUT
        )
        resp.raise_for_status()

        # Handle UTF-8 BOM by decoding with utf-8-sig
        text = resp.content.decode('utf-8-sig')

        # Parse JSON
        import json
        data = json.loads(text)
    except Exception as e:
        logger.warning(f"Dicta API request failed: {e}")
        return []

    results = []
    for entry in data.get('results', []):
        for cand in entry.get('data', []):
            url = cand.get('url') or cand.get('compUrl') or ''
            normalized = _normalize_dicta_url_to_ref(url)
            if not normalized:
                continue

            try:
                oref = Ref(normalized)
                if oref.is_segment_level():
                    results.append({
                        'resolved_ref': normalized,
                        'score': cand.get('score'),
                        'raw': cand
                    })
            except Exception:
                continue

    return results


def _try_search_for_candidates(marked_text: str, candidates: List[Dict[str, Any]],
                               lang: str, base_ref: str = None, base_text: str = None) -> Optional[Dict[str, Any]]:
    """Generate search queries and check if results match candidates."""
    # Generate search queries
    queries = _llm_form_search_query(marked_text, base_ref, base_text)
    if not queries:
        logger.info("Could not generate search queries")
        return None

    logger.info(f"Generated {len(queries)} search queries: {queries}")

    matching_candidates = []
    seen_refs = set()

    for query in queries:
        # Query search (without target ref filter)
        result = _query_sefaria_search_raw(query)
        if not result:
            continue

        search_ref = result['resolved_ref']
        if search_ref in seen_refs:
            continue

        try:
            result_oref = Ref(search_ref)

            if not result_oref.is_segment_level():
                continue

            # Check if this result matches any candidate
            for cand in candidates:
                cand_oref = cand['oref']
                if cand_oref.contains(result_oref):
                    logger.info(f"Search result {search_ref} matches candidate {cand['ref']}")
                    seen_refs.add(search_ref)
                    matching_candidates.append({
                        'ref': cand['ref'],  # The candidate ref
                        'resolved_ref': search_ref,  # The specific segment from search
                        'query': query,
                        'raw': result
                    })
                    break
        except Exception:
            continue

    if not matching_candidates:
        logger.info("Search found no matches among candidates")
        return None

    # Dedupe by resolved_ref
    deduped = {}
    for match in matching_candidates:
        segment_ref = match['resolved_ref']
        if segment_ref not in deduped:
            deduped[segment_ref] = match

    deduped_matches = list(deduped.values())

    if len(deduped_matches) == 1:
        return deduped_matches[0]

    # Multiple matches - use LLM to choose best
    logger.info(f"Search found {len(deduped_matches)} unique segments, using LLM to choose best")
    chosen = _llm_choose_best_candidate(
        marked_text,
        deduped_matches,
        base_ref=base_ref,
        base_text=base_text,
        lang=lang,
    )

    if chosen:
        return chosen

    # Fallback: return first if LLM failed
    logger.warning(f"LLM failed to choose, returning first of {len(deduped_matches)} segments")
    return deduped_matches[0]


def _query_sefaria_search_raw(query_text: str, slop: int = 10) -> Optional[Dict[str, Any]]:
    """Query Sefaria search without filtering by target ref."""
    bool_query = {
        'must': {'match_phrase': {'naive_lemmatizer': {'query': query_text, 'slop': slop}}}
    }

    payload = {
        'from': 0,
        'size': 500,
        'highlight': {
            'pre_tags': ['<b>'],
            'post_tags': ['</b>'],
            'fields': {'naive_lemmatizer': {'fragment_size': 200}}
        },
        'query': {
            'function_score': {
                'field_value_factor': {'field': 'pagesheetrank', 'missing': 0.04},
                'query': {'bool': bool_query}
            }
        }
    }

    headers = {
        'Content-Type': 'application/json; charset=UTF-8',
        'Accept': 'application/json',
        'Origin': 'https://www.sefaria.org',
        'Referer': 'https://www.sefaria.org/texts'
    }

    try:
        resp = requests.post(SEFARIA_SEARCH_URL, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning(f"Sefaria search API request failed: {e}")
        return None

    hits = (data.get('hits') or {}).get('hits', [])

    for entry in hits:
        normalized = _extract_ref_from_search_hit(entry)
        if not normalized:
            continue

        try:
            cand_oref = Ref(normalized)
            if cand_oref.is_segment_level():
                return {
                    'resolved_ref': normalized,
                    'raw': entry
                }
        except Exception:
            continue

    return None


