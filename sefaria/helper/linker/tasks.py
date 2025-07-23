"""
Celery tasks for the LLM server
"""
from typing import List
from dataclasses import asdict
from celery import signature
from sefaria.settings import CELERY_QUEUES
from sefaria.celery_setup.app import app

from sefaria_llm_interface.topic_prompt import TopicPromptGenerationOutput


@app.task(name="linker.hello_world")
def hello_world(words: str):
    print(words)
