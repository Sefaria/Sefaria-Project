"""
Management command to clear the development file cache.

Usage:
    python manage.py clear_dev_cache           # Clear all cache entries
    python manage.py clear_dev_cache --list    # List all cache entries
    python manage.py clear_dev_cache --name full_auto_completer  # Clear specific entry
"""
from django.core.management.base import BaseCommand
from sefaria.system.cache import clear_dev_file_cache, list_dev_file_cache, is_dev_file_cache_enabled


class Command(BaseCommand):
    help = 'Clear the development file cache used for persisting library objects across server reloads'

    def add_arguments(self, parser):
        parser.add_argument(
            '--name',
            type=str,
            help='Clear a specific cache entry by name (e.g., full_auto_completer, linker_he)',
        )
        parser.add_argument(
            '--list',
            action='store_true',
            help='List all cache entries instead of clearing',
        )

    def handle(self, *args, **options):
        if not is_dev_file_cache_enabled():
            self.stdout.write(
                self.style.WARNING(
                    'Dev file cache is not enabled. Set USE_DEV_FILE_CACHE = True in local_settings.py'
                )
            )

        if options['list']:
            entries = list_dev_file_cache()
            if entries:
                self.stdout.write('Dev file cache entries:')
                for entry in entries:
                    self.stdout.write(f'  - {entry}')
            else:
                self.stdout.write('No cache entries found.')
            return

        name = options.get('name')
        deleted = clear_dev_file_cache(name)

        if name:
            if deleted:
                self.stdout.write(self.style.SUCCESS(f'Cleared cache entry: {name}'))
            else:
                self.stdout.write(self.style.WARNING(f'Cache entry not found: {name}'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Cleared {deleted} cache entries'))
