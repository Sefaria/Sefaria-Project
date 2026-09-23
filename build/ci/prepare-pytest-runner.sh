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

# django-webpack-loader reads a stats JSON from disk whenever a template renders
# {% render_bundle %} (templates/base.html, templates/edit_text.html) or
# sefaria/client/util.py calls get_files('main'). The pytest jobs never run the
# webpack build, so without these stubs every such test dies on
# `OSError: Error reading .../node/webpack-stats.client.json`.
#
# The three paths mirror WEBPACK_LOADER in sefaria/settings.py (DEFAULT,
# SEFARIA_JS, LINKER). Keep them in sync; this script runs before pip install,
# so it cannot import Django to read them. sefaria/conftest.py writes the same
# stubs for a local run, and neither overwrites a real build's stats file.
python3 - <<'PY'
import json
from pathlib import Path

stub = {"status": "done", "chunks": {"main": []}, "assets": {}, "publicPath": "/static/"}
for name in (
    "node/webpack-stats.client.json",
    "node/webpack-stats.sefaria.json",
    "node/webpack-stats.linker.v3.json",
):
    path = Path(name)
    if path.exists():
        print(f"kept existing {path}")
        continue
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(stub, indent=2, sort_keys=True))
    print(f"wrote webpack stats stub {path}")
PY
