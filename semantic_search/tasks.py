from sefaria.celery_setup.app import app


@app.task(name="semantic_search.knn_search")
def knn_search_task(body: dict) -> dict:
    from api.views import KnnSearch

    return KnnSearch.run_search(body)
