"""
Celery tasks for the LLM server
"""

from celery import signature
from sefaria.model import library
from sefaria.celery_setup.app import app
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk
from sefaria.model import Ref, text, library # Importing library to get it preloaded before workers start
from sefaria.helper.linker.linker import make_find_refs_response, FindRefsInput
from dataclasses import dataclass


@dataclass(frozen=True)
class LinkingArgs:
    ref: str
    text: str
    lang: str
    vtitle: str


@app.task(name="linker.find_refs_api")
def find_refs_api_task(raw_find_refs_input: dict) -> dict:
    """
    Celery task for the find-refs API endpoint.
    @param raw_find_refs_input:
    @return:
    """
    find_refs_input = FindRefsInput(**raw_find_refs_input)
    # since output is already serialized, we can return it directly
    return make_find_refs_response(find_refs_input)


@app.task(name="linker.link_segment_with_worker")
def link_segment_with_worker(linking_args_dict: dict) -> None:
    linking_args = LinkingArgs(**linking_args_dict)
    linker = library.get_linker(linking_args.lang)
    book_ref = Ref(linking_args.ref)
    output = linker.link(linking_args.text, book_context_ref=book_ref)

    spans = _extract_resolved_spans(output.resolved_refs)
    if not spans:
        return
    chunk = MarkedUpTextChunk({
        "ref": linking_args.ref,
        "versionTitle": linking_args.vtitle,
        "language": linking_args.lang,
        "spans": spans,
    })

    _replace_existing_chunk(chunk)
    chunk.save()


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