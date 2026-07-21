"""
Rebuild the NonUniqueTerm -> MatchTemplate usage index (see
sefaria.model.linker.nonuniqueterm_index) from scratch by walking every index's
schema tree. Run after a deploy or whenever the index needs to be re-warmed.

    python manage.py build_nonuniqueterm_index
"""
from django.core.management.base import BaseCommand

import sefaria.model.linker.nonuniqueterm_index as nonuniqueterm_index


class Command(BaseCommand):
    help = "Rebuild the NonUniqueTerm -> MatchTemplate usage index in the shared cache."

    def handle(self, *args, **options):
        self.stdout.write("Rebuilding NonUniqueTerm usage index...")
        count = nonuniqueterm_index.rebuild()
        self.stdout.write(self.style.SUCCESS(
            "Done. Wrote {} usage entries.".format(count)))
