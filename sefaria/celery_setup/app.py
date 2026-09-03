import structlog
from celery import Celery
from celery.signals import task_prerun, worker_process_init
from sefaria.celery_setup.config import generate_config_from_env
from sefaria.settings import MULTISERVER_ENABLED

logger = structlog.get_logger(__name__)

app = Celery('sefaria')
raw_config, redis_config, sentinel_config = generate_config_from_env()
app.conf.update(**raw_config, result_expires=1800)
app.autodiscover_tasks(packages=['sefaria.helper.llm', 'sefaria.helper.linker', 'sefaria.helper.crm', 'sefaria.helper.texts'])


@worker_process_init.connect
def _reconnect_multiserver_coordinator(**kwargs):
    """
    A prefork worker process inherits its parent's (pre-fork) redis pubsub socket via
    copy-on-write; with more than one child that means several processes reading the same
    TCP stream. Reconnect fresh here so each child process gets its own subscription.

    MessagingNode.connect()/sync() already catch and log their own Redis errors, but this
    still guards against anything unexpected: a task_prerun/worker_process_init receiver
    raising can disrupt the task run it's attached to, and multiserver sync is not worth
    that risk.
    """
    if not MULTISERVER_ENABLED:
        return
    try:
        from sefaria.system.multiserver.coordinator import server_coordinator
        if server_coordinator:
            server_coordinator.connect()
    except Exception:
        logger.exception("multiserver_coordinator:reconnect_failed")


@task_prerun.connect
def _sync_multiserver_before_task(**kwargs):
    """
    Nothing else drains the multiserver Redis channel in a Celery process: sync() is
    otherwise only called by MultiServerEventListenerMiddleware, which is Django-request-only.
    Without this, a worker's in-memory library cache (index schemas, TOC, linker resolvers,
    ...) is frozen at whatever it was when the process started, and silently never picks up
    edits published from a web pod or another worker for the rest of its lifetime.
    """
    if not MULTISERVER_ENABLED:
        return
    try:
        from sefaria.system.multiserver.coordinator import server_coordinator
        if server_coordinator:
            server_coordinator.sync()
    except Exception:
        logger.exception("multiserver_coordinator:sync_failed")
