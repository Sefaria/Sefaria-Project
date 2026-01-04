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
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk, MUTCSpanType, LinkerOutput, MarkedUpTextChunkSet
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
    mutc_trefs = sorted({s["ref"] for s in spans if "ref" in s})  # unique + stable
    msg = DeleteAndSaveLinksMsg(
        ref=linking_args.ref,
        added_mutc_trefs=mutc_trefs,
        vtitle=linking_args.vtitle,
        lang=linking_args.lang,
        user_id=linking_args.user_id,
        tracker_kwargs=linking_args.kwargs,
    )
    
    delete_and_save_new_links(asdict(msg))


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
        options={"queue": CELERY_QUEUES["tasks"]}
    )
    return sig.apply_async()
