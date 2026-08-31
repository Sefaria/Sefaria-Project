import copy
import re
from dataclasses import dataclass
from typing import Optional

from sefaria import tracker
from sefaria.helper import linker_resource_panel_admin
from sefaria.helper.linker import tasks as linker_tasks
from sefaria.model import Link, LinkSet, Ref, library, log_linker_editor_action
from sefaria.model.marked_up_text_chunk import LinkerOutput, LinkerOutputSet, MarkedUpTextChunk, MarkedUpTextChunkSet, MUTCSpanType
from sefaria.model.text import TextChunk, prepare_index_regex_for_dependency_process
from sefaria.system.exceptions import InputError


VALID_STATUSES = {"parsed", "unparsed", "ambiguous"}
VALID_LANGS = {"he", "en"}
NAVIGATION_SCAN_LIMIT = 200
SNIPPET_RADIUS = 300


@dataclass(frozen=True)
class CitationItem:
    ref: str
    versionTitle: str
    language: str
    charRange: tuple[int, int]
    spans: list[dict]
    order: str
    status: str


def parse_dataset_definition(raw: dict) -> dict:
    if not isinstance(raw, dict):
        raise InputError("dataset must be an object")
    dataset_type = raw.get("type")
    if dataset_type != "book":
        raise InputError("Only book datasets are supported")
    book_title = raw.get("bookTitle")
    if isinstance(book_title, str):
        book_title = book_title.strip()
    if not isinstance(book_title, str) or not book_title:
        raise InputError("Missing required field: dataset.bookTitle")
    index = library.get_index(book_title)
    version_title = raw.get("versionTitle")
    if version_title == "":
        version_title = None
    lang = raw.get("lang")
    if lang == "":
        lang = None
    if lang is not None and lang not in VALID_LANGS:
        raise InputError("dataset.lang must be 'he', 'en', or null")
    statuses = raw.get("status") or ["unparsed"]
    if not isinstance(statuses, list) or not statuses:
        raise InputError("dataset.status must be a non-empty list")
    statuses = list(dict.fromkeys(statuses))
    invalid = [status for status in statuses if status not in VALID_STATUSES]
    if invalid:
        raise InputError(f"Unknown citation status: {', '.join(invalid)}")
    return {
        "type": "book",
        "bookTitle": index.title,
        "versionTitle": version_title,
        "lang": lang,
        "status": statuses,
    }


def _book_query(dataset: dict) -> dict:
    index = library.get_index(dataset["bookTitle"])
    query = {"ref": {"$regex": prepare_index_regex_for_dependency_process(index)}}
    if dataset.get("versionTitle"):
        query["versionTitle"] = dataset["versionTitle"]
    if dataset.get("lang"):
        query["language"] = dataset["lang"]
    return query


def resolve_book_dataset_docs(dataset: dict) -> list[LinkerOutput]:
    return list(LinkerOutputSet(_book_query(dataset)))


def _citation_status(spans: list[dict]) -> str:
    if any(span.get("failed") for span in spans):
        return "unparsed"
    if any(span.get("ambiguous") for span in spans):
        return "ambiguous"
    return "parsed"


def group_citation_spans(docs: list[LinkerOutput]) -> list[CitationItem]:
    grouped: dict[tuple[str, str, str, tuple[int, int]], list[dict]] = {}
    for doc in docs:
        for span in doc.spans:
            if span.get("type") != MUTCSpanType.CITATION.value or span.get("deleted"):
                continue
            char_range = span.get("charRange")
            if not isinstance(char_range, list) or len(char_range) != 2:
                continue
            key = (doc.ref, doc.versionTitle, doc.language, tuple(char_range))
            grouped.setdefault(key, []).append(span)

    items = []
    for (ref, version_title, language, char_range), spans in grouped.items():
        try:
            order = Ref(ref).order_id()
        except Exception:
            order = ref
        items.append(CitationItem(
            ref=ref,
            versionTitle=version_title,
            language=language,
            charRange=char_range,
            spans=spans,
            order=order,
            status=_citation_status(spans),
        ))
    return sorted(items, key=lambda item: (item.order, item.ref, item.versionTitle, item.language, item.charRange[0]))


def _full_grouped_items(dataset: dict) -> list[CitationItem]:
    return group_citation_spans(resolve_book_dataset_docs(dataset))


def _stats(items: list[CitationItem]) -> dict:
    return {
        "totalCitations": len(items),
        "parsedCitations": sum(1 for item in items if item.status == "parsed"),
    }


def _filtered_items(items: list[CitationItem], dataset: dict) -> list[CitationItem]:
    statuses = set(dataset["status"])
    return [item for item in items if item.status in statuses]


def _normalize_page(raw_page) -> int:
    try:
        page = int(raw_page or 0)
    except (TypeError, ValueError):
        raise InputError("page must be an integer")
    if page < 0:
        raise InputError("page must be non-negative")
    return page


def _normalize_page_size(raw_page_size) -> int:
    try:
        page_size = int(raw_page_size or 1)
    except (TypeError, ValueError):
        raise InputError("pageSize must be an integer")
    if page_size < 1 or page_size > 100:
        raise InputError("pageSize must be between 1 and 100")
    return page_size


def search_citations(payload: dict) -> dict:
    dataset = parse_dataset_definition(payload.get("dataset"))
    page = _normalize_page(payload.get("page"))
    page_size = _normalize_page_size(payload.get("pageSize"))
    all_items = _full_grouped_items(dataset)
    filtered = _filtered_items(all_items, dataset)
    start = page * page_size
    page_items = filtered[start:start + page_size]
    parse_results = linker_resource_panel_admin.parse_linker_citations_batch_sync([
        _parts_payload_from_item(item) for item in page_items
    ]) if page_items else []
    return {
        "dataset": dataset,
        "page": page,
        "pageSize": page_size,
        "total": len(filtered),
        "stats": _stats(all_items),
        "results": [
            serialize_citation_result(item, parse_result)
            for item, parse_result in zip(page_items, parse_results)
        ],
    }


def render_citation_snippet(item: CitationItem) -> dict:
    tc = TextChunk(Ref(item.ref), lang=item.language, vtitle=item.versionTitle)
    text = tc.text or ""
    start, end = item.charRange
    window_start = max(0, start - SNIPPET_RADIUS)
    window_end = min(len(text), end + SNIPPET_RADIUS)
    snippet_text = text[window_start:window_end]

    linker_output = LinkerOutput().load({
        "ref": item.ref,
        "versionTitle": item.versionTitle,
        "language": item.language,
    })
    source_spans = linker_output.spans if linker_output else item.spans
    spans_by_range = {}
    for span in source_spans:
        if span.get("type") != MUTCSpanType.CITATION.value or span.get("deleted"):
            continue
        span_start, span_end = span.get("charRange") or [None, None]
        if span_start is None or span_end is None or span_end <= window_start or span_start >= window_end:
            continue
        key = tuple(span["charRange"])
        spans_by_range.setdefault(key, span)

    # Ensure the focused citation's own span representation wins when the same charRange has
    # several ambiguous candidates.
    for span in item.spans:
        spans_by_range[tuple(span["charRange"])] = span

    spans = []
    for span in spans_by_range.values():
        rebased = copy.deepcopy(span)
        rebased["charRange"] = [span["charRange"][0] - window_start, span["charRange"][1] - window_start]
        spans.append(rebased)
    debug_chunk = LinkerOutput({
        "ref": item.ref,
        "versionTitle": item.versionTitle,
        "language": item.language,
        "spans": spans,
    })
    focused_range = f"{start - window_start}-{end - window_start}"
    return {"html": _mark_snippet_anchors(debug_chunk.apply_spans_to_text(snippet_text), focused_range)}


def _mark_snippet_anchors(html: str, focused_range: str) -> str:
    def repl(match):
        classes = match.group("classes")
        range_value = match.group("range")
        marker = "lbcFocusedCitation" if range_value == focused_range else "lbcContextCitation"
        return f'<a class="refLink {marker} {classes}"{match.group("attrs")}>'

    return re.sub(
        r'<a class="refLink (?P<classes>[^"]+)"(?P<attrs>[^>]*data-range=(?P<range>\d+-\d+)[^>]*)>',
        repl,
        html,
    )


def _parts_payload_from_span(span: dict, language: str) -> dict:
    parts = []
    input_parts = span.get("inputRefParts") or []
    input_types = span.get("inputRefPartTypes") or []
    for i, text in enumerate(input_parts):
        part_type = input_types[i] if i < len(input_types) else None
        if part_type == "RANGE":
            sections = span.get("inputRangeSections") or []
            to_sections = span.get("inputRangeToSections") or []
            parts.extend({"text": section, "type": "NUMBERED"} for section in sections)
            parts.append({"text": "-", "type": "RANGE_SYMBOL"})
            parts.extend({"text": section, "type": "NUMBERED"} for section in to_sections)
            continue
        parts.append({"text": text, "type": part_type})
    parts = [part for part in parts if part.get("text") and part.get("type")]
    if not parts:
        raise InputError("Stored citation is missing input ref parts")
    return {
        "parts": parts,
        "lang": language,
        "contextRef": span.get("contextRef"),
        "prevRefs": [],
    }


def _parts_payload_from_item(item: CitationItem) -> dict:
    return _parts_payload_from_span(item.spans[0], item.language)


def _status_from_parse_result(parse_result: dict) -> str:
    parsings = parse_result.get("parsings") or []
    valid = [parsing for parsing in parsings if parsing.get("valid") and parsing.get("ref")]
    if not valid:
        return "unparsed"
    if len(valid) > 1:
        return "ambiguous"
    return "parsed"


def _ref_parts(parse_result: dict) -> list[dict]:
    return parse_result.get("input", {}).get("parts") or []


def serialize_citation_result(item: CitationItem, parse_result: Optional[dict] = None) -> dict:
    parse_result = parse_result or {"input": {"parts": []}, "parsings": []}
    return {
        "ref": item.ref,
        "versionTitle": item.versionTitle,
        "language": item.language,
        "charRange": list(item.charRange),
        "status": item.status,
        "snippet": render_citation_snippet(item),
        "refParts": _ref_parts(parse_result),
        "parsings": parse_result.get("parsings") or [],
    }


def _cursor_key(cursor: dict) -> Optional[tuple[str, tuple[int, int]]]:
    if not cursor:
        return None
    ref = cursor.get("ref")
    char_range = cursor.get("charRange")
    if isinstance(char_range, str):
        char_range = char_range.split("-")
    if not ref or not isinstance(char_range, list) or len(char_range) != 2:
        raise InputError("cursor must include ref and charRange")
    try:
        return ref, (int(char_range[0]), int(char_range[1]))
    except (TypeError, ValueError):
        raise InputError("cursor.charRange values must be integers")


def _cursor_for_item(item: CitationItem) -> dict:
    return {"ref": item.ref, "charRange": list(item.charRange)}


def _cursor_matches(item: CitationItem, key: tuple[str, tuple[int, int]]) -> bool:
    return item.ref == key[0] and item.charRange == key[1]


def navigate_dataset(payload: dict) -> dict:
    dataset = parse_dataset_definition(payload.get("dataset"))
    direction = payload.get("direction")
    if direction not in {"forward", "backward"}:
        raise InputError("direction must be 'forward' or 'backward'")
    items = _full_grouped_items(dataset)
    if not items:
        return {"found": False, "continuationCursor": None, "checked": 0}
    cursor = _cursor_key(payload.get("cursor") or {})
    if cursor is None:
        idx = -1 if direction == "forward" else len(items)
    else:
        matching_indices = [i for i, item in enumerate(items) if _cursor_matches(item, cursor)]
        idx = matching_indices[0] if matching_indices else (-1 if direction == "forward" else len(items))

    step = 1 if direction == "forward" else -1
    current = idx + step
    checked = 0
    last_scanned = None
    while 0 <= current < len(items) and checked < NAVIGATION_SCAN_LIMIT:
        item = items[current]
        parse_result = linker_resource_panel_admin.parse_linker_citation_sync(_parts_payload_from_item(item))
        fresh_status = _status_from_parse_result(parse_result)
        fresh_item = CitationItem(
            ref=item.ref,
            versionTitle=item.versionTitle,
            language=item.language,
            charRange=item.charRange,
            spans=item.spans,
            order=item.order,
            status=fresh_status,
        )
        persist_citation_resolution(item.ref, item.versionTitle, item.language, list(item.charRange), parse_result)
        checked += 1
        last_scanned = item
        if fresh_status in set(dataset["status"]):
            return {
                "found": True,
                "item": serialize_citation_result(fresh_item, parse_result),
                "position": current,
                "checked": checked,
            }
        current += step
    return {
        "found": False,
        "continuationCursor": _cursor_for_item(last_scanned) if last_scanned else None,
        "checked": checked,
    }


def _load_item(ref: str, version_title: str, language: str, char_range: list[int]) -> CitationItem:
    linker_output = LinkerOutput().load({"ref": ref, "versionTitle": version_title, "language": language})
    if not linker_output:
        raise InputError(f"No stored linker output found for {ref}, {language}, {version_title}")
    spans = [
        span for span in linker_output.spans
        if span.get("type") == MUTCSpanType.CITATION.value
        and span.get("charRange") == char_range
        and not span.get("deleted")
    ]
    if not spans:
        raise InputError(f"No stored citation found for {ref} at {char_range}")
    try:
        order = Ref(ref).order_id()
    except Exception:
        order = ref
    return CitationItem(ref, version_title, language, tuple(char_range), spans, order, _citation_status(spans))


def reparse_citation(payload: dict) -> dict:
    ref = Ref(linker_resource_panel_admin._required(payload, "ref")).normal()
    version_title = linker_resource_panel_admin._required(payload, "versionTitle")
    language = linker_resource_panel_admin._required(payload, "language" if "language" in payload else "lang")
    char_range = linker_resource_panel_admin._normalize_char_range(linker_resource_panel_admin._required(payload, "charRange"))
    item = _load_item(ref, version_title, language, char_range)
    parse_result = linker_resource_panel_admin.parse_linker_citation_sync(_parts_payload_from_item(item))
    return persist_citation_resolution(ref, version_title, language, char_range, parse_result)


def _debug_spans_from_parse_result(item: CitationItem, parse_result: dict) -> list[dict]:
    parts = parse_result.get("input", {}).get("parts") or []
    parsings = parse_result.get("parsings") or []
    valid = [parsing for parsing in parsings if parsing.get("valid") and parsing.get("ref")]
    status = _status_from_parse_result(parse_result)
    span_text = item.spans[0].get("text")
    base = {
        "charRange": list(item.charRange),
        "text": span_text,
        "type": MUTCSpanType.CITATION.value,
        "failed": status == "unparsed",
        "ambiguous": status == "ambiguous",
        "inputRefParts": [part.get("text") for part in parts],
        "inputRefPartTypes": [part.get("type") for part in parts],
        "inputRefPartClasses": [part.get("class") for part in parts],
        "contextRef": parse_result.get("input", {}).get("contextRef"),
        "contextType": None,
    }
    new_spans = []
    source_parsings = valid if valid else (parsings[:1] or [{}])
    for parsing in source_parsings:
        span = copy.deepcopy(base)
        span["ref"] = parsing.get("ref")
        if parsing.get("disqualificationReason"):
            span["disqualificationReason"] = parsing.get("disqualificationReason")
        pairings = parsing.get("pairings") or []
        matched_parts = [part for pairing in pairings for part in (pairing.get("parts") or [])]
        if matched_parts:
            span["resolvedRefParts"] = [part.get("text") for part in matched_parts]
            span["resolvedRefPartTypes"] = [part.get("type") for part in matched_parts]
            span["resolvedRefPartClasses"] = [part.get("class") for part in matched_parts]
        new_spans.append(span)
    return new_spans


def _parsed_ref_from_parse_result(parse_result: dict) -> Optional[str]:
    valid = [parsing for parsing in (parse_result.get("parsings") or []) if parsing.get("valid") and parsing.get("ref")]
    if len(valid) == 1:
        return valid[0]["ref"]
    return None


def _replace_spans_at_char_range(chunk, char_range: list[int], new_spans: list[dict]) -> bool:
    original = chunk.spans
    kept = [
        span for span in original
        if not (span.get("type") == MUTCSpanType.CITATION.value and span.get("charRange") == char_range)
    ]
    if kept == original and not new_spans:
        return False
    chunk.spans = kept + new_spans
    if chunk.spans:
        chunk.save()
    else:
        chunk.delete()
    return True


def _other_backing_spans_exist(citing_ref: str, version_title: str, language: str, char_range: list[int], target_ref: str) -> bool:
    for mutc in MarkedUpTextChunkSet({"ref": citing_ref}):
        for span in mutc.spans:
            if span.get("type") != MUTCSpanType.CITATION.value or span.get("deleted"):
                continue
            if mutc.versionTitle == version_title and mutc.language == language and span.get("charRange") == char_range:
                continue
            if span.get("ref") == target_ref:
                return True
    return False


def _update_generated_link(citing_ref: str, old_refs: set[str], new_ref: Optional[str], version_title: str, language: str, char_range: list[int]) -> None:
    old_refs.discard(None)
    if new_ref:
        existing_new = Link().load({"refs": {"$all": [citing_ref, new_ref]}, "generated_by": "add_links_from_text"})
        if not existing_new:
            reusable = None
            for old_ref in old_refs:
                reusable = Link().load({"refs": {"$all": [citing_ref, old_ref]}, "generated_by": "add_links_from_text"})
                if reusable:
                    break
            if reusable:
                reusable.refs = sorted([citing_ref, new_ref])
                reusable.save()
            else:
                linker_tasks._create_link_for_resolution(citing_ref, new_ref)
    for old_ref in old_refs:
        if old_ref == new_ref or _other_backing_spans_exist(citing_ref, version_title, language, char_range, old_ref):
            continue
        for link in LinkSet({"refs": {"$all": [citing_ref, old_ref]}, "generated_by": "add_links_from_text"}):
            tracker.delete(None, Link, link._id)


def persist_citation_resolution(ref: str, versionTitle: str, language: str, charRange: list[int], parse_result: dict) -> dict:
    item = _load_item(ref, versionTitle, language, charRange)
    new_debug_spans = _debug_spans_from_parse_result(item, parse_result)
    parsed_ref = _parsed_ref_from_parse_result(parse_result)
    old_refs = {span.get("ref") for span in item.spans if span.get("ref")}

    query = {"ref": ref, "versionTitle": versionTitle, "language": language}
    linker_output = LinkerOutput().load(query)
    _replace_spans_at_char_range(linker_output, charRange, new_debug_spans)

    mutc = MarkedUpTextChunk().load(query)
    if mutc:
        mutc_span = []
        if parsed_ref:
            mutc_span = [{
                "charRange": charRange,
                "text": item.spans[0].get("text"),
                "type": MUTCSpanType.CITATION.value,
                "ref": parsed_ref,
            }]
        _replace_spans_at_char_range(mutc, charRange, mutc_span)
    elif parsed_ref:
        MarkedUpTextChunk({
            "ref": ref,
            "versionTitle": versionTitle,
            "language": language,
            "spans": [{
                "charRange": charRange,
                "text": item.spans[0].get("text"),
                "type": MUTCSpanType.CITATION.value,
                "ref": parsed_ref,
            }],
        }).save()

    _update_generated_link(ref, old_refs, parsed_ref, versionTitle, language, charRange)
    fresh_item = _load_item(ref, versionTitle, language, charRange)
    return serialize_citation_result(fresh_item, parse_result)


def enqueue_bulk_reparse_dataset(payload: dict, user_id: Optional[int]) -> dict:
    dataset = parse_dataset_definition(payload.get("dataset"))
    from sefaria.celery_setup.config import CeleryQueue
    async_result = linker_tasks.bulk_reparse_dataset_task.apply_async(args=(dataset, user_id), queue=CeleryQueue.TASKS.value)
    return {"task_id": async_result.id}


def bulk_reparse_dataset(dataset: dict, user_id: Optional[int] = None, task=None) -> dict:
    dataset = parse_dataset_definition(dataset)
    items = _filtered_items(_full_grouped_items(dataset), dataset)
    total = len(items)
    skipped = []
    if task:
        task.update_state(state="PROGRESS", meta={"current": 0, "total": total, "skipped": 0})

    for i, item in enumerate(items, start=1):
        try:
            parse_result = linker_resource_panel_admin.parse_linker_citation(_parts_payload_from_item(item))
            persist_citation_resolution(item.ref, item.versionTitle, item.language, list(item.charRange), parse_result)
        except InputError as e:
            skipped.append({
                "ref": item.ref,
                "versionTitle": item.versionTitle,
                "language": item.language,
                "charRange": list(item.charRange),
                "error": str(e),
            })
        if task:
            task.update_state(state="PROGRESS", meta={
                "current": i,
                "total": total,
                "skipped": len(skipped),
                "skippedSample": skipped[:10],
            })

    log_linker_editor_action(
        user_id,
        "bulk_reparse_dataset",
        {"dataset": dataset, "total": total, "skipped": len(skipped), "skippedSample": skipped[:10]},
        index_title=dataset["bookTitle"],
    )
    return {
        "ok": True,
        "current": total,
        "total": total,
        "skipped": len(skipped),
        "skippedSample": skipped[:10],
        "dataset": dataset,
    }
