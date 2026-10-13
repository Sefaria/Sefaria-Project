# Using staticfiles as the base class in order to not overwrite its custom runserver logic
import structlog
from django.contrib.staticfiles.management.commands.runserver import Command as RunserverCommand

from reader.startup import init_library_cache, init_sentry_from_settings

logger = structlog.get_logger(__name__)


class Command(RunserverCommand):
    def get_handler(self, *args, **options):
        handler = super().get_handler(*args, **options)
        logger.info("Starting reader application")
        init_library_cache()
        init_sentry_from_settings()
        return handler
