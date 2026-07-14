"""
Convert the printed output of monthly_registrations_with_signals() into a CSV.

Usage:
    python scripts/registered_users_to_csv.py input.txt output.csv
"""
import sys
import csv
import re


COLUMNS = [
    "month",
    "total_registered",
    "still_active",
    "deactivated_spam",
    "has_profile",
    "ever_logged_in",
    "returned_after_signup",
    "has_read_history",
    "has_sheet",
    "has_note",
    "any_activity",
]

MONTH_RE = re.compile(r"^\d{4}-\d{2}\b")


def parse(path):
    rows = []
    with open(path) as f:
        for line in f:
            line = line.rstrip("\n")
            if not MONTH_RE.match(line.strip()):
                continue
            parts = line.split()
            if len(parts) != len(COLUMNS):
                raise ValueError(
                    f"Expected {len(COLUMNS)} fields, got {len(parts)} in line: {line!r}"
                )
            rows.append(parts)
    return rows


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)

    rows = parse(sys.argv[1])
    with open(sys.argv[2], "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLUMNS)
        w.writerows(rows)

    print(f"Wrote {len(rows)} rows to {sys.argv[2]}")


if __name__ == "__main__":
    main()
