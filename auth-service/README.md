# auth-service

Envoy `ext_authz` server for the API Key Program. Classifies every request (anonymous / embed /
developer key / first-party JWT) from an in-memory key map and stamps `x-sefaria-tier`,
`x-sefaria-project`, `x-sefaria-auth-result`. Plan: sefaria-wiki `docs/plans/2026-09-16-api-auth-poc.md`.
Source of truth for the programme: sefaria-wiki `wiki/projects/api-key-program/_index.md`.

Env vars (cmd/authsvc): HTTP_ADDR=:8080 GRPC_ADDR=:9090 AUTH_MODE=enforce|observe
GATED_PATHS=/api/knn-search PG_DSN REDIS_ADDR REDIS_PASSWORD PUSH_CHANNEL=sefaria.apikeys
RELOAD_INTERVAL=60s JWT_MODE=envoy|authsvc JWKS_URL JWT_ISSUER JWT_AUDIENCE
HELP_URL=https://developers.sefaria.org/help/. REDIS_ADDR is optional and empty disables Redis
push subscription; REDIS_PASSWORD is optional when Redis does not require auth.
