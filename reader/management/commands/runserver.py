from django.contrib.staticfiles.management.commands.runserver import Command as RunserverCommand
from reader.startup import init_library_cache
import structlog
logger = structlog.get_logger(__name__)


class Command(RunserverCommand):

    def get_handler(self, *args, **options):
        handler = super(Command, self).get_handler(*args, **options)
        logger.info("Starting reader application")
        init_library_cache()
        return handler
