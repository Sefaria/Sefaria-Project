"""
Celery tasks for the LLM server
"""
from sefaria.settings import CELERY_QUEUES
from celery import signature
from celery.signals import worker_init
from sefaria.settings import USE_VARNISH
from sefaria import tracker
from sefaria.model import library, Link, LinkSet, Version
from sefaria.celery_setup.app import app
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk
from sefaria.model import Ref
from sefaria.model.linker.ref_resolver import ResolutionThoroughness
from sefaria.helper.linker.linker import make_find_refs_response, FindRefsInput
from dataclasses import dataclass, field, asdict
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
    output = linker.link(linking_args.text, book_context_ref=book_ref, thoroughness=ResolutionThoroughness.HIGH)

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

    _replace_existing_chunk(chunk)
    chunk.save()

    # Prepare the minimal info the next task needs
    linked_refs = sorted({s["ref"] for s in spans})  # unique + stable
    msg = DeleteAndSaveLinksMsg(
        ref=linking_args.ref,
        linked_refs=linked_refs,
        vtitle=linking_args.vtitle,
        lang=linking_args.lang,
        user_id=linking_args.user_id,
        tracker_kwargs=linking_args.kwargs,
    )
    return asdict(msg)

def _extract_resolved_spans(resolved_refs):
    spans = []
    for resolved_ref in resolved_refs:
        if resolved_ref.is_ambiguous:
            continue
        entity = resolved_ref.raw_entity
        spans.append({
            "charRange": entity.char_indices,
            "text": entity.text,
            "type": "citation",
            "ref": resolved_ref.ref.normal(),
        })
    return spans


def _replace_existing_chunk(chunk: MarkedUpTextChunk):
    existing = MarkedUpTextChunk().load({
        "ref": chunk.ref,
        "language": chunk.language,
        "versionTitle": chunk.versionTitle,
    })
    if existing:
        existing.delete()

@app.task(name="linker.delete_and_save_new_links")
def delete_and_save_new_links(payload: dict) -> None:
    if not payload:
        return []

    msg = DeleteAndSaveLinksMsg.from_dict(payload)

    target_oref = Ref(msg.ref)
    linked_orefs = [Ref(r) for r in msg.linked_refs]
    text_id = None
    if msg.vtitle and msg.lang:
        text_id = Version().load({"versionTitle": msg.vtitle, "language": msg.lang})._id

    user = msg.user_id
    kwargs = msg.tracker_kwargs

    found = []   # normal refs discovered in this run
    links = []   # links actually created

    existingLinks = LinkSet({
        "refs": target_oref.normal(),
        "auto": True,
        "generated_by": "add_links_from_text",
        "source_text_oid": text_id
    }).array()

    for linked_oref in linked_orefs:
        link = {
            "refs": [target_oref.normal(), linked_oref.normal()],
            "type": "",
            "auto": True,
            "generated_by": "add_links_from_text",
            "source_text_oid": text_id,
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
