"""
Celery tasks for the LLM server
"""
from typing import List
from dataclasses import asdict
from celery import signature

from sefaria.model import library
from sefaria.settings import CELERY_QUEUES
from sefaria.celery_setup.app import app




@app.task(name="linker.hello_world")
def hello_world(words: str):
    print(words)



@app.task(name="linker.link_segment_with_worker")
def link_segment_with_worker(raw_input: dict):
    print(f"raw_input type: {type(raw_input)} value: {raw_input}")
    print(f"Linking segment with input: {raw_input}")
    linker = library.get_linker(raw_input['lang'])
    output = linker.link(raw_input['text'], book_context_ref=raw_input['ref'])
    print(output)
    return str(output)


