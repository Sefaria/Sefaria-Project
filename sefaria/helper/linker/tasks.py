"""
Celery tasks for the LLM server
"""

from celery import signature
from sefaria.model import library
from sefaria.celery_setup.app import app
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk
from sefaria.model.text import Ref




@app.task(name="linker.hello_world")
def hello_world(words: str):
    print(words)


@app.task(name="linker.link_segment_with_worker")
def link_segment_with_worker(raw_input: dict) -> bool:
    linker = library.get_linker(raw_input["lang"])
    book_ref = Ref(raw_input["ref"])
    output = linker.link(raw_input["text"], book_context_ref=book_ref)

    spans = _extract_resolved_spans(output.resolved_refs)
    if not spans:
        print(f"No spans found for {raw_input['ref']} in {raw_input['lang']}")
        return True
    chunk = MarkedUpTextChunk({
        "ref": raw_input["ref"],
        "versionTitle": raw_input["vtitle"],
        "language": raw_input["lang"],
        "spans": spans,
    })

    _replace_existing_chunk(chunk)
    chunk.save()
    return True


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