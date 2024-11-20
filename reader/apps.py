import os
import sys
from django.apps import AppConfig

import structlog
logger = structlog.get_logger(__name__)


class ReaderAppConfig(AppConfig):
    name = 'reader'

    def ready(self):
        from .startup import init_library_cache
        logger.info(f'Starting reader app: {os.environ.get("RUN_MAIN")} -- {", ".join(sys.argv)}')

        if not os.environ.get('RUN_MAIN', None) and len(sys.argv) > 1 and sys.argv[1] == 'runserver':
            init_library_cache()
