import traceback
import uuid
import structlog
import django
from celery import chord
from collections import Counter
from sefaria.client.util import celeryResponse, jsonResponse
from sefaria.system.exceptions import DuplicateRecordError

django.setup()
from sefaria.model import *
import sefaria.tracker as tracker
from sefaria.client.wrapper import format_object_for_client
from sefaria.settings import CELERY_QUEUES, CELERY_ENABLED
from sefaria.celery_setup.app import app
from sefaria.settings import USE_VARNISH
from sefaria.helper.slack.send_message import send_message
if USE_VARNISH:
    from sefaria.system.varnish.wrapper import invalidate_ref

logger = structlog.get_logger(__name__)


def should_run_with_celery(from_api):
    return CELERY_ENABLED and from_api

def save_changes(changes, func, method):
    if should_run_with_celery(method == 'API'):
        main_task_id = str(uuid.uuid4())
        tasks = [save_change.s(func.__name__, c).set(queue=CELERY_QUEUES['tasks']) for c in changes]
        job = chord(tasks, inform.s(main_task_id=main_task_id).set(queue=CELERY_QUEUES['tasks']))(task_id=main_task_id)
        tasks_ids = [task.id for task in job.parent.results]
        return celeryResponse(job.id, tasks_ids)
    else:
        results = []
        for change in changes:
            try:
                func(change)
            except Exception as e:
                results.append({'error': f'Object: {change}. Error: {e}'})
            else:
                results.append({'status': 'ok'})
        return jsonResponse(results)

@app.task(name="web.save_change", acks_late=True, ignore_result=True)
def save_change(func_name, raw_history_change):
    function_names = {'save_link': save_link, 'save_version': save_version}
    func = function_names[func_name]
    try:
        func(raw_history_change)
        return 'Success'
    except Exception as e:
        logger.error(f'''Error:
            change: {raw_history_change}
            {traceback.format_exc()}''')
        if isinstance(e, DuplicateRecordError):
            return 'DuplicateRecordError'
        else:
            return repr(e)

@app.task(name="web.inform", acks_late=True)
def inform(results, main_task_id):
    title = f'Results for celery main task with id {main_task_id}'
    results = '\n'.join([f'{k}: {v}.' for k, v in Counter(results).items()])
    send_message('#engineering-signal', 'Text Upload', title, results, icon_emoji=':leafy_green:')

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

def save_version(raw_version_change: dict):
    version = raw_version_change['raw_version']
    uid = raw_version_change['uid']
    patch = raw_version_change['patch']
    kwargs = {'skip_links': raw_version_change['skip_links'], 'count_after': raw_version_change['count_after']}
    tracker.modify_version(uid, version, patch, **kwargs)
