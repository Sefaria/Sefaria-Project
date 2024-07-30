import structlog
from dataclasses import asdict
from functools import wraps
import django

from sefaria.client.util import celeryResponse, jsonResponse

django.setup()
from sefaria.sefaria_tasks_interace.history_change import LinkChange
from sefaria.model import *
import sefaria.tracker as tracker
from sefaria.client.wrapper import format_object_for_client
from sefaria.settings import CELERY_QUEUES, CELERY_ENABLED
from sefaria.celery_setup.app import app
from sefaria.settings import USE_VARNISH
if USE_VARNISH:
    from sefaria.system.varnish.wrapper import invalidate_ref

logger = structlog.get_logger(__name__)


def should_run_with_celery(from_api):
    return CELERY_ENABLED and from_api


class PossiblyCeleryJSONResponse:
    def __init__(self, data, method):
        self.data = data
        self.method = method

    def __call__(self, callback=None, status=200):
        if should_run_with_celery(self.method == 'API'):
            data = [x.id for x in self.data]
            return celeryResponse(data)
        return jsonResponse(self.data, status=status, callback=callback)


def defer_to_celery_conditionally(queue):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if should_run_with_celery(args[0]['method'] == 'API'):
                signature = func.s(*args, **kwargs).set(queue=queue)
                return signature.delay()
            else:
                return func(*args, **kwargs)
        return wrapper
    return decorator


@should_defer_to_celery(queue=CELERY_QUEUES['tasks'])
@app.task(name="web.save_link")
def save_link(raw_link_change: dict):
    link = raw_link_change['raw_link']
    uid = raw_link_change['uid']
    kwargs = {}
    if raw_link_change['method'] == 'API':
        kwargs['method'] = raw_link_change['method']
    func = tracker.update if "_id" in link else tracker.add
    # use the correct function if params indicate this is a note save
    obj = func(uid, Link, link, **kwargs)
    try:
        if USE_VARNISH:
            for ref in link.refs:
                invalidate_ref(Ref(ref), purge=True)
    except Exception as e:
        logger.error(e)
    return format_object_for_client(obj)
