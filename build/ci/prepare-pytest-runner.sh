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

# CI's pytest jobs run a postgres service container, as master's sandbox pod ran
# the suite against Postgres. powered_by's row-lock and race tests need it. The
# vector_db alias is left out: sefaria/conftest.py drops it anyway, and a pytester
# subprocess that skips that conftest would otherwise try to reach it.
# Unset PYTEST_POSTGRES_HOST keeps the SQLite default for a local run.
if [ -n "${PYTEST_POSTGRES_HOST:-}" ]; then
  cat >> sefaria/local_settings.py <<EOF

# Written by build/ci/prepare-pytest-runner.sh
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "${PYTEST_POSTGRES_DB:-sefaria}",
        "USER": "${PYTEST_POSTGRES_USER:-postgres}",
        "PASSWORD": "${PYTEST_POSTGRES_PASSWORD:-postgres}",
        "HOST": "${PYTEST_POSTGRES_HOST}",
        "PORT": "${PYTEST_POSTGRES_PORT:-5432}",
    },
}
EOF
  echo "pointed DATABASES['default'] at Postgres on ${PYTEST_POSTGRES_HOST}"
fi

# Pytest-only Django overrides (ALLOWED_HOSTS, caches, webpack-stats stubs) are
# applied by sefaria/conftest.py from sefaria/local_settings_pytest.py, so CI and
# a developer machine get the same ones; nothing more to write here.
