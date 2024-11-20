from django.contrib.staticfiles.management.commands.runserver import Command as RunserverCommand
from reader.startup import init_library_cache


class Command(RunserverCommand):

    def get_handler(self, *args, **options):
        handler = super(Command, self).get_handler(*args, **options)
        init_library_cache()
        return handler
