import structlog
from dataclasses import asdict
import django
django.setup()
from sefaria.sefaria_tasks_interace.history_change import LinkChange
from sefaria.model import *
import sefaria.tracker as tracker
from sefaria.client.wrapper import format_object_for_client
from sefaria.settings import CELERY_QUEUES
from sefaria.celery_setup.app import app
from sefaria.settings import USE_VARNISH
if USE_VARNISH:
    from sefaria.system.varnish.wrapper import invalidate_ref

logger = structlog.get_logger(__name__)


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


def defer_save_link(uid, raw_link: dict, method: str = 'Site'):
    link_change = LinkChange(raw_link=raw_link, uid=uid, method=method)
    save_signature = save_link.s(asdict(link_change)).set(queue=CELERY_QUEUES['tasks'])
    return save_signature.delay()
