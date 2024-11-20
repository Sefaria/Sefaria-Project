import os
import sys
from django.apps import AppConfig


class ReaderAppConfig(AppConfig):
    name = 'reader'

    def ready(self):
        from .startup import init_library_cache
        if not os.environ.get('RUN_MAIN', None) and len(sys.argv) > 1 and sys.argv[1] == 'runserver':
            init_library_cache()
