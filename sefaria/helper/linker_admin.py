from typing import Any, Optional

from ne_span import NEDoc

from sefaria import tracker
from sefaria.model import Ref, Link, library
from sefaria.model.linker.ref_part import RawRef, RawRefPart, RefPartType, TermContext
from sefaria.model.linker.ref_resolver import AmbiguousResolvedRef, ResolutionThoroughness
from sefaria.model.marked_up_text_chunk import LinkerOutput, MarkedUpTextChunk, MUTCSpanType
from sefaria.model.text import TextChunk
from sefaria.system.exceptions import InputError
from sefaria.helper.linker.tasks import LinkingArgs, enqueue_linking_chain


REF_PART_TYPE_BY_NAME = {part_type.name: part_type for part_type in RefPartType}


def _required(payload: dict, key: str) -> Any:
    value = payload.get(key)
    if value is None or value == "":
        raise InputError(f"Missing required field: {key}")
    return value


def _normalize_char_range(raw_char_range: Any) -> list[int]:
    if isinstance(raw_char_range, str):
        raw_char_range = raw_char_range.split("-")
    if not isinstance(raw_char_range, list) or len(raw_char_range) != 2:
        raise InputError("charRange must be a two-item list or start-end string")
    try:
        return [int(raw_char_range[0]), int(raw_char_range[1])]
    except (TypeError, ValueError):
        raise InputError("charRange values must be integers")


def _span_matches(span: dict, payload: dict) -> bool:
    return (
        span.get("type") == MUTCSpanType.CITATION.value
        and span.get("charRange") == payload["charRange"]
        and span.get("text") == payload["text"]
        and span.get("ref") == payload["targetRef"]
    )


def _update_deleted_marker(klass, payload: dict, deleted: bool) -> bool:
    chunk = klass().load({
        "ref": payload["ref"],
        "versionTitle": payload["versionTitle"],
        "language": payload["lang"],
    })
    if not chunk:
        return False
    updated = False
    for span in chunk.spans:
        if _span_matches(span, payload):
            if deleted:
                span["deleted"] = True
            else:
                span.pop("deleted", None)
            updated = True
    if updated:
        chunk.save()
    return updated


def _delete_generated_link(source_ref: str, target_ref: str, user_id: Optional[int]) -> bool:
    # Callers pass already-normalized refs (see set_linker_citation_deleted).
    link = Link().load({
        "refs": {"$all": [source_ref, target_ref]},
        "generated_by": "add_links_from_text",
    })
    if not link:
        return False
    tracker.delete(user_id, Link, link._id)
    return True


def rerun_linker_for_segment(payload: dict, user_id: Optional[int]) -> dict:
    ref = Ref(_required(payload, "ref")).normal()
    version_title = _required(payload, "versionTitle")
    lang = _required(payload, "lang")
    tc = TextChunk(Ref(ref), lang=lang, vtitle=version_title)
    if not tc.text:
        raise InputError(f"No text found for {ref}, {lang}, {version_title}")
    async_result = enqueue_linking_chain(LinkingArgs(
        ref=ref,
        text=tc.text,
        lang=lang,
        vtitle=version_title,
        user_id=user_id,
        kwargs={},
    ))
    return {
        "ok": True,
        "ref": ref,
        "versionTitle": version_title,
        "lang": lang,
        "task_id": async_result.id,
    }


def set_linker_citation_deleted(payload: dict, user_id: Optional[int], deleted: bool) -> dict:
    normalized = {
        "ref": Ref(_required(payload, "ref")).normal(),
        "versionTitle": _required(payload, "versionTitle"),
        "lang": _required(payload, "lang"),
        "text": _required(payload, "text"),
        "charRange": _normalize_char_range(_required(payload, "charRange")),
        "targetRef": Ref(_required(payload, "targetRef")).normal(),
    }

    mutc_updated = _update_deleted_marker(MarkedUpTextChunk, normalized, deleted)
    linker_output_updated = _update_deleted_marker(LinkerOutput, normalized, deleted)
    link_deleted = False
    if deleted:
        link_deleted = _delete_generated_link(normalized["ref"], normalized["targetRef"], user_id)
    else:
        rerun_linker_for_segment(normalized, user_id)

    return {
        "ok": True,
        "deleted": deleted,
        "marked": mutc_updated or linker_output_updated,
        "mutcUpdated": mutc_updated,
        "linkerOutputUpdated": linker_output_updated,
        "linkDeleted": link_deleted,
    }


def _raw_ref_from_part_dicts(part_dicts: list[dict], lang: str) -> RawRef:
    if not isinstance(part_dicts, list) or not all(isinstance(part, dict) for part in part_dicts):
        raise InputError("parts must be a list of objects with text and type")
    texts = []
    part_types = []
    for part in part_dicts:
        text = part.get("text")
        part_type_name = part.get("type")
        if not isinstance(text, str) or not text:
            raise InputError("Each part must include non-empty string text")
        if not isinstance(part_type_name, str):
            raise InputError("Each part must include string type")
        part_type = REF_PART_TYPE_BY_NAME.get(part_type_name)
        if part_type is None:
            raise InputError(f"Unknown ref part type: {part_type_name}")
        texts.append(text)
        part_types.append(part_type)

    input_str = " ".join(texts)
    doc = NEDoc(input_str)
    raw_parts = []
    cursor = 0
    for text_value, part_type in zip(texts, part_types):
        start = cursor
        end = start + len(text_value)
        cursor = end + 1
        raw_parts.append(RawRefPart(part_type, doc.subspan(slice(start, end))))
    return RawRef(doc.subspan(slice(0, len(input_str))), lang, raw_parts)


def _serialize_part(part) -> dict:
    return {
        "text": part.term.slug if isinstance(part, TermContext) else part.text,
        "type": part.type.name,
        "class": part.__class__.__name__,
    }


def _serialize_node(node) -> Optional[dict]:
    if node is None:
        return None
    try:
        ref = node.ref().normal()
    except Exception:
        ref = None
    try:
        key = node.unique_key()
    except Exception:
        key = ref
    return {
        "key": key,
        "ref": ref,
        "class": node.__class__.__name__,
    }


def _serialize_resolved_ref(resolved_ref) -> dict:
    return {
        "ref": resolved_ref.ref.normal() if resolved_ref.ref else None,
        "valid": not bool(resolved_ref.disqualification_reason),
        "disqualificationReason": resolved_ref.disqualification_reason,
        # Context parts in the pairings below were injected from this context (a single
        # CURRENT_BOOK / IBID source per parsing); the frontend labels them accordingly.
        "contextType": resolved_ref.context_type.name if resolved_ref.context_type else None,
        "contextRef": resolved_ref.context_ref.normal() if resolved_ref.context_ref else None,
        "pairings": [
            {
                "parts": [_serialize_part(part) for part in part_node_match.parts],
                "node": _serialize_node(part_node_match.node),
                "ref": part_node_match.ref.normal() if part_node_match.ref else None,
                "canMatchOutOfOrder": part_node_match.can_match_out_of_order,
            }
            for part_node_match in resolved_ref.ref_part_and_node_matches
        ],
    }


def parse_linker_citation(payload: dict) -> dict:
    parts = _required(payload, "parts")
    lang = payload.get("lang", "he")
    context_ref = payload.get("contextRef")
    prev_trefs = payload.get("prevRefs") or []
    raw_ref = _raw_ref_from_part_dicts(parts, lang)
    linker = library.get_linker(lang)
    ref_resolver = linker._ref_resolver
    ref_resolver.reset_ibid_history()
    for prev_tref in prev_trefs:
        if prev_tref is None:
            ref_resolver.reset_ibid_history()
        else:
            ref_resolver._ibid_history.last_refs = Ref(prev_tref)
    ref_resolver.set_thoroughness(ResolutionThoroughness.HIGH)
    resolved = ref_resolver.resolve_raw_ref(Ref(context_ref) if context_ref else None, raw_ref, keep_disqualified=True)
    if resolved is None:
        resolved_refs = []
    elif isinstance(resolved, AmbiguousResolvedRef):
        resolved_refs = resolved.resolved_raw_refs
    else:
        resolved_refs = [resolved]
    return {
        "ok": True,
        "input": {
            "text": raw_ref.text,
            "parts": [_serialize_part(part) for part in raw_ref.raw_ref_parts],
            "lang": lang,
            "contextRef": context_ref,
            "prevRefs": prev_trefs,
        },
        "parsings": [_serialize_resolved_ref(resolved_ref) for resolved_ref in resolved_refs],
    }
