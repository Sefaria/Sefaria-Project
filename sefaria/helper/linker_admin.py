import re
import time
from typing import Any, Optional

from ne_span import NEDoc
from ne_span.ne_span import LABEL_TO_NAMED_ENTITY_TYPE_ATTR, LABEL_TO_REF_PART_TYPE_ATTR

from sefaria import tracker
from sefaria.model import Ref, Link, library
from sefaria.model.linker.ref_part import RawRef, RawRefPart, RefPartType, TermContext
from sefaria.model.linker.ref_resolver import AmbiguousResolvedRef, ResolutionThoroughness
from sefaria.model.linker.linker_entity_recognizer import get_linker_normalizer
from sefaria.model.linker_dataset_example import LinkerDatasetExample
from sefaria.model.marked_up_text_chunk import LinkerOutput, MarkedUpTextChunk, MUTCSpanType
from sefaria.model.text import TextChunk
from sefaria.system.exceptions import InputError
from sefaria.helper.linker.tasks import LinkingArgs, enqueue_linking_chain


REF_PART_TYPE_BY_NAME = {part_type.name: part_type for part_type in RefPartType}

_HEBREW_CHAR_RE = re.compile(r'[֐-׿]')


def _reverse_labels_by_lang(label_to_attr: dict) -> dict:
    """
    Invert an ne_span label->enum-attr map into {lang: {enum_attr_name: raw_label}}.
    Labels are partitioned into 'he'/'en' by whether they contain Hebrew characters.
    When several labels map to the same enum attr within a language (e.g. person + group
    both map to PERSON), the first one listed in ne_span (the primary) wins.
    """
    by_lang = {"he": {}, "en": {}}
    for label, attr in label_to_attr.items():
        lang = "he" if _HEBREW_CHAR_RE.search(label) else "en"
        by_lang[lang].setdefault(attr, label)
    return by_lang


# {lang: {NamedEntityType attr name: raw model label}} and same for ref parts. Derived from
# ne_span so these stay in lockstep with how the models were trained.
_NAMED_ENTITY_LABEL_BY_LANG = _reverse_labels_by_lang(LABEL_TO_NAMED_ENTITY_TYPE_ATTR)
_REF_PART_LABEL_BY_LANG = _reverse_labels_by_lang(LABEL_TO_REF_PART_TYPE_ATTR)

# MUTC span type -> NamedEntityType enum attr name used by the named-entity ("ref") model.
# Category spans (links to a whole category/section) are labeled as citations for the model.
_MUTC_TYPE_TO_NE_ATTR = {
    MUTCSpanType.CITATION.value: "CITATION",
    MUTCSpanType.CATEGORY.value: "CITATION",
    MUTCSpanType.NAMED_ENTITY.value: "PERSON",
}


def _named_entity_label(mutc_span_type: str, lang: str) -> str:
    ne_attr = _MUTC_TYPE_TO_NE_ATTR[mutc_span_type]
    try:
        return _NAMED_ENTITY_LABEL_BY_LANG[lang][ne_attr]
    except KeyError:
        raise InputError(f"No named-entity model label for {ne_attr} in language '{lang}'")


def _ref_part_label(part_type_name: str, lang: str) -> str:
    try:
        return _REF_PART_LABEL_BY_LANG[lang][part_type_name]
    except KeyError:
        raise InputError(f"No ref-part model label for {part_type_name} in language '{lang}'")


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


def _span_refs(span: dict) -> set[str]:
    refs = set()
    for key in ("ref", "llm_resolved_ref_ambiguous", "llm_resolved_ref_non_segment"):
        ref = span.get(key)
        if ref:
            refs.add(ref)
    return refs


def _span_matches(span: dict, payload: dict) -> bool:
    return (
        span.get("type") == MUTCSpanType.CITATION.value
        and span.get("charRange") == payload["charRange"]
        and span.get("text") == payload["text"]
        and bool(_span_refs(span) & payload["targetRefs"])
    )


def _target_ref_aliases(payload: dict) -> set[str]:
    target_refs = {payload["targetRef"]}
    query = {
        "ref": payload["ref"],
        "versionTitle": payload["versionTitle"],
        "language": payload["lang"],
    }
    for klass in (LinkerOutput, MarkedUpTextChunk):
        chunk = klass().load(query)
        if not chunk:
            continue
        for span in chunk.spans:
            if (
                span.get("type") == MUTCSpanType.CITATION.value
                and span.get("charRange") == payload["charRange"]
                and span.get("text") == payload["text"]
            ):
                target_refs.update(_span_refs(span))
    return target_refs


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


def _delete_generated_link(source_ref: str, target_refs: set[str], user_id: Optional[int]) -> bool:
    # Callers pass already-normalized refs (see set_linker_citation_deleted).
    deleted = False
    for target_ref in target_refs:
        link = Link().load({
            "refs": {"$all": [source_ref, target_ref]},
            "generated_by": "add_links_from_text",
        })
        if not link:
            continue
        tracker.delete(user_id, Link, link._id)
        deleted = True
    return deleted


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
    normalized["targetRefs"] = _target_ref_aliases(normalized)

    mutc_updated = _update_deleted_marker(MarkedUpTextChunk, normalized, deleted)
    linker_output_updated = _update_deleted_marker(LinkerOutput, normalized, deleted)
    link_deleted = False
    if deleted:
        link_deleted = _delete_generated_link(normalized["ref"], normalized["targetRefs"], user_id)
    else:
        rerun_linker_for_segment(normalized, user_id)

    if not mutc_updated and not linker_output_updated and not link_deleted:
        # Nothing matched the given ref/charRange/text/targetRef combination. Without this check
        # the endpoint returns 200 "ok" even though it silently did nothing, and the admin UI
        # (which doesn't inspect the response body) shows the citation as deleted regardless.
        raise InputError(
            f"No stored citation found for {normalized['ref']} ({normalized['lang']}, "
            f"{normalized['versionTitle']}) at {normalized['charRange']} matching that text/targetRef."
        )

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


# ---------------------------------------------------------------------------
# Dataset example capture ("+ Ref Dataset" / "+ Ref Part Dataset" buttons)
# ---------------------------------------------------------------------------

def _upsert_dataset_example(example_type: str, text: str, entities: list, ref: str, lang: str,
                            version_title: str, user_id: Optional[int]) -> dict:
    """
    Store (or overwrite) one gold training example. Uniqueness is (type, ref, text) so
    re-clicking a button refreshes the labels rather than creating duplicates.
    """
    query = {"type": example_type, "ref": ref, "text": text}
    example = LinkerDatasetExample().load(query) or LinkerDatasetExample()
    example.type = example_type
    example.text = text
    example.ref = ref
    example.lang = lang
    example.versionTitle = version_title
    example.labels = {"entities": entities}
    example.added_by = user_id
    example.added_at = int(time.time())
    example.save()
    return {
        "ok": True,
        "type": example_type,
        "ref": ref,
        "numEntities": len(entities),
    }


def add_ref_dataset_example(payload: dict, user_id: Optional[int]) -> dict:
    """
    Capture a named-entity ("ref") model training example for a whole segment: the normalized
    segment text plus every non-deleted citation/person span from the current linker output.
    """
    ref = Ref(_required(payload, "ref")).normal()
    version_title = _required(payload, "versionTitle")
    lang = _required(payload, "lang")

    tc = TextChunk(Ref(ref), lang=lang, vtitle=version_title)
    original_text = tc.text
    if not original_text:
        raise InputError(f"No text found for {ref}, {lang}, {version_title}")

    normalizer = get_linker_normalizer(lang)
    normalized_text = normalizer.normalize(original_text)

    chunk = LinkerOutput().load({"ref": ref, "versionTitle": version_title, "language": lang})
    if not chunk:
        raise InputError(f"No stored linker output found for {ref}, {lang}, {version_title}")

    # Dedupe identical spans: an ambiguous citation/entity is stored as several span rows
    # (one per resolution) but is a single labeled span for the named-entity model.
    seen = set()
    entities = []
    for span in chunk.spans:
        if span.get("deleted"):
            continue
        span_type = span.get("type")
        if span_type not in _MUTC_TYPE_TO_NE_ATTR:
            continue  # skip span types the named-entity model doesn't train on (e.g. quotes)
        label = _named_entity_label(span_type, lang)
        (norm_start, norm_end) = normalizer.norm_to_unnorm_indices(
            original_text, [tuple(span["charRange"])], reverse=True
        )[0]
        key = (norm_start, norm_end, label)
        if key in seen:
            continue
        seen.add(key)
        entities.append([norm_start, norm_end, label])

    entities.sort(key=lambda e: (e[0], e[1]))
    return _upsert_dataset_example("ref", normalized_text, entities, ref, lang, version_title, user_id)


def _expand_ref_parts(span: dict) -> list:
    """
    Yield (part_text, part_type_name) pairs for a citation span. Synthesized RANGE
    parts are kept as RANGE markers here and expanded into NUMBERED / RANGE_SYMBOL /
    NUMBERED spans later by _locate_ref_part_entities.
    """
    part_texts = span.get("inputRefParts") or []
    part_types = span.get("inputRefPartTypes") or []
    range_sections = span.get("inputRangeSections") or []
    range_to_sections = span.get("inputRangeToSections") or []
    if len(part_texts) != len(part_types):
        raise InputError("inputRefParts and inputRefPartTypes are misaligned in stored span")

    expanded = []
    for part_text, part_type in zip(part_texts, part_types):
        if part_type == RefPartType.RANGE.name:
            if not range_sections or not range_to_sections:
                raise InputError("RANGE part is missing inputRangeSections / inputRangeToSections")
            expanded.append((part_text, RefPartType.RANGE.name))  # marker; located as a whole below
        else:
            expanded.append((part_text, part_type))
    return expanded


def _locate_ref_part_entities(normalized_citation: str, span: dict, normalizer, lang: str) -> list:
    """
    Turn a citation's ref parts into [start, end, label] entities whose offsets index into
    `normalized_citation`. Each part text is normalized and located sequentially from a running
    cursor. RANGE parts are decomposed into their NUMBERED/RANGE_SYMBOL/NUMBERED components.
    Raises InputError if any part cannot be located (so we never store malformed offsets).
    """
    range_sections = span.get("inputRangeSections") or []
    range_to_sections = span.get("inputRangeToSections") or []

    def locate(sub_text: str, cursor: int) -> tuple:
        normalized_sub = normalizer.normalize(sub_text)
        if not normalized_sub:
            raise InputError(f"Ref part '{sub_text}' is empty after normalization")
        idx = normalized_citation.find(normalized_sub, cursor)
        if idx == -1:
            raise InputError(f"Could not locate ref part '{normalized_sub}' in citation text")
        return idx, idx + len(normalized_sub)

    entities = []
    cursor = 0
    for part_text, part_type in _expand_ref_parts(span):
        if part_type == RefPartType.RANGE.name:
            # Bound the whole range within the citation, then place the sub-parts inside it.
            range_start, range_end = locate(part_text, cursor)
            inner_cursor = range_start
            numbered_label = _ref_part_label(RefPartType.NUMBERED.name, lang)
            symbol_label = _ref_part_label(RefPartType.RANGE_SYMBOL.name, lang)
            for section in range_sections:
                start, end = locate(section, inner_cursor)
                entities.append([start, end, numbered_label])
                inner_cursor = end
            # The range symbol is whatever sits between the from-sections and to-sections.
            first_to_start = None
            to_cursor = inner_cursor
            to_entities = []
            for section in range_to_sections:
                start, end = locate(section, to_cursor)
                if first_to_start is None:
                    first_to_start = start
                to_entities.append([start, end, numbered_label])
                to_cursor = end
            symbol_start = inner_cursor
            symbol_end = first_to_start if first_to_start is not None else range_end
            # Trim surrounding whitespace from the symbol span.
            while symbol_start < symbol_end and normalized_citation[symbol_start].isspace():
                symbol_start += 1
            while symbol_end > symbol_start and normalized_citation[symbol_end - 1].isspace():
                symbol_end -= 1
            if symbol_end > symbol_start:
                entities.append([symbol_start, symbol_end, symbol_label])
            entities.extend(to_entities)
            cursor = range_end
        else:
            start, end = locate(part_text, cursor)
            entities.append([start, end, _ref_part_label(part_type, lang)])
            cursor = end

    entities.sort(key=lambda e: (e[0], e[1]))
    return entities


def add_ref_part_dataset_example(payload: dict, user_id: Optional[int]) -> dict:
    """
    Capture a "ref part" model training example for a single citation: the normalized citation
    text plus its ref parts (offsets relative to the citation text). `ref` is the segment ref.
    """
    ref = Ref(_required(payload, "ref")).normal()
    version_title = _required(payload, "versionTitle")
    lang = _required(payload, "lang")
    char_range = _normalize_char_range(_required(payload, "charRange"))

    chunk = LinkerOutput().load({"ref": ref, "versionTitle": version_title, "language": lang})
    if not chunk:
        raise InputError(f"No stored linker output found for {ref}, {lang}, {version_title}")

    span = next(
        (
            s for s in chunk.spans
            if s.get("type") == MUTCSpanType.CITATION.value
            and s.get("charRange") == char_range
            and not s.get("deleted")
        ),
        None,
    )
    if span is None:
        raise InputError(f"No citation span found at {char_range} for {ref}")

    normalizer = get_linker_normalizer(lang)
    normalized_citation = normalizer.normalize(span["text"])
    entities = _locate_ref_part_entities(normalized_citation, span, normalizer, lang)
    return _upsert_dataset_example("ref part", normalized_citation, entities, ref, lang, version_title, user_id)
