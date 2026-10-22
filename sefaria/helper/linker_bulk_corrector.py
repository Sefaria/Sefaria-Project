import copy
import re
from dataclasses import dataclass, replace
from typing import Callable, Optional
from urllib.parse import unquote

from django.core.cache import cache

from sefaria.helper import linker_resource_panel_admin as panel_admin
from sefaria.helper.linker import tasks as linker_tasks
from sefaria.model import Ref, library, log_linker_editor_action
from sefaria.model.marked_up_text_chunk import LinkerOutput, LinkerOutputSet, MarkedUpTextChunk, MarkedUpTextChunkSet, MUTCSpanType
from sefaria.model.text import TextChunk, prepare_index_regex_for_dependency_process
from sefaria.system.exceptions import InputError, BookNameError


VALID_STATUSES = {"parsed", "unparsed", "ambiguous"}
VALID_LANGS = {"he", "en"}
SNIPPET_RADIUS = 300
SKIPPED_SAMPLE_SIZE = 10

# Fields of a stored citation span describing the linker's input. Re-parsing is built from these,
# so they carry over unchanged into the re-parsed span.
_INPUT_SPAN_FIELDS = (
    "text", "contextRef", "inputRefParts", "inputRefPartTypes", "inputRefPartClasses",
    "inputRangeSections", "inputRangeToSections",
)


@dataclass(frozen=True)
class CitationItem:
    ref: str
    versionTitle: str
    language: str
    charRange: tuple[int, int]
    spans: list[dict]
    order: str
    status: str


def _is_live_citation(span: dict) -> bool:
    return span.get("type") == MUTCSpanType.CITATION.value and not span.get("deleted")


def _order_id(tref: str) -> str:
    try:
        return Ref(tref).order_id()
    except Exception:
        return tref


# ---------------------------------------------------------------------------
# Dataset definition
# ---------------------------------------------------------------------------

_SEFARIA_URL_PREFIX_RE = re.compile(r'^(?:https?://)?(?:www\.)?sefaria\.org(?:\.il)?/', re.IGNORECASE)


def _strip_sefaria_url(text: str) -> str:
    """Turn a pasted Sefaria URL (or a bare, already URL-encoded ref segment) into a
    Ref()-parseable string: strips a sefaria.org(.il) domain prefix if present, drops
    any query string/fragment, and undoes percent-encoding (e.g. %2C -> ,)."""
    stripped = _SEFARIA_URL_PREFIX_RE.sub('', text.strip())
    stripped = stripped.split('?', 1)[0].split('#', 1)[0].strip('/')
    stripped = stripped.split('/', 1)[0]  # drop a trailing /<lang>/<version> path, if any
    return unquote(stripped)


def _resolve_book_title(text: str) -> Optional[tuple]:
    """Try to resolve `text` as a bare index title, then as a parseable ref.
    Returns (index, ref_or_None) on success, or None if neither resolves."""
    try:
        return library.get_index(text), None
    except BookNameError:
        pass
    try:
        ref = Ref(text)
    except InputError:
        return None
    return ref.index, ref


def _resolve_index_or_ref(book_title: str) -> tuple:
    """Resolve a dataset "bookTitle" field which may be a bare index title, any parseable ref,
    or a Sefaria URL / URL-encoded ref segment. Returns (index, ref) where ref is None when the
    input was a bare book title, and the ref the input resolved to otherwise (used to seed a
    "jump to this point in the book" search)."""
    resolved = _resolve_book_title(book_title) or _resolve_book_title(_strip_sefaria_url(book_title))
    if resolved is None:
        raise BookNameError(f'Unrecognized book title or ref: "{book_title}"')
    return resolved


def _parse_dataset_definition(raw: dict) -> tuple:
    if not isinstance(raw, dict):
        raise InputError("dataset must be an object")
    if raw.get("type") != "book":
        raise InputError("Only book datasets are supported")
    book_title = raw.get("bookTitle")
    if isinstance(book_title, str):
        book_title = book_title.strip()
    if not isinstance(book_title, str) or not book_title:
        raise InputError("Missing required field: dataset.bookTitle")
    index, jump_ref = _resolve_index_or_ref(book_title)
    lang = raw.get("lang") or None
    if lang is not None and lang not in VALID_LANGS:
        raise InputError("dataset.lang must be 'he', 'en', or null")
    statuses = raw.get("status") or ["unparsed"]
    if not isinstance(statuses, list):
        raise InputError("dataset.status must be a non-empty list")
    statuses = list(dict.fromkeys(statuses))
    invalid = [status for status in statuses if status not in VALID_STATUSES]
    if invalid:
        raise InputError(f"Unknown citation status: {', '.join(invalid)}")
    return {
        "type": "book",
        "bookTitle": index.title,
        "versionTitle": raw.get("versionTitle") or None,
        "lang": lang,
        "status": statuses,
    }, jump_ref


# ---------------------------------------------------------------------------
# Citation items (one per distinct ref/version/language/charRange)
# ---------------------------------------------------------------------------

def _book_query(dataset: dict) -> dict:
    index = library.get_index(dataset["bookTitle"])
    query = {"ref": {"$regex": prepare_index_regex_for_dependency_process(index)}}
    if dataset.get("versionTitle"):
        query["versionTitle"] = dataset["versionTitle"]
    if dataset.get("lang"):
        query["language"] = dataset["lang"]
    return query


def _citation_status(spans: list[dict]) -> str:
    if any(span.get("failed") for span in spans):
        return "unparsed"
    if any(span.get("ambiguous") for span in spans):
        return "ambiguous"
    return "parsed"


def _group_citation_spans(spans_by_key: dict) -> list[CitationItem]:
    """Group live citation spans by (ref, versionTitle, language, charRange); an ambiguous
    citation is stored as several spans sharing one charRange. Sorted in book order."""
    grouped: dict[tuple[str, str, str, tuple[int, int]], list[dict]] = {}
    for (ref, version_title, language), spans in spans_by_key.items():
        for span in spans:
            char_range = span.get("charRange")
            if not _is_live_citation(span) or not isinstance(char_range, list) or len(char_range) != 2:
                continue
            grouped.setdefault((ref, version_title, language, tuple(char_range)), []).append(span)

    items = [
        CitationItem(ref, version_title, language, char_range, spans, _order_id(ref), _citation_status(spans))
        for (ref, version_title, language, char_range), spans in grouped.items()
    ]
    return sorted(items, key=lambda item: (item.order, item.ref, item.versionTitle, item.language, item.charRange[0]))


def _item_from_linker_output(linker_output: Optional[LinkerOutput], ref: str, version_title: str,
                             language: str, char_range: list[int]) -> CitationItem:
    if not linker_output:
        raise InputError(f"No stored linker output found for {ref}, {language}, {version_title}")
    spans = [span for span in linker_output.spans if _is_live_citation(span) and span.get("charRange") == char_range]
    if not spans:
        raise InputError(f"No stored citation found for {ref} at {char_range}")
    return CitationItem(ref, version_title, language, tuple(char_range), spans, _order_id(ref), _citation_status(spans))


def _filtered_items(items: list[CitationItem], dataset: dict) -> list[CitationItem]:
    statuses = set(dataset["status"])
    return [item for item in items if item.status in statuses]


# ---------------------------------------------------------------------------
# Per-book cache
# ---------------------------------------------------------------------------

_ITEMS_CACHE_TTL = 600  # seconds; correctness relies on generation bumps below, this is just a safety net


def _items_cache_generation(book_title: str) -> int:
    return cache.get(f"lbc:items:gen:{book_title}") or 0


def _bump_items_cache_generation(book_title: str) -> None:
    """Invalidate every cached item list for this book (any versionTitle/lang combo).
    Called whenever a citation's stored spans change."""
    key = f"lbc:items:gen:{book_title}"
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, None)


def _dataset_cache_key(prefix: str, dataset: dict, gen: int) -> str:
    return f"{prefix}:{dataset['bookTitle']}:{dataset.get('versionTitle') or ''}:{dataset.get('lang') or ''}:{gen}"


def _cached_spans_by_key(dataset: dict) -> dict:
    """Map (ref, versionTitle, language) -> that segment's full span list, cached per book
    generation. This is the single Mongo fetch for the whole book; both the sorted item
    list and snippet rendering are derived from it."""
    cache_key = _dataset_cache_key("lbc:docspans", dataset, _items_cache_generation(dataset["bookTitle"]))
    spans_by_key = cache.get(cache_key)
    if spans_by_key is None:
        spans_by_key = {(doc.ref, doc.versionTitle, doc.language): doc.spans for doc in LinkerOutputSet(_book_query(dataset))}
        cache.set(cache_key, spans_by_key, _ITEMS_CACHE_TTL)
    return spans_by_key


def _full_grouped_items(dataset: dict) -> list[CitationItem]:
    cache_key = _dataset_cache_key("lbc:items", dataset, _items_cache_generation(dataset["bookTitle"]))
    items = cache.get(cache_key)
    if items is None:
        items = _group_citation_spans(_cached_spans_by_key(dataset))
        cache.set(cache_key, items, _ITEMS_CACHE_TTL)
    return items


# ---------------------------------------------------------------------------
# Parsing and serialization
# ---------------------------------------------------------------------------

def _flattened_ref_parts(span: dict) -> list[dict]:
    """A stored span's input ref parts with each RANGE part expanded into its NUMBERED sections,
    a RANGE_SYMBOL and its NUMBERED to-sections, so RawRef can regroup them when re-parsed."""
    parts = []
    input_types = span.get("inputRefPartTypes") or []
    for i, text in enumerate(span.get("inputRefParts") or []):
        part_type = input_types[i] if i < len(input_types) else None
        if part_type == "RANGE":
            parts.extend({"text": section, "type": "NUMBERED"} for section in span.get("inputRangeSections") or [])
            parts.append({"text": "-", "type": "RANGE_SYMBOL"})
            parts.extend({"text": section, "type": "NUMBERED"} for section in span.get("inputRangeToSections") or [])
        else:
            parts.append({"text": text, "type": part_type})
    return [part for part in parts if part.get("text") and part.get("type")]


def _parse_payload(item: CitationItem) -> dict:
    span = item.spans[0]
    parts = _flattened_ref_parts(span)
    if not parts:
        raise InputError("Stored citation is missing input ref parts")
    return {
        "parts": parts,
        "lang": item.language,
        "contextRef": span.get("contextRef"),
        "prevRefs": [],
    }


def _valid_parsings(parse_result: dict) -> list[dict]:
    return [parsing for parsing in parse_result.get("parsings") or [] if parsing.get("valid") and parsing.get("ref")]


def _status_from_parse_result(parse_result: dict) -> str:
    valid = _valid_parsings(parse_result)
    if not valid:
        return "unparsed"
    return "ambiguous" if len(valid) > 1 else "parsed"


def _parsed_ref_from_parse_result(parse_result: dict) -> Optional[str]:
    valid = _valid_parsings(parse_result)
    return valid[0]["ref"] if len(valid) == 1 else None


def _spans_from_parse_result(item: CitationItem, parse_result: dict) -> list[dict]:
    """LinkerOutput citation spans for `item` reflecting `parse_result`: one span per valid
    parsing, or a single failed span when nothing resolved."""
    source = item.spans[0]
    status = _status_from_parse_result(parse_result)
    base = {field: source[field] for field in _INPUT_SPAN_FIELDS if field in source}
    base.update({
        "charRange": list(item.charRange),
        "type": MUTCSpanType.CITATION.value,
        "failed": status == "unparsed",
        "ambiguous": status == "ambiguous",
    })
    parsings = parse_result.get("parsings") or []
    new_spans = []
    for parsing in _valid_parsings(parse_result) or parsings[:1] or [{}]:
        span = copy.deepcopy(base)
        span["ref"] = parsing.get("ref")
        span["contextType"] = parsing.get("contextType")
        if parsing.get("disqualificationReason"):
            span["disqualificationReason"] = parsing["disqualificationReason"]
        matched_parts = [part for pairing in parsing.get("pairings") or [] for part in pairing.get("parts") or []]
        if matched_parts:
            span["resolvedRefParts"] = [part.get("text") for part in matched_parts]
            span["resolvedRefPartTypes"] = [part.get("type") for part in matched_parts]
            span["resolvedRefPartClasses"] = [part.get("class") for part in matched_parts]
        new_spans.append(span)
    return new_spans


def _item_with_fresh_status(item: CitationItem, parse_result: dict) -> CitationItem:
    """Display-only copy of `item` whose spans/status reflect `parse_result`; nothing is persisted."""
    return replace(item, spans=_spans_from_parse_result(item, parse_result), status=_status_from_parse_result(parse_result))


def _mark_snippet_anchors(html: str, focused_range: str) -> str:
    # Matches the <a class="refLink ..." ... data-range=start-end> markup produced by
    # CitationMUTCSpan.wrap_span_in_a_tag (sefaria/model/marked_up_text_chunk.py).
    def repl(match):
        marker = "lbcFocusedCitation" if match.group("range") == focused_range else "lbcContextCitation"
        return f'<a class="refLink {marker} {match.group("classes")}"{match.group("attrs")}>'

    return re.sub(
        r'<a class="refLink (?P<classes>[^"]+)"(?P<attrs>[^>]*data-range=(?P<range>\d+-\d+)[^>]*)>',
        repl,
        html,
    )


def _render_citation_snippet(item: CitationItem, segment_spans: list[dict]) -> dict:
    """HTML for the text around `item`, with every citation fully inside the window highlighted.
    `segment_spans` are the segment's other stored spans; `item.spans` win at its own charRange."""
    text = TextChunk(Ref(item.ref), lang=item.language, vtitle=item.versionTitle).text or ""
    start, end = item.charRange
    window_start = max(0, start - SNIPPET_RADIUS)
    window_end = min(len(text), end + SNIPPET_RADIUS)

    spans_by_range = {}
    for span in segment_spans:
        span_start, span_end = span.get("charRange") or [None, None]
        if not _is_live_citation(span) or span_start is None or span_start < window_start or span_end > window_end:
            continue
        spans_by_range.setdefault((span_start, span_end), span)
    for span in item.spans:
        spans_by_range[tuple(span["charRange"])] = span

    rebased_spans = []
    for (span_start, span_end), span in spans_by_range.items():
        rebased = copy.deepcopy(span)
        rebased["charRange"] = [span_start - window_start, span_end - window_start]
        rebased_spans.append(rebased)
    snippet_chunk = LinkerOutput({
        "ref": item.ref,
        "versionTitle": item.versionTitle,
        "language": item.language,
        "spans": rebased_spans,
    })
    html = snippet_chunk.apply_spans_to_text(text[window_start:window_end])
    return {"html": _mark_snippet_anchors(html, f"{start - window_start}-{end - window_start}")}


def _serialize_citation_result(item: CitationItem, segment_spans: list[dict], parse_result: dict) -> dict:
    return {
        "ref": item.ref,
        "versionTitle": item.versionTitle,
        "language": item.language,
        "charRange": list(item.charRange),
        "status": item.status,
        "snippet": _render_citation_snippet(item, segment_spans),
        "refParts": _flattened_ref_parts(item.spans[0]),
        "parsings": parse_result.get("parsings") or [],
    }


def _live_result(item: CitationItem, dataset: dict) -> dict:
    """Live-parse `item` (without persisting) and serialize it with its fresh status."""
    parse_result = panel_admin.parse_linker_citation_sync(_parse_payload(item))
    segment_spans = _cached_spans_by_key(dataset).get((item.ref, item.versionTitle, item.language)) or []
    return _serialize_citation_result(_item_with_fresh_status(item, parse_result), segment_spans, parse_result)


# ---------------------------------------------------------------------------
# Search / navigate
# ---------------------------------------------------------------------------

def _jump_order_id(ref: Ref) -> str:
    if ref.is_spanning():
        ref = ref.first_spanned_ref()
    if ref.is_range():
        ref = ref.starting_ref()
    return ref.order_id()


def _normalize_page(raw_page) -> int:
    try:
        page = int(raw_page or 0)
    except (TypeError, ValueError):
        raise InputError("page must be an integer")
    if page < 0:
        raise InputError("page must be non-negative")
    return page


def search_citations(payload: dict) -> dict:
    """Load the citation at position `page` of the status-filtered dataset. When the dataset's
    bookTitle is a ref rather than a bare title, jump to the first citation at or after it."""
    dataset, jump_ref = _parse_dataset_definition(payload.get("dataset"))
    page = _normalize_page(payload.get("page"))
    all_items = _full_grouped_items(dataset)
    filtered = _filtered_items(all_items, dataset)

    stats = {
        "totalCitations": len(all_items),
        "parsedCitations": sum(1 for item in all_items if item.status == "parsed"),
    }
    if jump_ref is not None:
        jump_order = _jump_order_id(jump_ref)
        stats["citationsPassed"] = sum(1 for item in all_items if item.order < jump_order)
        page = next((i for i, item in enumerate(filtered) if item.order >= jump_order), len(filtered))

    return {
        "dataset": dataset,
        "page": page,
        "total": len(filtered),
        "stats": stats,
        "result": _live_result(filtered[page], dataset) if page < len(filtered) else None,
    }


def _cursor_key(cursor: Optional[dict]) -> Optional[tuple[str, tuple[int, int]]]:
    if not cursor:
        return None
    if not cursor.get("ref"):
        raise InputError("cursor must include ref and charRange")
    return cursor["ref"], tuple(panel_admin.normalize_char_range(cursor.get("charRange")))


def _cursor_index(items: list[CitationItem], cursor: tuple[str, tuple[int, int]]) -> Optional[int]:
    ref, char_range = cursor
    return next((i for i, item in enumerate(items) if item.ref == ref and item.charRange == char_range), None)


def navigate_dataset(payload: dict) -> dict:
    """Step to the next/previous item whose stored status matches the filter, or reload the
    cursor's own item ("current"). The landed-on item is live-parsed for display (not persisted).

    The cursor is located in the full (unfiltered) item list, not the status-filtered one:
    re-parsing the current citation can flip its status so it no longer matches the filter,
    and it must still be found so navigation continues from where the user was."""
    dataset, _ = _parse_dataset_definition(payload.get("dataset"))
    direction = payload.get("direction")
    if direction not in {"forward", "backward", "current"}:
        raise InputError("direction must be 'forward', 'backward', or 'current'")
    all_items = _full_grouped_items(dataset)
    statuses = set(dataset["status"])
    cursor = _cursor_key(payload.get("cursor"))
    cursor_index = _cursor_index(all_items, cursor) if cursor else None

    def landed(index: int) -> dict:
        return {
            "found": True,
            "item": _live_result(all_items[index], dataset),
            "position": sum(1 for item in all_items[:index] if item.status in statuses),
        }

    if direction == "current":
        return landed(cursor_index) if cursor_index is not None else {"found": False}

    step = 1 if direction == "forward" else -1
    if cursor_index is None:
        cursor_index = -1 if direction == "forward" else len(all_items)
    current = cursor_index + step
    while 0 <= current < len(all_items):
        if all_items[current].status in statuses:
            return landed(current)
        current += step
    return {"found": False}


# ---------------------------------------------------------------------------
# Re-parse and persist
# ---------------------------------------------------------------------------

def _replace_live_citations_at(chunk, char_range: list[int], new_spans: list[dict]) -> None:
    original = chunk.spans
    kept = [span for span in original if not (_is_live_citation(span) and span.get("charRange") == char_range)]
    if kept == original and not new_spans:
        return
    chunk.spans = kept + new_spans
    if chunk.spans:
        chunk.save()
    else:
        chunk.delete()


def _other_backing_spans_exist(item: CitationItem, target_ref: str) -> bool:
    """Whether any other citation in the citing segment (any version) still points at `target_ref`."""
    for mutc in MarkedUpTextChunkSet({"ref": item.ref}):
        is_same_version = mutc.versionTitle == item.versionTitle and mutc.language == item.language
        for span in mutc.spans:
            if not _is_live_citation(span) or span.get("ref") != target_ref:
                continue
            if is_same_version and tuple(span.get("charRange") or ()) == item.charRange:
                continue
            return True
    return False


def _update_generated_links(item: CitationItem, old_refs: set[str], new_ref: Optional[str], user_id: Optional[int]) -> None:
    if new_ref:
        linker_tasks._create_link_for_resolution(item.ref, new_ref)  # no-op if the link already exists
    stale_refs = {ref for ref in old_refs if ref != new_ref and not _other_backing_spans_exist(item, ref)}
    panel_admin.delete_generated_links(item.ref, stale_refs, user_id)


def _reparse_and_persist(ref: str, version_title: str, language: str, char_range: list[int],
                         user_id: Optional[int], parse: Callable[[dict], dict]) -> tuple:
    """Re-parse one stored citation with `parse` and write the result to its LinkerOutput,
    MarkedUpTextChunk and generated links. Doesn't invalidate the per-book cache; callers do.
    Returns (updated item, the segment's LinkerOutput spans, parse result)."""
    chunks = panel_admin.load_chunks(ref, version_title, language)
    linker_output = chunks[LinkerOutput]
    item = _item_from_linker_output(linker_output, ref, version_title, language, char_range)
    parse_result = parse(_parse_payload(item))
    new_spans = _spans_from_parse_result(item, parse_result)
    parsed_ref = _parsed_ref_from_parse_result(parse_result)

    _replace_live_citations_at(linker_output, char_range, new_spans)

    mutc_spans = [{
        "charRange": char_range,
        "text": item.spans[0].get("text"),
        "type": MUTCSpanType.CITATION.value,
        "ref": parsed_ref,
    }] if parsed_ref else []
    mutc = chunks[MarkedUpTextChunk]
    if mutc:
        _replace_live_citations_at(mutc, char_range, mutc_spans)
    elif mutc_spans:
        MarkedUpTextChunk({"ref": ref, "versionTitle": version_title, "language": language, "spans": mutc_spans}).save()

    old_refs = {span["ref"] for span in item.spans if span.get("ref")}
    _update_generated_links(item, old_refs, parsed_ref, user_id)
    updated_item = replace(item, spans=new_spans, status=_citation_status(new_spans))
    return updated_item, linker_output.spans, parse_result


def reparse_citation(payload: dict, user_id: Optional[int]) -> dict:
    ref = Ref(panel_admin.required_field(payload, "ref")).normal()
    version_title = panel_admin.required_field(payload, "versionTitle")
    language = panel_admin.required_field(payload, "language")
    char_range = panel_admin.normalize_char_range(panel_admin.required_field(payload, "charRange"))
    item, segment_spans, parse_result = _reparse_and_persist(
        ref, version_title, language, char_range, user_id, panel_admin.parse_linker_citation_sync,
    )
    _bump_items_cache_generation(Ref(ref).index.title)
    return _serialize_citation_result(item, segment_spans, parse_result)


def enqueue_bulk_reparse_dataset(payload: dict, user_id: Optional[int]) -> dict:
    dataset, _ = _parse_dataset_definition(payload.get("dataset"))
    from sefaria.celery_setup.config import CeleryQueue
    async_result = linker_tasks.bulk_reparse_dataset_task.apply_async(args=(dataset, user_id), queue=CeleryQueue.TASKS.value)
    return {"task_id": async_result.id}


def bulk_reparse_dataset(dataset: dict, user_id: Optional[int] = None, task=None) -> dict:
    """Runs on a Celery worker (see bulk_reparse_dataset_task): re-parse and persist every
    citation in the status-filtered dataset, reporting progress via task state."""
    dataset, _ = _parse_dataset_definition(dataset)
    items = _filtered_items(_full_grouped_items(dataset), dataset)
    skipped = []

    def progress(current: int) -> dict:
        return {"current": current, "total": len(items), "skipped": len(skipped), "skippedSample": skipped[:SKIPPED_SAMPLE_SIZE]}

    if task:
        task.update_state(state="PROGRESS", meta=progress(0))
    try:
        for i, item in enumerate(items, start=1):
            try:
                _reparse_and_persist(item.ref, item.versionTitle, item.language, list(item.charRange),
                                     user_id, panel_admin.parse_linker_citation)
            except InputError as e:
                skipped.append({
                    "ref": item.ref,
                    "versionTitle": item.versionTitle,
                    "language": item.language,
                    "charRange": list(item.charRange),
                    "error": str(e),
                })
            if task:
                task.update_state(state="PROGRESS", meta=progress(i))
    finally:
        _bump_items_cache_generation(dataset["bookTitle"])

    log_linker_editor_action(user_id, "bulk_reparse_dataset", {"dataset": dataset, **progress(len(items))},
                             index_title=dataset["bookTitle"])
    return {"ok": True, **progress(len(items)), "dataset": dataset}
