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
    prev_linked_refs: List[str]
    linked_refs: List[str]
    vtitle: Optional[str] = None
    lang: Optional[str] = None
    user_id: Optional[str] = None
    tracker_kwargs: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "DeleteAndSaveLinksMsg":
        return cls(
            ref=d["ref"],
            prev_linked_refs=list(d.get("prev_linked_refs", [])),
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
    if not spans:
        # Nothing to do next — stop the chain by returning None
        return

    chunk = MarkedUpTextChunk({
        "ref": linking_args.ref,
        "versionTitle": linking_args.vtitle,
        "language": linking_args.lang,
        "spans": spans,
    })

    prev_mutc = _replace_existing_chunk(chunk)

    # Prepare the minimal info the next task needs
    prev_linked_refs = sorted({s["ref"] for s in prev_mutc.spans if "ref" in s}) if prev_mutc else []  # unique + stable
    linked_refs = sorted({s["ref"] for s in spans if "ref" in s})  # unique + stable
    msg = DeleteAndSaveLinksMsg(
        ref=linking_args.ref,
        prev_linked_refs=prev_linked_refs,
        linked_refs=linked_refs,
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
    if not spans:
        return
    query = {
        "ref": tref,
        "versionTitle": version_title,
        "language": lang,
    }
    try:
        LinkerOutput().update(query, {"spans": spans})
    except InputError as e:
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
        existing_spans = list(filter(lambda span: span["type"] == MUTCSpanType.NAMED_ENTITY.value, existing.spans))
        # add_non_overlapping_spans prefers `self.spans` over the spans that are input
        new_mutc = existing.copy()
        new_mutc.spans = chunk.spans
        new_mutc.add_non_overlapping_spans(existing_spans)
        new_mutc.save()
    else:
        chunk.save()
    return existing


@app.task(name="linker.delete_and_save_new_links")
def delete_and_save_new_links(payload: dict):
    msg = DeleteAndSaveLinksMsg.from_dict(payload)
    all_mutcs = MarkedUpTextChunkSet({"ref": msg.ref})
    all_linked_trefs = {span.ref for mutc in all_mutcs for span in mutc.spans if span.type == MUTCSpanType.CITATION.value and hasattr(span, "ref")}
    # add
    linked_trefs_to_add = set(msg.linked_refs) - all_linked_trefs
    for linked_tref in linked_trefs_to_add:
        link = {
            "refs": [msg.ref, linked_tref],
            "type": "",
            "auto": True,
            "generated_by": "add_links_from_text",
            "inline_citation": True
        }

        try:
            tracker.add(msg.user_id, Link, link, **msg.tracker_kwargs)
            if USE_VARNISH:
                invalidate_ref(Ref(linked_tref))
        except DuplicateRecordError as e:
            # Link exists - skip
            print(f"Existing Link no need to change: {e}")
        except InputError as e:
            # Other kinds of input error
            print(f"InputError: {e}")
    # delete
    existing_links = LinkSet({
        "refs": msg.ref,
        "auto": True,
        "generated_by": "add_links_from_text",
    })
    linked_refs_to_delete = set(msg.prev_linked_refs) - all_linked_trefs
    for ex_link in existing_links:
        for r in ex_link.refs:
            if r == msg.ref:  # current base ref
                continue
            if USE_VARNISH:
                try:
                    invalidate_ref(Ref(r))
                except InputError:
                    pass
            if r not in linked_refs_to_delete:
                tracker.delete(msg.user_id, Link, ex_link._id)
            break


def enqueue_linking_chain(linking_args: LinkingArgs):
    sig = signature(
        "linker.link_segment_with_worker",
        args=(asdict(linking_args),),
        options={"queue": CELERY_QUEUES["tasks"]}
    )
    return sig.apply_async()
