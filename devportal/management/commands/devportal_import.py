"""Import the vendored developer-docs snapshot (PLAN.md §7.2). See devportal/services/seed.py."""

import json

from django.core.management.base import BaseCommand, CommandError

from devportal.services.seed import SOURCE_DIR, Importer, SourceError, format_report


class Command(BaseCommand):
    help = "Import devportal/migration_source/ into the portal's pages (idempotent; keeps local edits)."

    def add_arguments(self, parser):
        parser.add_argument("--source", default=str(SOURCE_DIR), help="Snapshot directory (default: the vendored one).")
        parser.add_argument(
            "--force",
            action="append",
            default=[],
            metavar="SECTION/SLUG",
            help="Replace this page's local edits with the source (repeatable), e.g. docs/welcome.",
        )
        parser.add_argument("--prune", action="store_true", help="Soft-delete imported pages gone from the source.")
        parser.add_argument("--dry-run", action="store_true", help="Do everything, then roll back.")
        parser.add_argument("--no-sync-spec", action="store_true", help="Do not run devportal_sync_spec.")
        parser.add_argument("--json", action="store_true", help="Print the full report as JSON.")

    def handle(self, *args, **options):
        importer = Importer(
            options["source"],
            force=options["force"],
            prune=options["prune"],
            dry_run=options["dry_run"],
            sync_spec=not options["no_sync_spec"],
        )
        try:
            report = importer.run()
        except SourceError as exc:
            raise CommandError(str(exc)) from exc
        if options["json"]:
            self.stdout.write(json.dumps(report, ensure_ascii=False, indent=1, default=str))
        else:
            self.stdout.write(format_report(report))
        unknown = set(importer.force) - {f"{f['section']}/{f['slug']}" for f in report["files"]}
        if unknown:
            raise CommandError(f"--force names pages not in the source: {', '.join(sorted(unknown))}")
