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
def link_segment_with_worker(raw_input: dict):
    print(f"raw_intput: {raw_input}")
    linker = library.get_linker(raw_input['lang'])
    output = linker.link(raw_input['text'], book_context_ref=Ref(raw_input['ref']))
    spans = []
    for resolved_ref in output.resolved_refs:
        if resolved_ref.is_ambiguous:
            print("Ambiguous reference found, skipping:", resolved_ref)
            continue
        print("Resolved ref:", resolved_ref)
        entity = resolved_ref.raw_entity
        spans.append({
            "charRange": entity.char_indices,
            "text": entity.text,
            "type": 'citation',
            "ref": resolved_ref.ref.normal(),
        })
    chunk = MarkedUpTextChunk({
        "ref": raw_input['ref'],
        "versionTitle": raw_input['vtitle'],
        "language": raw_input['lang'],
        "spans": spans
    })
    print(f"Chunk created: {chunk}")
    chunk.save()
    return True
