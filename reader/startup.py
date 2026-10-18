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
    from sefaria.system.cache import gen_cache
    from django.conf import settings

    # The individual builders below wrap themselves; this outer block groups them, so a boot
    # that skipped records reports them once, as "startup", rather than once per builder. It
    # also guarantees the summary posts if the build aborts partway.
    from sefaria.helper.skip_tracking import build_pathway
    with build_pathway("startup"):
        logger.info("Initializing topic pools cache")
        DjangoTopic.objects.build_slug_to_pools_cache()

        logger.info("Initializing library objects.")
        logger.info("Initializing TOC Tree")
        library.get_toc_tree()

        logger.info("Initializing Shared Cache")
        library.init_shared_cache()

        # Built through gen_cache, so the first request doesn't count as a cold start and rebuild them.
        if not settings.DISABLE_AUTOCOMPLETER:
            logger.info("Initializing Full Auto Completer")
            gen_cache.get("full_auto_completer")

            logger.info("Initializing Lexicon Auto Completers")
            gen_cache.get("lexicon_auto_completer")

            logger.info("Initializing Cross Lexicon Auto Completer")
            gen_cache.get("cross_lexicon_auto_completer")

        if settings.ENABLE_LINKER:
            logger.info("Initializing Linker")
            gen_cache.get("linker_resolver:he")
            gen_cache.get("linker_resolver:en")


    logger.info("Initialization Complete")
