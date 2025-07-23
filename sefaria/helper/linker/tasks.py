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



@app.task(name="linker.link_paragraph")
def link_paragraph(raw_output: dict):
    linker = library.get_linker('en')
    output = linker.link_by_paragraph(raw_output['text'], raw_output['ref'])
    print(output)
    return str(output)


