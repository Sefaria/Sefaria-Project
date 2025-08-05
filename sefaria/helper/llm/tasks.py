"""
Celery tasks for the LLM server
"""
from typing import List, Dict
from dataclasses import asdict
from celery import signature
from sefaria.settings import CELERY_QUEUES
from sefaria.celery_setup.app import app
from sefaria.model.topic import Topic
from sefaria.model.text import Ref
from sefaria.helper.llm.topic_prompt import save_topic_prompt_output, make_topic_prompt_input
from sefaria.helper.llm.sheet_scoring import save_sheet_scoring_output, make_sheet_scoring_input
from sefaria_llm_interface.topic_prompt import TopicPromptGenerationOutput
from sefaria_llm_interface.scoring_io import SheetScoringOutput


@app.task(name="web.save_topic_prompts")
def save_topic_prompts(raw_output: dict):
    output = TopicPromptGenerationOutput(**raw_output)
    save_topic_prompt_output(output)


@app.task(name="web.save_sheets_score")
def save_sheet_scoring(raw_output: dict):
    output = SheetScoringOutput(**raw_output)
    save_sheet_scoring_output(output)


def generate_and_save_sheet_scoring(sheet_content: Dict[str, any]) -> object:
    inp = make_sheet_scoring_input(sheet_content)
    generate_signature = signature('llm.score_sheet',args=(asdict(inp),),queue=CELERY_QUEUES['llm'])
    save_signature = save_sheet_scoring.s().set(queue=CELERY_QUEUES['tasks'])
    chain = generate_signature | save_signature
    return chain()


def generate_and_save_topic_prompts(lang: str,sefaria_topic: Topic,
                                    orefs: List[Ref],
                                    contexts: List[str]) -> object:
    topic_prompt_input = make_topic_prompt_input(lang, sefaria_topic, orefs, contexts)
    generate_signature = signature('llm.generate_topic_prompts', args=(asdict(topic_prompt_input),), queue=CELERY_QUEUES['llm'])
    save_signature = save_topic_prompts.s().set(queue=CELERY_QUEUES['tasks'])
    chain = generate_signature | save_signature
    return chain()
