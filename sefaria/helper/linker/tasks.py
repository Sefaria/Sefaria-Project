"""
Celery tasks for the LLM server
"""

from celery import signature, chain

from sefaria.settings import USE_VARNISH
from sefaria import tracker
from sefaria.model import library, Link, LinkSet, Version
from sefaria.celery_setup.app import app
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk
from sefaria.model.text import Ref
from dataclasses import dataclass

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
    return link_segment_with_worker_logic(linking_args_dict)



def link_segment_with_worker_logic(linking_args_dict: dict) -> dict:
    linking_args = LinkingArgs(**linking_args_dict)
    linker = library.get_linker(linking_args.lang)
    book_ref = Ref(linking_args.ref)
    output = linker.link(linking_args.text, book_context_ref=book_ref)

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
    print("tracking_args.kwargs", linking_args.kwargs)
    print(type(linking_args.kwargs))
    return {
        "ref": linking_args.ref,
        "linked_refs": linked_refs,
        "vtitle": linking_args.vtitle,
        "lang": linking_args.lang,
        "user_id": linking_args.user_id,
        "tracker_kwargs": linking_args.kwargs or {},
    }


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
def delete_and_save_new_links(payload: [dict]) -> list[dict]:
    """
    Runs after `link_segment_with_worker`. If the payload is None (no spans), do nothing.
    """
    return delete_and_save_new_links_logic(payload)


def delete_and_save_new_links_logic(payload: [dict]):
    if not payload:
        return []

    target_oref = Ref(payload["ref"])
    linked_orefs = [Ref(r) for r in payload.get("linked_refs", [])]
    # text_id = payload.get("text_id")
    text_id = Version().load({"versionTitle": payload.get("vtitle"), "language": payload.get("lang")})._id if payload.get("vtitle") and payload.get("lang") else None
    user = payload.get("user_id")     # pass-through for tracker
    kwargs = payload.get("tracker_kwargs", {})

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
        print(exLink)
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

    return links



def enqueue_linking_chain(linking_args: LinkingArgs):
    sig1 = app.signature(
        "linker.link_segment_with_worker",
        args=(linking_args.__dict__,),
        options={"queue": "linker"}   # optional routing
    )
    sig2 = app.signature(
        "linker.delete_and_save_new_links",
        options={"queue": "linker"} # add if you want it on same/different queue
    )

    # Use canvas piping to chain:
    return (sig1 | sig2).apply_async()

def enqueue_linking_chain_debug(linking_args: LinkingArgs):
    from dataclasses import asdict
    payload = link_segment_with_worker_logic(asdict(linking_args))  # sync, hits breakpoints
    if payload is None:  # mirror the chain's stop-on-none behavior
        return []
    return delete_and_save_new_links_logic(payload)
