"""Build the sheets.likes index in the current environment.

sefaria.system.database.ensure_indices() registers this index, but nothing in app
startup, the Helm chart, or any cron runs ensure_indices(), so each environment
needs it built once by hand. Without it, deleting a user from
/admin/delete/user-account scans every sheet to pull the user's likes (17s of a
21s request on 2026-10-19; 92-202s on 2026-11-10), so the admin page times out.

create_index is idempotent: re-running it when the index already exists is a no-op.
On MongoDB 4.2+ the build holds an exclusive lock only briefly at its start and
end, so it is safe to run against a live database.

Usage (from a pod with Mongo access):
    python scripts/migrations/create_sheets_likes_index.py
"""

import django

django.setup()

from sefaria.system.database import db


def main():
    name = db.sheets.create_index("likes")
    print(f"sheets index ready: {name}")
    plan = db.sheets.find({"likes": -1}).explain()["queryPlanner"]["winningPlan"]
    print(f"winning plan for {{'likes': uid}}: {plan}")


if __name__ == "__main__":
    main()
