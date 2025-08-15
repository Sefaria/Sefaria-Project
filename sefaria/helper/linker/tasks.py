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
import structlog

logger = structlog.get_logger(__name__)

library.build_linker("he")

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
    logger.info(
        "find_refs_api_task:start",
        keys=list(raw_find_refs_input.keys()),
        has_text=isinstance(raw_find_refs_input.get("text"), (dict,)),
        has_options=isinstance(raw_find_refs_input.get("options"), (dict,)),
        has_metadata=isinstance(raw_find_refs_input.get("metadata"), (dict,)),
    )
    find_refs_input = FindRefsInput(**raw_find_refs_input)
    try:
        result = make_find_refs_response(find_refs_input)
        # summarize result sizes
        title_results = len(result.get("title", {}).get("results", []) if isinstance(result.get("title"), dict) else [])
        body_results = len(result.get("body", {}).get("results", []) if isinstance(result.get("body"), dict) else [])
        logger.info(
            "find_refs_api_task:done",
            lang=find_refs_input.text.lang,
            title_len=len(find_refs_input.text.title or ""),
            body_len=len(find_refs_input.text.body or ""),
            title_results=title_results,
            body_results=body_results,
        )
        return result
    except Exception:
        logger.exception("find_refs_api_task:error")
        raise


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