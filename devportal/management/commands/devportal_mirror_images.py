"""Copy external images (files.readme.io, i.imgur.com) into the media bucket (PLAN.md §7.3)."""

import json

from django.core.management.base import BaseCommand

from devportal.services.images import mirror_images


class Command(BaseCommand):
    help = "Mirror every external image in published content into the media store. Idempotent."

    def add_arguments(self, parser):
        parser.add_argument("--json", action="store_true", help="Print the full report as JSON.")

    def handle(self, *args, **options):
        report = mirror_images()
        if options["json"]:
            self.stdout.write(json.dumps(report.as_dict(), indent=1))
            return
        self.stdout.write(
            f"external images: {len(report.found)}; stored {len(report.created)}, "
            f"already mirrored {len(report.reused)}, refused {len(report.refused)}, failed {len(report.failed)}; "
            f"pages updated {len(report.pages_updated)}",
        )
        for item in report.refused:
            self.stdout.write(f"  refused {item['url']}: {item['reason']}")
        for item in report.failed:
            self.stdout.write(f"  failed {item['url']}: {item['error']}")
