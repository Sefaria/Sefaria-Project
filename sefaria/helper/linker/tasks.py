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
from sefaria.model import library, Link, LinkSet, Version
from sefaria.celery_setup.app import app
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk, MUTCSpanType, LinkerResolutionsDebug
from sefaria.model import Ref
from sefaria.model.linker.ref_resolver import ResolutionThoroughness, ResolvedRef, AmbiguousResolvedRef
from sefaria.model.linker.ref_part import TermContext, RefPartType
from sefaria.model.linker.linker import LinkedDoc
from sefaria.helper.linker.linker import make_find_refs_response, FindRefsInput
from dataclasses import dataclass, field, asdict
from bson import ObjectId
import structlog
from typing import Any, Dict, List, Optional


logger = structlog.get_logger(__name__)


from sefaria.system.exceptions import InputError, DuplicateRecordError
from sefaria.system.varnish.wrapper import invalidate_ref


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
    linked_refs: List[str]
    vtitle: Optional[str] = None
    lang: Optional[str] = None
    user_id: Optional[str] = None
    version_id: Optional[str] = None
    tracker_kwargs: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "DeleteAndSaveLinksMsg":
        return cls(
            ref=d["ref"],
            linked_refs=list(d.get("linked_refs", [])),
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
def link_segment_with_worker(linking_args_dict: dict) -> dict:
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
    output = linker.link(linking_args.text, book_context_ref=book_ref, thoroughness=ResolutionThoroughness.HIGH, with_failures=True)

    _save_linker_debug_data(linking_args.ref, linking_args.vtitle, linking_args.lang, output)
    # Build spans/chunk (write MarkedUpTextChunk)
    spans = _extract_resolved_spans(output.resolved_refs)
    if not spans:
        # Nothing to do next — stop the chain by returning None
        return None

    chunk = MarkedUpTextChunk({
        "ref": linking_args.ref,
        "versionTitle": linking_args.vtitle,
        "language": linking_args.lang,
        "spans": spans,
    })

    existing_spans = _replace_existing_chunk(chunk)
    if existing_spans:
        logger.info(f"num spans before merge: {len(chunk.spans) + len(existing_spans)}")
        chunk.add_non_overlapping_spans(existing_spans)
        logger.info(f"num spans after merge: {len(chunk.spans)}")
    chunk.save()

    # Prepare the minimal info the next task needs
    linked_refs = sorted({s["ref"] for s in spans if "ref" in s})  # unique + stable
    msg = DeleteAndSaveLinksMsg(
        ref=linking_args.ref,
        linked_refs=linked_refs,
        vtitle=linking_args.vtitle,
        lang=linking_args.lang,
        user_id=linking_args.user_id,
        version_id=linking_args.kwargs.get('version_id'),
        tracker_kwargs=linking_args.kwargs,
    )
    return asdict(msg)


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


def _save_linker_debug_data(tref: str, version_title: str, lang: str, doc: LinkedDoc) -> None:
    spans = _extract_debug_spans(doc)
    if not spans:
        return
    query = {
        "ref": tref,
        "versionTitle": version_title,
        "language": lang,
    }
    existing = LinkerResolutionsDebug().load(query)
    if existing:
        existing.delete()
    query["spans"] = spans
    LinkerResolutionsDebug(query).save()


def _extract_debug_spans(doc: LinkedDoc) -> list[dict]:
    spans = []
    for resolved in doc.all_resolved:
        if isinstance(resolved, ResolvedNamedEntity):
            for topic in resolved.topics:
                spans.append(_get_debug_span_from_resolved(resolved, topic))
        elif isinstance(resolved, ResolvedCategory):
            for category in resolved.categories:
                spans.append(_get_debug_span_from_resolved(resolved, category))
        elif isinstance(resolved, ResolvedRef):
            spans.append(_get_debug_span_from_resolved(resolved))
        elif isinstance(resolved, AmbiguousResolvedRef):
            for resolved_ref in resolved.resolved_raw_refs:
                spans.append(_get_debug_span_from_resolved(resolved_ref))
    return spans


def _get_debug_span_from_resolved(resolved, obj=None) -> dict:
    span = {
        "text": resolved.raw_entity.text,
        "charRange": resolved.raw_entity.char_indices,
        "failed": resolved.resolution_failed,
        "ambiguous": resolved.is_ambiguous,
    }
    if isinstance(resolved, ResolvedNamedEntity):
        span.update({"type": MUTCSpanType.NAMED_ENTITY.value, "topicSlug": obj.slug})
    elif isinstance(resolved, ResolvedCategory):
        span.update({"type": MUTCSpanType.CATEGORY.value, "categoryPath": obj.path})
    elif isinstance(resolved, ResolvedRef):
        span.update({
            "type": MUTCSpanType.CITATION.value,
            "ref": resolved.ref.normal() if resolved.ref else None,
            "inputRefParts": [p.text for p in resolved.raw_entity.raw_ref_parts],
            "inputRefPartTypes": [p.type.name for p in resolved.raw_entity.raw_ref_parts],
            "inputRefPartClasses": [p.__class__.__name__ for p in resolved.raw_entity.raw_ref_parts],
            "refPartsToMatch": [p.text for p in resolved.raw_entity.parts_to_match],
            "contextRef": resolved.context_ref.normal() if resolved.context_ref else None,
            "contextType": resolved.context_type.name if resolved.context_type else None,
        })
        if resolved.ref:
            span.update({
                "resolvedRefParts": [p.term.slug if isinstance(p, TermContext) else p.text for p in resolved.resolved_parts],
                "resolvedRefPartTypes": [p.type.name for p in resolved.resolved_parts],
                "resolvedRefPartClasses": [p.__class__.__name__ for p in resolved.resolved_parts],
            })
        if RefPartType.RANGE.name in span['inputRefPartTypes']:
            range_part = next((p for p in resolved.raw_entity.parts_to_match if p.type == RefPartType.RANGE), None)
            span.update({
                'inputRangeSections': [p.text for p in range_part.sections],
                'inputRangeToSections': [p.text for p in range_part.toSections]
            })
    return span


def _replace_existing_chunk(chunk: MarkedUpTextChunk) -> Optional[list[dict]]:
    existing = MarkedUpTextChunk().load({
        "ref": chunk.ref,
        "language": chunk.language,
        "versionTitle": chunk.versionTitle,
    })
    if existing:
        spans = list(filter(lambda span: span["type"] == MUTCSpanType.NAMED_ENTITY.value, existing.spans))
        existing.delete()
        return spans


@app.task(name="linker.delete_and_save_new_links")
def delete_and_save_new_links(payload: dict) -> None:
    if not payload:
        return []

    msg = DeleteAndSaveLinksMsg.from_dict(payload)

    target_oref = Ref(msg.ref)
    linked_orefs = [Ref(r) for r in msg.linked_refs]

    user = msg.user_id
    kwargs = msg.tracker_kwargs

    found = []   # normal refs discovered in this run
    links = []   # links actually created

    existingLinks = LinkSet({
        "refs": target_oref.normal(),
        "auto": True,
        "generated_by": "add_links_from_text",
        "source_text_oid": ObjectId(msg.version_id),
    }).array()

    for linked_oref in linked_orefs:
        link = {
            "refs": [target_oref.normal(), linked_oref.normal()],
            "type": "",
            "auto": True,
            "generated_by": "add_links_from_text",
            "source_text_oid": ObjectId(msg.version_id),
            "inline_citation": True
        }
        found.append(linked_oref.normal())

        try:
            tracker.add(user, Link, link, **kwargs)
            links.append(link)
            if USE_VARNISH:
                invalidate_ref(linked_oref)
        except DuplicateRecordError as e:
            # Link exists - skip
            print(f"Existing Link no need to change: {e}")
        except InputError as e:
            # Other kinds of input error
            print(f"InputError: {e}")

    # Remove existing links that are no longer supported by the text
    for exLink in existingLinks:
        for r in exLink.refs:
            if r == target_oref.normal():  # current base ref
                continue
            if USE_VARNISH:
                try:
                    invalidate_ref(Ref(r))
                except InputError:
                    pass
            if r not in found:
                tracker.delete(user, Link, exLink._id)
            break


def enqueue_linking_chain(linking_args: LinkingArgs):
    sig1 = signature(
        "linker.link_segment_with_worker",
        args=(asdict(linking_args),),
        options={"queue": CELERY_QUEUES["tasks"]}
    )
    sig2 = signature(
        "linker.delete_and_save_new_links",
        options={"queue": CELERY_QUEUES["tasks"]}
    )
    return (sig1 | sig2).apply_async()
