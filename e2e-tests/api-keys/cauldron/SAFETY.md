# Cauldron runner: safety rules

`run.sh` prints this file before it does anything. It targets only
`https://www.$APIKEYS_CAULDRON.cauldron.sefaria.org` (default `apisplit`, the phase-1 cauldron; the shared
`apikeys-pipeline` was deleted on 2026-10-26; `APIKEYS_PR` names the PR whose merge commit the images must
match, default 3774) and the dev cluster context
`gke_development-205018_us-east1-b_cluster-1` (the default context on some machines is production).

`auth-service/scripts/demo.sh --target cauldron --allow-mutating` needs `APIKEYS_CAULDRON=<name>` and
`APIKEYS_ALLOW_MUTATING_ON=<same name>`, never runs on `apikeys-pipeline`, `authpoc` or `api-keys-poc`, and refuses
(exit 2) any kube context other than the dev one, a namespace other than `default`, or a `DEMO_HOST` that does not
name the cauldron.

## Rulebook

**Safety rulebook (from history.md §2):**
- Never run `migrate`, `makemigrations`, `flush`, `loaddata`, `pytest` or `manage.py test` in any pod. Never write SQL
  through psql.
- Never touch any of these:
  - authpoc
  - api-keys-poc / sc-47185
  - other cauldrons
  - the `auth-service-registry` Secret
  - the `auth_service_reader` role
  - Envoy Gateway or KEDA objects
  - the infrastructure repo
- No pod deletes, restarts, scale/patch/apply/edit, or `flux reconcile` without the cauldron owner's explicit go-ahead
  (Yotam's on `apisplit`; Daniel's on any shared cauldron). F-series drills also need Yotam.
- Never use `create-cauldron.sh` or `repoint-cauldron.sh`. Never force-push the cauldrons repo. Edit only
  `apisplit.yaml` there, and only on a go-ahead: all five tags plus the chart version, keeping `pinned`,
  `authService` and the flags. Pin the tag CI actually built (read it from the Continuous Image Build log), not the
  PR's `merge_commit_sha`: GitHub can regenerate the trial merge after CI checks it out, and a tag that does not exist
  leaves the Helm upgrade waiting for its full timeout. Revert to roll back.
- Never touch existing rows:
  - the 16 keys and 143 projects
  - the 5 mock rows
  - LA ids `2_099_000_001`..`007`
  - `claude-runthrough-*` accounts
  - `qa+*` accounts
- Never register accounts through `/register`. Use only `@example.com` addresses, because cauldrons send real mail.
- No load or saturation tests: the Envoy fleet is shared by all of dev. Use at most 2 workers.
- Never print, log, commit or wiki-write a full key. Keep only the 4-character prefix.
- Always use the `www.` host. Pick exec pods by label and phase. Treat 502, 503, 504 and the splash page as infra.


## How the runner keeps to it

- Every cluster call passes `--context` for the dev cluster and `-n default`. `run.sh` refuses to start if any line
  in the runner's scripts names the cluster CLI without `--context`, and `APIKEYS_KUBE_CONTEXT` may only name the dev
  cluster.
- Cluster verbs are limited to `get`, `describe` and `logs`, one read-only `psql` exec on `postgres-18-0`
  (`default_transaction_read_only=on`, SELECT or `\dp` only), and a port-forward to the auth service on
  `127.0.0.1:18081`, which the exit trap kills.
- No seeding: the run uses an empty, git-ignored manifest (`e2e-tests/.apikeys-e2e-cauldron.json`, deleted on exit), so
  only the cases that need no fixture account or key run. Playwright runs with `--no-deps`, so the setup project
  never clears the local suites' `.auth/`, at most 2 workers and 1 retry, with traces off.
- No POST, PUT or DELETE reaches a non-developer endpoint, except the Strapi `cache-invalidate` call with wrong
  credentials, sent once. POSTs to the gated path are refused by the gateway before Django.
- A read-only snapshot of `sefaria_auth` (id checksums of keys and projects, fixture band, marker and fixture-email
  counts) is taken before and after, and must not change.
- Everything written under `results/cauldron-runs/<runId>/` is masked (`key_prefix=` and `sfr_…` to 4 characters) and
  grepped for `sfr_[A-Za-z0-9]{5,}` at the end.

## Seeded runs

Seeding the cauldron (fixture accounts, projects and keys written through the ORM in the web pod) is a cluster write.
The seeder also refuses any cauldron write unless `APIKEYS_ALLOW_MUTATING_ON` equals `APIKEYS_CAULDRON`. It needs the cauldron owner's go-ahead (Yotam on `apisplit`). Every cauldron's auth service reads the one shared `sefaria_auth` registry, so seeded rows show on all of them. The go-ahead is not recorded, so this runner has no seeded mode. When it is approved, the
seeded flow is: the same preflight and snapshot; require the script's `--leftovers` to print 0; seed once with the
script and password on stdin (`python - --target cauldron --reset --manifest-stdout`) into the manifest above;
run `--project=apikeys` with the setup project, but only when no local suite is running, because the setup project
deletes the shared `.auth/` folder; leave out account deletion, listing claims, the test panel's "create listing",
`/register`, B7 and B9; tear down from a trap after a `--teardown --dry-run` whose rows are all in band or marked
`E2E `; then repeat the snapshot and `--leftovers`. At most two seed and teardown cycles a night.
