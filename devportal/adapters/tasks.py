"""Run portal work on Celery when workers exist, inline otherwise (PLAN.md §2.11).

Follows the pattern at `sefaria/tracker.py`: `CELERY_ENABLED` decides. Cauldrons run without
workers by default, so inline is the common case outside production. The Celery app itself is the
Sefaria one; `devportal/tasks.py` declares its tasks with `shared_task`, so nothing here imports
`sefaria.*`.
"""

import logging

from django.conf import settings

logger = logging.getLogger("devportal")


def celery_enabled():
    return bool(getattr(settings, "CELERY_ENABLED", False))


def run(task, *args, **kwargs):
    """Queue `task` when Celery is enabled, else call it inline. Returns the inline result or None."""
    if celery_enabled():
        try:
            task.delay(*args, **kwargs)
            return None
        except Exception:
            logger.exception("devportal: could not queue %s; running it inline", getattr(task, "name", task))
    return task(*args, **kwargs)
