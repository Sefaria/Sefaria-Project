# auth-service

Envoy `ext_authz` server for the API Key Program. Classifies every request (anonymous / embed /
developer key) from an in-memory key map and stamps `x-sefaria-tier`, `x-sefaria-project`,
`x-sefaria-auth-result`. Source of truth for the programme: sefaria-wiki
`wiki/projects/api-key-program/_index.md`.

## Phase 1 scope

In:

- `cmd/authsvc`: the ext_authz decision service over gRPC (`:9090`), with `/healthz`, `/readyz`,
  `/metrics` and `/internal/registry` on HTTP (`:8080`). Modes `enforce` and `observe`.
- `internal/registry`: the Postgres key registry (`schema.sql`), a full load at startup, change
  push through Postgres `LISTEN/NOTIFY` (coalesced full reloads), and a periodic full reload as the
  backstop.
- `cmd/keyadmin`: key and project administration against the registry (create, revoke, rotate,
  set-tier, set-origins, seed, init-schema). Running services pick changes up via NOTIFY.
- Helm (`helm-chart/sefaria/templates/authservice/*`, `templates/gateway/securitypolicy.yaml`):
  Deployment, Services, PDB, ServiceMonitor, and a SecurityPolicy with `extAuth` only (no `jwt`),
  all behind `authService.enabled` (default `false`).

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
HELP_URL=https://developers.sefaria.org/help/. An empty PG_NOTIFY_CHANNEL disables the listener and
leaves only the periodic reload.

## Checks

`make test` (Go vet and race tests; the Postgres tests run when `PG_TEST_DSN` is set),
`make helm-matrix`, `make helm-render`, `make shellcheck`.
