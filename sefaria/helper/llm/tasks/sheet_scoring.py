"""
Sheet scoring task for the LLM server
"""
from typing import Dict, Any
from dataclasses import asdict
from celery import signature
from sefaria.settings import CELERY_QUEUES
from sefaria.celery_setup.app import app
from sefaria.helper.llm.sheet_scoring import save_sheet_scoring_output, make_sheet_scoring_input
from sefaria_llm_interface.sheet_scoring import SheetScoringOutput


@app.task(name="web.save_sheets_score")
def save_sheet_scoring(raw_output: dict):
    output = SheetScoringOutput(**raw_output)
    save_sheet_scoring_output(output)


def generate_and_save_sheet_scoring(sheet_content: Dict[str, Any]) -> object:
    llm_queue = CELERY_QUEUES.get('llm')
    tasks_queue = CELERY_QUEUES.get('tasks')
    if not (llm_queue and tasks_queue):  # development environment without tasks pod and llm pod
        return
    sheet_scoring_input = make_sheet_scoring_input(sheet_content)
    generate_signature = signature('llm.score_sheet',
                                   args=(asdict(sheet_scoring_input),),
                                   queue=llm_queue)
    save_signature = save_sheet_scoring.s().set(queue=tasks_queue)
    chain = generate_signature | save_signature
    return chain()
