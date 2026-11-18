"""Remove pages left behind by the editor's real-write end-to-end tests (PLAN.md §5.2.2 "Writes").

Those tests create hidden pages whose slugs start with `e2e-<run id>-` and delete them in
`afterEach`; this removes any older than `--hours` (default 24), with their revisions and the
redirects that point at them.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from devportal.models import Page, Redirect
from devportal.services.publish import bump_generation, schedule_rebuild

PREFIX = "e2e-"


def purge_e2e(hours=24, *, dry_run=False):
    cutoff = timezone.now() - timedelta(hours=hours)
    pages = list(Page.objects.filter(slug__startswith=PREFIX, created_at__lt=cutoff))
    removed = [f"{p.section}/{p.slug}" for p in pages]
    if dry_run or not pages:
        return removed
    with transaction.atomic():
        # Deepest first, because parents are protected while they have children.
        for page in sorted(pages, key=lambda p: -p.depth):
            if page.children.exclude(pk__in=[p.pk for p in pages]).exists():
                continue
            paths = [f"/{page.section}/{page.slug}"]
            Redirect.objects.filter(Q(to_path__in=paths) | Q(from_path__in=paths)).delete()
            Page.objects.filter(pk=page.pk).update(published_revision=None, draft_revision=None)
            page.delete()
        bump_generation()
        schedule_rebuild()
    return removed


class Command(BaseCommand):
    help = "Delete e2e-* pages older than --hours (default 24) left behind by end-to-end tests."

    def add_arguments(self, parser):
        parser.add_argument("--hours", type=float, default=24)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        removed = purge_e2e(options["hours"], dry_run=options["dry_run"])
        verb = "would remove" if options["dry_run"] else "removed"
        self.stdout.write(f"{verb} {len(removed)} page(s)")
        for ident in removed:
            self.stdout.write(f"  {ident}")
