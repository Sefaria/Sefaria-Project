"""
Celery tasks for the LLM server
"""
from typing import List
from celery import signature
from sefaria.celery_setup.app import app
from sefaria.model.topic import Topic
from sefaria.model.text import Ref
from sefaria.helper.llm.topic_prompt import save_topic_prompt_output, make_topic_prompt_input
from sefaria.helper.llm.llm_interface import TopicPromptGenerationOutput


@app.task(name="web.save_topic_prompts")
def save_topic_prompts(raw_output: TopicPromptGenerationOutput):
    output = TopicPromptGenerationOutput.create(raw_output)
    save_topic_prompt_output(output)


def generate_and_save_topic_prompts(lang: str, sefaria_topic: Topic, orefs: List[Ref], contexts: List[str]):
    topic_prompt_input = make_topic_prompt_input(lang, sefaria_topic, orefs, contexts)
    generate_signature = signature('llm.generate_topic_prompts', args=(topic_prompt_input,), queue='llm')
    save_signature = save_topic_prompts.s().set(queue='web')
    chain = generate_signature | save_signature
    return chain()
