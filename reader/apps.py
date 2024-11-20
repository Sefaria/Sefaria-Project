from django.apps import AppConfig


class ReaderAppConfig(AppConfig):
    name = 'reader'

    def ready(self):
        from .startup import init_library_cache
        init_library_cache()
