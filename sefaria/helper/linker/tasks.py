"""
Celery tasks for the LLM server
"""
from sefaria.model.linker.category_resolver import ResolvedCategory
from sefaria.model.linker.named_entity_resolver import ResolvedNamedEntity
from sefaria.settings import CELERY_QUEUES
from celery import signature
from celery.signals import worker_init
from sefaria.settings import USE_VARNISH
from sefaria import tracker
from sefaria.model import library, Link, LinkSet, Version, TermSet
from sefaria.celery_setup.app import app
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk, MUTCSpanType, LinkerOutput, MarkedUpTextChunkSet
from sefaria.model import Ref
from sefaria.model.linker.ref_resolver import ResolutionThoroughness, ResolvedRef, AmbiguousResolvedRef
from sefaria.model.linker.ref_part import TermContext, RefPartType
from sefaria.model.linker.linker import LinkedDoc
from sefaria.helper.linker.linker import make_find_refs_response, FindRefsInput
from sefaria.helper.linker.disambiguator import (
    disambiguate_ambiguous_ref,
    disambiguate_non_segment_ref,
    AmbiguousResolutionPayload,
    NonSegmentResolutionPayload,
    AmbiguousResolutionResult,
    NonSegmentResolutionResult,
    DictaAPIError,
)
from dataclasses import dataclass, field, asdict
from bson import ObjectId
import structlog
from typing import Any, Dict, List, Optional
from functools import lru_cache


logger = structlog.get_logger(__name__)


from sefaria.system.exceptions import InputError, DuplicateRecordError
from sefaria.system.varnish.wrapper import invalidate_ref
from sefaria.system.database import db
from datetime import datetime


@dataclass(frozen=True)
class LinkingArgs:
    ref: str
    text: str
    lang: str
    vtitle: str
    user_id: str = None  # optional, for tracker
    kwargs: dict = None  # optional, for tracke

@dataclass(frozen=True)
class DeleteAndSaveLinksMsg:
    ref: str
    added_mutc_trefs: List[str]
    vtitle: Optional[str] = None
    lang: Optional[str] = None
    user_id: Optional[str] = None
    tracker_kwargs: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "DeleteAndSaveLinksMsg":
        return cls(
            ref=d["ref"],
            added_mutc_trefs=list(d.get("added_mutc_trefs", [])),
            vtitle=d.get("vtitle"),
            lang=d.get("lang"),
            user_id=d.get("user_id"),
            tracker_kwargs=d.get("tracker_kwargs") or {},
        )




@worker_init.connect
def on_worker_init(**kwargs):
    from reader.startup import init_library_cache
    logger.info("linker worker_init")
    init_library_cache()


@app.task(name="linker.find_refs_api")
def find_refs_api_task(raw_find_refs_input: dict) -> dict:
    """
    Celery task for the find-refs API endpoint.
    @param raw_find_refs_input:
    @return:
    """
    find_refs_input = FindRefsInput(**raw_find_refs_input)
    try:
        return make_find_refs_response(find_refs_input)
    except Exception:
        logger.exception("find_refs_api_task:error")
        raise


@app.task(name="linker.link_segment_with_worker")
def link_segment_with_worker(linking_args_dict: dict) -> None:
    """
    Returns a payload for the next task in the chain:
      {
        "ref": <str>,
        "linked_refs": <List[str]>,
        "text_id": <optional>,
        "user_id": <optional>,
        "tracker_kwargs": <optional dict>
      }
    """
    linking_args = LinkingArgs(**linking_args_dict)
    linker = library.get_linker(linking_args.lang)
    book_ref = Ref(linking_args.ref)
    output = linker.link_with_footnotes(linking_args.text, book_context_ref=book_ref, thoroughness=ResolutionThoroughness.HIGH, with_failures=True)

    _save_linker_debug_data(linking_args.ref, linking_args.vtitle, linking_args.lang, output)
    # Build spans/chunk (write MarkedUpTextChunk)
    spans = _extract_resolved_spans(output.resolved_refs)

    chunk = MarkedUpTextChunk({
        "ref": linking_args.ref,
        "versionTitle": linking_args.vtitle,
        "language": linking_args.lang,
        "spans": spans,
    })

    _replace_existing_chunk(chunk)

    # Prepare the minimal info the next task needs
    mutc_trefs = sorted({s["ref"] for s in spans if "ref" in s})
    msg = DeleteAndSaveLinksMsg(
        ref=linking_args.ref,
        added_mutc_trefs=mutc_trefs,
        vtitle=linking_args.vtitle,
        lang=linking_args.lang,
        user_id=linking_args.user_id,
        tracker_kwargs=linking_args.kwargs,
    )
    
    delete_and_save_new_links(asdict(msg))
    ambiguous_payloads = _load_recent_ambiguous_cases(linking_args)
    for payload in ambiguous_payloads:
        result = disambiguate_ambiguous_ref(payload)
        _apply_ambiguous_resolution(payload, result)
        

    non_segment_payloads = _load_recent_non_segment_cases(linking_args)
    for payload in non_segment_payloads:
        result = disambiguate_non_segment_ref(payload)
        _apply_non_segment_resolution(payload, result)
        


def _load_recent_ambiguous_cases(linking_args: LinkingArgs) -> list[AmbiguousResolutionPayload]:
    """Load ambiguous cases from the latest LinkerOutput for this ref."""
    linker_output = LinkerOutput().load({
        "ref": linking_args.ref,
        "versionTitle": linking_args.vtitle,
        "language": linking_args.lang,
    })
    if not linker_output:
        return []

    spans = linker_output.spans
    ambiguous_groups: dict[tuple[int, int], list[dict]] = {}
    for span in spans:
        if span.get("type") == MUTCSpanType.CITATION.value and span.get("ambiguous"):
            key = tuple(span.get("charRange", []))
            if len(key) == 2:
                ambiguous_groups.setdefault(key, []).append(span)

    ambiguous_payloads: list[AmbiguousResolutionPayload] = []
    for char_range, group in ambiguous_groups.items():
        refs = [sp.get("ref") for sp in group if sp.get("ref")]
        normalized = set()
        for ref_str in refs:
            try:
                normalized.add(Ref(ref_str).normal())
            except Exception:
                normalized.add(ref_str)
        if len(normalized) > 1:
            ambiguous_payloads.append(AmbiguousResolutionPayload(
                ref=linker_output.ref,
                versionTitle=linker_output.versionTitle,
                language=linker_output.language,
                charRange=list(char_range),
                text=group[0].get("text"),
                ambiguous_refs=refs,
            ))

    return ambiguous_payloads


def _load_recent_non_segment_cases(linking_args: LinkingArgs) -> list[NonSegmentResolutionPayload]:
    """Load non-segment citation spans; include ambiguous only if MUTC shows non-segment at same charRange."""
    linker_output = LinkerOutput().load({
        "ref": linking_args.ref,
        "versionTitle": linking_args.vtitle,
        "language": linking_args.lang,
    })
    if not linker_output:
        return []

    spans = linker_output.spans
    mutc = MarkedUpTextChunk().load({
        "ref": linking_args.ref,
        "versionTitle": linking_args.vtitle,
        "language": linking_args.lang,
    })
    mutc_spans = (mutc.spans if mutc else [])
    mutc_non_segment_char_ranges: set[tuple[int, int]] = set()
    for mutc_span in mutc_spans:
        if mutc_span.get("type") != MUTCSpanType.CITATION.value:
            continue
        mutc_ref = mutc_span.get("ref")
        if not mutc_ref:
            continue
        try:
            mutc_oref = Ref(mutc_ref)
        except Exception:
            continue
        if _is_non_segment_or_perek_ref(mutc_ref, mutc_oref):
            key = tuple(mutc_span.get("charRange", []))
            if len(key) == 2:
                mutc_non_segment_char_ranges.add(key)
    non_segment_payloads: list[NonSegmentResolutionPayload] = []
    for span in spans:
        if span.get("type") != MUTCSpanType.CITATION.value:
            continue
        if span.get("failed"):
            continue
        if span.get("ambiguous"):
            key = tuple(span.get("charRange", []))
            if len(key) != 2 or key not in mutc_non_segment_char_ranges:
                continue
        ref_str = span.get("ref")
        if not ref_str:
            continue
        try:
            oref = Ref(ref_str)
        except Exception:
            continue
        if _is_non_segment_or_perek_ref(ref_str, oref):
            non_segment_payloads.append(NonSegmentResolutionPayload(
                ref=linker_output.ref,
                versionTitle=linker_output.versionTitle,
                language=linker_output.language,
                charRange=span.get("charRange"),
                text=span.get("text"),
                resolved_non_segment_ref=ref_str,
            ))

    return non_segment_payloads


def _is_non_segment_or_perek_ref(ref_str: str, oref: Optional[Ref] = None) -> bool:
    """Return True for non-segment refs or refs treated as non-segment (perakim/parshiot)."""
    if oref is None:
        try:
            oref = Ref(ref_str)
        except Exception:
            return False
    if not oref.is_segment_level():
        return True
    return ref_str in _get_talmud_perek_ref_set() or ref_str in _get_parasha_ref_set()


@lru_cache(maxsize=1)
def _get_talmud_perek_ref_set() -> set[str]:
    """Cache of Talmud perakim refs (Bavli/Yerushalmi/Tosefta/Mishnah)."""
    categories = [
        ["Talmud", "Bavli"],
        ["Talmud", "Yerushalmi"],
        ["Tosefta"],
        ["Mishnah"],
    ]
    perakim: set[str] = set()
    for path in categories:
        for index in library.get_indexes_in_category_path(path, full_records=True) or []:
            try:
                alone_nodes = index.get_referenceable_alone_nodes()
            except Exception:
                continue
            for node in alone_nodes:
                try:
                    perakim.add(node.ref().normal())
                except Exception:
                    continue

    return perakim


@lru_cache(maxsize=1)
def _get_parasha_ref_set() -> set[str]:
    """Cache of parasha wholeRef ranges from alt-struct leaves whose titles map to Parasha terms."""
    parasha_titles: set[str] = set()
    for term in TermSet({"scheme": "Parasha"}):
        for lang in ("en", "he"):
            try:
                parasha_titles.update(term.get_titles(lang))
            except Exception:
                continue

    parasha_refs: set[str] = set()
    for index in library.get_indexes_in_category_path(["Tanakh", "Torah"], include_dependant=False, full_records=True) or []:
        try:
            alt_leaves = index.get_alt_struct_leaves()
        except Exception:
            continue
        for node in alt_leaves:
            if not getattr(node, "wholeRef", None):
                continue
            try:
                titles = set()
                titles.update(node.get_titles("en"))
                titles.update(node.get_titles("he"))
                if getattr(node, "sharedTitle", None):
                    titles.add(node.sharedTitle)
            except Exception:
                titles = set()
            if parasha_titles and titles.isdisjoint(parasha_titles):
                continue
            try:
                parasha_refs.add(Ref(node.wholeRef).normal())
            except Exception:
                continue

    return parasha_refs


def _apply_non_segment_resolution(payload: NonSegmentResolutionPayload, result: Optional[NonSegmentResolutionResult]) -> None:
    """Upsert citation span + link for a resolved non-segment reference."""
    if not result or not result.resolved_ref:
        return

    citing_ref = payload.ref
    resolved_ref = result.resolved_ref
    if not citing_ref or not resolved_ref:
        return

    _upsert_mutc_span(
        ref=payload.ref,
        version_title=payload.versionTitle,
        language=payload.language,
        char_range=payload.charRange,
        text=payload.text,
        resolved_ref=resolved_ref,
    )

    _create_link_for_resolution(citing_ref, resolved_ref)
    _update_linker_output_resolution_fields(payload, result)


def _apply_ambiguous_resolution(payload: AmbiguousResolutionPayload, result: Optional[AmbiguousResolutionResult]) -> None:
    """Upsert citation span + link for a resolved ambiguous reference."""
    if not result or not result.resolved_ref:
        return

    citing_ref = payload.ref
    resolved_ref = result.resolved_ref
    if not citing_ref or not resolved_ref:
        return

    _upsert_mutc_span(
        ref=payload.ref,
        version_title=payload.versionTitle,
        language=payload.language,
        char_range=payload.charRange,
        text=payload.text,
        resolved_ref=resolved_ref,
    )

    _create_link_for_resolution(citing_ref, resolved_ref)
    _update_linker_output_resolution_fields(payload, result)


def _apply_non_segment_resolution_with_record(payload: NonSegmentResolutionPayload, result: Optional[NonSegmentResolutionResult]) -> None:
    """Upsert citation span + link and record temp data for a resolved non-segment reference."""
    if not result or not result.resolved_ref:
        return

    citing_ref = payload.ref
    resolved_ref = result.resolved_ref
    if not citing_ref or not resolved_ref:
        return

    mutc, span_data = _upsert_mutc_span(
        ref=payload.ref,
        version_title=payload.versionTitle,
        language=payload.language,
        char_range=payload.charRange,
        text=payload.text,
        resolved_ref=resolved_ref,
        return_mutc=True,
    )
    if mutc is not None:
        _record_disambiguated_mutc({
            "id": mutc._id,
            "span": span_data,
            "type": "mutc",
            "resolution_type": "non_segment",
            "ref": payload.ref,
            "versionTitle": payload.versionTitle,
            "language": payload.language,
            "llm_resolved_ref_non_segment": result.resolved_ref,
            "llm_resolved_method_non_segment": result.method,
            "llm_resolved_phrase_non_segment": getattr(result, "llm_resolved_phrase", None),
        })

    link_obj, action = _create_or_update_link_for_non_segment_resolution(
        citing_ref=citing_ref,
        non_segment_ref=payload.resolved_non_segment_ref,
        resolved_ref=resolved_ref,
    )
    if link_obj is not None:
        _record_disambiguated_link({
            "id": link_obj._id,
            "type": "link",
            "action": action,
            "link": link_obj.contents(),
            "resolution_type": "non_segment",
            "ref": payload.ref,
            "versionTitle": payload.versionTitle,
            "language": payload.language,
            "previous_ref": payload.resolved_non_segment_ref,
            "resolved_ref": resolved_ref,
            "llm_resolved_ref_non_segment": result.resolved_ref,
            "llm_resolved_method_non_segment": result.method,
            "llm_resolved_phrase_non_segment": getattr(result, "llm_resolved_phrase", None),
        })
    _update_linker_output_resolution_fields(payload, result)


def _apply_ambiguous_resolution_with_record(payload: AmbiguousResolutionPayload, result: Optional[AmbiguousResolutionResult]) -> None:
    """Upsert citation span + link and record temp data for a resolved ambiguous reference."""
    if not result or not result.resolved_ref:
        return

    citing_ref = payload.ref
    resolved_ref = result.resolved_ref
    if not citing_ref or not resolved_ref:
        return

    mutc, span_data = _upsert_mutc_span(
        ref=payload.ref,
        version_title=payload.versionTitle,
        language=payload.language,
        char_range=payload.charRange,
        text=payload.text,
        resolved_ref=resolved_ref,
        return_mutc=True,
    )
    if mutc is not None:
        _record_disambiguated_mutc({
            "id": mutc._id,
            "span": span_data,
            "type": "mutc",
            "resolution_type": "ambiguous",
            "ref": payload.ref,
            "versionTitle": payload.versionTitle,
            "language": payload.language,
            "llm_resolved_ref_ambiguous": getattr(result, "matched_segment", None),
            "llm_resolved_method_ambiguous": result.method,
            "llm_resolved_phrase_ambiguous": getattr(result, "llm_resolved_phrase", None),
            "llm_ambiguous_option_valid": True,
        })

    link_obj = _create_link_for_resolution(citing_ref, resolved_ref)
    if link_obj is not None:
        _record_disambiguated_link({
            "id": link_obj._id,
            "type": "link",
            "resolution_type": "ambiguous",
            "ref": payload.ref,
            "versionTitle": payload.versionTitle,
            "language": payload.language,
            "llm_resolved_ref_ambiguous": getattr(result, "matched_segment", None),
            "llm_resolved_method_ambiguous": result.method,
            "llm_resolved_phrase_ambiguous": getattr(result, "llm_resolved_phrase", None),
            "llm_ambiguous_option_valid": True,
        })
    _update_linker_output_resolution_fields(payload, result)


def _update_linker_output_resolution_fields(payload: object, result: object) -> None:
    """Persist resolution metadata onto LinkerOutput spans by charRange."""
    try:
        query = {
            "ref": payload.ref,
            "versionTitle": payload.versionTitle,
            "language": payload.language,
        }
    except Exception:
        return

    linker_output = LinkerOutput().load(query)
    if not linker_output:
        return

    updated = False
    is_ambiguous = hasattr(payload, "ambiguous_refs")
    for span in linker_output.spans:
        if span.get("type") != MUTCSpanType.CITATION.value:
            continue
        if span.get("charRange") != payload.charRange:
            continue
        if is_ambiguous:
            is_valid = (span.get("ref") == getattr(result, "resolved_ref", None))
            span["llm_ambiguous_option_valid"] = is_valid
            if is_valid:
                span["llm_resolved_ref_ambiguous"] = getattr(result, "matched_segment", None)
                span["llm_resolved_method_ambiguous"] = getattr(result, "method", None)
                span["llm_resolved_phrase_ambiguous"] = getattr(result, "llm_resolved_phrase", None)
        else:
            span["llm_resolved_ref_non_segment"] = getattr(result, "resolved_ref", None)
            span["llm_resolved_method_non_segment"] = getattr(result, "method", None)
            span["llm_resolved_phrase_non_segment"] = getattr(result, "llm_resolved_phrase", None)
        updated = True

    if updated:
        linker_output.save()


def _record_disambiguated_mutc(payload: dict) -> None:
    """
    Temp task: record MUTC edits/creates after disambiguation.
    Expected payload: {id: ObjectId, span: {...}, type: "mutc", ...}
    """
    doc = dict(payload)
    doc["created_at"] = datetime.utcnow()
    try:
        db.linker_disambiguation_tmp.insert_one(doc)
        logger.info("Recorded disambiguated MUTC", payload=doc)
    except Exception:
        logger.exception("Failed recording disambiguated MUTC", payload=doc)


def _record_disambiguated_link(payload: dict) -> None:
    """
    Temp func: record new link after disambiguation.
    Expected payload: {id: ObjectId, type: "link", ...}
    """
    doc = dict(payload)
    doc["created_at"] = datetime.utcnow()
    try:
        db.linker_disambiguation_tmp.insert_one(doc)
        logger.info("Recorded disambiguated link", payload=doc)
    except Exception:
        logger.exception("Failed recording disambiguated link", payload=doc)


def _record_dicta_failure(payload: dict) -> None:
    doc = dict(payload)
    doc["created_at"] = datetime.utcnow()
    try:
        db.linker_dicta_failures_tmp.insert_one(doc)
        logger.info("Recorded dicta failure", payload=doc)
    except Exception:
        logger.exception("Failed recording dicta failure", payload=doc)


def _dicta_error_payload(info: dict, payload_obj: object) -> dict:
    payload_doc = None
    payload_type = None
    try:
        payload_doc = asdict(payload_obj)
        payload_type = type(payload_obj).__name__
    except Exception:
        payload_doc = None
    return {
        "type": "dicta_non_200",
        "status_code": info.get("status_code"),
        "url": info.get("url"),
        "target_ref": info.get("target_ref"),
        "query_text": (info.get("query_text") or "")[:4000],
        "response_text": (info.get("response_text") or "")[:2000],
        "payload": payload_doc,
        "payload_type": payload_type,
    }

def _extract_resolved_spans(resolved_refs):
    spans = []
    for resolved_ref in resolved_refs:
        if resolved_ref.is_ambiguous or resolved_ref.resolution_failed:
            continue
        entity = resolved_ref.raw_entity
        spans.append({
            "charRange": entity.char_indices,
            "text": entity.text,
            "type": MUTCSpanType.CITATION.value,
            "ref": resolved_ref.ref.normal(),
        })
    return spans


def _upsert_mutc_span(
    ref: str,
    version_title: str,
    language: str,
    char_range: list[int],
    text: str,
    resolved_ref: str,
    return_mutc: bool = False,
):
    span_data = {
        "charRange": char_range,
        "text": text,
        "type": MUTCSpanType.CITATION.value,
        "ref": resolved_ref,
    }

    mutc = MarkedUpTextChunk().load({
        "ref": ref,
        "versionTitle": version_title,
        "language": language,
    })
    if mutc:
        updated = False
        for span in mutc.spans:
            if (
                span.get("type") == MUTCSpanType.CITATION.value and
                span.get("charRange") == char_range
            ):
                span["ref"] = resolved_ref
                updated = True
                break
        if not updated:
            mutc.add_non_overlapping_spans([span_data])
        mutc.save()
    else:
        mutc = MarkedUpTextChunk({
            "ref": ref,
            "versionTitle": version_title,
            "language": language,
            "spans": [span_data],
        })
        mutc.save()

    if return_mutc:
        return mutc, span_data
    return None


def _create_link_for_resolution(citing_ref: str, resolved_ref: str) -> Optional[Link]:
    link = {
        "refs": [citing_ref, resolved_ref],
        "type": "",
        "auto": True,
        "generated_by": "add_links_from_text",
        "inline_citation": True,
    }
    try:
        link_obj = tracker.add(None, Link, link, **{})
        if USE_VARNISH:
            try:
                invalidate_ref(Ref(resolved_ref))
            except InputError:
                pass
        return link_obj
    except DuplicateRecordError:
        return None
    except InputError as e:
        logger.info(f"InputError creating link {citing_ref} -> {resolved_ref}: {e}")
        return None


def _create_or_update_link_for_non_segment_resolution(
    citing_ref: str,
    non_segment_ref: str,
    resolved_ref: str,
) -> tuple[Optional[Link], str]:
    try:
        citing_normal = Ref(citing_ref).normal()
        non_segment_normal = Ref(non_segment_ref).normal()
    except Exception:
        citing_normal = citing_ref
        non_segment_normal = non_segment_ref

    existing_link = Link().load({"refs": {"$all": [citing_normal, non_segment_normal]}})
    if existing_link:
        existing_link.refs = sorted([citing_ref, resolved_ref])
        existing_link.save()
        if USE_VARNISH:
            try:
                invalidate_ref(Ref(resolved_ref))
            except InputError:
                pass
        return existing_link, "updated"

    link_obj = _create_link_for_resolution(citing_ref, resolved_ref)
    return link_obj, "created"



def _save_linker_debug_data(tref: str, version_title: str, lang: str, doc: LinkedDoc) -> None:
    spans = _extract_debug_spans(doc)
    query = {
        "ref": tref,
        "versionTitle": version_title,
        "language": lang,
    }
    existing = LinkerOutput().load(query)
    if existing:
        if len(spans) == 0:
            existing.delete()
        else:
            existing.spans = spans
            existing.save()
    else:
        if len(spans) == 0:
            return
        query["spans"] = spans
        LinkerOutput(query).save()


def _extract_debug_spans(doc: LinkedDoc) -> list[dict]:
    spans = []
    for resolved in doc.all_resolved:
        spans.extend(resolved.get_debug_spans())
    return spans


def _replace_existing_chunk(chunk: MarkedUpTextChunk) -> Optional[MarkedUpTextChunk]:
    """
    :return: existing mutc that was replaced, or None
    """
    existing = MarkedUpTextChunk().load({
        "ref": chunk.ref,
        "language": chunk.language,
        "versionTitle": chunk.versionTitle,
    })
    if existing:
        if len(chunk.spans) == 0:
            # If the new chunk has no spans, just delete the existing one
            existing.delete()
            return existing
        existing_spans = list(filter(lambda span: span["type"] == MUTCSpanType.NAMED_ENTITY.value, existing.spans))
        # add_non_overlapping_spans prefers `self.spans` over the spans that are input
        existing.spans = chunk.spans
        existing.add_non_overlapping_spans(existing_spans)
        existing.save()
    else:
        if len(chunk.spans) == 0:
            # No existing chunk and no spans to save
            return None
        chunk.save()
    return existing


def _get_existing_linked_trefs(base_tref: str) -> tuple[list[str], list[ObjectId]]:
    existing_links = LinkSet({
        "refs": base_tref,
        "auto": True,
        "generated_by": "add_links_from_text",
    })
    existing_linked_trefs = []
    existing_link_ids = []
    for link in existing_links:
        for r in link.refs:
            if r != base_tref:
                existing_linked_trefs.append(r)
                existing_link_ids.append(link._id)
    return existing_linked_trefs, existing_link_ids


def _get_link_trefs_to_add_and_delete_from_msg(msg: DeleteAndSaveLinksMsg, existing_linked_trefs: set[str]) -> tuple[set[str], set[str]]:
    all_mutcs = MarkedUpTextChunkSet({"ref": msg.ref}, hint="ref_1")
    other_mutc_trefs = set()
    for mutc in all_mutcs:
        if mutc.ref == msg.ref and mutc.versionTitle == msg.vtitle and mutc.language == msg.lang:
            # Skip MUTC that matches the current version
            continue
        for span in mutc.spans:
            if span['type'] == MUTCSpanType.CITATION.value and ('ref' in span):
                other_mutc_trefs.add(span['ref'])

    # we need to consider all other MUTCs that link to this ref, to avoid deleting links that are still needed
    # a link should be deleted if it isn't backed by any MUTCs, either an alternate version of the target ref or for any ref that is linked to the target ref
    linked_mutcs = MarkedUpTextChunkSet({"ref": {"$in": list(existing_linked_trefs)}}, hint="ref_1")
    for mutc in linked_mutcs:
        for span in mutc.spans:
            if span['type'] == MUTCSpanType.CITATION.value and span.get('ref') == msg.ref:
                # this is an MUTC that links back to the current ref implying we need to keep this link
                other_mutc_trefs.add(mutc.ref)

    logger.info(f"LINKER: curr ref: {msg.ref} existing_linked_trefs: {existing_linked_trefs}")
    logger.info(f"LINKER: curr ref: {msg.ref} other_mutc_trefs: {other_mutc_trefs}")
    logger.info(f"LINKER: curr ref: {msg.ref} added_mutc_trefs: {msg.added_mutc_trefs}")
    return _get_link_trefs_to_add_and_delete(set(msg.added_mutc_trefs), existing_linked_trefs, other_mutc_trefs)


def _get_link_trefs_to_add_and_delete(added_mutc_trefs: set[str], existing_linked_trefs: set[str], other_mutc_trefs: set[str]) -> tuple[set[str], set[str]]:
    linked_trefs_to_add = added_mutc_trefs - existing_linked_trefs
    linked_refs_to_delete = existing_linked_trefs - (other_mutc_trefs | added_mutc_trefs)
    return linked_trefs_to_add, linked_refs_to_delete


def _add_new_links(msg: DeleteAndSaveLinksMsg, linked_trefs_to_add: set[str]) -> None:
    for linked_tref in linked_trefs_to_add:
        try:
            # don't allow book-level links
            linked_oref = Ref(linked_tref)
            if linked_oref.is_book_level():
                continue
        except:
            continue
        link = {
            "refs": [msg.ref, linked_tref],
            "type": "",
            "auto": True,
            "generated_by": "add_links_from_text",
            "inline_citation": True
        }

        try:
            logger.info(f"LINKER: Adding new link from {msg.ref} to {linked_tref}")
            tracker.add(msg.user_id, Link, link, **msg.tracker_kwargs)
            if USE_VARNISH:
                try:
                    invalidate_ref(Ref(linked_tref))
                except InputError:
                    pass
        except DuplicateRecordError as e:
            # Link exists - skip
            print(f"Existing Link no need to change: {e}")
        except InputError as e:
            # Other kinds of input error
            print(f"InputError: {e}")


def _delete_old_links(msg: DeleteAndSaveLinksMsg, linked_trefs_to_delete: set[str], existing_linked_trefs: list[str], existing_link_ids: list[ObjectId]) -> None:
    for tref, _id in zip(existing_linked_trefs, existing_link_ids):
        if tref in linked_trefs_to_delete:
            if USE_VARNISH:
                try:
                    invalidate_ref(Ref(tref))
                except InputError:
                    pass
            logger.info(f"LINKER: Deleting old link from {msg.ref} to {tref}")
            tracker.delete(msg.user_id, Link, _id)


def delete_and_save_new_links(payload: dict):
    msg = DeleteAndSaveLinksMsg.from_dict(payload)
    existing_linked_trefs, existing_link_ids = _get_existing_linked_trefs(msg.ref)
    linked_trefs_to_add, linked_trefs_to_delete = _get_link_trefs_to_add_and_delete_from_msg(msg, set(existing_linked_trefs))
    _delete_old_links(msg, linked_trefs_to_delete, existing_linked_trefs, existing_link_ids)
    _add_new_links(msg, linked_trefs_to_add)


def enqueue_linking_chain(linking_args: LinkingArgs):
    sig = signature(
        "linker.link_segment_with_worker",
        args=(asdict(linking_args),),
        options={"queue": CELERY_QUEUES.get("tasks", "TASK QUEUE UNDEFINED")},
    )
    return sig.apply_async()


@app.task(name="linker.process_ambiguous_resolution")
def process_ambiguous_resolution(resolution_data: dict) -> None:
    """
    Process an ambiguous resolution from LinkerOutput.
    Uses LLM to disambiguate between multiple possible references.

    @param resolution_data: dict with structure:
        {
            'ref': str,
            'versionTitle': str,
            'language': str,
            'charRange': [int, int],
            'text': str,
            'ambiguous_refs': [str, str, ...]
        }
    """
    logger.info("=== Processing Ambiguous Resolution ===")
    payload = AmbiguousResolutionPayload(**resolution_data)
    logger.info(f"Ref: {payload.ref}")
    logger.info(f"Version: {payload.versionTitle} ({payload.language})")
    logger.info(f"Text: '{payload.text}'")
    logger.info(f"Char Range: {payload.charRange}")
    logger.info(f"Ambiguous Options ({len(payload.ambiguous_refs)}): {payload.ambiguous_refs}")

    try:
        result = disambiguate_ambiguous_ref(payload)
        if result:
            resolved_ref = result.resolved_ref
            print(f"\n{'='*80}")
            print(f"AMBIGUOUS RESOLUTION SUCCESS")
            print(f"{'='*80}")
            print(f"Citing Ref: {payload.ref}")
            print(f"Version: {payload.versionTitle} ({payload.language})")
            print(f"Citation Text: '{payload.text}'")
            print(f"Char Range: {payload.charRange}")
            print(f"Ambiguous Options: {payload.ambiguous_refs}")
            print(f"→ RESOLVED TO: {resolved_ref}")
            print(f"  Method: {result.method}")
            if getattr(result, "llm_resolved_phrase", None):
                print(f"  Phrase: {result.llm_resolved_phrase}")
            if result.matched_segment:
                print(f"  Matched Segment: {result.matched_segment}")
            print(f"{'='*80}\n")

            logger.info(f"✓ Resolved to: {resolved_ref} (method: {result.method})")
        else:
            print(f"\n{'='*80}")
            print(f"AMBIGUOUS RESOLUTION FAILED")
            print(f"{'='*80}")
            print(f"Citing Ref: {payload.ref}")
            print(f"Citation Text: '{payload.text}'")
            print(f"Ambiguous Options: {payload.ambiguous_refs}")
            print(f"{'='*80}\n")
            logger.warning("✗ Could not resolve ambiguous reference")
    except Exception as e:
        print(f"\n{'='*80}")
        print(f"AMBIGUOUS RESOLUTION ERROR")
        print(f"{'='*80}")
        print(f"Citing Ref: {payload.ref}")
        print(f"Error: {e}")
        print(f"{'='*80}\n")
        logger.error(f"✗ Error during disambiguation: {e}", exc_info=True)

    logger.info("=====================================")



@app.task(name="linker.process_non_segment_resolution")
def process_non_segment_resolution(resolution_data: dict) -> None:
    """
    Process a non-segment-level resolution from LinkerOutput.
    Uses LLM to resolve to a specific segment.

    @param resolution_data: dict with structure:
        {
            'ref': str,
            'versionTitle': str,
            'language': str,
            'charRange': [int, int],
            'text': str,
            'resolved_ref': str,
            'ref_level': str  # e.g., 'book', 'chapter', 'section'
        }
    """
    logger.info("=== Processing Non-Segment Resolution ===")
    payload = NonSegmentResolutionPayload(**resolution_data)
    logger.info(f"Ref: {payload.ref}")
    logger.info(f"Version: {payload.versionTitle} ({payload.language})")
    logger.info(f"Text: '{payload.text}'")
    logger.info(f"Char Range: {payload.charRange}")
    logger.info(f"Resolved To: {payload.resolved_non_segment_ref}")

    try:
        result = disambiguate_non_segment_ref(payload)
        if result:
            resolved_ref = result.resolved_ref
            print(f"\n{'='*80}")
            print(f"NON-SEGMENT RESOLUTION SUCCESS")
            print(f"{'='*80}")
            print(f"Citing Ref: {payload.ref}")
            print(f"Version: {payload.versionTitle} ({payload.language})")
            print(f"Citation Text: '{payload.text}'")
            print(f"Char Range: {payload.charRange}")
            print(f"Original Non-Segment Ref: {payload.resolved_non_segment_ref}")
            print(f"→ RESOLVED TO SEGMENT: {resolved_ref}")
            print(f"  Method: {result.method}")
            if getattr(result, "llm_resolved_phrase", None):
                print(f"  Phrase: {result.llm_resolved_phrase}")
            print(f"{'='*80}\n")

            logger.info(f"✓ Resolved to segment: {resolved_ref} (method: {result.method})")
        else:
            print(f"\n{'='*80}")
            print(f"NON-SEGMENT RESOLUTION FAILED")
            print(f"{'='*80}")
            print(f"Citing Ref: {payload.ref}")
            print(f"Citation Text: '{payload.text}'")
            print(f"Non-Segment Ref: {payload.resolved_non_segment_ref}")
            print(f"{'='*80}\n")
            logger.warning("✗ Could not resolve to segment level")
    except Exception as e:
        print(f"\n{'='*80}")
        print(f"NON-SEGMENT RESOLUTION ERROR")
        print(f"{'='*80}")
        print(f"Citing Ref: {payload.ref}")
        print(f"Non-Segment Ref: {payload.resolved_non_segment_ref}")
        print(f"Error: {e}")
        print(f"{'='*80}\n")
        logger.error(f"✗ Error during resolution: {e}", exc_info=True)

    logger.info("=========================================")


@app.task(name="linker.cauldron_routine_disambiguation")
def cauldron_routine_disambiguation(payload: dict) -> dict:
    """
    Single-item disambiguation task that records MUTC/link outputs in a temp collection.
    Accepts either an AmbiguousResolutionPayload or NonSegmentResolutionPayload (as dict).
    """
    logger.info("=== Processing Bulk Disambiguation (single) ===")
    if "ambiguous_refs" in payload:
        amb_payload = AmbiguousResolutionPayload(**payload)
        try:
            result = disambiguate_ambiguous_ref(amb_payload)
            if result and result.resolved_ref:
                _apply_ambiguous_resolution_with_record(amb_payload, result)
        except DictaAPIError as e:
            _record_dicta_failure(_dicta_error_payload(e.info, amb_payload))
        return None

    ns_payload = NonSegmentResolutionPayload(**payload)
    try:
        result = disambiguate_non_segment_ref(ns_payload)
        if result and result.resolved_ref:
            _apply_non_segment_resolution_with_record(ns_payload, result)
    except DictaAPIError as e:
        _record_dicta_failure(_dicta_error_payload(e.info, ns_payload))
    return None
