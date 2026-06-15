from django.core.management.base import BaseCommand
from sefaria.model.category import Category


class Command(BaseCommand):
    help = 'Creates the "Community" category for community book uploads'

    def handle(self, *args, **options):
        existing = Category().load({"path": ["Community"]})
        if existing:
            self.stdout.write(self.style.WARNING('Category "Community" already exists. Skipping.'))
            return

        cat = Category()
        cat.path = ["Community"]
        cat.lastPath = "Community"
        cat.depth = 1
        cat.add_primary_titles("Community", "קהילה")
        cat.save()
        self.stdout.write(self.style.SUCCESS('Successfully created "Community" category.'))
