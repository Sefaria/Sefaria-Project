# -*- coding: utf-8 -*-
"""
Read-only report of sheets whose stored fields still contain markup.

Counts flagged sheets and groups them by field path (array indexes collapsed),
then prints one line per flagged sheet. Nothing is written: no update, replace
or delete calls are made, so this is safe to run against any copy of the data.

Usage:
    python scripts/scan_sheet_markup.py [--limit N] [--sample N]

--limit caps how many sheets are read (0 = all). --sample caps the per-sheet
lines printed (the counts always cover every scanned sheet).
"""
import argparse
import collections
import os
import re
import sys

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
django.setup()

import structlog

from sefaria.system.database import db
from sefaria.sheet_markup_scan import scan_sheets

logger = structlog.get_logger(__name__)

# Only the fields the detector reads, so the scan does not pull whole sheets.
PROJECTION = {"id": 1, "owner": 1, "attribution": 1, "options": 1, "sources": 1}


def _field_kind(path):
    """Collapse array indexes so 'sources[3].caption.he' and 'sources[0].caption.he' group together."""
    return re.sub(r"\[\d+\]", "[]", path)


def main():
    parser = argparse.ArgumentParser(description="Read-only scan for sheets with markup in stored fields.")
    parser.add_argument("--limit", type=int, default=0, help="read at most this many sheets (0 = all)")
    parser.add_argument("--sample", type=int, default=50, help="print at most this many flagged sheets")
    args = parser.parse_args()

    cursor = db.sheets.find({}, PROJECTION).sort("_id", 1)
    if args.limit:
        cursor = cursor.limit(args.limit)

    scanned = 0

    def counted(sheets):
        nonlocal scanned
        for sheet in sheets:
            scanned += 1
            yield sheet

    flagged_sheets = 0
    by_kind = collections.Counter()
    printed = 0
    for sheet_id, owner, paths in scan_sheets(counted(cursor)):
        flagged_sheets += 1
        by_kind.update(_field_kind(p) for p in paths)
        if printed < args.sample:
            print(f"sheet {sheet_id} owner {owner}: {', '.join(paths)}")
            printed += 1

    print("***")
    for kind, count in by_kind.most_common():
        print(f"{count}\t{kind}")
    print(f"{flagged_sheets} of {scanned} sheets have markup in stored fields")
    logger.info("sheet_markup_scan_complete", scanned=scanned, flagged=flagged_sheets)


if __name__ == "__main__":
    main()
