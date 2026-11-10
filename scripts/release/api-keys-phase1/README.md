# API keys phase 1: release scripts

Scripts for taking #3774 (API key program, phase 1) from master to staging, preprod and prod: a snapshot before each
promotion, a rollback of the chart and of the database to that snapshot, preflight checks, a staging smoke test, the
Powered by listing count, a timed rehearsal of the migrations on a copy of the database (N-M8), and a read-only watch of
prod while preprod's promotion migrates the shared database.

A person runs them. Nothing here deploys, merges, pushes or posts anything.

## Why the preprod promotion matters most

preprod (prod cluster, namespace `preprod`) and prod (prod cluster, namespace `default`) both set
`postgres.host: postgres-18.default.svc.cluster.local` and neither sets `postgres.db`, so both use the chart default
`sefaria_auth`. Every web pod runs `python manage.py migrate && gunicorn` at start
(`helm-chart/sefaria/templates/rollout/web.yaml`). The first preprod pod of the promotion therefore applies
`powered_by` 0003_developer_settings to 0011_api_key_allowed_domains to **prod's live database**, and the prod promotion later
carries no schema change. The migrations only add things, and old code works on the new schema (the test suite checks it
again), so the default after a problem is: roll the code back, keep the schema, roll forward.

## Safety properties

- **Context table.** Every script takes `--context` and refuses one that is not the env's cluster:
  staging is `gke_development-205018_us-east1-b_cluster-1`; preprod and prod are
  `gke_production-deployment_us-east1-b_cluster-1`. Every kubectl and helm call names that context; none uses the current
  context. The test suite stands in with `APIKEYS_RELEASE_TEST_CONTEXT`, which accepts only a `kind-` context.
- **Dry run by default.** `snapshot.sh` and `restore.sh` print what they would do. `--execute` runs them; the emergency
  chart rollback and the database restore also need the env name typed back.
- **Read-only where it says so.** `snapshot.sh`, `preflight.sh`, `listing-count.sh` and `watch-promotion.sh` read only: their SQL runs in a
  `default_transaction_read_only` session, and dumps are `pg_dump`. The backup CronJob is not triggered (it deletes old
  dumps and posts to Slack); `snapshot.sh` uses the same `pg_dump --format=c` approach without either.
- **No Secret values; the dumps are sensitive.** Secrets are checked by name with server-side table output, so no
  Secret data reaches the machine, and raw Rollout and pod objects are not saved (only names, images and revisions). The
  database dumps are a different matter: they are copies of `sefaria_auth`, with password hashes, sessions and (once
  phase 1 has run) API key values. The scripts write them under `umask 077` (directory 700, files 600); keep them on an
  encrypted disk or upload them only to the backup bucket, and delete local copies after the release. Keys are only ever
  printed as a 4-character prefix.

## Files

| File                                    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshot.sh`                           | Records an env and the database it uses. Writes `manifest.json`; the deployed and branch env files; HelmRelease, GitRepository (release tag), helm history, Rollout images and revisions, pod images, expected Secrets (names), `current_database()` from a web pod of each env sharing the database; `django_migrations`, per-table row counts, the scoped tables' schema and checksums; a full `pg_dump --format=c` and a dump of the scoped tables, each with sha256, `pg_restore --list` and a full read. `--upload gs://...` copies it with `gcloud storage cp`. |
| `restore.sh chart`                      | Normal path: checks that the snapshot's release tag still serves the snapshot's env file, prints the redeploy (`gh workflow run trigger-infra-deploy.yml -f tag=<tag>`), and with `--execute` creates a local branch off `origin/<env branch>` whose env file equals the snapshot's, then prints the push and `gh pr create` commands. `--emergency --execute`: suspends the HelmRelease, `helm rollback` to the snapshot's revision, checks each Rollout's images against the snapshot.                                                                              |
| `restore.sh db --scoped`                | Puts `powered_by_*`, the phase 1 tables (`api_project`, `api_tier`, `api_tier_meter_limit`, `powered_by_apikey`, `api_key_project_remap`), `apikeys_notify()` with its triggers, and the `powered_by` rows of `django_migrations` back to the snapshot. See below.                                                                                                                                                                                                                                                                                                    |
| `restore.sh db --full`                  | Prints the manual procedure and refuses to run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `preflight.sh`                          | Read-only checks before the preprod and prod promotions (list below). Exits 1 on a failure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `listing-count.sql`, `listing-count.sh` | Powered by projects listed now, hidden by the merge, listed after. `--record FILE` for the staging smoke test.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `staging-smoke.sh`                      | HTTP checks of the Staging list after the merge; with `--context`, the cluster-side ones; with `--legacy-apikey-file` and `--session-cookie-file`, the legacy apikey write (creates and deletes a collection).                                                                                                                                                                                                                                                                                                                                                        |
| `watch-promotion.sh`                    | Read-only watch while preprod is promoted: lock waits and long queries on `sefaria_auth`, the newest `powered_by` migration, prod web pods' readiness and restarts, prod nginx 5xx rate and latency; one line per tick, JSON lines on disk, an ALARM and exit 2 past the thresholds.                                                                                                                                                                                                                                                                                  |
| `rehearse-migration.sh`                 | Restores a dump into a scratch local Postgres (docker), runs the checkout's pending migrations one at a time with their durations, samples `pg_locks`/`pg_stat_activity` every 0.2 s. Never a cluster.                                                                                                                                                                                                                                                                                                                                                                |
| `release_lib.py`, `lib.sh`, `django/`   | Shared helpers; the Django settings overlay for running a checkout's migrations against a local port.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tests/run-tests.sh`                    | The end-to-end test on a kind cluster (below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Requirements: bash 4+ (macOS: `brew install bash`), kubectl, helm, git, python3, docker (or a local `pg_restore` 18+ and
no schema round trip), gcloud for `--upload` and the image check, gh for the staging release check. The rehearsal and the
test suite need a Python with the project's requirements (Django 6): pass `--python`.

## Runbook

The order follows the [release plan](https://github.com/Sefaria/Sefaria-Project/pull/3774) gates; the Sefaria wiki page
`projects/api-key-program/release-plan-phase1` is the full version.

### Before the master merge

```bash
# 1. The test suite (about 3 minutes; creates and deletes kind cluster apikeys-release-test):
scripts/release/api-keys-phase1/tests/run-tests.sh --master-code ~/sefaria/worktrees/apikeys-master --python <venv>/bin/python

# 2. Prod numbers for the go/no-go (read-only; needs gcloud auth for the prod context):
C=gke_production-deployment_us-east1-b_cluster-1
scripts/release/api-keys-phase1/listing-count.sh --env prod --context $C --record listing-prod.json
scripts/release/api-keys-phase1/snapshot.sh --env prod --context $C              # dry run: read what it will do
scripts/release/api-keys-phase1/snapshot.sh --env prod --context $C --execute    # a copy of sefaria_auth for N-M8

# 3. N-M8: the migrations on that copy, timed, with a reader standing in for old pods:
scripts/release/api-keys-phase1/rehearse-migration.sh --dump <snapshot>/db/sefaria_auth.dump \
  --code <phase1 checkout> --python <venv>/bin/python --concurrent-reads
```

The listing count's hidden rows need the product owner's sign-off before the promotion.

### Stage 7: master to staging

```bash
D=gke_development-205018_us-east1-b_cluster-1
# before the merge
scripts/release/api-keys-phase1/listing-count.sh --env staging --context $D --record listing-staging.json
scripts/release/api-keys-phase1/staging-smoke.sh --base-url https://www.sefariastaging.org   # baseline: see below
# after deploy-static has released and Flux has applied it
scripts/release/api-keys-phase1/staging-smoke.sh --base-url https://www.sefariastaging.org \
  --listing-record listing-staging.json --context $D [--session-cookie-file F] [--knn-token-file F]
```

The legacy apikey write is MANUAL unless `--legacy-apikey-file F --session-cookie-file F` name a legacy (non-`sfr_`) key
of a staging test account and a session of the same account: the script then posts a private collection with the key in
the body, checks that an unknown key is refused, and deletes the collection with the session (a legacy key cannot
delete). The key is read from the file and never printed.

On master before the merge, the smoke test fails exactly the phase 1 checks (X-Frame-Options on `/login`,
`/register` and the password-reset page; the `OPTIONS /api/*` preflight). After the merge every automated check must pass.

### Stage 8: master to preprod (migrates prod's database)

```bash
C=gke_production-deployment_us-east1-b_cluster-1
scripts/release/api-keys-phase1/preflight.sh --env preprod --context $C --infra-repo ~/sefaria/infrastructure
scripts/release/api-keys-phase1/snapshot.sh --env preprod --context $C --execute --upload gs://<bucket>/api-keys-phase1/
scripts/release/api-keys-phase1/restore.sh chart --snapshot <snapshot> --env preprod --context $C   # rollback ready?
# promote at low traffic; start the watch first and keep it running while the first preprod pod migrates
# (exit 2 and an ALARM banner: a session waited on a lock over 5 s, or prod 5xx went over 2% of >= 50 requests a tick):
scripts/release/api-keys-phase1/watch-promotion.sh --env preprod --context $C --interval 10 --duration 1800
scripts/release/api-keys-phase1/preflight.sh --env prod --context $C      # afterwards: nothing pending for prod
```

Expected preflight result before this promotion: the phase 1 tables do not exist yet (WARN), and the reader role and the
Secret in `preprod` depend on the infrastructure commit. `powered_by_apikey` has no grant in any migration (0008 grants
only the three `api_*` tables), so after the migration the preflight fails on it until
`GRANT SELECT (id, key, project_id, label, allowed_origins, revoked_at) ON powered_by_apikey TO auth_service_reader;`
is run. That must happen before `authService.enabled: true`.

### Stage 9: preprod to prod (no schema change)

```bash
scripts/release/api-keys-phase1/preflight.sh --env prod --context $C --infra-repo ~/sefaria/infrastructure
scripts/release/api-keys-phase1/snapshot.sh --env prod --context $C --execute --upload gs://<bucket>/api-keys-phase1/
scripts/release/api-keys-phase1/watch-promotion.sh --env prod --context $C --duration 1800   # during the promotion
scripts/release/api-keys-phase1/preflight.sh --env prod --context $C --infra-repo ~/sefaria/infrastructure   # after: CronJobs, Datadog
```

The prod preflight renders the chart and env file at `origin/prod` (`--chart-ref`), so before the promotion it compares
the cluster with what is deployed, and after it with the new release.

## Rolling back

1. **Code first, through the promotion path.** `restore.sh chart --snapshot S --env E --context C --execute` prepares
   it. The step that deploys is the redeploy of the snapshot's release tag:
   `gh workflow run trigger-infra-deploy.yml -R Sefaria/Sefaria-Project --ref master -f tag=<tag>`. That makes the
   infrastructure repo's GitRepository for the env serve the old tag, and Flux applies it within 5 minutes. The local
   branch keeps the env branch's file truthful. Merging an env-file-only change does not deploy by itself, because
   `deploy-static.yaml`'s update-deployment-state step then fails (nothing to commit, or the tag exists). Before the next
   promotion, revert the promotion merge on the env branch (the script lists the merges since the snapshot).
   For staging, `trigger-infra-deploy.yml` rejects `staging/` tags (it allows prod, preprod, qa and dev), so a staging
   rollback goes through a revert on master.
2. **Emergency.** `restore.sh chart ... --emergency --execute` suspends the HelmRelease (so Flux stops re-applying) and
   runs `helm rollback` to the snapshot's revision, which puts each Rollout's template back; then step 1, then
   `flux resume hr <name> -n <ns>`. It does not run `kubectl argo rollouts undo`, which would race helm's apply; it prints
   that command if a Rollout still differs.
3. **Database, only if needed.** Old code works on the new schema, so the default is to keep it. If the schema must go,
   `restore.sh db --scoped`:
   - refuses while any Running or Pending pod in either env sharing the database runs an image from the web repository
     other than the snapshot's (roll the chart back first);
   - refuses if a foreign key from outside the scoped tables points into them;
   - shows the `powered_by_project` rows added, changed or removed since the snapshot (they are not kept);
   - takes a fresh full dump and a scoped dump first;
   - checks the pods again right before the change, then in one transaction (`BEGIN` ... `COMMIT`, `lock_timeout` 15 s): drops the scoped tables in one `DROP TABLE` without CASCADE, drops
     `apikeys_notify()` unless the snapshot had it, restores the scoped tables from the snapshot's scoped dump (schema,
     data, sequences, constraints, indexes, grants), and puts the `powered_by` `django_migrations` rows back;
   - verifies the scoped tables' schema (`pg_dump --schema-only`, normalised) and per-table row checksums against the
     snapshot. Postgres prints some CHECK expressions differently after any dump and restore, so the schema reference is
     the snapshot's dump restored once into a scratch postgres:18 container (`db/scoped-schema.roundtrip.sql`); without
     docker the comparison falls back to CHECK expressions without casts and parentheses.
     Content types and permissions Django created for the phase 1 models stay (harmless; `remove_stale_contenttypes`
     clears them). A phase 1 pod started after this re-applies the migrations (tested).
4. **Never a reverse migration**, and no automated full restore: `sefaria_auth` also holds users, sessions and
   social accounts written since the snapshot. `restore.sh db --full` prints the manual procedure.

## Preflight checks

`preflight.sh --env preprod|prod --context C [--code-ref REF] [--infra-repo DIR]` prints PASS, FAIL, WARN or SKIP:
`current_database()` on a preprod and a prod web pod; `auth_service_reader` exists, may CONNECT, and has SELECT on every
column `auth-service/internal/registry/pgload.go` reads (`powered_by_apikey` included); Secret `auth-service-registry` in
the env's namespace; pending migrations of the code ref (preprod: only phase 1 may be pending; prod: nothing); the env
file's image tags in Artifact Registry; Rollouts Healthy and the HelmRelease Ready; transactions older than 60 s; for
preprod, `DEVELOPER_SETTINGS_ENABLED` off; the Secret's namespace declared in the prod cluster (with `--infra-repo`,
in `prod/cluster-1/spec/namespaces.yaml` or another Namespace manifest there; without it, a MANUAL line naming what to
look for). For prod only, the chart and `envs/prod` values at `--chart-ref` (default `origin/prod`) are rendered with
`helm template`: every CronJob it renders must exist in `default` (a missing one FAILs; a different schedule, a suspended
one, or a release CronJob the chart no longer renders is a WARN), and every Running prod web pod must carry the Datadog
labels and annotations the chart renders on the web pod template (skipped when `datadog.enabled` is off). Those two need
helm and PyYAML for `APIKEYS_RELEASE_PYTHON3`, and are SKIPped without them.

## Watching the preprod promotion

`watch-promotion.sh --env preprod|prod --context C [--interval 10] [--duration 1800] [--out DIR]` changes nothing. Each
tick it reads, in a read-only session with a 2 s lock timeout (so the watcher never queues behind the migration), the
sessions on `sefaria_auth` waiting on a lock (what they wait for, for how long, the blocking pids) and the queries or idle
transactions older than `--long-query` (30 s), with the query text cut at its first comment and every string literal replaced by `?`; the newest
`powered_by` row of `django_migrations`; prod web pods' readiness and restarts since the start; and the prod nginx
access log lines since the previous tick (`kubectl logs --since-time`, counts of `httpRequest.status` >= 500 and latency
percentiles; no line is printed). It prints a line per tick and appends a JSON object per tick to `DIR/watch.jsonl`.
`--max-lock-wait` (5 s), `--max-5xx-pct` (2%) and `--min-requests` (50) set the alarms; `--stop-on-alarm` stops at the
first. Three ticks in a row without the database are also an ALARM. Exit 2 after an alarm, 1 when a tick could not
read something (or nginx lines arrived but none parsed), else 0.

## The test suite

`tests/run-tests.sh --master-code DIR [--phase1-code DIR] --python PY` builds kind cluster `apikeys-release-test` with
namespaces `default`, `preprod` and `flux-system`; a `postgres:18` StatefulSet `postgres-18` (pod `postgres-18-0`);
minimal Flux HelmRelease/GitRepository and Argo Rollout CRDs (objects only, no controllers); the preprod and production
web Rollouts and stand-in web pods installed as helm releases `preprod` and `production`, so helm history and helm
rollback are real; HelmReleases from the env files; GitRepositories at release tags of a fixture repository; the
Secrets by name. Then, in order:

1. master's migrations and listing rows (one published row asked not to be published); wrong-context and dry-run checks;
   listing count (3 listed, 1 hidden, 2 after); snapshot, with the manifest and dump checksums checked;
2. phase 1's migrations and a tier, a project and a key; the preprod release flipped to a phase 1 image (helm revision 2);
3. preflight: fails without the grant on `powered_by_apikey`, passes with it, fails without the Secret;
4. `restore db --scoped` refused while the phase 1 image runs (database unchanged); `db --full` refused;
5. `restore chart`: dry run (no branch), `--execute` (branch with the snapshot's env file, nothing pushed), emergency dry
   run and wrong confirmation (no change), `--emergency --execute` (HelmRelease suspended, helm revision 3 = revision 1,
   Rollout and pods back on the snapshot image); then the git side applied as Flux would: HelmRelease spec and
   GitRepository tag equal to the snapshot's;
6. `restore db --scoped`: dry run (no change), `--execute`; tables, row checksums, `powered_by` migrations and schema equal
   to the snapshot; `apikeys_notify()` and the triggers gone; a fresh dump taken; master's code has no unapplied
   migration and creates, lists and deletes a listing; a second restore is a no-op; phase 1 migrates forward again and
   master's code still works on that schema;
7. `rehearse-migration.sh` on the snapshot dump with a concurrent reader;
8. staging-smoke's legacy apikey write against a stub of the two endpoints (MANUAL without the flag, refused without a
   session to delete with, then create, refuse an unknown key, delete; the key never printed).

The preflight step (3) also covers the prod-only checks against stand-ins built from the real chart's prod render
(CronJobs with the same names and schedules, the Datadog labels and annotations on the production web pods): they
pass, then fail with a CronJob deleted and with an annotation removed; and the namespace check (its own
`namespace.yaml`, `namespaces.yaml`, neither, and MANUAL without `--infra-repo`). Between steps 3 and 4,
`watch-promotion.sh` runs a clean short window (exit 0, every tick's JSON checked), then fires its lock-wait alarm
while a transaction holds ACCESS EXCLUSIVE on `powered_by_project` and a reader waits (the reader's query literal must
not reach the output), its 5xx alarm while a stand-in nginx (`app=nginx-production`) logs 503s, and exits 1 when it
cannot read the database; the database is unchanged by the watches.

Not covered by the kind suite: real nginx log volume and real Argo-managed web pods for the watch, the real Django
`/api/collections` endpoints for the legacy write (the stub follows `sourcesheets/views.py`; the POST path is covered by
`reader/tests/legacy_api_key_test.py`), the Django branch of the `current_database()` probe (stand-in pods answer through
psql), real Flux and Argo controllers, `gcloud storage cp` and the Artifact Registry check, the `trigger-infra-deploy.yml`
dispatch, and the rehearsal on a real copy of prod (it needs a prod snapshot). `pg_dump` runs inside the `postgres-18`
container, under its 4 GiB memory limit; the dump of `sefaria_auth` (hundreds of MB) streams out through `kubectl exec`.
