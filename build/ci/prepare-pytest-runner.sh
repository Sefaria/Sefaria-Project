#!/usr/bin/env bash
# Prepare a GitHub-hosted ubuntu-latest runner to execute pytest without the
# Kubernetes sandbox. local_settings.py is gitignored; CI has no copy, so
# settings.py would otherwise load local_settings_example.py with a placeholder
# SQLite path that cannot be created.
set -euo pipefail

cp sefaria/local_settings_example.py sefaria/local_settings.py
python3 - <<'PY'
from pathlib import Path

root = Path(".").resolve()
path = Path("sefaria/local_settings.py")
sqlite = root / "db.sqlite"
path.write_text(
    path.read_text().replace("/path/to/Sefaria-Project/db.sqlite", str(sqlite))
)
print(f"wrote {path} with sqlite at {sqlite}")
PY
