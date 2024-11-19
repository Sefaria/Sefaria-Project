from django.apps import AppConfig
import os


class ReaderAppConfig(AppConfig):
    name = 'reader'

    def ready(self):
        from .startup import init_library_cache
        if not os.environ.get('RUN_MAIN', None):
            init_library_cache()
