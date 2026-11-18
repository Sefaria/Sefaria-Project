# Standalone dev server

The portal runs on SQLite with no MongoDB, Redis or library (PLAN.md §2.3.1). Builders and verifiers loop against this, not against a full Sefaria stack.

```bash
python manage.py migrate --settings=devportal.dev.settings_standalone
python manage.py createsuperuser --settings=devportal.dev.settings_standalone   # for /admin and the editor
python manage.py runserver --settings=devportal.dev.settings_standalone
```

- Database: `.devportal-run/standalone.sqlite3` (git-ignored). Set `DEVPORTAL_SQLITE_PATH` to use another file, e.g. one per worktree or test run.
- Installed apps: `adminsortable`, the Django contrib apps (admin, auth, contenttypes, sessions, messages, staticfiles) and `devportal`. Nothing else.
- URLs (`devportal/dev/urls_standalone.py`): `devportal.urls` at the root, the Django admin at `/admin/`, `/healthz` and `/health-check`, and `/api/powered-by`.
- `/api/powered-by` answers from the gallery's API snapshot, `devportal-ui/src/gallery/lib/__fixtures__/projects.json` (override with `DEVPORTAL_STANDALONE_POWERED_BY_FIXTURE`); until the gallery is ported it answers `{"projects": []}`. The real `powered_by` app is not installed: its view imports `sefaria.settings`, and its user signals import `sefaria.model`.
- Settings: the `DEVPORTAL_*` values are the defaults of contract C1 (`devportal/contracts/settings.json`). Environment overrides: `DEVPORTAL_DEBUG` (`1` default), `DEVPORTAL_AUTO_SEED` (`1` default), `DEVPORTAL_VITE_DEV_SERVER` (e.g. `http://localhost:5173` while `npm run dev` runs in `devportal-ui/`).
- There is no `django_hosts` and no `ModuleMiddleware` here, so nothing sets `request.active_module`. `DevportalMiddleware` therefore treats every request as a portal request (CSP, `Link`, `Content-Language: en`, 404 logging), except `/api/`, `/static/` and `/admin/`.
- The built bundle is read from `static/bundles/devportal/` (copy `devportal-ui/dist/` there, or set `DEVPORTAL_VITE_DEV_SERVER`). Without it, pages render their server markup and a plain header fallback.

Tests:

```bash
pytest devportal/tests --ds=devportal.dev.settings_standalone   # everything, on SQLite
pytest devportal/tests/pure -p no:django                         # pure tests, no Django
```
