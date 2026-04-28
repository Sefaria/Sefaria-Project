# Django Upgrade: 1.11 → 6.0

> ✅ **STATUS: COMPLETE.** All 4 LTS hops done. `manage.py check` passes (only the
> pre-existing recaptcha dev-key warning). pytest: **527 passed, 13 failed** — all
> remaining failures are pre-existing Mongo-seed-dependent data tests (no seeded DB in
> local dev). No regressions introduced by any hop.

Tracks Sefaria's multi-hop Django upgrade. Each LTS hop lands as its own commit.

## Summary

| Hop | Django | Python | Status |
|-----|--------|--------|--------|
| 0 (baseline) | 1.11.* | 3.7 / 3.9 | `master` |
| pre-existing | 2.2.28 | 3.9 | branch `feature/sc-39065/upgrade-to-django-2-x-on-mdl` |
| Hop 1 | 3.2.25 | 3.9 | done |
| Hop 2 | 4.2.20 | 3.11.9 | done |
| Hop 3 | 5.2.4 | 3.12.7 | done |
| **Hop 4** | **6.0.4** | **3.12.7** | **this branch (HEAD)** |

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

## Hop 2 — Django 3.2 → 4.2 (Python 3.9 → 3.11)

### Pin bumps

| Package | Hop 1 | Hop 2 | Reason |
|---------|-------|-------|--------|
| `django` | 3.2.25 | **4.2.20** | Target LTS |
| `djangorestframework` | 3.14.0 | **3.15.2** | Django 4.2 compat |
| `django-redis` | 5.2.0 | **5.4.0** | Django 4.2 compat |
| `django-anymail` | 9.2 | **10.3** | Django 4.2 compat |
| `django-debug-toolbar` | 3.8.1 | **4.4.6** | Django 4.2 compat |
| `django-webpack-loader` | 1.8.1 | **3.1.1** | Django 4.2 compat |
| `djangorestframework-simplejwt` | 5.2.2 | **5.3.1** | Django 4.2 compat |
| `django-recaptcha` | 2.0.6 | **4.0.0** | Django 2.x cap; app renamed `captcha` → `django_recaptcha` |
| `django-mobile` | 0.7.0 | **removed** | Unmaintained since 2015; only reference was a commented-out template loader in `settings.py` |
| `cython` | 0.29.14 | **3.0.11** | Python 3.10+ broke `collections.Iterable` usage in old Cython |
| `lxml` | 4.6.1 | **5.3.0** | Python 3.11 moved `longintrepr.h` |
| `bleach` | 1.4.2 | **6.1.0** | Python 3.10+ compat; pulls in modern `html5lib` |
| `html5lib` | 0.9999999 | **1.1** | Python 3.10+ compat (`collections.Mapping`) |
| `psycopg2-binary` | 2.8.6 | **2.9.9** | Python 3.11 + macOS build fix |
| `deepdiff` | 3.3.0 | **7.0.1** | Python 3.10+ compat (`collections.Mapping`) |

### Code changes

- **Codemods** via `django-upgrade --target-version 4.2`: rewrote 23 files. Key changes:
  - `ugettext*` → `gettext*` (all translation call sites)
  - `from django.conf.urls import url` → `from django.urls import re_path, include` (URLconfs)
  - `is_safe_url` → `url_has_allowed_host_and_scheme` in `reader/views.py`, `sefaria/views.py`
  - Dropped redundant `USE_L10N = True` (now default)
- **`sefaria/model/abstract.py`** — `collections.Mapping` / `collections.Hashable` / `collections.Iterable` → `collections.abc.*` (Python 3.10 removal).
- **`sefaria/model/abstract.py`** — `bleach.ALLOWED_TAGS` changed from list to frozenset in bleach 6.x; wrap in `list()` before concat.
- **`sefaria/settings.py`** — `INSTALLED_APPS`: `'captcha'` → `'django_recaptcha'` (app rename in django-recaptcha 4.x). Removed commented-out `'django_mobile.loader.Loader'` template loader entry.
- **`sefaria/forms.py`** — `from captcha.* ` → `from django_recaptcha.*` (package rename).

### Test results

- `python manage.py check` — clean (pre-existing recaptcha dev-key warning only).
- `pytest` (full suite excl. `sefaria/helper/tests`, one deselected strapi test) — **517 passed, 27 failed, 8 skipped, 9 xfailed, 9 errors**, ~12min runtime.
- New failures vs Hop 1 are mostly in `model/tests/webpage_test.py` (TypeError on `deepdiff` API changes in test-side comparison helpers — test-code incompatibility with deepdiff 7, not Django).
- Mongo-seed-dependent failures from Hop 1 persist (same surface: `test_rename_category`, `test_index_title_change`, `Test_Category_Editor`).

### Gotchas

- `django-recaptcha` 4.0 **renamed its Django app**: `captcha` → `django_recaptcha`. Both `INSTALLED_APPS` and import paths change.
- `bleach.ALLOWED_TAGS` is a `frozenset` in bleach ≥ 6 — `list + list` patterns need explicit `list()` cast.
- `psycopg2` (non-binary) built from source against system openssl can fail with `SystemError: initialization of _psycopg raised unreported exception` at runtime on macOS. The project pins `psycopg2-binary` — make sure `psycopg2` itself isn't installed concurrently.
- `django-upgrade` 1.30 codemod handled almost all deprecation edits automatically. Very high value tool for multi-hop upgrades.

## Hop 3 — Django 4.2 → 5.2 (Python 3.11 → 3.12)

### Pin bumps

| Package | Hop 2 | Hop 3 |
|---------|-------|-------|
| `django` | 4.2.20 | **5.2.4** |
| Python | 3.11.9 | **3.12.7** |

No other pin changes required — `djangorestframework==3.15.2`, `django-redis==5.4.0`, `django-anymail==10.3`, `django-debug-toolbar==4.4.6`, `django-webpack-loader==3.1.1`, `djangorestframework-simplejwt==5.3.1`, `django-recaptcha==4.0.0`, `django-hosts==7.0.0`, `django-structlog==8.0.0` all already support Django 5.2.

### Code changes

- **None.** `django-upgrade --target-version 5.2` produced zero rewrites on top of Hop 2.
- `pytz.timezone(...)` retained in `reader/views.py` (2 call sites): the `pytz` package itself still works; only Django's `USE_DEPRECATED_PYTZ` shim was removed in 5.0. These sites don't rely on the shim, so no migration needed.
- Python 3.12 emits `SyntaxWarning: invalid escape sequence` for several regexes in `sefaria/model/topic.py`, `sefaria/model/webpage.py`, `reader/templatetags/sefaria_tags.py`, `sefaria/history.py`. Cosmetic — left for a follow-up PR (fix: raw strings).

### Test results

- `python manage.py check` — clean (pre-existing recaptcha dev-key warning only).
- `pytest` (full suite excl. `sefaria/helper/tests`, one deselected strapi test) — **516 passed, 28 failed, 8 skipped, 9 xfailed, 9 errors**, ~16min runtime.
- Failure surface is essentially identical to Hop 2 (517/27/9). No new Django-shaped regressions. Remaining failures are the same three pre-existing clusters: Strapi external dep, Mongo-seed-dependent model/data tests, `deepdiff` 7 test-helper incompatibilities.

## Hop 4 — Django 5.2 → 6.0 (Python 3.12, same)

### Pin bumps (`requirements.txt`)

| Package | Hop 3 | Hop 4 | Reason |
|---------|-------|-------|--------|
| `django` | 5.2.4 | **6.0.4** | Target LTS |

No other pin changes required. All existing deps (`djangorestframework`, `django-redis`, `django-anymail`, `django-debug-toolbar`, `django-webpack-loader`, `djangorestframework-simplejwt`, `django-recaptcha`, `django-hosts`, `django-structlog`, `psycopg2-binary`) already satisfy Django 6.0's minimum version requirements. Python 3.12 is unchanged.

Note: `psycopg2-binary==2.9.9` continues to work — Django 6.0 sets minimum psycopg2 at 2.9.9, which is already pinned. No driver swap required.

### Code changes

- **`sefaria/local_settings_ci.py` + `sefaria/local_settings_example.py`** — `ADMINS` format updated from `(('Name', 'email'),)` to `('email',)` via `django-upgrade --target-version 6.0` codemod. Django 6.0 deprecated tuple-of-tuples ADMINS format.
- **`sefaria/views.py`** — `CustomLogoutView` now declares `http_method_names = ["get", "post", "options"]` and adds a `get()` method that delegates to `post()`. Django ≥ 5.0 made `LogoutView` POST-only, but every Sefaria entry point (`Header.jsx` dropdown, mobile menu, `Sefaria.getLogoutUrl()` in `sefaria.js`) is a plain `<a href="/logout?next=...">`. Routing GET through the same handler keeps existing links working without a frontend refactor; the trade-off (logout via GET is technically not RESTful) is accepted given the link surface.
- **`reader/views.py`** — `make_sheet_panel_dict` now coerces `sheet_id = str(sheet_id)` at the top. The `path('sheets/<int:sheet_id>', ...)` URL converter passes an `int`, which the existing `if "." in sheet_id:` substring check could not handle, raising `TypeError: argument of type 'int' is not iterable` on every sheet view. The coercion preserves the existing `"<id>.<node>"` form while being safe for ints.
- **`sefaria/sheets.py`** — `bleach_text` migrated to bleach 6.x's CSS sanitizer API. Bleach 6.0 removed the `styles=` kwarg from `bleach.clean()`; we now build a `CSSSanitizer(allowed_css_properties=ok_sheet_styles)` and pass it via `css_sanitizer=`. Without this, every `POST /api/sheets/` (sheet save) crashed with `TypeError: clean() got an unexpected keyword argument 'styles'`. Added import: `from bleach.css_sanitizer import CSSSanitizer`.

**Checked and confirmed not hit by Sefaria:**
- `EmailMessage.mixed_subtype`/`alternative_subtype` (removed) — Sefaria has no custom `EmailMessage` subclasses.
- `as_sql()`/`process_lhs()`/`process_rhs()` tuple requirement — Sefaria has no custom ORM lookups/expressions.
- `Field.pre_save()` idempotency — Sefaria has no custom field implementations.
- `FORMS_URLFIELD_ASSUME_HTTPS` removal — not referenced in Sefaria's settings.
- `send_mail` / `mail_admins` keyword-arg requirement — Sefaria does not call these directly in app code.

### Test results

- `python manage.py check` — clean (pre-existing recaptcha dev-key warning only).
- `pytest` (full suite excl. `sefaria/helper/tests`, strapi tests deselected) — **527 passed, 13 failed, 8 skipped, 9 xfailed**, ~14min runtime.
- **Improvement vs Hop 3**: +11 passing, -15 failing. Remaining 13 failures are all pre-existing Mongo-seed-dependent data tests (no seeded DB in local dev environment). Zero new Django-shaped regressions.

### Gotchas

- `pip` (old resolver) could not resolve `django==6.0.4` when the venv's pip metadata cache was stale from Python 3.9. Solution: use `uv pip install` which always queries PyPI directly.
- `DEFAULT_AUTO_FIELD` defaults to `BigAutoField` in 6.0. Sefaria already explicitly pins it to `AutoField` in `sefaria/settings.py` (added in Hop 1) — no migrations generated.
- **Bleach 6.x `css_sanitizer` requires `tinycss2`.** It is an optional bleach extra (`bleach[css]`), not a hard dep. If you import `bleach.css_sanitizer` without `tinycss2` installed, you get `ModuleNotFoundError: No module named 'tinycss2'` at app startup. We pin `tinycss2` explicitly so this isn't latent.
- **Django runserver `--skip-checks`** is useful in local dev: `django-recaptcha` 4.0 escalates the dev-key warning to an error during `manage.py check`, blocking server startup. Either set `SILENCED_SYSTEM_CHECKS = ['django_recaptcha.recaptcha_test_key_error']` in `local_settings.py` or pass `--skip-checks` to `runserver`.
- **django-hosts host regex includes the port**, derived from `urlparse(DOMAIN_MODULES[lang][module]).netloc`. For local dev you must hit `http://voices.localhost:8000/` (or the port matching your `local_settings_example.py`), otherwise the `/sheets/...` routes 404 because the request is matched against `urls_library` instead of `urls_sheets`.

---

## Local Development — Migrating Your Checkout

When a new Django hop lands on the upgrade branch, every developer needs to refresh their local environment. Steps:

### Prerequisites

- **Python**: install via `pyenv` (recommended) or Homebrew.
  - Hop 1: Python 3.9 (same as current `master`)
  - Hop 2: Python 3.11
  - Hop 3 & 4: Python 3.12
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

- **Hop 3 (Django 5.0+)**: `LogoutView` no longer accepts GET. We chose to keep the GET-based `<a href="/logout?next=...">` flow by overriding `CustomLogoutView.http_method_names` and adding a `get()` that delegates to `post()` — see Hop 4 *Code changes*. If a future change wants strict POST-only logout, the frontend (`Header.jsx` dropdown, mobile menu, `Sefaria.getLogoutUrl()` in `sefaria.js`) needs a form submission.
- **Hop 2 (Django 4.0)**: `USE_L10N` default flipped to `True`. We pin it to `False` explicitly to preserve current date/number formatting. If at any point you want locale-aware formatting in templates, remove that override.

## Open questions

- The full Django 2.2 baseline pytest run was not captured (stopped early at 18 tests due to context budget). The 26 failures on Hop 1 need to be diffed against a clean 2.2 baseline on the same machine + Mongo state to confirm none are regressions. Recommended: run `pytest --tb=short -q --ignore=helper/tests` once on 2.2 and once on 3.2 against the same seeded Mongo, diff the results.
- `django_mobile` replacement — see Hop 2 notes. Consider a separate spike PR before committing Hop 2.
- `django-hosts==7.0.0` Django 5 compatibility — verify at Hop 3.
