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
from sefaria.settings import CELERY_ENABLED
from sefaria.celery_setup.app import app
from sefaria.celery_setup.config import CeleryQueue
from sefaria.settings import USE_VARNISH
from sefaria.helper.slack.send_message import send_message
if USE_VARNISH:
    from sefaria.system.varnish.wrapper import invalidate_ref

logger = structlog.get_logger(__name__)


def should_run_with_celery(from_api):
    return CELERY_ENABLED and from_api

def save_changes(changes, func, method, task_title=''):
    if should_run_with_celery(method == 'API'):
        main_task_id = str(uuid.uuid4())
        tasks = [save_change.s(func.__name__, c).set(queue=CeleryQueue.TASKS.value) for c in changes]
        job = chord(tasks, inform.s(main_task_id=main_task_id, task_title=task_title).set(queue=CeleryQueue.TASKS.value))(task_id=main_task_id)
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
def inform(results, main_task_id, task_title):
    title = f'{task_title} (celery main task id {main_task_id})'
    results = '\n'.join([f'{k}: {v}.' for k, v in Counter(results).items()])
    success = send_message('#engineering-signal', 'Text Upload', title, results, icon_emoji=':leafy_green:')
    if not success:
        logger.warning(f"Failed to send Slack notification for task {main_task_id}")

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


@app.task(name="web.update_index_title", bind=True, acks_late=True)
def update_index_title(self, uid: int, attrs: dict, raw: bool, method) -> dict:
    """Rename an Index and cascade all dependent records.

    Wraps the full tracker.update() call so that every subscriber in
    dependencies.py (versions, links, notes, history, sheets, ref data,
    user history, topic links, manuscripts, marked-up chunks, cache, TOC)
    runs in the Celery worker rather than blocking the request.
    """
    from sefaria.system.progress_context import set_progress_reporter, reset_progress_reporter
    old_title = attrs.get("oldTitle")
    new_title = attrs.get("title")
    logger.info("update_index_title:start", old_title=old_title, new_title=new_title, uid=uid, task_id=self.request.id)
    token = set_progress_reporter(
        lambda step: self.update_state(state='PROGRESS', meta={'step': step})
    )
    try:
        index_obj = tracker.update(uid, Index, attrs, raw=raw, method=method)
        logger.info("update_index_title:complete", old_title=old_title, new_title=new_title, uid=uid, task_id=self.request.id)
        return {"status": "ok", "title": index_obj.title}
    except Exception as e:
        logger.error("update_index_title:failed", old_title=old_title, new_title=new_title, uid=uid, task_id=self.request.id, error=str(e))
        raise
    finally:
        reset_progress_reporter(token)
