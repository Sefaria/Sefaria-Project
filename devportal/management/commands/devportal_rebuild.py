"""Re-render stale revisions and rebuild every artifact (sidebar trees, sitemap, search, llms)."""

from django.core.management.base import BaseCommand

from devportal.services.publish import bump_generation, rebuild_artifacts


class Command(BaseCommand):
    help = "Re-render revisions rendered by an older renderer and rebuild the portal's artifacts."

    def add_arguments(self, parser):
        parser.add_argument("--no-rerender", action="store_true", help="Only rebuild the artifacts.")

    def handle(self, *args, **options):
        report = rebuild_artifacts(rerender=not options["no_rerender"])
        if report["rerendered"] or report["changed"]:
            bump_generation()
        self.stdout.write(
            f"re-rendered {report['rerendered']}; artifacts changed: {', '.join(report['changed']) or 'none'}; "
            f"unchanged: {len(report['unchanged'])}",
        )
        for name, error in report["errors"].items():
            self.stderr.write(f"  {name}: {error}")
