import time
from contextlib import contextmanager

from django_topics.models import Topic as DjangoTopic


@contextmanager
def _timed_step(logger, name):
    t0 = time.monotonic()
    logger.info("startup_step_start", step=name)
    try:
        yield
    finally:
        logger.info("startup_step_end", step=name, elapsed_sec=round(time.monotonic() - t0, 2))


def init_sentry_from_settings():
    import structlog
    logger = structlog.get_logger(__name__)

    from django.conf import settings
    sentry_dsn = getattr(settings, "SENTRY_DSN", None)
    if not sentry_dsn:
        return

    from sefaria.settings_utils import init_sentry
    logger.info("Initializing Sentry")
    init_sentry(
        sentry_dsn,
        getattr(settings, "SENTRY_CODE_VERSION", "unknown"),
        getattr(settings, "SENTRY_ENVIRONMENT", "unknown"),
    )


def init_library_cache():
    import django
    django.setup()
    import structlog
    logger = structlog.get_logger(__name__)

    from sefaria.model.text import library
    from sefaria.system.multiserver.coordinator import server_coordinator
    from django.conf import settings

    with _timed_step(logger, "topic_pools_cache"):
        DjangoTopic.objects.build_slug_to_pools_cache()

    logger.info("Initializing library objects.")
    with _timed_step(logger, "toc_tree"):
        library.get_toc_tree()

    with _timed_step(logger, "shared_cache"):
        library.init_shared_cache()

    if not settings.DISABLE_AUTOCOMPLETER:
        with _timed_step(logger, "full_auto_completer"):
            library.build_full_auto_completer()
        with _timed_step(logger, "lexicon_auto_completers"):
            library.build_lexicon_auto_completers()
        with _timed_step(logger, "cross_lexicon_auto_completer"):
            library.build_cross_lexicon_auto_completer()

    if settings.ENABLE_LINKER:
        with _timed_step(logger, "linker_he"):
            library.build_linker('he')
        with _timed_step(logger, "linker_en"):
            library.build_linker('en')

    if server_coordinator:
        with _timed_step(logger, "server_coordinator_connect"):
            server_coordinator.connect()
    logger.info("Initialization Complete")
