# auth-service

Envoy `ext_authz` server for the API Key Program. Classifies every request (anonymous / embed /
developer key) from an in-memory key map and stamps `x-sefaria-tier`, `x-sefaria-project`,
`x-sefaria-auth-result`. Source of truth for the programme: sefaria-wiki
`wiki/projects/api-key-program/_index.md`.

## Phase 1 scope

In:

- `cmd/authsvc`: the ext_authz decision service over gRPC (`:9090`), with `/healthz`, `/readyz`,
  `/metrics` and `/internal/registry` on HTTP (`:8080`). Modes `enforce` and `observe`.
- `internal/registry`: reads the key registry, a full load at startup, change push through Postgres
  `LISTEN/NOTIFY` (coalesced full reloads), and a periodic full reload as the backstop. The registry
  is Django's `powered_by_project` and `powered_by_apikey` tables in `sefaria_auth`; Django owns the
  schema and the NOTIFY triggers (migrations in `powered_by/`) and is the only writer. One project
  has many keys; tier is per project, allowed origins are per key (empty = unrestricted). The project
  id becomes `x-sefaria-project`. `testdata/schema.sql` mirrors the tables for the Postgres tests.
- Helm (`helm-chart/sefaria/templates/authservice/*`, `templates/gateway/securitypolicy.yaml`):
  Deployment, Services, PDB, ServiceMonitor, and a SecurityPolicy with `extAuth` only (no `jwt`),
  all behind `authService.enabled` (default `false`). When enabled, the gateway's ClientTrafficPolicy
  strips client-sent `x-sefaria-tier`, `x-sefaria-project` and `x-sefaria-auth-result` at the listener,
  so a fail-open pass cannot carry spoofed identity upstream. Enabling requires
  `authService.image.tag` (an immutable `sha-...` tag pushed by the Continuous workflow).

Out (later phases): first-party JWT minting and verification, rate limiting
(BackendTrafficPolicy), the legacy body-borne `apikey`, the HTTP ext_authz transport, Redis/HTTP
push, the HTTPRoute and nginx log-field changes, load tests and drill scripts. A bearer token is
not verified in Phase 1: it rides the anonymous tier with `x-sefaria-auth-result: jwt_pending`.

Later phases are specified in the Sefaria wiki page
`wiki/meta/spec-2026-09-30-api-auth-phase1-and-later.md`. The full POC implementation, including
everything listed as out, is in PR #3736.

## Configuration

Env vars (cmd/authsvc): HTTP_ADDR=:8080 GRPC_ADDR=:9090 AUTH_MODE=enforce|observe
GATED_PATHS=/api/knn-search PG_DSN PG_NOTIFY_CHANNEL=sefaria_apikeys RELOAD_INTERVAL=60s
HELP_URL=https://developers.sefaria.org/#. An empty PG_NOTIFY_CHANNEL disables the listener and
leaves only the periodic reload.

PG_DSN comes from the cluster Secret `auth-service-registry` (key `AUTH_PG_DSN`): a read-only role
on `sefaria_auth` that can connect, LISTEN, and SELECT the columns the loader reads.
`scripts/provision-cluster-registry.sh` creates the role and the SOPS-encrypted Secret file; run it
after the Django migrations. A new column in the load query needs a matching GRANT; a role provisioned before deleted projects were loaded as revoked needs `GRANT SELECT (deleted_at) ON powered_by_project TO auth_service_reader;`.

## Checks

`make test` (Go vet and race tests; the Postgres tests run when `PG_TEST_DSN` is set, as they do in
the Continuous workflow's auth-service job),
`make helm-matrix`, `make helm-render`, `make shellcheck`.

## Demo

`scripts/demo.sh` walks through what is built, deployed, enforced, safe and propagated. Every section
prints the feature ids it proves (`FEATURES: ...`) and each check prints `[OK id]`, `[MISMATCH id]` or
`[SKIP id]`; the last line is `DEMO RESULT: ok=N mismatch=M skipped=K`. Targets: `--target local`
(default, the local stack in `dev/local-stack`) and `--target cauldron` (the cauldron named by
`APIKEYS_CAULDRON`, default the shared `apikeys-pipeline`, through `kubectl` on the dev context only;
`DEMO_HOST` overrides the site; `--allow-mutating` there needs `APIKEYS_CAULDRON` set explicitly). The demo is read-only by default;
`--allow-mutating` also runs the sections that write SQL, drop the listener connection or stop the
auth service (each is undone on exit). `--offline` runs only the checks that need no network, docker
or cluster, `--pause` waits between sections, and `--list-sections` prints the section names. A
`MISMATCH` means the target behaves differently from what the feature id promises, and the script then
exits 1; a `SKIP` means the check could not run here (read-only, POC only, or a tool is missing), not
that it passed. An unknown flag exits 2.
