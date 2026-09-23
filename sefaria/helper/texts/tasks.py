import traceback
import uuid
import structlog
import django
from celery import chord
from collections import Counter
from typing import Optional
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
    from sefaria.system.varnish.wrapper import invalidate_ref, invalidate_linked

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


def _invalidate_version_title_rename(index_title: str, lang: str, old_version_title: str, new_version_title: str) -> None:
    if not USE_VARNISH:
        return
    try:
        oref = Ref(index_title)
        invalidate_linked(oref)
        invalidate_ref(oref, lang, old_version_title)
        invalidate_ref(oref, lang, new_version_title)
    except Exception as e:
        logger.warning(f"Varnish invalidation failed for {index_title}: {e}")


def run_version_rename(user_id: int, version_title: str, new_version_title: str, index_title: str, language: Optional[str] = None) -> tuple[dict, int]:
    """
    Rename one versionTitle and return a tuple of (response_payload, http_status).
    """
    try:
        # `language` ("he"/"en", i.e. RTL/LTR) is only a coarse filter; multiple versions can
        # share a title + versionTitle across distinct language families. Load the full set so
        # we never silently rename an arbitrary one of several matches.
        load_query = {"title": index_title, "versionTitle": version_title}
        if language:
            load_query["language"] = language
        candidates = VersionSet(load_query)
        if len(candidates) == 0:
            return {"status": "error", "index": index_title, "error": f'No Version "{version_title}" found'}, 404
        if len(candidates) > 1:
            return {
                "status": "error",
                "index": index_title,
                "error": f'Multiple versions named "{version_title}" found; specify a language to disambiguate',
            }, 409
        version = candidates[0]

        # A duplicate is defined by sharing the same actual language family (e.g. "arabic"),
        # not the coarse language/direction field. Read the family name off the loaded version
        # rather than the optional `language` param, and exclude this version from the query so a
        # single match unambiguously means "some other version already occupies this identity".
        collision_query = {
            "title": index_title,
            "versionTitle": new_version_title,
            "_id": {"$ne": version._id},
        }
        language_family = getattr(version, "languageFamilyName", None)
        if language_family:
            collision_query["languageFamilyName"] = language_family
        if Version().load(collision_query):
            return {"status": "error", "index": index_title, "error": f'Version "{new_version_title}" already exists'}, 409

        lang = version.language
        tracker.update_version_metadata(user_id, version, {"versionTitle": new_version_title})
        _invalidate_version_title_rename(index_title, lang, version_title, new_version_title)
        return {
            "status": "ok",
            "index": index_title,
            "versionTitle": version_title,
            "newVersionTitle": new_version_title,
            "language": lang,
        }, 200

    except Exception as e:
        logger.exception(
            "run_version_rename failed",
            index=index_title,
            versionTitle=version_title,
            newVersionTitle=new_version_title,
            language=language,
        )
        error_msg = str(e) if str(e) else type(e).__name__
        return {"status": "error", "index": index_title, "error": error_msg}, 500


@app.task(name="web.rename_version_title", bind=True, acks_late=True)
def rename_version_title(self, rename_payload: dict):
    result, status_code = run_version_rename(
        user_id=rename_payload.get("user_id"),
        version_title=rename_payload.get("versionTitle"),
        new_version_title=rename_payload.get("newVersionTitle"),
        index_title=rename_payload.get("index"),
        language=rename_payload.get("language"),
    )
    result["http_status"] = status_code

    try:
        old_title = rename_payload.get("versionTitle")
        new_title = rename_payload.get("newVersionTitle")
        index_title = rename_payload.get("index")
        task_id = getattr(self.request, "id", None)
        title = f'Version Rename: "{old_title}" -> "{new_title}" [{index_title}]'
        if task_id:
            title = f"{title} (celery task id {task_id})"
        lines = [
            f"Status: {result.get('status')}",
            f"Index: {index_title}",
        ]
        if result.get("status") == "ok":
            lines.append("Result: rename completed")
            color = "#2eb886"
            icon_emoji = ":leafy_green:"
        else:
            lines.append(f"Error: {result.get('error', 'Unknown error')}")
            color = "#a30200"
            icon_emoji = ":warning:"
        slack_response = send_message(
            "#engineering-signal",
            "Version Rename",
            title,
            "\n".join(lines),
            icon_emoji=icon_emoji,
            color=color,
        )
        logger.info(
            "rename_version_title: slack notification sent",
            task_id=task_id,
            index=index_title,
            slack_status_code=getattr(slack_response, "status_code", None),
            slack_ok=getattr(slack_response, "ok", None),
            slack_reason=getattr(slack_response, "reason", None),
        )
        if not getattr(slack_response, "ok", False):
            logger.warning(
                "rename_version_title: slack notification non-2xx",
                task_id=task_id,
                index=index_title,
                slack_status_code=getattr(slack_response, "status_code", None),
                slack_body=getattr(slack_response, "text", None),
            )
    except Exception:
        logger.exception(
            "rename_version_title: slack notification failed",
            task_id=getattr(self.request, "id", None),
            index=rename_payload.get("index"),
        )

    return result

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
