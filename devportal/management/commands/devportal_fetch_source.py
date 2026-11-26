"""Replace the vendored content snapshot with the upstream branch (PLAN.md §7.1, §7.6).

    python manage.py devportal_fetch_source --ref v1.0

Read-only towards GitHub and live: a shallow `git clone` of the public repository and three GET
requests for live's sidebar files. Review the diff, run `devportal/tests/import_test.py`, and commit
the result as `chore(devportal): refresh content snapshot to <sha>`.

`reference/sefaria-api.json` is not vendored: `docs/openAPI.json` is the spec. Its hash is recorded
in SOURCE.json, with a hash of its parsed form (sorted keys, integral floats as integers) that the
import compares with `docs/openAPI.json`; the two files differ only in number formatting today.
"""

import hashlib
import json
import shutil
import subprocess
import tempfile
from datetime import date
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from devportal.adapters import spec as spec_adapter
from devportal.services.seed import SOURCE_DIR

DEFAULT_REPO = "https://github.com/Sefaria/developer-docs"
TREES = ("docs", "reference", "custom_pages", "custom_blocks")
EXCLUDED = "reference/sefaria-api.json"
LIVE_BASE = "https://developers.sefaria.org"
LIVE_SIDEBARS = {
    "sidebar-docs.json": "docs",
    "sidebar-reference.json": "reference",
    "sidebar-custom_pages.json": "custom_pages",
}


def _git(*args, cwd=None):
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=False)  # noqa: S603, S607
    if result.returncode != 0:
        msg = f"git {' '.join(args)} failed: {result.stderr.strip()}"
        raise CommandError(msg)
    return result.stdout.strip()


def compare_spec(excluded_path, spec_path=None):
    upstream = json.loads(Path(excluded_path).read_text(encoding="utf-8"))
    ours = spec_adapter.load_spec(spec_path)
    upstream_sha = spec_adapter.normalized_sha256(upstream)
    equal = upstream_sha == spec_adapter.normalized_sha256(ours)
    return upstream_sha, equal


class Command(BaseCommand):
    help = "Refresh devportal/migration_source/ from Sefaria/developer-docs and live's sidebar files."

    def add_arguments(self, parser):
        parser.add_argument("--ref", default="v1.0", help="Branch or tag to fetch (default v1.0).")
        parser.add_argument("--repo", default=DEFAULT_REPO, help="Repository URL or local path.")
        parser.add_argument("--dest", default=str(SOURCE_DIR), help="Snapshot directory to replace.")
        parser.add_argument("--no-live", action="store_true", help="Keep the current live/ sidebar files.")
        parser.add_argument("--live-base", default=LIVE_BASE, help=f"Where to GET the sidebars (default {LIVE_BASE}).")

    def handle(self, *args, **options):
        dest = Path(options["dest"])
        with tempfile.TemporaryDirectory() as tmp:
            clone = Path(tmp) / "src"
            _git("clone", "--quiet", "--depth", "1", "--branch", options["ref"], options["repo"], str(clone))
            commit = _git("rev-parse", "HEAD", cwd=clone)
            committed = _git("log", "-1", "--format=%cI", cwd=clone)
            for tree in TREES:
                if not (clone / tree).is_dir():
                    msg = f"{tree}/ is missing upstream"
                    raise CommandError(msg)
            live = {} if options["no_live"] else self._fetch_live(options["live_base"])
            excluded = clone / EXCLUDED
            excluded_info = []
            if excluded.exists():
                data = excluded.read_bytes()
                normalized, equal = compare_spec(excluded)
                excluded_info.append(
                    {
                        "path": EXCLUDED,
                        "sha256": hashlib.sha256(data).hexdigest(),
                        "bytes": len(data),
                        "normalized_sha256": normalized,
                        "replaced_by": "docs/openAPI.json",
                        "comparison": (
                            "Parsed, with integral floats as integers, equal to docs/openAPI.json."
                            if equal
                            else "Parsed, it DIFFERS from docs/openAPI.json: review before importing."
                        ),
                    },
                )
                if not equal:
                    self.stderr.write(f"warning: {EXCLUDED} differs from docs/openAPI.json (parsed)")
            for tree in TREES:
                target = dest / tree
                if target.exists():
                    shutil.rmtree(target)
                shutil.copytree(clone / tree, target, ignore=shutil.ignore_patterns(".git"))
            stray = dest / EXCLUDED
            if stray.exists():
                stray.unlink()
            (dest / "live").mkdir(exist_ok=True)
            for name, body in live.items():
                (dest / "live" / name).write_bytes(body)
        source = {
            "repository": options["repo"],
            "ref": options["ref"],
            "commit": commit,
            "date": committed,
            "vendored_at": date.today().isoformat(),
            "trees": list(TREES),
            "excluded": excluded_info,
            "live": {
                "path": "live/",
                "files": list(LIVE_SIDEBARS),
                "source": f"GET {options['live_base']}/sefaria/api-next/v2/branches/1.0/sidebar?section=<section>",
            },
        }
        (dest / "SOURCE.json").write_text(json.dumps(source, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        self.stdout.write(f"Snapshot is now {options['repo']} @ {options['ref']} ({commit[:7]}, {committed}).")
        self.stdout.write("Review the diff, run devportal/tests/import_test.py, then commit.")

    def _fetch_live(self, base):
        import requests

        out = {}
        for name, section in LIVE_SIDEBARS.items():
            url = f"{base}/sefaria/api-next/v2/branches/1.0/sidebar?section={section}"
            response = requests.get(url, timeout=30, headers={"Accept": "application/json"})
            if response.status_code != 200:
                msg = f"GET {url} answered {response.status_code}"
                raise CommandError(msg)
            if not isinstance(response.json(), list):
                msg = f"GET {url} did not return a list"
                raise CommandError(msg)
            out[name] = response.content
        return out
