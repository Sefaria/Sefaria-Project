"""
Topic prompts task for the LLM server
"""

from dataclasses import asdict

from celery import signature
from sefaria_llm_interface.topic_prompt import TopicPromptGenerationOutput

from sefaria.celery_setup.app import app
from sefaria.celery_setup.config import CeleryQueue
from sefaria.helper.llm.topic_prompt import make_topic_prompt_input, save_topic_prompt_output
from sefaria.model.text import Ref
from sefaria.model.topic import Topic


@app.task(name="web.save_topic_prompts")
def save_topic_prompts(raw_output: dict):
    output = TopicPromptGenerationOutput(**raw_output)
    save_topic_prompt_output(output)


def generate_and_save_topic_prompts(lang: str, sefaria_topic: Topic, orefs: list[Ref], contexts: list[str]) -> object:
    topic_prompt_input = make_topic_prompt_input(lang, sefaria_topic, orefs, contexts)
    generate_signature = signature(
        "llm.generate_topic_prompts",
        args=(asdict(topic_prompt_input),),
        queue=CeleryQueue.LLM.value,
    )
    save_signature = save_topic_prompts.s().set(queue=CeleryQueue.TASKS.value)
    chain = generate_signature | save_signature
    return chain()
