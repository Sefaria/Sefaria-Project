# Monthly quota for semantic search: design validation

Status: design validation, documentation only. Nothing in this file is built by this document. Rows marked `planned` are tracked in the feature matrix; rows marked `POC` are proven only on the POC branch (draft #3813); rows marked `doc` are accepted behaviour reasoned from source. Written from the 2026-10-20 quota deep dive. Section numbers follow the deep dive; sections 8 (accepted risks) and 9 (references) are added here.

Verified vs UNVERIFIED: a claim is source-verified only where its row or bullet cites code, and is live-verified only where it says so. Source reading is not live behaviour. The UNVERIFIED lists are carried over verbatim (section 6).

Limits are per API-key project. The monthly counter and the per-minute counters are keyed by the project id (`x-sefaria-project`), and the tier comes from the project's row in `powered_by_projectlimits` (no row means `developer`). All keys of one project share its counters and its tier. Where the deep dive text reads the tier from `powered_by_project.tier`, that is the POC source; on the split branch the tier is read from the limits row.

The test-status column mirrors the F-QUOTA-01 rows of `e2e-tests/api-keys/features.json`: it states the proof for each row (a drill, a test, a POC proof, a planned proof, or a documentation-only acceptance).

---

## 0. Citation key

| Short | Meaning |
|---|---|
| `POC` | Sefaria-Project `origin/feature/<POC story>/auth-service-poc-monthly-quota` @ `76d34a4` (draft PR #3813). Go paths start at `auth-service/`, chart paths at `helm-chart/sefaria/` |
| `P1` | Sefaria-Project `origin/feature/<P1 story>/api-keys-phase1-with-settings-ui` (Phase 1, #3798) |
| `INFRA` | `Sefaria/infrastructure` `origin/main` @ `d5a41a9` |
| `EG@v1.8.0` / `EG@v1.9.1` | github.com/envoyproxy/gateway at those tags. Prod runs v1.8.0, dev v1.9.1 (`INFRA prod/cluster-1/spec/envoy/helmrelease.yaml:25`, `dev/cluster-1/spec/envoy/helmrelease.yaml:25`) |
| `RL@8fe6ea42` / `RL@ff287602` / `RL@master` | github.com/envoyproxy/ratelimit: the image EG v1.9.1 bundles / the image EG v1.8.0 bundles / `053bfeb` (`EG api/v1alpha1/shared_types.go:38@v1.9.1`, `:37@v1.8.0`) |
| `Envoy@1.39.1` | the proxy EG v1.9.1 bundles (`shared_types.go:30@v1.9.1`) |
| `wiki/` | the Sefaria wiki repo, `sefaria-wiki`, under `wiki/` |
| `spec` | `wiki/meta/spec-2026-10-14-api-key-monthly-quota.md` |
| `arch` | `wiki/sources/api-key-architecture-2026-10-14.md` |
| `next-steps` | `wiki/projects/api-key-program/next-steps.md` |
| `r1`..`r4` | citation keys for the 2026-10-20 research notes behind this document: r1 (code reading), r2 (Envoy and Envoy Gateway docs), r3 (Go ext_authz practice), r4 (industry comparison). The notes are not published in this repo; every conclusion they support is carried inline here. A cite like `(r2 §C1)` names the note section the conclusion came from |
| Trove-Envoy | Trove book "Envoy Proxy: The Definitive Guide", `cmmt9asuy0a2yqq0z4njsdch4` (p.14 = ch.12 ext_authz, p.19 = ch.17 rate limiting) |

Corrections to the research made while writing this (source re-read):
- r2 §B4 says per-rule `xRateLimitHeaders` is v1.9+ only. **Wrong.** It is in the v1.8.0 API:
  `api/v1alpha1/ratelimit_types.go:139-144@v1.8.0` (fetched with `gh api`). r1 Q5.6 was right.
  The chart comment claiming 1.8.0 rejects it (`POC values.yaml:256-258`) disagrees with the source; live CRD behaviour on prod is UNVERIFIED.
- r2 §A3 worries that client-sent `x-sefaria-*` survive a fail-open. On the POC chart they are stripped at the listener before
  ext_authz (`POC templates/gateway/clienttrafficpolicy.yaml:30-37`), proven on authpoc with the auth service at 0 replicas
  (`wiki/projects/api-key-program/checks/evidence/L03.txt`, S1). The worry is valid only where that ClientTrafficPolicy is not
  Accepted, which today includes prod and preprod (next-steps §4, "ClientTrafficPolicy was rejected"; r1 step 0).
- (corrected, verification pass) The chart comment `POC values.yaml:272-273` says Month is a calendar month "only on EG >= 1.9 with the
  ... USE_CALENDAR_MONTH_RATE_LIMIT flag". The flag tracks the bundled ratelimit image, not the EG minor: EG v1.8.0/v1.8.1 bundle
  `ff287602`, v1.8.2/v1.8.3 `1e50889b`, **v1.9.0 `17b1956c`**: none has the flag; **v1.8.4, v1.8.5 and v1.9.1 bundle `8fe6ea42`**, which has it
  (default `false`). EG itself never sets it (`internal/infrastructure/kubernetes/ratelimit/resource.go:300-450@v1.9.1`). So on every EG version we run,
  `Month` is the 30-day epoch block unless the env var is set; the image can also be pinned via `rateLimitDeployment.container.image` without an EG upgrade.
  (Checked with `gh api .../api/v1alpha1/shared_types.go?ref=<tag>` for every v1.8.x/v1.9.x tag and `settings.go` at each image commit.)

Final pass (2026-10-20): merged r1's second-pass addendum (A1-A4: machine-run decision matrix, prod namespaces, edge cases E27-E34) and r2 section J (J3 additions) into the catalog as Q-EDGE-66..74 and edits to Q-EDGE-07, -09, -24, -30, -46. `P1` is now `7e3f5bb87a` (r1's first pass cited the merge-base `78e160b`); POC `76d34a4a77` re-confirmed with `git rev-parse`.

New facts found while writing (not in r1-r4):
- Django's embedder retries Gemini up to **5 times** per request on `{429, 500, 502, 503, 504}` and transport errors, 60 s timeout
  each (`POC semantic_search/embedder.py:10,25-26,47-77`). One counted gateway request can be up to 5 Gemini calls. (corrected) They are
  not 5 *billed* calls: a retry only follows a failed attempt, and Google's billing FAQ says "If your request fails with a 400 or 500 error,
  you won't be charged for the tokens used. However, the request will still count against your quota" (https://ai.google.dev/gemini-api/docs/billing).
  The amplification is Gemini quota/RPM (worsening a Gemini 429 storm) and worker time (5 x 60 s + ~15 s backoff), not spend. A client-side
  60 s timeout on a request Gemini did complete may still be billed (UNVERIFIED).
- There is no query-length cap in `KnnSearch.post` (`POC api/views.py:378-415`; only `MAX_RESULT_LIMIT = 100`, `MAX_LINKED_REF_LIMIT = 100`).
- No embedding cache: `get_query_embedding` calls `embed_query` directly on every request (`POC semantic_search/search.py:29-33`).
- Django's Bearer check and body validation run **before** Gemini (`POC api/views.py:378-415`), and a missing `GEMINI_API_KEY` gives 503
  (`:418-419`); a Gemini failure after retries gives 502 (`:426-427`). The success response sets `Cache-Control: no-store` (`:456`).
- nginx sends every `/api/` request, including `/api/knn-search`, through Varnish (`POC conf/nginx.template.conf.tpl:277-283`).
- EG header matches support `invert` on v1.8.0 (`api/v1alpha1/ratelimit_types.go:370-376@v1.8.0`), translated to
  `HeaderValueMatch.expect_match=false` (`internal/xds/translator/ratelimit.go:375@v1.8.0`, `:395@v1.9.1`). This is what a catch-all rule
  for "missing or unknown tier" can be built from (§4).
- The EG knob for ratelimit env vars is `config.envoyGateway.provider.kubernetes.rateLimitDeployment.container.env`
  (`EnvoyGatewayKubernetesProvider.RateLimitDeployment`, `api/v1alpha1/envoygateway_types.go:357-363@v1.8.0`), merged by name over EG's own env
  (`internal/infrastructure/kubernetes/ratelimit/resource.go:477@v1.9.1`, `ExpectedContainerEnv`; r2 Correction 3). Neither INFRA HelmRelease sets it today
  (`INFRA dev/cluster-1/spec/envoy/helmrelease.yaml:37-61`, `prod/.../helmrelease.yaml:37-43`).
- The next 30-day epoch boundaries (computed: `floor(unix/2592000)*2592000`): 2026-10-04, **2026-11-03**, 2026-12-03, 2027-01-02, 2027-02-01 (all 00:00 UTC). Matches r2 §B4.

---

## 1. The life of one semantic-search request with a developer key

Setup assumed: the POC chart with `authService.enabled`, `rateLimit.enabled`, `quotas` containing a `semantic` meter with a `developer`
monthly limit (the authpoc values: 100000/Month, `CAULDRONS authpoc.yaml:142-146`, r1 rule table). On prod none of this is live yet:
prod has no ratelimit backend, no Redis and no auth service (`INFRA prod/cluster-1/spec/envoy/helmrelease.yaml:37-43`;
`POC envs/{prod,preprod,staging}/helmrelease.yaml` contain no `authService`; r1 step 0, Facts table).

The caller sends `POST https://www.sefaria.org/api/knn-search` with `x-api-key: sfr_...` **and** `Authorization: Bearer <SEMANTIC_SEARCH_API_TOKEN>`
(Django still demands the Bearer: `POC api/views.py:378-385`; arch, table row "Semantic search accepts only a key").

| # | Hop | Reads | Writes / decides | Source |
|---|---|---|---|---|
| 1 | **Cloudflare** (edge) | the request | Forwards to the origin over HTTPS (0 plain-HTTP requests in 3 h + 1 h on prod). A POST with `no-store` is not served from Cloudflare cache (UNVERIFIED: Cloudflare cache rules not read) | next-steps §4, "forced port-80 redirect is safe for prod" |
| 2 | **Envoy listener** (one per HTTPS hostname listener) | inbound headers | `earlyRequestHeaders.remove` drops client-sent `x-sefaria-tier`, `x-sefaria-project`, `x-sefaria-auth-result`, `x-sefaria-meter`. HTTPS listeners only; port 80 only redirects when the auth service is on | `POC templates/gateway/clienttrafficpolicy.yaml:9-20,30-37`; r1 step 0; r3 row 3 |
| 3 | **ext_authz filter** (EG order 6 on v1.9.1, 5 on v1.8.0) | `x-api-key`, `authorization`, `origin` (+`cookie` if JWT) | One gRPC `Check` to `auth-service-<env>:9090`, `timeout: 200ms`, `failOpen: true`. No decision cache: every request is one call | `POC templates/gateway/securitypolicy.yaml:17-24` (corrected: the file is 50 lines; `:55-62` does not exist), `values.yaml:211-212`; `EG internal/xds/translator/httpfilters.go:93-140@v1.9.1`; Trove-Envoy p.14; r1 step 1, r2 §A1 |
| 4 | **Auth service `Check`** | path (cut at `?`), headers | Builds `Request`, calls `decideRequest` | `grpcserver.go:57-77`@POC; r1 step 2 |
| 5 | **Registry lookup** (in-memory `atomic.Pointer` map; never Postgres on the hot path) | the key string | Hit, not revoked, origin OK -> `allow(project_id, tier, "ok")`. Unknown/revoked -> 401 `api_key_invalid`; origin mismatch -> 403 | `decide.go:153-166`, `registry.go:98-101`@POC; r1 step 3, r3 row 16 |
| 6 | **Meter classification** | cleaned + raw path | `meterFor` longest-prefix over `METERED_PATHS` -> `semantic` for `/api/knn-search`, else `none` | `decide.go:79-151`@POC, `values.yaml:250-251`; r1 step 4 |
| 7 | **Headers stamped** on the OK response | decision | `x-sefaria-project=<powered_by_project.id>`, `x-sefaria-tier=developer`, `x-sefaria-auth-result=ok`, `x-sefaria-meter=semantic`, overwrite; `api_key` query param removed; `Authorization` kept | `grpcserver.go:78-92`@POC; Envoy applies `headers_to_set` before `continueDecoding` (`ext_authz.cc:759-785@1.39.1`); r3 §3 |
| 8 | **Rate-limit filter** (EG order 303, after ext_authz, so it sees the stamped headers) | `x-sefaria-tier`, `x-sefaria-meter`, `x-sefaria-project`, route name | Builds one descriptor per matching rule. For a developer key on knn-search two rules match: rule 0 (developer per-minute, Distinct project) and rule 6 (semantic+developer Month, Distinct project). Non-matching rules produce no descriptor | `POC templates/gateway/backendtrafficpolicy-auth.yaml:20-25,55-64`; `EG ratelimit.go:224-310,346-415@v1.9.1`; r1 steps 8-9, r2 §A3 |
| 9 | **Descriptors sent** | | ONE `ShouldRateLimit` gRPC call carrying both descriptors (both rules are non-shared, same listener domain), timeout 20 ms. Domain = `<gateway-ns>/<gateway>/<listener>`; entries = route name, `rule-<N>-match-<M>` per Exact match, the project id for the Distinct match | `ratelimit.cc:60-69@1.39.1`; `EG ratelimit.go:87-121,240-246,806-820@v1.9.1`; `INFRA dev/.../helmrelease.yaml:56-57`; r2 §B2, §C1 |
| 10 | **ratelimit service** | its xDS-delivered config | For each descriptor computes key `<CACHE_KEY_PREFIX=""><domain>_<k>_<v>_..._<bucketStart>`; for rule 6 that is (corrected, spelled out) `<domain>_<route>_<route>_rule-6-match-0_rule-6-match-0_rule-6-match-1_rule-6-match-1_rule-6-match-2_<projectId>_<bucketStart>` (Exact matches emit key=value=`rule-N-match-M`; Distinct emits the header value). `<route>` is `httproute/<ns>/<name>/rule/<i>/match/<j>/<host_with_underscores>` (`internal/gatewayapi/helpers.go:552-554`, `route.go:1931-1934@v1.9.1`). Month bucket = 30-day block from the Unix epoch (no calendar flag set) | `RL src/limiter/cache_key.go:52-104`, `src/utils/utilities.go:20-39`; r1 step 10, r2 §B2, §B4 |
| 11 | **Redis** (one per cluster; dev: `envoy-ratelimit-redis`) | | One pipeline: `INCRBY key 1` + `EXPIRE key 2592000+jitter(0..299)` per descriptor. Every matched descriptor is incremented, even if another one is over (no `STOP_CACHE_KEY_INCREMENT_WHEN_OVERLIMIT`) | `RL src/redis/fixed_cache_impl.go:35-38,65-93,182-202`; `RL settings.go:108-113`; r2 §B1, §C1 |
| 12 | **Decision** | INCRBY results | Over iff `after > limit` per descriptor; overall OVER_LIMIT if any descriptor is over | `RL base_limiter.go:128-136`, `src/service/ratelimit.go:244-266`; r2 §B1 |
| 13a | **429** (over) | | Envoy local reply 429, replaced by the chart's `responseOverride`: JSON `code: rate_limited` (+project, tier, meter), fixed `Retry-After: 60`, `x-ratelimit-*` dropped. Request never reaches nginx/Django/Gemini | `backendtrafficpolicy-auth.yaml:65-79`@POC; r1 step 11, r2 §F |
| 13b | **Allowed** | | Request goes Envoy -> nginx (`location ~ /api/` -> Varnish) -> Django. 200 responses carry `x-ratelimit-*` of the tightest descriptor only | `nginx.template.conf.tpl:277-283`@POC; `rlh-ratelimit_headers.cc:44-100`; r2 §C4 |
| 14 | **Django `KnnSearch.post`** | `Authorization` | Bearer must equal `SEMANTIC_SEARCH_API_TOKEN` else 401; JSON body validated else 400; no `GEMINI_API_KEY` -> 503 | `api/views.py:378-419`@POC |
| 15 | **Gemini** | query text | `embedContent` (`gemini-embedding-001`, 1536 dims), up to 5 attempts on 429/5xx/transport error, 60 s timeout each; then pgvector search. Failure -> 502 | `semantic_search/embedder.py:7-10,39-77`, `search.py:29-33`, `api/views.py:420-427`@POC |
| - | **Postgres** | | (corrected) The key registry (`sefaria_auth`) is not read or written in the request path (see Q2), and nothing is written anywhere. Django **does read** Postgres for the search itself: `semantic_search` models route to the `vector_db` alias (pgvector) | r1 Q2; `semantic_search/router.py:4-10`, `search.py:36-47`@POC |

```mermaid
sequenceDiagram
    autonumber
    participant C as Developer client
    participant CF as Cloudflare
    participant E as Envoy (listener + filters)
    participant A as Auth service (gRPC ext_authz)
    participant RL as envoy-ratelimit
    participant R as Redis
    participant N as nginx -> Varnish
    participant D as Django KnnSearch
    participant G as Gemini

    C->>CF: POST /api/knn-search (x-api-key: sfr_..., Authorization: Bearer token)
    CF->>E: HTTPS to origin
    Note over E: Listener strips client x-sefaria-tier/project/auth-result/meter
    E->>A: Check(path, x-api-key, authorization, origin), timeout 200ms
    Note over A: In-memory registry lookup (no DB). meterFor(path) = semantic
    alt unknown / revoked key, or no key on gated path
        A-->>E: Denied 401 (api_key_invalid / api_key_required)
        E-->>C: 401 JSON. Not rate limited, not counted
    else auth service down, slow or error (failOpen)
        A--xE: error / timeout
        Note over E: No x-sefaria-* headers, so no rule matches: gate AND all limits skipped
        E->>N: forwarded uncounted
        N->>D: Django Bearer check is the only guard
    else valid key
        A-->>E: OK + x-sefaria-project=P, tier=developer, meter=semantic
        Note over E: Build descriptors: rule0 (developer/minute/P), rule6 (semantic+developer/Month/P)
        E->>RL: ShouldRateLimit(domain=listener, [rule0, rule6]), timeout 20ms
        RL->>R: pipeline INCRBY minuteKey 1, EXPIRE; INCRBY monthKey 1, EXPIRE
        R-->>RL: minute=m, month=n
        alt Redis / ratelimit down or > 20ms
            RL--xE: error
            Note over E: failClosed=false, request passes, usually not counted
            E->>N: forwarded
        else m > per-minute limit (month still under)
            RL-->>E: OVER_LIMIT (month counter was still +1)
            E-->>C: 429 rate_limited, Retry-After: 60
        else n > monthly limit
            RL-->>E: OVER_LIMIT (minute counter also +1)
            E-->>C: 429 rate_limited, Retry-After: 60 (same body; until the 30-day block ends)
        else both under
            RL-->>E: OK
            E->>N: forward (x-sefaria-* headers kept for logs)
            N->>D: /api/knn-search
            D->>D: Bearer == SEMANTIC_SEARCH_API_TOKEN ? else 401 (already counted)
            D->>G: embedContent (up to 5 attempts)
            G-->>D: embedding
            D-->>C: 200 results, Cache-Control: no-store, x-ratelimit-* of tightest rule
        end
    end
```

### 1a. Blocked case: monthly quota exhausted
Monthly counter for `(listener, route, rule 6, project P, block 2026-10-04)` is at the limit. Hops 1-11 run as above; INCRBY returns limit+1
on the month key, so the decision is OVER_LIMIT and Envoy answers 429 with the override body and `Retry-After: 60` (r1 step 11).
Side effects: the per-minute key was also incremented (r2 §C1), the month key keeps growing on every retry (no stop-increment flag),
and each retry costs one ext_authz call, one ratelimit RPC and one Redis round trip (local over-limit cache is off: `RL settings.go:109`, r2 §D2).
The block lasts until the 30-day epoch block ends (next: 2026-11-03 00:00 UTC), not the calendar month (r2 §B4).

### 1b. Blocked case: per-minute exhausted
Same path; the minute key's INCRBY exceeds the per-minute limit, so 429 with the **same** body and `Retry-After: 60` (r1 E21). The month key
was incremented by the same pipeline, so the rejected call still costs a unit of monthly quota (r2 §C1; r4 D1). A client that keeps hammering
at the per-minute limit burns monthly quota at its full request rate without a single Gemini call.

---

## 2. Direct answers

### Q1. Once a developer calls semantic search with their own key, how exactly is the monthly limit enforced and the request blocked?
- The auth service does **not** count or block for quota. It only classifies: it stamps `x-sefaria-project` (Django project id),
  `x-sefaria-tier` (POC source: from `powered_by_project.tier`; split branch: from the project's `powered_by_projectlimits` row, no row means developer) and `x-sefaria-meter=semantic` (`grpcserver.go:78-92`, `decide.go:136-166`@POC; r1 steps 3-7; r3 §5 Q1).
- Envoy's **global rate-limit filter** reads those headers and sends a descriptor for the BackendTrafficPolicy quota rule
  `(tier Exact developer, meter Exact semantic, project Distinct)`, unit `Month` (`backendtrafficpolicy-auth.yaml:55-64`@POC; r1 rule table).
- The **ratelimit service** does `INCRBY` on a Redis key containing the listener domain, the route name (which contains the host), the rule
  index, the project id and the 30-day bucket start; if the post-increment value exceeds the limit it answers OVER_LIMIT
  (`RL cache_key.go:52-104`, `fixed_cache_impl.go:182-202`, `base_limiter.go:128-136`; r2 §B1-§B2).
- Envoy turns OVER_LIMIT into a 429, which the chart rewrites into a JSON body with `Retry-After: 60` (r1 step 11). Nothing past Envoy runs.
- What is counted: every request that passed ext_authz and matched the rule, whatever happens afterwards (Django 401/400/502, Gemini error,
  client abort), and every request rejected by the per-minute rule (r1 E18-E19; r2 §C1, §D1).
- Proof level: the mechanism is proven end to end on authpoc with a JWT-derived developer tier on a `probe` meter (`/api/shape/`, limit 6):
  6 x 200 then 429 (`quota-e2e.sh:57-64`@POC, `checks/evidence/L02.txt` 11/11). It has **never** been driven to a 429 with an `sfr_` registry
  key on `/api/knn-search` (r1 POC e2e table; r3 row 51).

### Q2. When does Postgres get updated (if ever) in that flow?
**Never in the request path.**
- The auth service only reads: one `SELECT` joining `powered_by_apikey` and `powered_by_project` (`internal/registry/pgload.go:12-14`@POC; on the split branch the tier is read from the project's `powered_by_projectlimits` row and the join keeps `powered_by_project` for `deleted_at`), a `LISTEN sefaria_apikeys`
  (`listen.go:64`), with a read-only role (`default_transaction_read_only = on`, column-level `GRANT SELECT`: `scripts/provision-cluster-registry.sh:37-40`@POC; r1 Q2).
- `powered_by_apikey.last_used_at` exists (`powered_by/models.py:260`@POC, `:259`@P1) and is written by nobody (`git grep last_used` on both refs; r1 Q2); it is
  deliberately kept out of the NOTIFY triggers (`0004_api_key_notify_triggers.py:6`; spec "Why at Envoy").
- Postgres is written only by Django (settings UI, admin, user deletion) and the operator CLI `keyadmin`. Those writes fire `NOTIFY` (key insert/delete, key/project/label/revoked/origins change,
  tier change, project delete: `0004_api_key_notify_triggers.py:14-37`@POC), which makes each auth-service replica reload its full snapshot (50 ms coalesce) with a 60 s periodic reload
  as backstop (`cmd/authsvc/main.go:75,136-165`@POC; r1 Q2; r3 row 26).
- Consequence: **there is no usage count in Postgres.** The only enforcement count is in Redis; developer-facing usage must come from a separate
  stream (nginx log fields `sefariaProject/Tier/AuthResult/Meter`, `nginx.template.conf.tpl:66`@POC, into BigQuery, then a daily rollup: spec §7).
  That split is the industry pattern (AWS GetUsage, Stripe meters, Google monitoring: r4 §4).

### Q3. Can a project's counter end up in more than one Redis ("hit another Redis"), and how are counters kept consistent?
**Not in more than one Redis (one exception below), but yes in more than one counter inside the same Redis.**
- (corrected) Exception: the dev Redis is a `Deployment` with `replicas: 1` and no `strategy`, i.e. RollingUpdate with maxSurge 1 / maxUnavailable 0
  (`INFRA dev/cluster-1/spec/envoy/resources/ratelimit-redis.yaml:4-12`). During a Redis rollout the new pod becomes Ready (`redis-cli ping`) while the
  old one still serves, so new ratelimit connections can land on the new, empty instance while pooled ones still hit the old: for that window one project's
  key exists in two Redis processes. Prod must use a StatefulSet or `strategy: Recreate`.
- One Redis per cluster: EG accepts a single backend URL (`RateLimitRedisSettings`, `envoygateway_types.go:757-783@v1.9.1`), sets only `REDIS_SOCKET_TYPE` and `REDIS_URL`
  (`ratelimit/resource.go:386-399@v1.9.1`), so `REDIS_TYPE=SINGLE`; the per-second second Redis is used only for `SECOND` units, and we use Minute and Month
  (`RL fixed_cache_impl.go:49-52`, `settings.go:145,176`; r1 Q3, r2 §D4). Dev has exactly one (`INFRA dev/cluster-1/spec/envoy/resources/ratelimit-redis.yaml`); prod has none yet.
  Prod and preprod live in the same prod cluster, so they would share the one prod Redis but never a key (different gateway names and route names) (r1 Facts "Prod vs preprod").
- Consistency mechanism: every Envoy replica and every ratelimit replica talks to that one Redis; `INCRBY` is atomic and returns the post-increment value, so admission is exact
  for one key (`fixed_cache_impl.go:232-239`, `base_limiter.go:128-136`; Redis INCRBY docs https://redis.io/docs/latest/commands/incrby/; POC burst: 10 allowed / 20 rejected for limit 10,
  `wiki/.raw/api-key-poc-results-2026-09-17/21c-ratelimits-authsvc-jwt.md`; r2 §D1). No async sync exists, which is stronger than Kong/Apigee/Azure defaults (r4 §4).
- **Where one project gets several counters in the same Redis** (all derived from source; live Redis key names UNVERIFIED, no cluster access):
  1. **Per host / listener.** Non-shared rules use the listener as domain and put the IR route name (which ends in the host) into the descriptor (`EG ratelimit.go:240-270@v1.9.1`,
     `internal/gatewayapi/route.go:1931-1938@v1.9.1`; logged route name `.../www_authpoc_cauldron_sefaria_org` in `24e-rl-redis-final.md`; EG docs "each route ... still has a separate rate limit bucket",
     https://gateway.envoyproxy.io/docs/tasks/traffic/global-rate-limit/). Prod has 6 HTTPS listeners (`https-en`, `https-www-en`, `https-voices-en`, `https-he`, `https-www-he`, `https-chiburim-he`:
     `POC envs/prod/helmrelease.yaml:155-175`, `templates/gateway/gateway.yaml:20-60`), so a project could get up to 6x its monthly quota by rotating hosts (r1 Q3 c; r2 Correction 2).
  1b. (corrected, added) **Per HTTPRoute rule/match.** The route name in the key is `httproute/<ns>/<name>/rule/<i>/match/<j>/<host>` (`helpers.go:552-554@v1.9.1`).
     The POC HTTPRoute has ~8 rules (`/api/texts/`, `/edit/`, three `/api/version-*` matches, `/api/text-upload`, `/modtools/`, `/download/bulk/`, optional
     `legacy-body-auth`, catch-all `/`: `POC templates/gateway/httproute.yaml:37-122`). knn-search only matches the catch-all, so the semantic quota splits
     per host only; but the developer **per-minute** rule is split per (host x route rule/match), roughly 10 independent per-minute buckets per host.
  2. **Per rule position.** The key holds `rule-<N>` where N is the rule's position, so inserting/reordering a rule renames keys and resets counters (`getDomainRuleIndex`, `ratelimit.go:806-820@v1.9.1`; r1 Q3 d; r2 §B2.1).
     (corrected, added) The same applies to the **HTTPRoute** rule index `<i>` in the route name: toggling `authService.legacyBodyArm.enabled` inserts the
     `legacy-body-auth` rule before the catch-all (`httproute.yaml:106-115`), renumbering `/` and resetting every non-shared counter on it, monthly semantic included.
  3. **Per tier.** A tier change moves the project to another rule index = fresh counter (r2 §B2.2; r4 D4).
  4. **Per window definition.** Turning on `USE_CALENDAR_MONTH_RATE_LIMIT` changes `bucketStart` = new keys (RL README "Calendar-aligned MONTH rate limits"; r2 §B4).
  5. **Per environment / cauldron.** Separate domains; same project id in two cauldrons = two counters (r1 Facts).
- Durability is the real consistency risk, not drift: dev Redis is `--save ""`, `--appendonly no`, `allkeys-lru`, `emptyDir` (`ratelimit-redis.yaml:30-48,72`@INFRA), so restart or eviction silently
  restarts the month at 0, and nothing can reconcile it because Postgres holds no counts (r1 E25; r2 §D5).

### Q5. Is "per-minute rate limit to protect us + monthly capacity" implemented the right way?
**The shape is right; the configuration is not production-ready.** Every major gateway separates a short-window throttle from a long-window quota
(Apigee SpikeArrest vs Quota, AWS throttle vs usage-plan quota, Azure rate-limit-by-key vs quota-by-key; r4 §1), keys the quota on the account/project not the credential
(r4 §7), and treats the gateway quota as a soft cap with a provider spend cap behind it (AWS "Don't rely on usage plan quotas ... to control costs"; r4 §4). Sefaria's design matches all three
(spec §3, §5; r4 §9a). The defects are in the details: rejected requests consume quota, counters split per host, counter identity depends on rule position and tier, the
store is not durable, the window is an epoch block, the 429 contract is the same for both limits, and unknown tiers / fail-open are unlimited. Ranked fixes are in §4.


### Per-minute and monthly rules together

Both rules apply to the same request. For a developer key on `/api/knn-search`, Envoy builds two descriptors (rule 0, the per-minute limit, and rule 6, the semantic monthly limit, both keyed by the project id) and sends them in one `ShouldRateLimit` call. The ratelimit service increments both counters on every request (`STOP_CACHE_KEY_INCREMENT_WHEN_OVERLIMIT` defaults to false), and the request is rejected when either counter is over its limit. So a request rejected by the per-minute rule still spends a unit of the monthly quota (Q-EDGE-33), and a request rejected by the monthly rule still bumps the minute counter. Both counters belong to the project: all keys of a project share them, and the tier that selects the rules comes from the project's limits row.

---

## 3. Edge-case catalog

Severity note: Q-EDGE-13 (C in the original deep dive, now M) and Q-EDGE-28 (H, now M) follow the 2026-10-20 fail-open decision (section 8); the rows below carry the revised severities.

Severity: **C** = can cost money or break the product promise at launch; **H** = wrong behaviour developers or ops will hit; **M** = correctness gap with a workaround or backstop; **L** = cosmetic / defence in depth.
Test: **U** = unit or render test (Go `go test`, `helm template` + assertion, `egctl x translate` diff); **D** = cauldron drill (authpoc, mutating, `quota-e2e.sh --drill` style); **E** = end-to-end on a cauldron with real `sfr_` keys.

### 3a. Window and time

| id | scenario | what happens today (POC) | what should happen | sev | how to test | source | test status |
|---|---|---|---|---|---|---|---|
| Q-EDGE-01 | Month boundary | `Month` = 30-day block from the Unix epoch; current block 2026-10-04 to 2026-11-03 00:00 UTC, then 12-03, 01-02. Old key expires within ~30 days + 300 s of its last hit; new key starts at 0 | Calendar month (1st 00:00 UTC) via EG >= v1.8.4 image + `USE_CALENDAR_MONTH_RATE_LIMIT=true`, or publish the epoch reset date everywhere | H | U: unit test of reset-date helper; E (corrected): `;w=2592000` in `x-ratelimit-limit` (Q1w) does **not** prove the epoch window: Envoy maps MONTH to 30x24x3600 unconditionally (`ratelimit_headers.cc:116-117@1.39.1`), so it reads the same with the calendar flag on. Check `x-ratelimit-reset` while the month descriptor is the tightest (RLS `CalculateReset`: `2592000 - now%2592000` vs seconds to the 1st), or the `_<bucketStart>` suffix of the Redis key; D: freeze-time not possible on cauldron, so check keys before/after 2026-11-03 | `RL cache_key.go:85-103`, `utilities.go:20-39`; r1 E20; r2 §B4; `next-steps` §4 ("reset about 19.7 days out") | plan: FU-Q-01 (reset-date helper unit test; assert `x-ratelimit-reset` or the `_<bucketStart>` Redis key suffix, never Q1w) |
| Q-EDGE-02 | Calendar flag turned on while counters exist | `bucketStart` changes at the flip, so every monthly counter resets to 0 | Flip before the first production counters exist, or at a published boundary | H | D: set env on dev ratelimit, compare `redis-cli --scan` before/after | RL README (`README.md:1483-1494@053bfeb`); r2 §B4; r4 D3 | plan: FU-Q-02 (drill: `redis-cli --scan` before and after on dev ratelimit) |
| Q-EDGE-03 | Fixed-window boundary burst | Up to 2x the limit across a window edge (minute and month) | Acceptable for month; for per-minute only if limits are near real capacity | L | E: N requests at :59, N at :00, expect 2N admitted | r4 §3 (Kong note); r2 §B1 | doc: `auth-service/docs/monthly-quota.md` row Q-EDGE-03 (accepted behaviour, reasoned from source) |
| Q-EDGE-04 | Clock skew between ratelimit replicas | Bucket computed from each pod's clock; seconds of ambiguity at a boundary | Accept; NTP on nodes | L | none needed (reasoned) | `RL base_limiter.go` `timeSource.UnixNow()`; r2 §D3 | doc: `auth-service/docs/monthly-quota.md` row Q-EDGE-04 (accepted behaviour, reasoned from source) |
| Q-EDGE-05 | Very large `Retry-After` | Not possible today: chart sends fixed `Retry-After: 60`; Envoy 1.39.1 has no dynamic Retry-After (`enable_retry_after_header` first in Envoy 1.40). A month-sized value (up to 2,592,000 s) would make naive clients sleep for weeks | Quota 429: no `Retry-After` (OpenAI pattern) or reset timestamp in body; per-minute 429: `Retry-After` <= 60 | M | U: render-check asserts header per override; E: curl and inspect | `backendtrafficpolicy-auth.yaml:65-79`@POC; r2 §F; IETF draft-11 §6 (`ietf11.txt`); r4 §5 | plan: FU-Q-05 (render check asserts the header per override; curl) |

### 3b. Redis and ratelimit availability

| id | scenario | what happens today | what should happen | sev | how to test | source | test status |
|---|---|---|---|---|---|---|---|
| Q-EDGE-06 | Redis restart / reschedule | No persistence (`--save ""`, no AOF, `emptyDir`): every counter, monthly included, silently restarts at 0; requests fail open while it is down (POC drill: 15/15 x 200; 6 timeouts and one 503 after restore) | AOF `appendfsync everysec` on a PVC (loses <= ~1 s), dedicated instance, alert on restarts; admin runbook to re-seed from the BigQuery rollup | C | D: delete Redis pod mid-burst, read keys after | `INFRA ratelimit-redis.yaml:1-3,30-48,72`; `24e-rl-redis-final.md`; r2 §D5; Redis persistence docs; r4 §4, D9 | plan: FU-Q-06 (drill: delete Redis pod mid-burst, read keys after) |
| Q-EDGE-07 | Redis eviction under memory pressure | `allkeys-lru` may evict a month key: silent reset to 1 on next hit | `noeviction` (or `volatile-*` has the same problem: every ratelimit key has a TTL) plus a `used_memory` alert. (added, r2 J3.6) The anonymous per-IP rule writes one key per source IP per minute window (TTL 60 s + up to 300 s jitter), so a many-IP flood is itself a way to fill 128 MB and evict month keys; key size ~250-350 B is an estimate, not measured | H | D: fill Redis on dev with junk keys, verify month key survives | `ratelimit-redis.yaml:31-39`@INFRA; Redis eviction docs; r2 §D5; r4 §4 | plan: FU-Q-07 (drill: fill dev Redis with junk keys, month key survives) |
| Q-EDGE-08 | Redis full with `noeviction` | INCRBY is `denyoom`: write errors, ratelimit returns error, Envoy fails open: quota off exactly when Redis is full | Alert on memory at 70%; treat OOM as fail-open incident | M | D: `maxmemory` tiny on a test Redis, observe pass-through | Redis INCRBY docs; r2 §D5, §E | plan: FU-Q-08 (drill: tiny `maxmemory` on a test Redis) |
| Q-EDGE-09 | Redis or ratelimit down, or ratelimit RPC > 20 ms | `failClosed: false`: request passes. If the service still applied INCRBY after Envoy gave up, the request is admitted **and** counted | Keep fail-open for availability (decided 2026-10-20: everything fails open, semantic search included, section 8). The Gemini project spend cap is the hard ceiling; alert on `ratelimit.error` and `ratelimit.failure_mode_allowed`. `failClosed` is one global bool and answers 500, so it cannot be scoped to knn-search. | H | D: scale ratelimit to 0; add Redis latency (`DEBUG SLEEP 0.05`) | `INFRA dev/.../helmrelease.yaml:56-57`; `ratelimit.cc:285-297@1.39.1`; r2 §E rows 1-3 | POC drill: `auth-service/scripts/drill-rl-redis-down.sh`; demo section_outage |
| Q-EDGE-10 | ratelimit pod restarted before xDS config arrives | `FORCE_START_WITHOUT_INITIAL_CONFIG=true`; `no rate limit configuration loaded` -> service error -> fail-open | Accept; >=2 replicas + PDB (`rateLimitPDB`) so one is always configured | M | D: delete ratelimit pod during load | `ratelimit/resource.go:371-374@v1.9.1`; `RL src/service/ratelimit.go:137`; r2 §E | plan: FU-Q-10 (drill: delete ratelimit pod during load) |
| Q-EDGE-11 | Redis HA failover (if Sentinel/replica is added later) | Async replica loses last writes; `READONLY` errors until reconnect unless `REDIS_CLOSE_CONNECTION_ON_READONLY_ERROR=true` | Prefer single durable instance; if HA, set that env (corrected: the env exists only in image `8fe6ea42`, `settings.go:210`; prod's `ff287602` (EG v1.8.0) lacks it) | L | D (only if HA is built) | RL README 1412-1428; r2 §D4, §E | doc: `auth-service/docs/monthly-quota.md` row Q-EDGE-11 (accepted behaviour, reasoned from source) |
| Q-EDGE-12 | Monthly-exhausted project keeps calling | Each call = ext_authz call + ratelimit RPC + Redis round trip (local cache off) + month key keeps growing | `LOCAL_CACHE_SIZE_IN_BYTES` > 0 so over-limit keys are answered from memory. (corrected, caveat) The local entry lives `ExpirationSeconds(unit)` = up to 30 days per ratelimit pod (`base_limiter.go:136-147`), so a *raised* limit or an operator reset of the Redis key does not unblock the project until the bucket rolls or the pod restarts (breaks Q-EDGE-45 and the §4 item 3 runbook) | M | E: exhaust quota, measure Redis ops/s | `RL settings.go:109`, `base_limiter.go:140-152`; r2 §D2 | plan: FU-Q-12 (e2e: exhaust quota, measure Redis ops/s) |

### 3c. Auth service availability and correctness

| id | scenario | what happens today | what should happen | sev | how to test | source | test status |
|---|---|---|---|---|---|---|---|
| Q-EDGE-13 | Auth service down / > 200 ms / error (fail-open) -> no tier | No `x-sefaria-*` at all: the gate is skipped AND no rule matches (no catch-all, no `internal` rule): per-minute and monthly limits off. Only Django's shared Bearer protects `/api/knn-search` | Fail open on every path (decided 2026-10-20, section 8). The A3 catch-all is per-minute limits only and carries no 'no semantic search' row, so a request with no tier header is not blocked on semantic search (F-OUT-02.e3). Accepted risk: Gemini quota exhaustion (Q-EDGE-65). | M | D: scale auth service to 0, call knn-search with Bearer only, count admitted (S1/S2 only check the strip today) | `values.yaml:211-212`@POC; r1 E12; r2 §E; next-steps 2026-10-19 "A3 accepted", "Conflict to fix" | plan: FU-Q-13 (drill: auth service at 0 replicas, knn-search anonymous and with Bearer only, nothing blocked by Envoy or the limiter; render check on the catch-all) |
| Q-EDGE-14 | Auth-service pod termination (rollout, scale-in) | `GracefulStop` starts at SIGTERM with no `preStop` sleep: checks routed to the dying pod can error -> fail-open with no headers for that moment | `preStop` sleep 5-10 s, `terminationGracePeriodSeconds` > 20 s shutdown cap, gRPC health NOT_SERVING on SIGTERM | M | D: rollout restart under k6 load, count requests without `x-sefaria-tier` in nginx log | `main.go:221-230`@POC; r3 rows 23, 43 | drill SC/nf1-sigterm.sh [KG] |
| Q-EDGE-15 | Registry empty at first load | Pod becomes Ready with an empty set; every valid key gets 401 `api_key_invalid` (N-CR8) | Not Ready on empty first load unless an explicit allow-empty flag | H | U: `go test -tags knowngaps` `TestKnownGapNCR8EmptyTableAtStart` (fails today) | `main.go:124-132`@POC; r3 row 20; r1 E13 | CMD::TestKnownGapNCR8EmptyTableAtStart [KG] |
| Q-EDGE-16 | Registry reload keeps failing (Postgres down) | Old snapshot kept silently, pod stays Ready; revocations and tier changes stop propagating | Gauge `authsvc_last_reload_success_timestamp_seconds` + alert | M | U + D: block Postgres, watch metric | `main.go:163-165`, `reload.go:50-67`@POC; r3 row 22 | plan: FU-Q-16 (go test plus drill: block Postgres, watch the metric) |
| Q-EDGE-17 | Replicas disagree during reload window | Each replica reloads independently: up to ~60 s where one replica still has the old tier/revocation | Accept (documented SLA 60 s) | L | E: revoke, poll 70 s | `registry.go:22-35`, `main.go:136-165`@POC; r1 Q2 | doc: `auth-service/docs/monthly-quota.md` row Q-EDGE-17 (accepted behaviour, reasoned from source) |

### 3d. Identity: headers, keys, projects, tiers

| id | scenario | what happens today | what should happen | sev | how to test | source | test status |
|---|---|---|---|---|---|---|---|
| Q-EDGE-18 | Client spoofs `x-sefaria-*` while the auth service answers | Stripped at listener, then overwritten by the auth service | Same | L | U: `TestGRPCOverwritesClientSentMeter`; E: S1 | `clienttrafficpolicy.yaml:30-37`, `grpcserver.go:53`@POC; r1 E22 | POC: AZ::TestGRPCOverwritesClientSentMeter; POC drill: quota-e2e.sh S1 |
| Q-EDGE-19 | Client spoofs `x-sefaria-project=<victim>` during an auth outage where the strip is NOT applied | Spoofed headers reach the rate-limit filter: attacker can burn a victim project's monthly quota or get a tier. On prod/preprod the ClientTrafficPolicy is still rejected, so the strip is not live there | ClientTrafficPolicy Accepted on every HTTPS listener before limits ship (fix `a33497b` exists on POC, not on #3774); port 80 redirect-only | C | D: `quota-e2e.sh --drill` S1 on the target env; check P1 (CTP Accepted) on prod | next-steps §4 ("rejected whole on 60 of 63 dev cauldrons", "Still to do: the same change on #3774"); r2 §A3; r1 step 0 | plan: FU-Q-19 (drill: `quota-e2e.sh --drill` S1 on the target env; wiki check D10 (CTP Accepted)) |
| Q-EDGE-20 | Key rotated mid-month (new key, old revoked) | Counter is per project id, so usage carries over; old key 401 within ~50 ms (NOTIFY) or 60 s | Same (correct by design, A2 decided) | L | E: use key A to N, create key B, revoke A, call with B, expect remaining = limit-N | `backendtrafficpolicy-auth.yaml:61`@POC; next-steps 2026-10-19 "A2 decided"; r4 §7, 9a.2 | plan: FU-Q-20 (e2e: use key A to N, create B, revoke A, expect remaining = limit - N) |
| Q-EDGE-21 | 5 keys on one project | All share one project counter (no multiplication) | Same | L | E: alternate 2 keys, one counter | `MAX_KEYS_PER_PROJECT = 5` `powered_by/developer.py:28,598-599`@P1; r4 9a.2; next-steps "per key ... multiplies by 5 keys" | plan: FU-Q-21 (e2e: alternate two keys, one counter) |
| Q-EDGE-22 | New project created to reset quota | Each project is a fresh full quota; no per-account project limit (N-CR7) | Decide N-CR7: cap projects per account, or stamp an owner header and add a per-owner monthly rule | H | E: create second project, verify fresh counter | next-steps:374 (N-CR7); r4 D5 | plan: FU-Q-22 (e2e: second project has a fresh counter; decision with Daniel) |
| Q-EDGE-23 | Tier change mid-month on the project's limits row (developer -> partner or back) | Different rule index = fresh counter; switching back resumes the old key if not expired | Document as reset; prefer per-project overrides; runbook to read/set the Redis key | M | E: change tier with `keyadmin set-tier`, compare remaining | r2 §B2.2; r4 D4; r1 E17 | plan: FU-Q-23 (e2e: set the tier on the project's limits row, compare remaining) |
| Q-EDGE-24 | Project soft-deleted | Loaded as revoked: 401 for all its keys, not counted (see Q-EDGE-69 for how fast that propagates). Its counter stays in Redis until TTL; an undelete in the same block resumes it | Same | L | U: registry tests (exist); E: soft-delete then call | `pgload.go:10-14`@POC; r1 E3 | PT/migration_project_limits_test.py::BackfillMigrationTest::test_deleted_project_keeps_its_row_and_its_keys_load_revoked; RG::TestLoadAllMarksDeletedProjectKeysRevoked |
| Q-EDGE-25 | Revoked or unknown key | 401 `api_key_invalid` before the rate limiter: never counted and never rate limited (key guessing limited only by ext_authz capacity; each deny writes a log line) | Count denies per IP (e.g. catch-all anonymous rule never sees them); sample deny logs | M | U: knowngap tests; D: k6 random keys, watch log volume | `decide.go:155-158`@POC; r2 §A2; r3 rows 33-34; r1 E2 | plan: FU-Q-25 (knowngap tests; drill: k6 random keys, watch log volume) |
| Q-EDGE-26 | Tier `internal` | No `internal` rule: unlimited by absence | Explicit very high `internal` per-minute rule, no monthly rule (section 4 item 5, A3). | H | E: `quota-e2e.sh` Q4 already shows 8 x 200; add a rule and expect 429 at its limit | spec §4 lines 105-112; next-steps 2026-10-19; r1 E16 | plan: FU-Q-26 (e2e: `quota-e2e.sh` Q4 plus 429 at the new rule limit) |
| Q-EDGE-27 | Unknown, empty or typo tier (and `partner`, which Django cannot create) | Unknown/empty/typo tier matches no rule: unlimited. (corrected) `partner` is **not** unlimited: it matches per-minute rule 1 (`backendtrafficpolicy-auth.yaml:26-31`) and any quota whose `perTier` lists it (authpoc: semantic 1,000,000/Month); it is only uncreatable from Django. `Tier` choices are only `developer`, `internal` (`models.py:31-34`); no DB CHECK | Invert-regex catch-all on the known tiers, per-minute only (never a semantic deny, section 8); DB CHECK on `powered_by_projectlimits.tier`; `keyadmin` validation; map unknown tiers to a safe label in `decide.go` (section 4 item 5). | H | U: helm render + `egctl x translate` shows catch-all descriptor; E: set tier `xyz` via SQL on a cauldron | `powered_by/models.py:31-34`@POC; r1 E16; r3 row 5 | plan: FU-Q-27 (helm render plus `egctl x translate` shows the catch-all descriptor; e2e: tier `xyz` via SQL) |
| Q-EDGE-28 | Library Assistant | Must send an `sfr_` key (internal tier) **and** the Bearer token; a Bearer-only call is 401 at the gate. Internal tier is unlimited today. In an auth outage with A3's catch-all it would be throttled as anonymous per-IP (its backend IP shared) | No special key format and no special key or path for the Library Assistant (decided 2026-10-20, section 8). It uses its normal `sfr_` key and Bearer; during an outage it arrives with no tier header and is not blocked on semantic search; the Gemini spend cap is set at a catastrophic level. | M | E: LA staging call with key+Bearer; D: auth outage drill with LA traffic | arch rows "Library Assistant uses an sfr_ key", line 74-75; `decide.go:173-179`@POC (r1 E6); next-steps 2026-10-19 "Open: the Library Assistant would also get anonymous limits"; spec §5 lines 130-132 | plan: FU-Q-28 (e2e: LA staging call with key and Bearer; drill: outage with LA traffic at its normal rate, none throttled below it) |
| Q-EDGE-29 | Origin-restricted key from the wrong Origin | 403 `origin_not_allowed`, not counted | Same | L | U: `decide_gaps_test.go:69-81` | `decide.go:159-165`@POC; r1 E4 | AZ::decide_gaps_test.go (origin cases, lines 69-81) |
| Q-EDGE-30 | Observe mode (`decide.go` observe) | Would-be denials become anonymous allows with project "" and the meter still stamped; quota rules never apply (they need a tier of developer/partner), but (added, r1 A1 machine-run `Decide` matrix) a keyless call on the GATED path is then open to anonymous callers and DOES reach the anonymous per-minute rules 4/5. The earlier "rules 4/5 never see semantic requests" holds in enforce mode only | Only for dark launch; never with quota enforcing | L | U: `meter_test.go` observe cases; r1 `decide-matrix.txt` rows | `decide.go:70-75`@POC; r3 row 10; r1 A1 | POC: AZ::TestGRPCStampsMeterInObserveMode |
| Q-EDGE-31 | `jwt.mode=envoy` | `claimToHeaders` overwrites tier/project from JWT; a non-JWT Bearer (the LA's shared token) becomes 401 at Envoy | Keep `mode: authsvc` (default and authpoc) | M | U: render-check asserts mode | `securitypolicy.yaml:63-87`, `values.yaml:229,235`@POC; r1 E11 | plan: FU-JWT-1 (same render check as F-JWT-01.e6) |

### 3e. Counting semantics

| id | scenario | what happens today | what should happen | sev | how to test | source | test status |
|---|---|---|---|---|---|---|---|
| Q-EDGE-32 | Burst at the limit (concurrency) | Exact admission: INCRBY atomic, exactly `limit` requests see `after <= limit`. Counter ends above the limit by the number of rejected requests | Same | L | E: 200 parallel at remaining=5, expect exactly 5 x 200 | `fixed_cache_impl.go:232-239`, `base_limiter.go:128-136`; POC `21c` (10 allowed / 20 rejected); r2 §D1 | plan: FU-Q-32 (e2e: 200 parallel at remaining=5, expect exactly 5 x 200) |
| Q-EDGE-33 | Per-minute 429 consumes monthly quota | **Yes**: both descriptors are in one RPC and both are incremented (`STOP_CACHE_KEY_INCREMENT_WHEN_OVERLIMIT` defaults false). Also a monthly 429 increments the minute key | Rejected calls must not burn monthly quota: set the env to `true` or move the quota to a shared domain whose filter runs after the per-minute one | C | E: exceed per-minute by 20, read month key (expect +0 after fix; +20 today) | `RL fixed_cache_impl.go:65-93,138-202`, `settings.go:113`; r1 E18; r2 §C1-§C3; r4 D1 (Kong `disable_penalty`, Azure `increment-condition`) | plan: FU-Q-33 (e2e: exceed per-minute by 20, month key +0 after the fix (+20 today)) |
| Q-EDGE-34 | Upstream errors counted (Django 401 no Bearer, 400 bad body, 503 no Gemini key, 502 Gemini failed, client abort, Envoy route timeout) | All counted: the count happens at Envoy before the upstream | Accept and document as "requests, not successful results". (corrected) Refunds are not available **through EG**: Envoy 1.38/1.39 (`HitsAddend.is_negative_hits`, `route_components.proto:2689-2692@1.39.1`) and ratelimit `8fe6ea42` (README "Negative hits") support them, but the EG v1.8/v1.9 BTP API does not expose the field, and prod's `ff287602` lacks it. Only an EnvoyPatchPolicy could wire it | M | E: send bad body x N, read counter | r1 E19; r2 §D1, §F; `api/views.py:378-427`@POC | plan: FU-Q-34 (e2e: send bad body x N, read the counter; document) |
| Q-EDGE-35 | One counted request = many Gemini calls | Embedder makes up to 5 attempts on 429/5xx/transport errors with 60 s timeouts. (corrected) Failed Gemini calls are not billed (Gemini billing FAQ) but do count against Gemini quota, so under Gemini trouble one counted request = up to 5x Gemini RPM and ~5 min of a Django worker; spend amplification only if a timed-out call was completed and billed (UNVERIFIED) | Query path: max 1-2 retries, short timeout; keep the Gemini project spend cap as the real ceiling | H | U: Django test with mocked 503 counts attempts | `semantic_search/embedder.py:10,25-26,47-77`@POC | plan: FU-Q-35 (Django test with mocked 503 counts attempts) |
| Q-EDGE-36 | Client retries after a 5xx | Each retry is a new counted request (and may again trigger 5 Gemini attempts) | Same counting; document; consider `cost.request.number: 0` for idempotent retries only if a header proves it (not planned) | L | E | r2 §D1 | doc: `auth-service/docs/monthly-quota.md` row Q-EDGE-36 (accepted behaviour, reasoned from source) |
| Q-EDGE-37 | Request cancelled by the client mid-flight | Counted if the ratelimit call was made (state `Calling`); Django may still call Gemini (UNVERIFIED whether gunicorn aborts) | Accept | L | E: curl `--max-time 0.01` loop, read counter | `ratelimit.cc:191-194@1.39.1`; r2 §D1 | doc: `auth-service/docs/monthly-quota.md` row Q-EDGE-37 (accepted behaviour, reasoned from source) |
| Q-EDGE-38 | Very long query text | Quota counts requests; Gemini bills by input size (UNVERIFIED: pricing page not read this session); no query-length cap in `KnnSearch.post` | Cap query length in Django (e.g. 2,000 chars) | M | U: Django test 413/400 on oversize | `api/views.py:378-415`@POC | plan: FU-Q-38 (Django test 400/413 on oversize) |
| Q-EDGE-39 | `cost > 1` | Not used. If set: refused when remaining < N but the counter already advanced by N; (corrected) `cost.response` is sent on stream done with the same descriptor (`ratelimit.go:333-342@v1.9.1`, `ratelimit.cc:195-213@1.39.1`), so it cannot block the request that incurred it but does raise the shared counter that the *next* request is checked against | Keep cost 1 per call | L | U: render | `EG ratelimit.go:327-331,611-621@v1.9.1`; `ratelimit.cc:191-214`; r2 §F | plan: FU-Q-39 (render assertion) |
| Q-EDGE-40 | OPTIONS preflight on knn-search | Allowed as tier `embed` (only when it carries `Origin` and no `x-api-key`: `decide.go:170-172`), meter computed but no semantic quota rule for `embed`: not counted toward the monthly quota. (corrected) It **is** counted on the embed per-Origin per-minute rule 3 (`backendtrafficpolicy-auth.yaml:38-43`) | Same | L | U: decide tests | `decide.go:170-172`@POC; r1 E19 | plan: FU-Q-40 (confirm or add the decide test for OPTIONS with Origin) |
| Q-EDGE-41 | CDN / Varnish cached responses | Cloudflare hits never reach Envoy (not counted, no cost). Varnish sits **behind** Envoy (nginx -> Varnish -> Django), so a Varnish hit would still be counted; knn-search is POST with `Cache-Control: no-store`, so no hits are expected (Varnish VCL for POST UNVERIFIED) | Same; if a response cache is ever added, describe the quota as "requests" | L | E: two identical POSTs, check `varnishCache` log field = miss/pass | `nginx.template.conf.tpl:51-53,277-283`, `api/views.py:456`@POC; next-steps §4 (Cloudflare over HTTPS); r4 D10 | doc: `auth-service/docs/monthly-quota.md` row Q-EDGE-41 (accepted behaviour, reasoned from source) |
| Q-EDGE-42 | Shadow mode on the quota rule | Not set. `shadowMode: true` still INCRBYs and reports over-limit stats but forces OK. The key does not include shadow mode, so turning enforcement on keeps the month's count (derived) | Recommended for the first block: measure, then enforce | M | D: set shadowMode, exceed, expect 200 + stat `shadow_mode` | `EG ratelimit.go:851-858@v1.9.1`; `RL base_limiter.go:163-169`; `ratelimit_types.go:130-138@v1.8.0`; r2 §F | plan: FU-Q-42 (drill: `shadowMode`, exceed, expect 200 plus shadow stat) |

### 3f. Topology and configuration

| id | scenario | what happens today | what should happen | sev | how to test | source | test status |
|---|---|---|---|---|---|---|---|
| Q-EDGE-43 | Same project via several hostnames (`sefaria.org`, `www.`, `voices.`, `.org.il` hosts) | Separate counters per listener and host: up to 6x monthly quota on prod (per-minute too; (corrected) per-minute is further split per HTTPRoute rule/match, see Q3 item 1b) | `shared: true` on quota rules (domain = policy, key = rule name) or canonical-host redirect for `/api/*` | C | E: one call on each authpoc host (`authpoc.`, `www.authpoc.`, `voices.authpoc.`), then `redis-cli --scan --pattern '*authpoc*'` | r1 Q3 a-c; r2 Correction 2, §B2.3; `envs/prod/helmrelease.yaml:155-175`@POC | plan: FU-Q-43 (e2e: one call per authpoc host, `redis-cli --scan --pattern "*authpoc*"`) |
| Q-EDGE-44 | Rule inserted/removed/reordered (new tier, new meter sorting before an old one, Daniel's per-partner rules) | `rule-N` renumbers: later rules' counters silently reset; changing only the limit number does not reset. (corrected, added) Inserting an **HTTPRoute** rule before the catch-all (e.g. toggling `legacyBodyArm.enabled`) renames the route in every non-shared key and resets them too | Append-only quota rules; CI diff of rendered ratelimit config. (corrected) `shared: true` does **not** give stable names: a shared rule's descriptor key is `<ns>/<policy>/rule/<i>` with `i` = position in the BTP (`irRuleName`, `backendtrafficpolicy.go:1913-1914@v1.9.1`) plus `rule-<k>-match-M` with `k` = index among shared rules (`getDomainRuleIndex`). Shared only removes the HTTPRoute/host part | H | U: `helm template` before/after + `egctl x translate`, assert keys of existing rules unchanged | `ratelimit.go:806-820@v1.9.1`; r1 Q3 d; r2 §B2.1; next-steps 2026-10-19 "each partner project gets its own rule" | plan: FU-Q-44 (`helm template` before and after plus `egctl x translate`, existing keys unchanged) |
| Q-EDGE-45 | Limit value changed mid-block | Takes effect immediately, count kept (limit not in key). Confirmed for today (local cache off); (corrected, caveat) once `LOCAL_CACHE_SIZE_IN_BYTES` > 0, a raised limit does not unblock already-over projects until the bucket rolls (Q-EDGE-12) | Same | L | D: lower limit below current count, expect 429 | r4 D9; r1 Q3 d | plan: FU-Q-45 (drill: lower the limit below the count, expect 429) |
| Q-EDGE-46 | Prod and preprod in one cluster, one Redis | Separate domains and route names (`default/production/https-*` vs `preprod/preprod/https-*`, r1 A2; `envs/prod/helmrelease.yaml:4-5,20`, `envs/preprod/helmrelease.yaml:4-5,20`@POC): no key collision, but (added, r1 E33) both environments read the SAME registry (shared Postgres per cluster, `values.yaml:219-222@POC`), so one project has a separate monthly counter per environment; shared Redis means shared outage and memory | Same; size `maxmemory` for both; alert per env | M | D: list keys per domain prefix | r1 Facts "Prod vs preprod"; `prod/cluster-1/spec/preprod/application.yaml:5`@INFRA | plan: FU-Q-46 (drill: list keys per domain prefix) |
| Q-EDGE-47 | Multiple Envoy / ratelimit replicas | All share the one Redis: limits are global and exact; ratelimit default 1 replica | >=2 ratelimit replicas + PDB for availability (no correctness change) | M | D: scale ratelimit to 2, burst, exact count | `shared_types.go:23@v1.9.1`; EG global-rate-limit docs; r2 §D3 | plan: FU-Q-47 (drill: scale ratelimit to 2, burst, exact count) |
| Q-EDGE-48 | Prod prerequisites missing | Prod EG has no `rateLimit` backend, no Redis, no auth service; ClientTrafficPolicy rejected; EG v1.8.0 image has no calendar flag | All of §4 "must change" before enabling | C | U: render prod values; D10 check before enabling | `INFRA prod/.../helmrelease.yaml:37-43`; next-steps §4; r2 Correction 1 | plan: FU-Q-48 (render prod values; wiki check D10 (CTP Accepted) before enabling) |
| Q-EDGE-49 | BackendTrafficPolicy rejected by EG (e.g. field unsupported on 1.8.0) | Route may become a direct 500, or the rule is missing; runtime `failOpen` does not cover it | Render and apply on a 1.8.x cauldron first; watch policy `Accepted` | H | D: apply to a v1.8 test gateway | wiki `research/api-key-system-design/envoy-verified-behaviours.md`; r2 §E | plan: FU-Q-49 (drill: apply to a v1.8 cauldron, watch policy `Accepted`) |
| Q-EDGE-50 | `xRateLimitHeaders` on prod v1.8.0 | Chart comment says rejected; v1.8.0 source has the field, and (corrected, added) so does the v1.8.0 chart CRD (`charts/gateway-helm/charts/crds/crds/generated/gateway.envoyproxy.io_backendtrafficpolicies.yaml:1799,2183@v1.8.0`). Only the CRD actually installed on prod is unknown | Verify on prod CRD (`kubectl explain`) before relying on it | M | D | `values.yaml:256-258`@POC vs `ratelimit_types.go:139-144@v1.8.0`; r1 Q5.6 | plan: FU-Q-50 (`kubectl explain` on the prod CRD) |
| Q-EDGE-51 | Meter or tier typo between `authService.meters` and `rateLimit.quotas[]` | Quota rule silently never matches = unlimited | `render-check.sh` asserts every quota meter exists in `METERED_PATHS` and every tier is valid | H | U | r3 row 52; `render-check.sh:9-22`@POC | plan: FU-Q-51 (`render-check.sh` asserts every quota meter is in `METERED_PATHS` and every tier valid) |
| Q-EDGE-52 | Client IP detection | Same ClientTrafficPolicy also carries client-IP settings, never applied where rejected; per-IP anonymous rule (and the A3 catch-all) would key on the wrong IP (UNVERIFIED which IP Envoy sees behind Cloudflare) | CTP Accepted; verify `sourceCIDR` descriptor = real client IP | M | D: compare nginx `remoteIp` vs ratelimit key | next-steps §4 ("master's `escapedSlashesAction` and client-IP settings were never applied") | plan: FU-Q-52 (drill: compare nginx `remoteIp` with the ratelimit key) |

### 3g. Paths and gate

| id | scenario | what happens today | what should happen | sev | how to test | source | test status |
|---|---|---|---|---|---|---|---|
| Q-EDGE-53 | Gated path with no key | 401 `api_key_required` before Bearer handling; not counted | Same | L | U: `TestGatedPathDeniedBeforeBearerHandling`; E: G1 | `decide.go:173-175`@POC; r1 E1 | POC: AZ::TestGatedPathDeniedBeforeBearerHandling |
| Q-EDGE-54 | Bearer-only (first-party JWT or LA token) on knn-search | 401 at the gate | Same (LA must use a key) | L | U: decide tests | r1 E6 | POC: AZ::TestGatedPathDeniedBeforeBearerHandling |
| Q-EDGE-55 | Encoded paths `%6b`, `//`, `..` | Gated and metered | Same | L | U: `meter_test.go:13-30` | r1 E10; r3 row 6 | POC: AZ::TestMeterMatchesTheDecodedCleanedPath (`auth-service/internal/authz/meter_test.go:13-30`) |
| Q-EDGE-56 | `/api/%6bnn-search%`, `/api/%256bnn-search` | NOT gated, NOT metered (known gap). Bypass only if nginx/Django resolve them to knn-search (UNVERIFIED) | Fail closed on undecodable paths; match the router's normalisation | M | U: `go test -tags knowngaps` (fails today); E: curl both forms with a key, check Django route | `decide_known_gaps_test.go:42-49`@POC; r3 row 6 | AZ::TestKnownGapNCR9MalformedGatedPaths [KG] |
| Q-EDGE-57 | `/api/knn-searchX` | Prefix match without segment boundary: metered as semantic (over-count, harmless) | Segment-boundary match | L | U | r3 row 6 | plan: FU-Q-57 (unit test for segment-boundary match) |
| Q-EDGE-58 | `GATED_PATHS` with spaces (`"/a, /b"`) | Not trimmed: `/b` ungated (reproduced) | Trim like `METERED_PATHS` | M | U: `TestKnownGapNA10GatedPathsTrimmed` | `main.go:64-66`@POC; r3 row 53 | CMD::TestKnownGapNA10GatedPathsTrimmed [KG] |
| Q-EDGE-59 | Duplicate `x-api-key` headers | Joined with comma: 401 even for a valid key | Same on gated path | L | U: `TestA2dDuplicateKeyHeaderOnGatedPath` | r1 E9 | AZ::TestA2dDuplicateKeyHeaderOnGatedPath |
| Q-EDGE-60 | `?api_key=` in query / key in body / key as Bearer | Not credentials; query param stripped upstream; gated path 401 | Same | L | U | r1 E7, E8; `grpcserver.go:63-65,89`@POC | plan: FU-Q-60 (unit tests on `decide`/`grpcserver` for the three shapes) |

### 3h. Developer-facing contract

| id | scenario | what happens today | what should happen | sev | how to test | source | test status |
|---|---|---|---|---|---|---|---|
| Q-EDGE-61 | 429 body/headers: quota vs per-minute | Identical body (`code: rate_limited`), fixed `Retry-After: 60`, `x-ratelimit-*` dropped by the override. A client honouring `Retry-After` retries every minute for weeks after the month is spent | Distinct reason (e.g. `code: quota_exhausted` with `reset_at`, no `Retry-After`) vs `rate_limited` + `Retry-After` <= 60. Envoy cannot tell which descriptor tripped inside one override (spec §6); options in §4 item 7 | H | E: trigger each, diff responses | `backendtrafficpolicy-auth.yaml:65-79`@POC; spec §6 lines 136-142; r2 §F; r4 D2 (OpenAI codes, Azure 403, IETF `quota-exceeded`) | plan: FU-Q-61 (e2e: trigger each, diff responses) |
| Q-EDGE-62 | Usage visibility on 200s | `x-ratelimit-*` of the **tightest** descriptor only: developers see per-minute numbers, almost never the monthly remaining. (corrected, added) `X-RateLimit-Limit` does list every enabled descriptor's policy, e.g. `10, 10;w=60, 100000;w=2592000`, so the monthly *limit* is visible, not the remaining | (corrected) Disabling headers on the per-minute rule does **not** surface the monthly numbers: Envoy picks the min-remaining descriptor first and, if headers are disabled for it, emits no `x-ratelimit-*` at all (`ratelimit_headers.cc:52-74@1.39.1`). Also rule 0 covers every path, not only semantic requests. Use a usage page / documented reset instead | M | E: inspect headers at month usage 50% | `rlh-ratelimit_headers.cc:44-100`; r2 §C4, §F; r4 D6 | plan: FU-Q-62 (e2e: inspect headers at 50% month usage) |
| Q-EDGE-63 | Usage page / warnings | Nothing in Phase 1; no Postgres count; `last_used_at` never written; Phase 2 = daily BigQuery rollup | Phase 1: publish limit + reset date in docs; operator alert at 80/100% from rollup | M | E (Phase 2) | spec §7 lines 144-153; r1 Q2; r4 D6 | plan: FU-Q-63 (e2e (Phase 2)) |
| Q-EDGE-64 | Anonymous gets `x-sefaria-project: ""` | Envoy sets the empty header; a Distinct match would produce an empty-value descriptor. No current rule uses project for anonymous; ratelimit behaviour with empty value UNVERIFIED | Never key a rule on project for tiers that can have "" | L | U: render assertion | `grpcserver.go:83`@POC; `router_ratelimit.cc:111-126@1.39.1`; r3 P3 | plan: FU-Q-64 (render assertion) |
| Q-EDGE-65 | Gemini project spend cap hit | Gemini refuses everything for the Google Cloud project, including the Library Assistant | Accepted risk (decided 2026-10-20, section 8): auth service down plus a flood on semantic search can exhaust the shared Gemini quota, and the Library Assistant's semantic tool stops until the quota resets or the service recovers. Cap set at a catastrophic level only, alert well before it; runbook, no cauldron test. | H | none on cauldron (billing); runbook | spec §5 lines 130-132, line 58; r4 §8 | doc: `auth-service/docs/monthly-quota.md` row Q-EDGE-65 (accepted behaviour, reasoned from source) |

### 3i. Added in the final pass (r1 addendum A3, r2 section J3)

| id | scenario | what happens today | what should happen | sev | how to test | source | test status |
|---|---|---|---|---|---|---|---|
| Q-EDGE-66 | `embed` tier is keyed on the client-chosen `Origin` header | Rotating `Origin` values escapes the 15/min rule and creates one Redis key per value; under `allkeys-lru` 128 MB that is also a way to push other keys out (inference, UNVERIFIED) | Key embed on something the server derives (IP), or cap it; never a client-chosen key (Azure "client-driven throttling", r4 §7) | M | D: loop with random `Origin`, watch `DBSIZE` | `backendtrafficpolicy-auth.yaml:38-43`@POC; r1 E29; r4 §7 | plan: FU-Q-66 (drill: loop with random `Origin`, watch `DBSIZE`) |
| Q-EDGE-67 | Anonymous per-IP rule uses `sourceCIDR 0.0.0.0/0` | IPv6 clients likely produce no descriptor for rule 4 (IPv4 address matcher); rule 5 (one global anonymous bucket) still applies. UNVERIFIED | Add an IPv6 CIDR (`::/0`) rule or confirm Envoy emits one descriptor for both families | M | U: `egctl x translate`; D: `curl -6` burst on authpoc | `ratelimit.go:500-546@v1.9.1`; r1 E30 | plan: FU-Q-67 (`egctl x translate`; drill: `curl -6` burst on authpoc) |
| Q-EDGE-68 | Non-POST method on `/api/knn-search` | Metered by path only; Django implements only `post`, so a GET/PUT is a counted 405 | Accept and document, or make the meter method-aware | L | E: `curl -X GET`, read counter | `decide.go:136-145`, `api/views.py:378`@POC; r1 E31 | doc: `auth-service/docs/monthly-quota.md` row Q-EDGE-68 (accepted behaviour, reasoned from source) |
| Q-EDGE-69 | Soft-delete a project without revoking its keys | On this branch migration 0008 keeps `deleted_at` in the project trigger's WHEN list, so setting it NOTIFYs and the keys go 401 at the next reload (the POC trigger watched only `tier` and DELETE, leaving the 60 s periodic reload). The Django path also revokes keys in the same write, which NOTIFYs (`powered_by/developer.py:536,565`) | Keep `deleted_at` in the project trigger | L | U: migration test (exists) | `0004_api_key_notify_triggers.py:32-35`@POC; r1 E32 | PT/migration_project_limits_test.py::TriggerMigrationTest::test_soft_delete_notifies |
| Q-EDGE-70 | Prod's bundled ratelimit image `ff287602` (EG v1.8.0) vs `8fe6ea42` | `ff287602` passes `context.Background()` into every Redis call, so a call Envoy abandoned at 20 ms still executes and increments; it panics when Redis is unreachable at startup (crash loop); no `REDIS_CLOSE_CONNECTION_ON_READONLY_ERROR`, no calendar flag. `8fe6ea42` threads the request context and retries startup with backoff | Prod on `8fe6ea42` or later (EG >= v1.8.4, not v1.9.0); start Redis before the ratelimit pods | M | D: start ratelimit with Redis at 0 replicas, then slow Redis past 20 ms | `driver_impl.go:228-251,272-287@ff287602` vs `:274-285,390-404@8fe6ea4`; r2 J3.2 | plan: FU-Q-70 (drill: ratelimit with Redis at 0 replicas, then Redis slowed past 20 ms) |
| Q-EDGE-71 | Flood of bad keys on a gated path | Denies come from ext_authz, which runs BEFORE any rate-limit filter, so they are never throttled: every attempt is one gRPC `Check` plus a deny log line (10x the cost of an allow, r3 row 34) | Run `local_ratelimit` (order 302) before ext_authz via `EnvoyProxy.spec.filterOrder`; sample deny logs. UNVERIFIED on a cauldron | M | D: k6 random keys at the gated path, watch auth-service CPU and log volume | `envoyproxy_types.go:162`, `httpfilters.go:191-260@v1.8.0`; r2 J3.4; r3 rows 33-34 | plan: FU-Q-71 (drill: k6 random keys, watch auth-service CPU and log volume) |
| Q-EDGE-72 | ratelimit `QUOTA_MODE` env | Trap: makes every descriptor a quota descriptor and refuses only when ALL are over, which disables per-minute-or-monthly semantics. EG does not set it; `container.env` could | Never set it; CI check on the env block | L | U: assert env list in the HelmRelease | `service/ratelimit.go:231-254@ff28760`; r2 J3.3 | plan: FU-Q-72 (assert the env list in the HelmRelease) |
| Q-EDGE-73 | `STOP_CACHE_KEY_INCREMENT_WHEN_OVERLIMIT=true` side effects | Service-wide, so it also changes the anonymous per-IP and any shared rules; non-incremented keys still get `INCRBY key 0` + `EXPIRE` (TTL refresh); the reported `remaining` of a non-incremented key is off by one (cosmetic) | Accept; include these rules in the live test of fix item 2 | L | D: same drill as Q-EDGE-33 on a per-IP rule | `fixed_cache_impl.go:210-216@8fe6ea4`, `base_limiter.go:76-79`; r2 J3.8 | plan: FU-Q-73 (drill: same as Q-EDGE-33 on a per-IP rule) |
| Q-EDGE-74 | PR base: #3798 (Phase 1) has none of the quota machinery | `P1@7e3f5bb` has no meter, no quota/BTP, no JWT/mint stub, no legacy arm, no drills, no `quota-e2e.sh`, no `demo.sh`; its CTP strips 3 headers and `grpcserver.go` stamps 3 (not 4). `git diff --stat P1 POC -- auth-service`: 39 files, +2086/-31. Verified this pass: `demo.sh` and `quota-e2e.sh` exist only on the POC branch | The draft PR into #3798's branch must carry the meter header, the quota BTP, the 4-header strip and the e2e matrix together, or the matrix cannot pass | C | U: `render-check.sh` + `go test ./...` on the PR branch; E: the new matrix | `grpcserver.go:63-65@P1`, `clienttrafficpolicy.yaml:22-23@P1`; r1 E34, A4 | plan: FU-Q-74 (`render-check.sh` and `go test ./...` on the PR branch; e2e: the new matrix) |

---

## 4. Design verdict

**Is "per-minute limits + monthly quota at Envoy in one ratelimit/Redis" right?** Yes as an architecture:
- It is the industry shape (throttle + quota, r4 §1), the counter is per project not per key (r4 §7; A2 decided 2026-10-19), and one synchronous Redis gives exact
  admission with no drift between nodes (r4 §4; r2 §D1). Keeping the auth service a pure classifier with no hot-path DB or Redis call is the right split
  (spec "Why at Envoy"; r3 row 16; wiki `library-findings.md:53-60`).
- Fail-open with an external hard cap is the accepted practice (AWS, Google, OWASP API4:2023; r4 §4, §8) and matches spec §5.

**It is not right as configured.** What must change before production, ranked by money/trust impact:

1. **Count per project, not per host** (Q-EDGE-43). Set `shared: true` on every quota rule in `templates/gateway/backendtrafficpolicy-auth.yaml` (the `range $q := $rl.quotas` block, lines 55-64@POC).
   Effect: domain becomes `<ns>/<env>-auth-ratelimit`, key uses `<ns>/<policy>/rule/<idx>`, one counter across all hosts (`EG ratelimit.go:240-270,1053-1058@v1.9.1`). It also puts the quota in a
   second ratelimit filter that sorts after the per-minute filter, so a per-minute 429 never reaches it (r2 §C3), which fixes item 2 for free.
   (Source-confirmed in this pass: both filters have order 303 and ties sort by name, `envoy.filters.http.ratelimit` < `envoy.filters.http.ratelimit/<ns>/<policy>`,
   `httpfilters.go:118,146,175-184,324@v1.9.1`, same on v1.8.0; ext_authz is order 6 (v1.9.1) / 5 (v1.8.0), so it precedes both.) Cost: two ratelimit RPCs per semantic request
   on v1.9.1 (per-route `TypedPerFilterConfig` per domain, `ratelimit.go:174-196@v1.9.1`). (corrected) On **prod's v1.8.0** a route with any shared rule gets
   **all** its rules as route-level `rate_limits` (`ratelimit.go:172-187@v1.8.0`), which every ratelimit filter on the HCM picks up: every rate-limited request
   (not only semantic) then makes two RPCs, each carrying all descriptors, with the RLS ignoring the ones not configured in its domain. Correct, but double the RLS load.
   Decide whether per-minute rules should also be shared (otherwise per-minute is per project per host). UNVERIFIED at runtime: test with the authpoc three-host scan.
2. **Rejected requests must not burn monthly quota** (Q-EDGE-33). If item 1's filter ordering is not confirmed live, add
   `STOP_CACHE_KEY_INCREMENT_WHEN_OVERLIMIT=true` under `config.envoyGateway.provider.kubernetes.rateLimitDeployment.container.env` in
   `INFRA {dev,prod}/cluster-1/spec/envoy/helmrelease.yaml` (field: `envoygateway_types.go:357-363@v1.8.0`; merge: `resource.go:477@v1.9.1`). Cost: one extra Redis GET pipeline per request; small
   overshoot in "wasted" accounting under concurrency only (r2 §C2). The flag is service-wide (Q-EDGE-73). Never set `QUOTA_MODE` (Q-EDGE-72). Test: exceed per-minute by 20, month key +0.
3. **Durable, dedicated Redis on prod** (Q-EDGE-06/07/08/48). New resource under `INFRA prod/cluster-1/spec/envoy/resources/` modelled on the dev one, but:
   `--appendonly yes --appendfsync everysec`, a PVC (not `emptyDir`), `--maxmemory-policy noeviction`, `maxmemory` sized with headroom, alerts on `used_memory` > 70% and on restarts;
   then `config.envoyGateway.rateLimit.backend.redis.url`, `failClosed: false`, `timeout: 20ms` in the prod HelmRelease (mirrors `dev/.../helmrelease.yaml:47-57`). Do not reuse the
   dev file's "no persistence on purpose" (`ratelimit-redis.yaml:1-3`). Runbook: read/set a project's key (AWS "grant usage extension" analogue), restore AOF, never move the store mid-block (r4 D9).
4. **Calendar month, decided before the first counter exists** (Q-EDGE-01/02). Upgrade prod EG from v1.8.0 to >= v1.8.4 (patch upgrade; image `8fe6ea42` has the flag; r2 Correction 1; confirmed: v1.8.4 and v1.8.5 bundle `8fe6ea42`; do **not** pick v1.9.0, which bundles `17b1956c` without the flag) and set
   `USE_CALENDAR_MONTH_RATE_LIMIT=true` in the same `container.env` block on dev and prod. If that slips, publish the epoch reset dates (2026-11-03, 12-03, 2027-01-02) on the settings page.
5. **Catch-all and `internal` rule (A3)** (Q-EDGE-13/26/27). Append (do not insert, see item 6) to the per-minute rules:
   - `internal`: `x-sefaria-tier` Exact `internal`, Distinct `x-sefaria-project`, very high per-minute, no monthly rule (spec §4).
   - catch-all: `x-sefaria-tier` `RegularExpression` `^(developer|partner|firstparty|embed|anonymous|internal)$` with `invert: true` + `sourceCIDR` Distinct, anonymous limits. Envoy's
     `HeaderValueMatch expect_match=false` produces a descriptor when the header is missing or unknown (`ratelimit.go:375@v1.8.0`, `:395@v1.9.1`; `ratelimit_types.go:370-376@v1.8.0`). UNVERIFIED live: test with the auth service at 0 replicas.
   - Resolve Yotam's open conflict: does semantic search stay fail-open with anonymous limits during an outage, or fail closed? (next-steps 2026-10-19). **Decided 2026-10-20: fail open on every path, semantic search included (section 8).**
   - Defence in depth: DB CHECK on the project's limits row (`powered_by_projectlimits.tier`; the frozen `powered_by_project.tier` has none), `keyadmin` validation, map unknown tiers to `anonymous` in `decide.go:166` (r3 row 5).
6. **Stable counter identity** (Q-EDGE-44/23). Rules are append-only; a CI step renders the BTP before and after (`helm template` + `egctl x translate`) and fails if any existing quota rule's
   descriptor key changes. Daniel's "each partner project gets its own rule" (next-steps 2026-10-19) makes this mandatory: put partner rules after all existing rules or in a separate shared
   policy. Document "tier change = new month" until per-project overrides exist.
   (corrected) A separate shared policy is not position-proof either: shared keys embed the BTP rule index (`<ns>/<policy>/rule/<i>`). The CI diff must also
   cover the HTTPRoute rule list, because non-shared keys embed `rule/<i>/match/<j>` of the HTTPRoute (Q3 item 2).
7. **Distinct 429 for the quota** (Q-EDGE-61/05). The single override cannot know which descriptor tripped (spec §6). Options, cheapest first: (a) remove `Retry-After` and the override
   on the quota path so Envoy's own 429 with `x-ratelimit-*` passes, and say "monthly or per-minute" in docs; (b) with item 1's separate shared policy, give the quota its own
   BackendTrafficPolicy and `responseOverride` (body `code: quota_exhausted`, `reset_at`, no `Retry-After`) - UNVERIFIED whether EG lets two policies target the same route this way;
   (c) Envoy >= 1.40 `enable_retry_after_header` once EG ships it.
8. **Hard cap and alerts as launch gates** (Q-EDGE-09/13/65). Gemini project budget alert and spend cap at a catastrophic level (spec §5); PrometheusRules on Envoy
   `ratelimit.error`, `ratelimit.failure_mode_allowed`, `ext_authz.error`, `ext_authz.failure_mode_allowed` (r2 §E; r3 row 41).
9. **Real end-to-end proof** (Q-EDGE-51, r3 row 51). Extend `auth-service/scripts/quota-e2e.sh` with: `sfr_` registry key -> tier from `powered_by_project` -> meter `semantic` ->
   `/api/knn-search` with Bearer -> 429 at a tiny cauldron limit; three hosts; per-minute-then-month-key check; key rotation; tier change. Add the meter/tier contract check to `render-check.sh`.
10. **Django cost guards** (Q-EDGE-35/38). Query path `max_retries` 1-2 with a short timeout in `semantic_search/embedder.py` (`GeminiEmbedder(max_retries=..., timeout_seconds=...)`), and a query-length cap in
    `KnnSearch.post`.
11. **ClientTrafficPolicy Accepted on prod** (Q-EDGE-19/52): port the `a33497b` per-listener `sectionName` fix to #3774 and run check D10 before enabling (next-steps §4).
12. **Auth-service hardening** that affects counting: N-CR8 empty first load not Ready; `preStop` sleep + gRPC health (r3 §6 items 1, 3, 4).

**Optional (worth doing, not blocking):**
- `shadowMode: true` on the quota rules for the first block to calibrate the `developer` number from real traffic (Q-EDGE-42; Daniel's "numbers from 30 days of Phase 0 data", next-steps 2026-10-19).
- `LOCAL_CACHE_SIZE_IN_BYTES` (e.g. 10 MB) so exhausted projects stop costing Redis round trips (Q-EDGE-12).
- 2 ratelimit replicas + `rateLimitPDB` (Q-EDGE-10/47).
- Per-owner monthly ceiling (owner id header + Distinct rule) if N-CR7 is not solved by a project cap (Q-EDGE-22).
- Usage page and 80/100% operator alerts from the BigQuery rollup (Q-EDGE-63); IETF `RateLimit`/`RateLimit-Policy` headers once the draft stabilises (r4 §5).
- Local token bucket in front for sub-second bursts (Trove-Envoy p.19 RULE 17.2; r4 D7), low priority at "very high" per-minute limits.
- Hash keys at rest (Q10; r3 row 30): not quota-related but same deployment.

---

## 5. Open questions

For **Yotam**
1. (Decided 2026-10-20: fail open on every path, see section 8.) During an auth-service outage, should `/api/knn-search` stay open with anonymous (per-IP) limits, or fail closed? The 2026-10-19 artifact and A3 disagree (next-steps "Conflict to fix").
2. `shared: true` on quota rules only, or also on per-minute rules (making per-minute truly per project instead of per project per host and route)?
3. Prefer `STOP_CACHE_KEY_INCREMENT_WHEN_OVERLIMIT` (one env var, extra GET) or the shared-domain filter ordering (two RPCs, needs a live ordering test), or both?
4. Is a patch upgrade of prod EG v1.8.0 -> v1.8.4+ acceptable before launch (calendar flag), or do we ship with the epoch window and published dates?
5a. #3798 (`P1@7e3f5bb`) lacks the meter, quota BTP, 4-header strip and e2e scripts (Q-EDGE-74): confirm the draft PR into its branch should bring the POC's auth-service and chart pieces with it, not only the API-projects/Powered-by split.
5. (Decided 2026-10-20: no, the Library Assistant gets no special outage behaviour, see section 8.) Should the Library Assistant's behaviour in an outage differ from third parties (Daniel's "tier-specific key types" question, next-steps 2026-10-19)?

For **Daniel** (product)
6. Monthly `developer` number and per-minute numbers (from 30 days of Phase 0 data), and whether rejected or failed requests (4xx/5xx) may count toward the month.
7. Calendar month (1st, UTC) vs a rolling 30-day block; what reset moment we promise developers.
8. N-CR7: cap projects per account, or a per-owner ceiling, so a new project is not a free quota reset?
9. Tier change mid-month = fresh counter: acceptable, or do we need per-project overrides first?
10. Quota 429 wording, status (429 vs 403 like Azure) and whether developers see remaining monthly quota in headers in Phase 1.

For **Brendan** (infra)
11. Durable Redis on the prod cluster: StatefulSet + PVC + AOF everysec + `noeviction`, or a managed Memorystore instance? Who owns its alerts?
12. Is the prod/preprod shared Redis acceptable, or one Redis per environment?
13. Approval for the `rateLimitDeployment.container.env` block (calendar flag, stop-increment, local cache) and 2 ratelimit replicas with a PDB in both Envoy HelmReleases.
14. Gemini project budget alert and spend-cap level, given it also stops the Library Assistant.
15. Which client IP Envoy sees behind Cloudflare on prod, once the ClientTrafficPolicy is Accepted (needed by the per-IP anonymous and catch-all rules)?

---

## 6. UNVERIFIED summary
- Live Redis key names, the per-host split and `shared: true` as the fix (no cluster access in this session; r1, r2 §I).
- Runtime filter order of the listener-domain vs shared-domain ratelimit filters (r2 §C3). (corrected) Now confirmed from EG source on both v1.8.0 and v1.9.1
  (same order 303, name tie-break puts the listener filter first); only a live `egctl config envoy-proxy listener` dump remains unchecked.
- `invert` catch-all producing a descriptor for a missing header, live (§4 item 5).
- Prod v1.8.0 CRD acceptance of `xRateLimitHeaders` and of any new BTP fields (Q-EDGE-50).
- Whether nginx/Django resolve the two known-gap encoded paths to knn-search (Q-EDGE-56).
- Varnish VCL handling of POST; Cloudflare cache rules; Gemini per-token pricing; which client IP Envoy sees behind Cloudflare.
- Whether two BackendTrafficPolicies with different `responseOverride`s can target the same route (§4 item 7b).
- authpoc's deployed chart/image (`sha-f4e7188`) vs `76d34a4` was not diffed (r1).

---

## 7. Verification (skeptical re-read, 2026-10-20)

Method: every load-bearing claim re-read against primary source, not against r1-r4. Sources: POC `76d34a4` via `git show` (BTP, CTP,
SecurityPolicy, HTTPRoute, values, `decide.go`, `grpcserver.go`, `pgload.go`, `main.go`, `embedder.py`, `search.py`, `router.py`, `api/views.py`,
nginx template, `quota-e2e.sh`); INFRA `d5a41a9` (both Envoy HelmReleases, `ratelimit-redis.yaml`); EG v1.8.0/v1.9.1 translator, filter order,
gatewayapi naming, ratelimit infra resource (local copies under `eg/`, `r2/`, re-fetched where marked); `gh api` on EG tags v1.8.0-v1.8.5, v1.9.0, v1.9.1
(`shared_types.go`, `ratelimit_types.go`, BTP CRD); envoyproxy/ratelimit `8fe6ea42`, `ff287602`, `17b1956c`, `1e50889b` (`settings.go`, cache key,
fixed cache, base limiter, service); Envoy 1.39.1 ratelimit/ext_authz filters and headers, `rate_limit.proto` at v1.39.2 and v1.40.0; Gemini billing FAQ
(https://ai.google.dev/gemini-api/docs/billing); wiki evidence `checks/evidence/L02.txt`.

| Claim | Verdict | Evidence |
|---|---|---|
| ext_authz runs before the ratelimit filter | Confirmed | `newOrderedHTTPFilter`: ext_authz 6 / ratelimit 303 (v1.9.1), 5 / 303 (v1.8.0); `sortHTTPFilters` applied after `patchHCMWithRateLimit` (`httpfilters.go:299,324@v1.9.1`); ext_authz `setCopy`s OK headers before `continueDecoding` (`ext_authz.cc:743-770@1.39.1`) |
| Denied (401/403) requests are not counted | Confirmed | Deny = ext_authz local reply; the ratelimit filter (later in chain) never runs. Holds for observe mode too (deny becomes an anonymous allow, which *is* counted on anonymous per-minute rules, not on quotas) |
| One RPC carries all matching descriptors (non-shared) | Confirmed | `initiateCall` sends `descriptors_` in one `limit()` (`ratelimit.cc:52-69@1.39.1`); v1.9.1 scopes per domain via `TypedPerFilterConfig`. v1.8.0 differs once a shared rule exists (corrected in §4 item 1) |
| All descriptors are incremented even if one is over | Confirmed (default) | `getHitsAddendValue` returns `hitsAddend` when `stopCacheKeyIncrementWhenOverlimit` is false (`fixed_cache_impl.go:65-71`); default false (`settings.go:113@8fe6ea42`). With the flag: GET pre-check, only would-be-over keys are incremented, others +0 (`:137-200`) |
| Over iff `after > limit`; overall OVER_LIMIT if any descriptor over | Confirmed | `base_limiter.go:129`; `service/ratelimit.go:262-267` (quota-mode branch unused by EG) |
| Month on EG 1.8 vs 1.9 | Corrected | Month = 30-day epoch block on every EG version unless `USE_CALENDAR_MONTH_RATE_LIMIT=true`; flag exists in `8fe6ea42` (EG v1.8.4, v1.8.5, v1.9.1), not in `ff287602`/`1e50889b`/`17b1956c` (v1.8.0-1.8.3, v1.9.0). Chart comment `values.yaml:272-273` is wrong ("only on EG >= 1.9") |
| Epoch boundaries 2026-10-04, 11-03, 12-03, 2027-01-02, 02-01 | Confirmed | recomputed `floor(t/2592000)*2592000` |
| L02 Q1w proves the epoch window | Corrected | Envoy emits `w=2592000` for MONTH unconditionally (`ratelimit_headers.cc:116-117`); test must use reset or key suffix (Q-EDGE-01) |
| `failClosed` defaults false; dev sets false + 20 ms; prod sets nothing | Confirmed | `egtypes-v1.8.0.go:565-576` ("If not set, FailClosed is False", timeout default 20 ms); `createRateLimitFilter` sets `FailureModeDeny` only if true (`ratelimit.go:152-155@v1.9.1`); Envoy fail-open path `ratelimit.cc:285-291`; failClosed=true would answer **500** (`statusOnError`), not 429; INFRA dev `helmrelease.yaml:56-57`, prod `:37-43` |
| ext_authz `failOpen: true`, 200 ms | Confirmed | `values.yaml:211-212`, `securitypolicy.yaml:17-19` (line cite corrected) |
| 429 headers: fixed `Retry-After: 60`, `x-ratelimit-*` dropped, same body for both limits | Confirmed (headers drop is the POC's 2026-09-24 EG 1.9.1 observation, `backendtrafficpolicy-auth.yaml:75-76`; not re-run) | `values.yaml:255`, BTP `:65-79`; no dynamic Retry-After in Envoy 1.39.1/1.39.2, `enable_retry_after_header` present at v1.40.0 |
| 200 headers show only the tightest descriptor | Confirmed, with addition | `ratelimit_headers.cc:52-101`: min-remaining descriptor; Limit header lists all enabled policies; disabled-on-tightest suppresses all (Q-EDGE-62 corrected) |
| Redis key format and TTL | Confirmed / spelled out | `cache_key.go:66-94` (`prefix+domain_` + `key_value_` per entry + bucketStart; `CACHE_KEY_PREFIX` default ""); `INCRBY`+`EXPIRE` per hit, TTL = `UnitToDivider` + `Int63n(300)` jitter, refreshed on every hit (`fixed_cache_impl.go:35-38,190-193`) |
| Route name carries the host | Confirmed, extended | `route.go:1931-1934@v1.9.1`; also carries HTTPRoute `rule/<i>/match/<j>` (`helpers.go:552-554`), new split and reset hazard (Q3 items 1b, 2) |
| `shared: true` -> one counter across hosts, quota filter after per-minute | Confirmed from source | domain = `<ns>/<policy>`, descriptor = rule name; but rule name embeds BTP index (Q-EDGE-44, §4 item 6 corrected) |
| One Redis per cluster | Confirmed with exception | single `REDIS_URL`; rollout overlap of the Deployment (Q3 corrected) |
| `FORCE_START_WITHOUT_INITIAL_CONFIG=true`, "no rate limit configuration loaded" fails open | Confirmed | EG resource env; `service/ratelimit.go:132`, panic -> gRPC error -> Envoy fail-open |
| Local cache off; over-limit keys keep incrementing | Confirmed | `LOCAL_CACHE_SIZE_IN_BYTES` default 0; caveat on enabling added (Q-EDGE-12/45) |
| Shadow mode keeps the count | Confirmed | `shadowMode` not part of the key; `base_limiter.go:159-165` forces OK |
| `xRateLimitHeaders` in v1.8.0 | Confirmed (types and CRD) | `ratelimit_types.go:139-144@v1.8.0`, chart CRD `:1799,2183@v1.8.0`; live prod CRD UNVERIFIED |
| `invert` -> `expect_match=false` | Confirmed | `ratelimit.go:392-396@v1.9.1`; live catch-all behaviour on a missing header still UNVERIFIED |
| Auth service: unknown/revoked 401, origin 403, OPTIONS+Origin -> embed, gated no-key 401, Bearer-only on gated 401, unknown tier passed through, soft-delete = revoked, empty successful first load -> Ready, `GATED_PATHS` untrimmed | Confirmed | `decide.go:153-184`, `grpcserver.go:30-37,78-92`, `pgload.go:10-14`, `main.go:64-66,100-132` |
| Django: Bearer before Gemini, 400/503/502, `no-store`, 5 attempts x 60 s, no cache, no length cap | Confirmed | `api/views.py:378-457`, `embedder.py:10,22-77`, `search.py:29-33` |
| "5 billed Gemini calls" | Corrected | failed calls are not billed (Gemini billing FAQ) |
| "Postgres not read in the request path" | Corrected | Django reads `vector_db` (pgvector) |
| Refunds unavailable ("no negative hits in our images") | Corrected | images support it from `8fe6ea42`/Envoy 1.38; EG API does not expose it |
| `partner` unlimited (Q-EDGE-27) | Corrected | rule 1 + quota rules |
| OPTIONS preflight not counted (Q-EDGE-40) | Corrected | counted on embed per-Origin per-minute rule |
| `cost.response` never enforced (Q-EDGE-39) | Corrected | enforced on later requests via the same key |
| Rows not re-derivable from source here (Cloudflare caching, prod CTP status, live Redis keys, client IP behind Cloudflare, Varnish POST handling, k6/drill outcomes) | Unverifiable | no cluster access in this pass; left as marked |


## 8. Accepted risks (decision of 2026-10-20)

Decided on the call of 2026-10-20 (wiki `meta/meeting-2026-10-20-api-key-table-split-fail-open`, decisions 2-4; plan decision D10): everything fails open during an auth-service outage, semantic search included. When the auth service is down, slow or erroring, Envoy passes the request with no `x-sefaria-*` headers, so the gate and every limit are skipped. Only Django's Bearer check on `/api/knn-search` remains, and it is unchanged by this decision. The Gemini embedding quota is the spending ceiling.

Accepted consequences:
- Auth service down plus a flood on semantic search can exhaust the shared Gemini quota. The Library Assistant's semantic tool then stops until the quota resets or the auth service recovers (F-OUT-03.e3, Q-EDGE-65). Unlikely; both agreed on 2026-10-20.
- The rate-limit catch-all must not carry a "no semantic search" row. It is per-minute limits only, so a request with no tier header is never blocked on semantic search (Q-EDGE-13, F-OUT-02.e3).
- No special internal key format, and no special key or path for the Library Assistant (Q-EDGE-28). A per-path fail-closed list can be added later if Gemini quota data calls for it (F-OUT-02.e4).
- The Gemini project spend cap is set at a catastrophic level only, since it also stops the Library Assistant (Q-EDGE-65).

## 9. References

- Envoy Gateway (`github.com/envoyproxy/gateway`): tags v1.8.0 (prod) and v1.9.1 (dev); global rate limit task, https://gateway.envoyproxy.io/docs/tasks/traffic/global-rate-limit/
- envoyproxy/ratelimit (`github.com/envoyproxy/ratelimit`): images `ff287602` (EG v1.8.0), `8fe6ea42` (EG v1.8.4, v1.8.5, v1.9.1), `17b1956c` (EG v1.9.0); README sections "Calendar-aligned MONTH rate limits" and "Negative hits"
- Envoy proxy 1.39.1, ext_authz and ratelimit filters and `rate_limit.proto`
- Envoy Proxy: The Definitive Guide (Trove book `cmmt9asuy0a2yqq0z4njsdch4`): p.14 = ch.12 ext_authz, p.19 = ch.17 rate limiting
- Redis INCRBY, https://redis.io/docs/latest/commands/incrby/
- Gemini API billing FAQ, https://ai.google.dev/gemini-api/docs/billing
- IETF HTTP RateLimit header fields, draft-11 section 6 (local copy `ietf11.txt` in the research folder)
- Go ext_authz practice: research file r3 (`r3-go-extauthz.md`) behind the deep dive
- Industry comparison (Apigee, AWS, Azure, Kong, Stripe, OWASP API4:2023): research file r4 (`r4-industry.md`) behind the deep dive
- Wiki (`sefaria-wiki/wiki/`): `meta/spec-2026-10-14-api-key-monthly-quota.md`, `sources/api-key-architecture-2026-10-14.md`, `projects/api-key-program/next-steps.md`, `meta/meeting-2026-10-20-api-key-table-split-fail-open.md`
