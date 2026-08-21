from django_topics.models import Topic as DjangoTopic

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

    # The summary must post even if the build aborts partway — an unguarded bad record, or a
    # skip-tracking breaker deciding the degradation is systemic. Without the finally, the
    # abort skips the call below and throws away the skip log that explains what went wrong.
    from sefaria.helper.skip_tracking import signal_and_reset_skip_counts
    try:
        logger.info("Initializing topic pools cache")
        DjangoTopic.objects.build_slug_to_pools_cache()

        logger.info("Initializing library objects.")
        logger.info("Initializing TOC Tree")
        library.get_toc_tree()

        logger.info("Initializing Shared Cache")
        library.init_shared_cache()

        if not settings.DISABLE_AUTOCOMPLETER:
            logger.info("Initializing Full Auto Completer")
            library.build_full_auto_completer()


            logger.info("Initializing Lexicon Auto Completers")
            library.build_lexicon_auto_completers()

            logger.info("Initializing Cross Lexicon Auto Completer")
            library.build_cross_lexicon_auto_completer()


        if settings.ENABLE_LINKER:
            logger.info("Initializing Linker")
            library.build_linker('he')
            library.build_linker('en')

    finally:
        signal_and_reset_skip_counts("startup")

    if server_coordinator:
        server_coordinator.connect()
    logger.info("Initialization Complete")
