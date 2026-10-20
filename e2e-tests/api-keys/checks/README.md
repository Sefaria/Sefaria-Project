# API-key checks harness

`run-checks.sh` runs the API-key checks against throwaway containers: the `powered_by` pytest suite, the
migration round trip (with an optional dev-shape seed), the auth-service Go tests, shellcheck, and the
feature-matrix validator. Nothing it does writes outside the repo, except container state and the git-ignored
`.claude/scratch/apikeys-checks/` directory.

```bash
bash e2e-tests/api-keys/checks/run-checks.sh <command> [args]
```

## Commands

| Command | What it does |
| --- | --- |
| `selftest` | No containers. Prints the docker server version and the Django version seen by `PY`, runs `bash -n` on itself. Exits 1 with an actionable message when docker or Django is missing. |
| `up` | Starts `apikeys-checks-pg` and `apikeys-checks-mongo` if needed, waits for both, creates the databases `sefaria_auth` and `authsvc_go`, and seeds the Mongo `sefaria.bootstrap` collection. Leaves the containers running. |
| `down` | Removes every container whose name starts with `apikeys-checks-`. Nothing else. |
| `pytest [args]` | Runs `$PY -m pytest -p no:cacheprovider`. Without `-m` it adds `-m "not deep and not failing"`; without a path it targets `powered_by/tests`. Output is teed to `.claude/scratch/apikeys-checks/logs/pytest.log`. The exit status is pytest's own. |
| `migrations [--seed]` | `makemigrations --check`, `migrate`, `showmigrations`, a schema dump (apikey CHECK constraints and triggers on both tables), `migrate powered_by 0005`, `migrate powered_by`, then the schema dump and the check again. With `--seed` and `testenv/seed_dev_shape.sql` present, it first resets `sefaria_auth`, loads the seed at 0005, migrates forward and back, and compares the project and key row counts. |
| `go` | `go vet ./... && go test -race -count=1 -v ./...` in a `golang` container, with `PG_TEST_DSN` pointing at `authsvc_go`. Then an informational `go test -tags knowngaps -run KnownGap` that does not count toward failure. |
| `shell [files]` | `shellcheck -S warning`. Default files: `auth-service/scripts/*.sh` and `run-checks.sh`. Uses a local `shellcheck` if present, else the `koalaman/shellcheck:stable` image, else a `shellcheck-py` install into `.claude/scratch/apikeys-checks/tools`. |
| `unit` | `python3 -m unittest discover -s e2e-tests/api-keys/tests -t .` when that directory exists. |
| `features` | `python3 e2e-tests/api-keys/check_features.py --strict`, then `unit`. |
| `all` | `selftest`, `pytest`, `migrations`, `go`, `shell`, `features`. |

`KEEP=1` leaves the containers running after `pytest`, `migrations`, `go` or `all`. Without it those commands
stop the containers on exit.

## Contract

- **`PY`**: the Python used for pytest, Django and migrations. Default is `$ROOT/.venv/bin/python` when it exists,
  else `python3`. Set `PY=/path/to/python` to use another one. It needs `requirements.txt` installed (Python 3.12,
  Django 6.0.4 at the time of writing). `selftest` checks it.
- **Docker**: a reachable daemon. Images used: `postgres:18-alpine`, `mongo:7`, `golang:1.27`. Override with
  `PG_IMAGE`, `MONGO_IMAGE`, `GO_IMAGE` if needed.
- **Django settings**: `testenv/test_settings.py` is put on `PYTHONPATH` with `DJANGO_SETTINGS_MODULE=test_settings`.
  It imports `sefaria.settings`, points the default database at the throwaway Postgres, and replaces the webpack
  stats file with `testenv/webpack-stats.stub.json`, because a bare checkout has no JS build.

## Ports and names

| Resource | Value |
| --- | --- |
| Postgres container | `apikeys-checks-pg`, `postgres:18-alpine`, `127.0.0.1:55442` |
| Mongo container | `apikeys-checks-mongo`, `mongo:7`, `127.0.0.1:27017` |
| Django database | `sefaria_auth` (pytest creates `test_sefaria_auth` itself) |
| Go database | `authsvc_go` (its tests drop tables, so it is never shared with Django) |

The harness never uses port 55432 (the local stack's Postgres), 18080, 19090 or 10080. If 55442 or 27017 is taken
by something other than an `apikeys-checks-*` container, the command fails and names the port.

## Reading a failure

- Each failing step prints `FAIL: <step>` on stderr and the command ends with `N failing step(s)` and exit 1.
- `pytest`: the full log is in `.claude/scratch/apikeys-checks/logs/pytest.log`. The run uses `--tb=line`, so each
  failure is one line with its file and line number.
- `migrations`: the commands are echoed with `$ python manage.py ...` and `exit=N`. The schema dumps show whether the
  CHECK constraint and the triggers came back after the reverse and forward steps.
- `go`: the log is in `.claude/scratch/apikeys-checks/logs/go.log`. `grep -- '--- FAIL'` finds failing tests.
- `Postgres not ready` or `Mongo not ready`: read `docker logs apikeys-checks-pg` (or `-mongo`).
- After a failure the containers are removed on exit. Run with `KEEP=1` to inspect them, then `down` to remove them.
