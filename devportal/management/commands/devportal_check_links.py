"""Check every published page's links and images (PLAN.md §6.3), on whatever database this runs on."""

import json

from django.core.management.base import BaseCommand, CommandError

from devportal.services.nav import check_links


class Command(BaseCommand):
    help = "Fail when a published page links to a missing page or still uses a doc:/ref:/page: link."

    def add_arguments(self, parser):
        parser.add_argument(
            "--images",
            action="store_true",
            help="Also fail when an image is outside the media bucket (run after devportal_mirror_images).",
        )
        parser.add_argument("--json", action="store_true", help="Print the full report as JSON.")

    def handle(self, *args, **options):
        report = check_links()
        if options["json"]:
            self.stdout.write(json.dumps(report, ensure_ascii=False, indent=1))
        else:
            self.stdout.write(
                f"pages {report['checked']}, links {report['links']}, unresolved {len(report['unresolved'])}, "
                f"external images {len(report['external_images'])}",
            )
            for item in report["unresolved"]:
                self.stdout.write(f"  unresolved {item['page']}: {item['destination']}")
            for item in report["external_images"]:
                self.stdout.write(f"  external image {item['page']}: {item['url']}")
        problems = len(report["unresolved"]) + (len(report["external_images"]) if options["images"] else 0)
        if problems:
            raise CommandError(f"{problems} link problem(s)")
