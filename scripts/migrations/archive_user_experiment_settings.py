# -*- coding: utf-8 -*-
"""
Archive the experiments whitelist before its table is dropped.

**Run this before the deploy that applies reader/migrations/0002.** Reversing a Django
DeleteModel recreates the schema, not the data, so this CSV is the only surviving record
of who was on the whitelist and what their flag was.

Reads `reader_userexperimentsettings` with raw SQL rather than through the model, which
this deploy deletes — the script has to work against a database the migration has not
been applied to yet.

Writes one row per record: user id, email, flag.

Usage:
    python scripts/migrations/archive_user_experiment_settings.py
    python scripts/migrations/archive_user_experiment_settings.py --out /path/to/file.csv
"""

import argparse
import csv

import django

django.setup()

from django.db import connection

DEFAULT_OUT = "user_experiment_settings_archive.csv"

QUERY = """
    SELECT s.user_id, u.email, s.experiments
    FROM reader_userexperimentsettings s
    LEFT JOIN auth_user u ON u.id = s.user_id
    ORDER BY s.user_id
"""


def archive(out=DEFAULT_OUT):
    with connection.cursor() as cursor:
        cursor.execute(QUERY)
        rows = cursor.fetchall()

    with open(out, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["user_id", "email", "experiments"])
        writer.writerows(rows)

    print(f"Archived {len(rows)} whitelist row(s) to {out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Dump the experiments whitelist to CSV.")
    parser.add_argument("--out", default=DEFAULT_OUT, help=f"output path (default: {DEFAULT_OUT})")
    archive(**vars(parser.parse_args()))
