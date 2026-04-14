# Django Upgrade: 1.11 → 5.2

Tracks Sefaria's multi-hop Django upgrade. Each LTS hop lands as its own commit with tests green (or diffed against baseline for data-dependent failures).

## Summary

| Hop | Django | Python | Status |
|-----|--------|--------|--------|
| 0 (baseline) | 1.11.* | 3.7 / 3.9 | `master` |
| pre-existing | 2.2.28 | 3.9 | branch `feature/sc-39065/upgrade-to-django-2-x-on-mdl` |
| **Hop 1** | **3.2.25** | **3.9** | **this branch** |
| Hop 2 (planned) | 4.2.* | 3.11 | pending |
| Hop 3 (planned) | 5.2.* | 3.12 | pending |

## Approach

Sequential LTS stepping stones per Django's upgrade policy. One commit per hop. At each hop: bump pins → address `SystemCheckError`/deprecation warnings → run tests → commit.

Tools: `uv` for venv/installs, `pipx install django-upgrade` for per-version codemods (`django-upgrade --target-version X.Y $(git ls-files '*.py')`).

## Hop 1 — Django 2.2 → 3.2

### Pin bumps (`requirements.txt`)

| Package | 2.2 branch | Hop 1 | Reason |
|---------|------------|-------|--------|
| `django` | 2.2.28 | **3.2.25** | Target LTS |
| `djangorestframework` | 3.13.1 | **3.14.0** | DRF 3.14 drops Django 2.2, adds 4.0 support |
| `django-redis` | 4.11.0 | **5.2.0** | Django 3.2 compat |
| `django-anymail` | 8.6 | **9.2** | Django 3.2 compat |
| `django-debug-toolbar` | 2.2 | **3.8.1** | Django 3.2 compat |
| `django-webpack-loader` | 1.4.1 | **1.8.1** | Django 3.2 compat |
| `django-structlog` | 1.6.2 | **8.0.0** | Multiple majors; `structlog.threadlocal` deprecation gone |

Unchanged: `django-admin-sortable==2.3`, `django-hosts==7.0.0`, `django-ipware==7.0.1`, `django-mobile==0.7.0`, `django-recaptcha==2.0.6`, `django-user-agents==0.4.0`, `djangorestframework-simplejwt==5.2.2`.

### Code changes

- **`sefaria/settings.py`** — added `DEFAULT_AUTO_FIELD = 'django.db.models.AutoField'`. Django 3.2 changed the default auto-field to `BigAutoField`, which would trigger unnecessary `AlterField` migrations on every legacy model's integer PK. Pinning to `AutoField` preserves existing schema behavior. The 11 `models.W042` warnings that `manage.py check` emitted without this setting now clear.

### Test results

- `python manage.py check` — **clean** (just the pre-existing recaptcha dev-key warning, same as baseline).
- `pytest` (full suite excl. `sefaria/helper/tests` and one deselected strapi test) — **524 passed, 26 failed, 8 skipped, 9 xfailed, 3 errors**, ~30min runtime.
- Failure clusters (not validated against a full 2.2 baseline — likely pre-existing):
  - Strapi cache tests (require live Strapi service)
  - Mongo model tests `test_attr_definitions`, `test_index_update`, `test_rename_category`, etc. — require seeded Sefaria Mongo data
  - `test_new_index_title_change` / `test_index_title_change` — same data-seeding gap

### Gotchas encountered

- **numpy ABI**: fresh install grabbed `numpy==2.0.2`, which broke `thinc`/`spacy` C extensions at import time (`numpy.dtype size changed`). Pinned `numpy<2` → `1.26.4`. This is not Django-related but surfaces on clean installs.
- **psycopg2 build**: on macOS (Apple Silicon), `pip install psycopg2` required `LDFLAGS=-L/opt/homebrew/opt/openssl@3/lib CPPFLAGS=-I/opt/homebrew/opt/openssl@3/include`. Consider switching to `psycopg2-binary` in a follow-up.
- **`local_settings_ci.py` incomplete**: missing `CELERY_ENABLED` and `MONGO_REPLICASET_NAME`. `local_settings_example.py` is the working template — copy it to `sefaria/local_settings.py` for local dev.

## Hop 2 — Django 3.2 → 4.2 (planned)

Key items:
- Python bump to 3.11 (`.python-version`, `Dockerfile`)
- `django==4.2.*`, DRF 3.15, `django-redis==5.4`, `django-anymail==10`, `django-webpack-loader==3`, simplejwt 5.3
- Codemods: `ugettext*` → `gettext*` (9 call sites starting at `sefaria/settings.py:4`), `force_text` → `force_str`, `is_safe_url` → `url_has_allowed_host_and_scheme`, `render_to_response` → `render` (2 sites in `sefaria/system/decorators.py`)
- Settings: set `USE_L10N = False` explicitly (default flipped in 4.0), audit `CSRF_TRUSTED_ORIGINS` (scheme required)
- Templates: `{% load staticfiles %}` → `{% load static %}`
- **`django_mobile` replacement** — unmaintained since 2015, no Django 4 support. Highest-risk item. Plan: reimplement mobile-flag detection on top of `django-user-agents` (already installed).

## Hop 3 — Django 4.2 → 5.2 (planned)

- Python bump to 3.12
- `django==5.2.*`
- `pytz.timezone(...)` → `zoneinfo.ZoneInfo(...)` (grep first)
- Logout: any `<a href="{% url 'logout' %}">` in templates → POST form (5.0 removed GET logout)
- Final: `python manage.py check --deploy` clean

---

## Local Development — Migrating Your Checkout

When a new Django hop lands on the upgrade branch, every developer needs to refresh their local environment. Steps:

### Prerequisites

- **Python**: install via `pyenv` (recommended) or Homebrew.
  - Hop 1: Python 3.9 (same as current `master`)
  - Hop 2: Python 3.11
  - Hop 3: Python 3.12
- **Docker Desktop** running (for Mongo + Redis services).
- **OpenSSL headers for psycopg2 on macOS Apple Silicon**:
  ```bash
  brew install openssl@3
  export LDFLAGS="-L/opt/homebrew/opt/openssl@3/lib"
  export CPPFLAGS="-I/opt/homebrew/opt/openssl@3/include"
  ```

### Refresh your venv from scratch — do not upgrade in place

```bash
cd Sefaria-Project
rm -rf .venv                                                # or your venv dir
uv venv --python 3.9 .venv                                  # bump per current hop
source .venv/bin/activate
uv pip install -r requirements.txt
uv pip install 'numpy<2'                                    # see Gotchas above
```

### Local settings file

```bash
cp sefaria/local_settings_example.py sefaria/local_settings.py
```

This file is gitignored. If you get `NameError: name 'MONGO_REPLICASET_NAME' is not defined` or similar at startup, you're missing it.

### Services

```bash
docker compose up -d db cache            # mongo + redis
```

### Clear stale caches after a Python bump (Hops 2 & 3)

```bash
find . -name __pycache__ -exec rm -rf {} +
find . -name '*.pyc' -delete
```

### Verify

```bash
python manage.py check                   # should report only recaptcha warning
python manage.py runserver               # homepage loads
cd sefaria && pytest --tb=short -q       # tests
```

### Database migrations

With `DEFAULT_AUTO_FIELD = 'django.db.models.AutoField'` set in `settings.py`, Django will NOT generate surprise `AlterField` migrations for existing integer PKs. If `python manage.py migrate --plan` shows unexpected `AlterField` operations on primary keys, stop and investigate — something's off.

### IDE

- Point your Python interpreter at the new `.venv` after each Python bump (PyCharm: Settings → Project → Python Interpreter; VS Code: bottom-right interpreter selector).

### Rollback

```bash
git checkout <pre-upgrade-commit>
rm -rf .venv && uv venv --python 3.9 .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

## Known behavioral changes for end-users / devs

Nothing user-visible in Hop 1. Later hops will introduce:

- **Hop 3 (Django 5.0+)**: `LogoutView` no longer accepts GET — any `<a>` logout links must become `<form method="post">`. Check front-end before cutover.
- **Hop 2 (Django 4.0)**: `USE_L10N` default flipped to `True`. We pin it to `False` explicitly to preserve current date/number formatting. If at any point you want locale-aware formatting in templates, remove that override.

## Open questions

- The full Django 2.2 baseline pytest run was not captured (stopped early at 18 tests due to context budget). The 26 failures on Hop 1 need to be diffed against a clean 2.2 baseline on the same machine + Mongo state to confirm none are regressions. Recommended: run `pytest --tb=short -q --ignore=helper/tests` once on 2.2 and once on 3.2 against the same seeded Mongo, diff the results.
- `django_mobile` replacement — see Hop 2 notes. Consider a separate spike PR before committing Hop 2.
- `django-hosts==7.0.0` Django 5 compatibility — verify at Hop 3.
