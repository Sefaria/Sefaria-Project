"""
Commentary scoring task for the LLM server
"""
from dataclasses import asdict
from celery import signature
from sefaria.settings import CELERY_QUEUES
from sefaria.celery_setup.app import app
from sefaria.helper.llm.commentary_scoring import make_commentary_scoring_input, save_commentary_scoring_output
from sefaria_llm_interface.commentary_scoring import CommentaryScoringOutput


@app.task(name="web.save_commentary_score")
def save_commentary_scoring(raw_output: dict):
    output = CommentaryScoringOutput(**raw_output)
    save_commentary_scoring_output(output)


def generate_and_save_commentary_scoring(commentary_ref: str) -> object:
    commentary_scoring_input = make_commentary_scoring_input(commentary_ref)
    generate_signature = signature(
        'llm.score_commentary',
        args=(asdict(commentary_scoring_input),),
        queue='llm'
        )
    save_signature = save_commentary_scoring.s().set(queue=CELERY_QUEUES['tasks'])
    chain = generate_signature | save_signature
    return chain()

