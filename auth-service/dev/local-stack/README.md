# Local API-keys stack

The auth service, a stand-in for the Envoy Gateway setup, the chart's nginx and this checkout's Django, all on one
laptop. It's for the API-keys e2e suites (`e2e-tests/api-keys/`) and for poking at gateway decisions by hand. Ports,
hostnames, fixture ids and the manifest are fixed in `e2e-tests/api-keys/CONTRACT.md`.

```
curl / Playwright ─► envoy :10080 (strips client x-sefaria-*) ─┬─ ext_authz gRPC ─► authsvc :19090 ─► pg (LISTEN)
                  └► envoy :10081 (no strip)                    ├─ www., voices., gateway.test ─► nginx ─► Django :8100
                                                                ├─ direct.gateway.test ─► Django :8100 (no nginx)
                                                                ├─ flagoff.gateway.test ─► Django :8101 (flag off)
                                                                └─ echo.gateway.test ─► echo (shows what upstream got)
Django :8100/:8101 (host, runserver) ─► pg :55432 sefaria_auth (migrated by Django, NOTIFY triggers) ; mail ─► mailpit
```

## Use

| Command | Does |
|---|---|
| `./up.sh` | Brings it up, or repairs whatever is down. Idempotent: data survives, running Django servers are left alone |
| `./status.sh` | One screen of health; non-zero exit when something is down |
| `./smoke.sh` | Four end-to-end checks (anonymous page, gated path, ORM key accepted, revoke → 401 within 2 s) |
| `./envoy-variant.sh keepunchanged` | Restarts only Envoy with `path_with_escaped_slashes_action: KEEP_UNCHANGED` (N-A1). `default` switches back |
| `DJANGO_RESTART=1 DEVELOPER_SETTINGS_MOCKS=true ./up.sh` | Restarts both Django servers, :8100 with mocks on |
| `./down.sh` | Stops our two Django servers, then removes only this compose project's containers, network and volume. `--keep-data` keeps the Postgres volume |

`up.sh` also takes `AUTHSVC_REBUILD=1`, `AUTH_MODE`, `GATED_PATHS`, `RELOAD_INTERVAL`, `PG_NOTIFY_CHANNEL` and `PG_DSN` for the auth
service, and `SKIP_WEBPACK=1`. Requests by hand:

```bash
curl --resolve www.gateway.test:10080:127.0.0.1 http://www.gateway.test:10080/api/knn-search      # 401 api_key_required
curl -H 'Host: echo.gateway.test:10080' -H "x-api-key: $KEY" http://127.0.0.1:10080/x            # echo shows x-sefaria-tier
curl -s http://127.0.0.1:18080/internal/registry                                                  # {len, version, loaded_at, mode}
curl -s 'http://127.0.0.1:19000/stats?filter=ext_authz'
docker compose -p sefaria-apikeys-stack logs -f authsvc nginx
```

Never send `localhost` or `127.0.0.1` as the Host in a test about headers, CORS or cookies: with `DEBUG` on,
Django's `CORSDebugMiddleware` then adds permissive CORS headers.

State lives in `.claude/scratch/apikeys-stack/` of the checkout (git-ignored): `django-81xx.log` and `.pid`,
`migrate.log`, `compose-up.log`, `webpack.log`, and `run/` with the rendered `envoy.yaml` and `nginx.template.conf`.

## What it mirrors, and where it differs

- **Auth service**: built from `build/auth-service/Dockerfile` (runtime stage) with the chart's env and defaults. It
  reads Postgres as `auth_service_reader`, with the column grants of `scripts/provision-cluster-registry.sh`
  (`provision.sql`). `up.sh` builds the image only when it is missing; `AUTHSVC_REBUILD=1 ./up.sh` rebuilds it from the current `auth-service/` and recreates the container.
- **Envoy** (`render_configs.py`): `envoyproxy/envoy:v1.39.1`, the cluster's version. HCM defaults as Envoy Gateway
  1.9 generates them (`normalize_path`, `merge_slashes`, `UNESCAPE_AND_REDIRECT`, `use_remote_address`). ext_authz
  matches the SecurityPolicy (`failure_mode_allow`, 0.2 s, `x-api-key`/`authorization`/`origin`). The Lua filter is
  read from `templates/gateway/extensionpolicy.yaml` at render time. :10080 has the ClientTrafficPolicy strip and
  one trusted XFF hop; :10081 has neither, like the cluster's merged port-80 listener where that policy is not
  accepted. An active health check on `/readyz` (3 s, 3 failures) with panic routing off stands in for the k8s
  readiness probe, so a not-ready auth service should fail open as on the cluster (the stack scenario scripts check it). Not reproduced: TLS, merged gateways,
  per-route ext_authz wiring, route timeouts.
- **nginx**: the cluster's image (`opentracing/nginx-opentracing:nginx-1.23.3`). The config is
  `conf/nginx.template.conf.tpl` rendered by Helm's own `tpl` (root domain `gateway.test`, the chart's `voices`
  module, instrumentation off), then envsubst as in the chart's entrypoint. Three local changes, each asserted to
  apply: upstream `host.docker.internal:8100` instead of Varnish, `Host $http_host` (keeps the port), and
  `X-Forwarded-Proto $scheme` (plain HTTP). So the CORS map, `add_header ... always` and the `apiClassification` log
  are the chart's. Varnish is left out. `/static/` is served from this checkout's `static/`, not a collectstatic
  copy. Module redirects point at `https://voices.gateway.test/`, as the chart writes them, which does not resolve.
- **Django**: `runserver --noreload` on 127.0.0.1:8100 (flag on) and :8101 (flag off), settings
  `django_settings.py` on top of the normal ones: Postgres `sefaria_auth` on :55432, `.gateway.test` hosts, plain
  cookies with no domain, CSRF trusted origins, mail over SMTP to mailpit, `DOMAIN_MODULES` on :10080, and a
  per-process shared-data cache (the normal local dummy cache rebuilt the table of contents on every request).
  Mongo is the shared local `sefaria` database. `auth_user_id_seq` starts at 2,100,000,000 so accounts made in
  the UI never map onto real Mongo profiles. Never point `sefaria/local_settings.py` at this database instead:
  it is a symlink into another checkout.
- **Sentinel**: `up.sh` keeps one live key on user 2,098,000,901 (`seed_sentinel.py`), because the auth service
  ignores the first empty reload of a non-empty registry.
- **Webpack**: `up.sh` runs `npm run build-client` when a source file under `static/js` is newer than the bundle.

Rendering needs the `alpine/helm:3.16.4` image; everything runs in Docker except Django and webpack.
