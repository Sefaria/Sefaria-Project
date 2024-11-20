from django.apps import AppConfig

import structlog
logger = structlog.get_logger(__name__)


class ReaderAppConfig(AppConfig):
    name = 'reader'

    def ready(self):
        from .startup import init_library_cache
        logger.info('Starting reader')
        init_library_cache()
