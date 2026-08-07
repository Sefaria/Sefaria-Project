from sefaria.celery_setup.app import app
from semantic_search.natural_language_search import run_natural_language_search


@app.task(bind=True, name="semantic_search.natural_language_search", acks_late=True)
def natural_language_search_task(self, query: str) -> dict:
    def progress(phase: str, meta: dict):
        self.update_state(state="PROGRESS", meta={"phase": phase, **meta})

    return run_natural_language_search(query, progress_callback=progress)
