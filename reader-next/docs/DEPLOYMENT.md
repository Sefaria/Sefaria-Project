# Deployment: the reader client in the cluster

Written 2026-10-06; rewritten 2026-11-10 for the launch topology (LAUNCH_PLAN §4 D-1: `optin` only in shared environments). Everything
below lives on the Sefaria-Project branch `reader-next`; the client is the folder `reader-next/`.

## Three modes (`nodejs.mode` in `helm-chart/sefaria/values.yaml`)

| Mode               | Who gets the new reader                                                         | Node pods                     | Reader pods                       | Django SSR (`USE_NODE`) |
| ------------------ | ------------------------------------------------------------------------------- | ----------------------------- | --------------------------------- | ----------------------- |
| `legacy` (default) | nobody                                                                          | legacy SSR (`sefaria-node`)   | none                              | on                      |
| `optin` (launch)   | page requests that carry the cookie `reader_version=next` (set by Django)       | legacy SSR (`sefaria-node`)   | `reader-<env>` (`sefaria-reader`) | on                      |
| `reader`           | everyone (not deployed anywhere shared: Django's own SSR is off for its pages) | the reader (`sefaria-reader`) | none                              | off                     |

`legacy` renders the same chart as `origin/master` byte for byte (randomised redeploy strings aside; checked 2026-11-10 with
`helm template`, see "Verifying locally"). Only `optin` writes `READER_OPTIN` into Django's settings, which shows the switch in account
settings (`sefaria/helper/reader_choice.py`).

## Request flow (`optin`, Library hosts)

```
Cloudflare → nginx (www server block of each root domain)
               ├─ /api/search/…                  → Elasticsearch                      (unchanged)
               ├─ /static/…, /robots.txt         → nginx's own files                   (unchanged, cookie never consulted)
               ├─ /api/…                         → Varnish → Django, cookie or not     (its own location in optin)
               ├─ /sheets, /collections, /profile → 307 to the Voices host             (unchanged; Voices block untouched)
               ├─ Django's prefixes, favicon,    → Varnish → Django, cookie or not     (T-C04; generated from DJANGO_PREFIXES)
               │  manifests, llms.txt, .well-known
               ├─ /assets/…                      → the reader, cookie or not           (its hashed bundles; Django has none)
               └─ everything else (pages): location /, legacy's
                    no cookie (or kill switch)   → Varnish → Django, exactly as in legacy mode
                    cookie reader_version=next   → `return 418` → error_page → @reader → the reader (reader-<env>:3000)
                                                    ├─ reader / library page → rendered there; data read from Varnish
                                                    ├─ a page it does not render, a write, its 404 → passed to Varnish → Django
                                                    └─ nginx's own 502/504 (unreachable: 5 s connect timeout; timed out)
                                                         → @reader_down: GET/HEAD from Varnish → Django; any other method 502
```

**Visitors without the cookie are served by legacy's `location /`, unchanged.** The optin config only adds to legacy's: `diff` of
the rendered nginx config, legacy against optin (instrumentation on), has no removed line; added are the reader upstream and cookie
map, three lines at the top of `location /` (`recursive_error_pages on; error_page 418 = @reader; if ($reader_page) { return 418; }`),
and the `/api/`, `@reader`, `/assets/`, `@reader_down` and Django-paths locations (the `/api/` and Django-paths ones have legacy's
`location /` body). With the kill switch the three lines and the map are not rendered at all. A write is never replayed: only
nginx's own failure to reach the reader falls back, and only for GET/HEAD; a Varnish failure is never retried (no `error_page` on the
Varnish locations, as in legacy). `recursive_error_pages` is needed because nginx checks it in the location where the first
`error_page` (the 418) fired; `location /` has no other `error_page`, so nothing else changes. Every reader location sets
`X-Forwarded-Host $host` and `X-Forwarded-Proto https`: the reader trusts `X-Forwarded-Host` (Voices detection, the Host it sends to
Varnish, the canonical origin), so a value from the client must never reach it.

The Voices server blocks (`voices.*`, `chiburim.*`) never consult the cookie and never reach the reader.

- Server-side API reads go to `http://varnish-<env>-<revision>:8040` with `Host: www.<first root domain>`, so cached answers never reach
  Django. The browser calls `/api/…` on its own origin, which nginx sends to Varnish.
- Which paths are always Django's: `src/lib/routing/django-paths.ts` (`DJANGO_PREFIXES`); every non-GET request is passed through too.
  nginx's copy (`helm-chart/sefaria/templates/_reader-django-paths.tpl`) is generated from it:
  `node --experimental-strip-types build/ci/reader-nginx-paths.mjs` (run it after changing `DJANGO_PREFIXES`; CI's `--check` fails
  when the copy is stale, or when the regex would send one of the client's own pages to Django — e.g. the revision history
  `/activity/<ref>/<lang>/<version>`). `/api/` and `/static/` are left out of the regex: nginx has locations of their own for them.
- In `reader` mode the same nginx locations apply, except that every page goes to the reader first (`location /` → the node pods,
  falling back through `@reader_down`).

## Pieces

| Piece                                                                     | Where                                                                                                                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime config (env → server, `window.__SEFARIA_CONFIG__` → browser)      | `src/lib/config.ts`                                                                                                                             |
| Pass-through to Django, `/healthz-reader`                                 | `src/start.ts`, `src/server/pass-through.ts`                                                                                                    |
| Host header on internal API reads                                         | `src/server/internal-fetch.ts`                                                                                                                  |
| Production server (srvx: static files with long-lived cache headers, SSR) | `server/index.mjs`, `npm start`                                                                                                                 |
| Image                                                                     | `reader-next/Dockerfile`, context `reader-next/`; CI (`continuous.yaml`) builds `sefaria-reader-<branch>`. `build/node/Dockerfile` is the legacy SSR image (`sefaria-node`) |
| Chart                                                                     | `values.yaml` (`nodejs.mode`, `reader.*`), `conf/nginx.template.conf.tpl`, `templates/rollout/reader.yaml` + `service/reader.yaml` (optin), `templates/rollout/nodejs.yaml` (reader mode), `templates/_helpers.tpl` (`sefaria.readerEnv`), `templates/configmap/local-settings-file.yaml` (`USE_NODE`, `READER_OPTIN`), `templates/keda/scaledobject.yaml` |
| nginx routing check (all modes, no cluster)                               | `build/ci/reader-nginx-routing.py` (CI: `helm.yaml`)                                                                                            |

### Values

| Value                          | Default                                                            | Meaning                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `nodejs.mode`                  | `legacy`                                                           | see above                                                                                                  |
| `reader.containerImage`        | `…/development-205018/containers/sefaria-reader-master:latest`     | the reader image (optin rollout; the node pods in reader mode). The default tag is mutable on purpose: in `optin`/`reader` the chart **refuses to render** while the tag is `latest` or empty (see "Images") |
| `reader.allowMutableImage`     | `false`                                                            | escape for dev environments and cauldrons only: `true` lets `optin`/`reader` run a `latest` (or empty) tag. Never in preprod or production |
| `reader.optin.enabled`         | `true`                                                             | the kill switch (optin): `false` = nginx ignores the cookie, `READER_OPTIN = False`; the rollout stays    |
| `reader.errors.endpoint`, `.sampleRate` | `/api/reader-errors`, `1`                              | browser error beacons to Django (`reader/browser_errors.py`): 30 a minute per client address and 600 a minute from everyone together. The address is nginx's `X-Real-IP`; Django's `ORIGIN_LOCKED_TO_CLOUDFLARE = True` (a Django setting, not in this chart; off by default) makes it trust `CF-Connecting-IP` instead: set it only where nothing but Cloudflare can reach the origin. Without it, behind Cloudflare, the per-address limit is per Cloudflare edge |
| `reader.canonicalOrigin`       | `https://www.sefaria.org`                                          | `PUBLIC_CANONICAL_ORIGIN` (templated)                                                                      |
| `reader.replicaCount`, `reader.resources`, `reader.heapSize` | 1, 256Mi/100m → 768Mi/1 CPU, 384 MB          | optin rollout sizing, not yet measured (T-C06 below)                                                       |

### The reader pods' environment (T-C02)

Both layouts (the `reader-<env>` rollout in optin, the node pods in reader mode) get it from one helper, `sefaria.readerEnv`; checked
against `src/lib/config.ts` and against what the web pods read (2026-11-10).

| Variable                                                                 | Value                                                          | Source / note                                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `SEFARIA_API_ORIGIN`                                                     | `http://varnish-<env>-<revision>:8040`                         | this release's Varnish                                                                                          |
| `SEFARIA_API_HOST`                                                       | `www.<first root domain>`                                      | `domains.root[0]` (so `www.sefaria.org` on the `.org.il` host too)                                              |
| `PUBLIC_API_ORIGIN`, `PUBLIC_SITE_ORIGIN`                                | `""`                                                           | same origin                                                                                                     |
| `PUBLIC_CANONICAL_ORIGIN`                                                | `reader.canonicalOrigin`                                       | canonical, og:url and hreflang alternates are absolute (T-C08); on the Hebrew site's host (`*.org.il`, `*-il.org`) a page names the origin's Hebrew twin (`www.sefaria.org.il`), as Django's `canonical_url` (`src/lib/routing/canonical.ts`) |
| `PUBLIC_VOICES_ORIGIN`                                                   | `https://voices.<first root domain>`                           |                                                                                                                 |
| `SEFARIA_PASS_THROUGH`, `PORT`                                           | `1`, `3000`                                                    |                                                                                                                 |
| `APP_VERSION`                                                            | the reader image tag                                           | gtag `site_version`                                                                                             |
| `SIMPLE_ANALYTICS_HOSTNAME`                                              | `sefaria.org`, or `sa-dev.sefaria.org` when `DEBUG`            | as Django's `base.html`                                                                                         |
| `SENTRY_ENVIRONMENT`                                                     | `deployEnv`                                                    | the Library Assistant's `origin`, as the web pods' configmap                                                    |
| `GOOGLE_TAG_MANAGER_CODE` (GTM), `GOOGLE_GTAG` (GA4), `GOOGLE_SSO_CLIENT_ID`, `APPLE_SSO_CLIENT_ID`, `RECAPTCHA_PUBLIC_KEY`, `CHATBOT_API_BASE_URL`, `PINNED_IPCOUNTRY` | key by key, optional | `secretKeyRef` on `secrets.localSettings.ref`, the secret the web pods load with `envFrom`. Not the whole secret: it also holds database and API credentials. The CI-only override secret (`secrets.localSettings.data` → `local-settings-secrets-<env>`) is not read |
| optin rollout only: `NODE_OPTIONS`, `DEBUG`; `envFrom` `local-settings-node-<env>` (+ `-secrets-`) | | per-deployment extras such as `PUBLIC_LABS`, `PUBLIC_ROOM_URL` (labs stay off in production, D-10)              |

Not set (unset on both sides, defaults match Django's): `CHATBOT_VERSION`, `CHATBOT_USE_LOCAL_SCRIPT`.

## Kill switch and rollback (T-C03)

Target: every reader back on the legacy reader within two minutes, without removing the reader rollout. Three levers, fastest first.

1. **Remote config (no deploy; needs lane C's client half).** Set `feature.reader.optin.enabled` = `false` in Django admin → Remote
   config. Interface the chart side expects: when the key is `false`, the reader's **server** answers any page request with a `302` to
   the same URL plus `Set-Cookie` clearing `reader_version` (on the domain Django set it on, `get_cookie_domain`, and host-only), and its
   **browser** code, on its next remote-config read, clears the cookie the same way and reloads. nginx then sends the reload to the
   legacy reader. Saved profile choices are untouched (the account switch stays), so turning the key back on restores everyone at
   their next sign-in sync. Until lane C lands this, use 2 or 3.
2. **Emergency, kubectl (seconds).** Take the reader's endpoints away; nginx's connect fails (5 s timeout at worst) and every page
   falls back to Varnish/Django (`@reader_down`, GET/HEAD; a write gets a 502), checked by `reader-nginx-routing.py`. Opted-in
   readers pay at most one failed connect per page.
   ```
   # without KEDA (production today)
   kubectl -n <namespace> scale rollout <env>-reader --replicas=0
   # with KEDA (cauldrons): pause the ScaledObject at zero, or it scales the reader back up
   kubectl -n <namespace> annotate scaledobject <env>-reader autoscaling.keda.sh/paused-replicas="0" --overwrite
   ```
   Flux does not undo a replica change on a Rollout it manages through Helm unless drift detection is on; the next release does
   (`reader.replicaCount`), so follow with 3.
3. **Durable, Helm (one release).** Set `reader.optin.enabled: false` in the environment's HelmRelease values and let Flux reconcile
   (`flux reconcile helmrelease <name>`). nginx's `location /` is then legacy's byte for byte (no cookie check), `READER_OPTIN`
   becomes `False` (the account switch is hidden), and the reader rollout keeps running (its `/assets/` still serve pages that are
   already open). A release rolls nginx and web blue/green, so this takes as long as a deploy, not two minutes.

**The opt-in is a routing cookie, not an access boundary (accepted for L0, DECISIONS.md 2026-11-10).** Anyone can set
`reader_version=next` in their own browser (devtools) and nginx routes on the cookie alone (`map $cookie_reader_version`). Django's
`ReaderChoiceMiddleware` clears the cookie of someone outside the audience only on responses **Django** sends, and the reader itself
never checks the audience: a signed-out visitor who sets the cookie gets the new reader on every page it renders (a signed-in non-staff
visitor loses the cookie at their next Django response). This is not a data exposure (the reader serves only what the visitor could read
anyway), but it means: (a) "staff only" at L0 limits who is invited, not who can reach the reader's pages and its `/_serverFn/…`
endpoints; treat the reader server as public from L0 on; (b) lever 1 (remote config) reaches only tabs whose client code runs and
responses Django sends. **The server-side kill switch is lever 3, `reader.optin.enabled: false`**: nginx stops reading the cookie, so
no request reaches the reader whatever cookie it carries (lever 2 does the same at once, until the next release).

Restore: undo in reverse order (`reader.optin.enabled: true`; `kubectl … scale … --replicas=<n>` or remove the KEDA annotation;
the remote-config key back to `true`). Rehearse 2 and 3 on a cauldron before L0 (LAUNCH_PLAN §7).

## Hosts and the cookie (T-C05, Library hosts only)

Read from the rendered chart (`helm template … -f build/ci/preprod-values.yaml --set nodejs.mode=optin`, and the default cauldron
values), `sefaria/helper/reader_choice.py` and `sefaria/utils/domains_and_languages.py` on 2026-11-10; no cluster access. Production's
values are not in this repository: they are assumed to have preprod's shape (an English root and a Hebrew root, Voices on `voices.` /
`chiburim.`). Verify on staging (LAUNCH_PLAN T-C05 "done when").

**The cookie.** `reader_version=next`, set or cleared by Django only (`/api/profile` when the switch changes; `ReaderChoiceMiddleware`
once per signed-in session), `Max-Age` one year, `Path=/`, `SameSite=Lax`, `Secure` (nginx sends `X-Forwarded-Proto: https`, which
`SECURE_PROXY_SSL_HEADER` trusts), not `HttpOnly` (the client can clear it). Its domain is `get_cookie_domain(current_domain_lang())`:
the longest common suffix of the language's module hosts.

| Host (Library)                                   | `reader_version` domain                                    | Opted-in reader gets                                                                                                                                                         | Not opted in |
| ------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `www.sefaria.org`                                | `.sefaria.org` (en: www + voices)                          | the new reader for reader, library, search, auth, topics (Library pool), translations, calendars, compare, saved/history, revision history; Django for `DJANGO_PREFIXES` and everything the reader passes on; 307 to `voices.sefaria.org` for `/sheets`, `/collections`, `/profile` | legacy       |
| `www.sefaria.org.il`                             | `.sefaria.org.il` (he: www + chiburim)                     | the same, 307s to `chiburim.sefaria.org.il`. Caveats: the reader's own API reads use `Host: www.sefaria.org` and its Voices links `voices.sefaria.org` (both from the first root domain; see Open questions) | legacy       |
| `sefaria.org`, `sefaria.org.il` (bare)           | (cookie sent, unused)                                      | 301 to `www.`; `/apple-app-site-association` → Varnish                                                                                                                         | same         |
| `www.sefariapreprod.org`, `www.sefariapreprod-il.org` | `.sefariapreprod.org`, `.sefariapreprod-il.org`        | as production                                                                                                                                                                | legacy       |
| `www.<name>.cauldron.sefaria.org`                | `.<name>.cauldron.sefaria.org` (en and he share the host, so the cross-language suffix) | as production, one host for both languages                                                                                                    | legacy       |

- **Separate per root domain.** The `.org` and `.org.il` cookies are independent: a reader who opted in is synced on each domain by
  the middleware when they sign in there (sessions are per domain too).
- **Production's cookie reaches cauldrons.** `.sefaria.org` is also sent to `*.cauldron.sefaria.org`: a staff member opted in on
  production gets the new reader on any cauldron running `optin` (a cauldron's own cookie, `.<name>.cauldron.sefaria.org`, never reaches
  production). Harmless, but remember it when comparing readers on a cauldron.
- **Shared static files stay out of the split.** The cookie is consulted only in the www block's `location /` (`$page_upstream`).
  `/static/…` (nginx's files), `/static/sitemaps/` (GCS), `/robots.txt` (nginx's file), `/api/…` and `/api/search/…` have their own
  locations; `/favicon.ico`, `/site.webmanifest`, `/manifest.json`, `/llms.txt` and `/.well-known/…` go to Varnish whatever the cookie;
  `/assets/…` (the reader's bundles) to the reader whatever the cookie. `build/ci/reader-nginx-routing.py --table` asserts each of these
  in every mode.

## CI

| Workflow                 | What it does for the reader                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `continuous.yaml`        | builds `sefaria-web-<branch>`, `sefaria-node-<branch>` (legacy SSR) and, only when `reader-next/` changed in the push or pull request (or a new branch, where that cannot be told), `sefaria-reader-<branch>` (`reader-next/Dockerfile`, context `reader-next/`; job `images` picks the matrix). Job `reader-nginx-paths` runs the generated-paths `--check` on master and every pull request |
| `helm.yaml` (lint job)   | `ct lint`; `reader-nginx-paths.mjs --check`; `reader-nginx-routing.py --table` (helm + nginx on the runner)                                                       |
| `reader-next-client.yaml`| checks (types, unit, atlas, stories, the nginx paths check, the scripts' `node --test`), `budgets` (initial JS/CSS of a reader page, `scripts/budgets/`), `e2e` (below) |

**Deterministic e2e (T-A04).** The e2e job downloads the API cassette bundle pinned by `e2e/cassette.lock` (a release asset named by
the recordings' content hash, `scripts/cassette/bundle.mjs fetch`) and runs `E2E_API_MODE=replay`: a missing recording is a 504 and a
`[cassette] MISS` line in the log, never a network call. With no lock it warns and keeps the old behaviour (Actions cache + `auto`).
With a lock whose bundle cannot be fetched or does not match, a **push fails** (`fetch --strict`) and a pull request warns and falls
back: so upload a new bundle before pushing its lock. When a change needs new recordings: run the suite locally (auto records them), then
`node scripts/cassette/bundle.mjs pack --out <dir>`, upload the printed asset (`gh release upload reader-next-e2e-cassette …`, maintainers
only) and commit the new `e2e/cassette.lock`. Dicta (Hebrew search) is recorded under the cassette's `/__dicta/` prefix once the specs
route it there (`scripts/cassette/dicta-route.mjs`).

**Budgets (T-H04).** `node scripts/budgets/measure.mjs` after `npm run build`: the JS and CSS a server-rendered `/Genesis.1` links
(TanStack Start's manifest for `__root__` + `/$`, plus the root's `?url` stylesheets), raw and gzip, against
`scripts/budgets/baseline.json`; more than 2% over fails. Re-baseline a deliberate change with `--write` and say why in the commit.
Baseline 2026-11-10: JS 56 files, 1,339,866 B (gzip 434,242); CSS 17 files, 239,813 B (gzip 57,081). Who may raise it: the owner (or
whoever reviews performance) should approve every change to `baseline.json`; a CODEOWNERS entry for
`reader-next/scripts/budgets/baseline.json` would enforce that (not added here).

## Sign-in (the ported AuthPage)

- `/login`, `/register` and the password-reset link are rendered by this client (`src/routes/_auth*.tsx`, `src/features/auth`); they are
  no longer in `DJANGO_PREFIXES`. Their POSTs (`/api/auth/login`, `/register` noredirect, the reset link's JSON) are writes, so they still
  go to Django. `/logout`, `/_allauth`, `/accounts`, `/api` stay Django's.
- **Reset link.** Django must see the emailed `/password/reset/confirm/<uid>/<token>/` first: it checks the token, stores it in the
  session and redirects to `…/<uid>/set-password/`, which this client renders. For an invalid token Django answers with its own page;
  the request middleware (`passResetLink`) turns that into a redirect to the set-password address. There the page asks Django whether
  the stored token is still good with an empty JSON POST (valid → 400 field errors, nothing saved; invalid → `invalid_reset_link`) —
  Django's `authResetValid` was only ever in its own page context. Cost: one small POST and a "Loading" line on that card.
- **Who is signed in.** `GET /api/profile` cannot tell (it 404s without a slug). The viewer query asks allauth's
  `/_allauth/browser/v1/auth/session` and `/api/user_stats/<id>?quick=1`, forwarding the request's cookie during SSR (only when a
  `sessionid` cookie is present), so the header is right at first paint.
- **CSRF.** The last `csrftoken` cookie (Django's own choice when a cauldron has two), fetched first from the allauth session endpoint if
  the browser has none (`src/lib/auth/csrf.ts`, `http.ts` — the one helper for writes).
- Google/Apple/One Tap only work same-origin with Django (provider token and callbacks are Django endpoints; Google's redirect mode posts
  back to `/api/auth/google/redirect`). Locally the client points at www.sefaria.org cross-origin, so sign-in cannot work in `npm run dev`;
  use a local Django with `SEFARIA_PASS_THROUGH=1 SEFARIA_API_ORIGIN=<local Django>` or a cauldron.

## Creating a cauldron

Cauldrons do not use the chart from the branch: they install a published chart version from `sefaria-project-helm-repo`. Pushing a
non-master branch that changes `helm-chart/**` with a conventional `helm:`/`feat:`/`fix:` commit makes `.github/workflows/helm.yaml`
publish a prerelease chart for that branch (channel = the branch name, e.g. `0.90.0-reader-next.1`).

1. Push the branch: `git push -u origin reader-next`. CI (`continuous.yaml`) builds `sefaria-web-reader-next`,
   `sefaria-node-reader-next` (legacy SSR), `sefaria-reader-reader-next` (this client) and `sefaria-asset-reader-next`; `helm.yaml`
   publishes the prerelease chart.
2. Read the chart version from the workflow's "Get chartVersion" step or the `helm-chart-*` tag it creates.
3. In the cauldrons repository: `./create-cauldron.sh -n reader-next -b reader-next -c <chart version>` (add `-d` to review the
   HelmRelease first), then set in its HelmRelease values `nodejs.mode: optin` and
   `reader.containerImage.imageRegistry: us-east1-docker.pkg.dev/<dev project>/containers/sefaria-reader-reader-next` (tag as for the
   other images; with `latest`, also `reader.allowMutableImage: true`, or the chart refuses to render). The script knows only the node image: until it learns `reader.containerImage`, add these by hand, and an image policy
   for `sefaria-reader-<branch>` if the cauldron should follow new builds.
4. Opt in: sign in, Account Settings → the new reader (sets `reader_version=next`). Open `https://www.reader-next.cauldron.sefaria.org/Genesis.1`
   (this client) and `/topics` (Django through the client). Response header `x-served-by: django` marks a page the client passed on;
   a Django prefix (e.g. `/settings`) now comes straight from Varnish, without that header.

Updating: commit to the `reader-next` branch and push; the image policy picks up the new reader image. Chart changes need a new
prerelease (another `helm:` commit) and `-c` / `repoint-cauldron.sh`.

## Verifying locally (no cluster)

```
# legacy renders exactly as origin/master's chart (random redeploy strings masked)
mkdir -p /tmp/master && git archive origin/master helm-chart | tar -x -C /tmp/master
mask() { sed -E '/randomstringtoforceredeployments/{n;s/value: .*/value: RANDOM/;}'; }
diff <(helm template t /tmp/master/helm-chart/sefaria --set deployEnv=t | mask) <(helm template t helm-chart/sefaria --set deployEnv=t | mask)

# every mode: nginx -t, then who answers which path with and without the cookie (and with the reader down). optin and reader
# need an immutable reader tag or reader.allowMutableImage=true (the script passes the escape value)
python3 build/ci/reader-nginx-routing.py --table

# optin/reader refuse the default mutable tag (expect the "mutable tag" error), and render with a sha tag
helm template t helm-chart/sefaria --set deployEnv=t --set nodejs.mode=optin >/dev/null
helm template t helm-chart/sefaria --set deployEnv=t --set nodejs.mode=optin --set reader.containerImage.tag=sha-abc1234 | grep sefaria-reader

# nginx's Django paths are current
node --experimental-strip-types build/ci/reader-nginx-paths.mjs --check
```

Earlier (2026-10-06, reader mode): nginx (rendered config) → client container → stand-in Varnish (proxy to www.sefaria.org): `/Genesis.1`,
`/texts` rendered by the client; `/about`, `/topics/light`, the 404 page passed to Django; `/api/…` straight to Varnish; with the client
stopped, `/Genesis.1` is answered by Django. Locally, `npm start` against `https://www.sefaria.org` can fail TLS inside the macOS
sandbox ("unable to verify the first certificate"); the container and the cluster (plain http to Varnish) are not affected.

## Owner and integrator actions (need a cluster, an account or write access)

### Load test and sizing (T-C06): the plan

Run on staging in `optin` (or a production-sized cauldron), against nginx's service from a pod in the cluster (so Cloudflare and the
office network are not measured), every request with `Cookie: reader_version=next` and `Host: www.<root>`. Tool: k6 or vegeta.

- **Pages** (anonymous, server-rendered, each a full page load: HTML, then its `/assets/` and API reads as the browser makes them):
  `/Genesis.1`, `/Berakhot.2a`, `/texts`, `/search?q=light&tab=text` — plus a cold variant of each with a new ref per request
  (`/Genesis.<1-50>`, `/Berakhot.<2-64>a`) so Varnish misses are measured too.
- **Load.** Expected opt-in traffic = the week's p95 page requests per second at nginx (Datadog: non-`/api`, non-`/static` requests on
  the www hosts) × the expected opt-in share (L0: staff only, negligible; L1: assume 5% of signed-in page views). Ramp in 5-minute
  steps to ×1, ×3, ×10 that rate, hold ×10 for 15 minutes, then a spike to ×20 for 2 minutes. During the hold, roll the reader
  (`kubectl argo rollouts restart <env>-reader`) once to measure graceful shutdown.
- **Measure.** TTFB and full-response p50/p95/p99 per page; error rate (any 5xx, and nginx falling back to `@reader_down`, visible as
  Django-served reader pages in the access log); reader pod CPU, RSS against the limit and V8 heap against `heapSize`, event-loop
  delay, GC pauses; restarts and OOMKills (must be 0); requests per pod at which p95 TTFB passes 1 s (sets the KEDA/HPA target);
  Varnish hit ratio of the reader's own API reads and the web pods' extra load from pass-throughs; in-flight requests dropped during
  the rollout restart (must be 0: add a preStop sleep and SIGTERM draining if not).
- **Output** into this file: `reader.resources` requests/limits, `reader.heapSize`, min/max replicas and the scale trigger, probe
  timings (readiness `/healthz-reader` every 10 s, liveness after 30 s today), and the restart result.

### Adobe Fonts (T-C07)

Kit `aeg8div` (Adobe Garamond for the English face): add these domains in the kit's web project settings, or the English face falls
back to the system serif on them: `www.sefaria.org`, `www.sefaria.org.il`, `www.sefariapreprod.org`, `www.sefariapreprod-il.org`, the
staging hosts, `*.cauldron.sefaria.org`, and `localhost` for development. Decide Q-P2 (self-hosting, if the licence allows) at the
same time.

### Images

What exists today: `continuous.yaml` pushes `us-east1-docker.pkg.dev/<DEV_PROJECT>/containers/sefaria-reader-<branch>` (tags
`latest`, `sha-<short>-<date>`, `<branch>`) whenever `reader-next/` changes, so `sefaria-reader-master:latest` exists once a
`reader-next/` change has landed on master. Only the branch named exactly `master` (or `prod`/`preprod`) writes those image names: the
branch-name step used to keep the middle segment of `a/b/c`, so `anything/master/x` wrote `sefaria-reader-master:latest`; such a branch
is now published as `sefaria-reader-branch-anything-master-x`.

**Mutable tags are refused (`sefaria.readerImage` in `templates/_helpers.tpl`).** In `nodejs.mode` `optin` or `reader`, `helm template`
fails while `reader.containerImage.tag` is `latest` or empty: a `latest` tag is pulled again on every pod restart
(`imagePullPolicy: Always`) and is overwritten by every build, unreviewed. The message:

```
Error: execution error at (sefaria/templates/rollout/reader.yaml:41:18): nodejs.mode "optin" runs the reader image
us-east1-docker.pkg.dev/development-205018/containers/sefaria-reader-master with the mutable tag "latest". Set
reader.containerImage.tag to an immutable tag (a commit sha from continuous.yaml), or, for a dev environment or cauldron only, set
reader.allowMutableImage: true (reader-next/docs/DEPLOYMENT.md, "Images").
```

Set the tag to a `sha-<short>-<date>` (or `sha-<short>`) tag of a reviewed master build, or let the environment's Flux image policy
write it, as for `sefaria-node`. `reader.allowMutableImage: true` is the escape for a dev environment or cauldron that should follow a
branch's `latest`; never set it in preprod or production. `legacy` mode never renders the reader image and is not affected. The chart's default, `…/development-205018/containers/sefaria-reader-master:latest`,
assumes `DEV_PROJECT` is `development-205018` (as `build/ci/integration-values.yaml` does for the other images): check it. Nothing pushes
a reader image to the production registry. Owner actions before the reader runs anywhere shared:

1. Production image: add `reader-next/Dockerfile` (context `reader-next/`) to the production image pipeline (outside this repository)
   as `us-east1-docker.pkg.dev/production-deployment/containers/sefaria-reader`, tagged like `sefaria-node`.
2. In each environment that runs `nodejs.mode: optin` (staging, production), set `reader.containerImage.imageRegistry` and `.tag` to that
   image, and add an image policy for it in the environment's Flux image automation, as for `sefaria-node`.
3. Cauldrons: `reader.containerImage.imageRegistry: us-east1-docker.pkg.dev/development-205018/containers/sefaria-reader-<branch>`,
   and either a `sha-…` tag or `reader.allowMutableImage: true` to follow the branch's `latest`.
4. Upload the pinned e2e cassette bundle (command in `scripts/cassette/bundle.mjs pack`'s output) **before** the lock reaches a pushed
   branch: with a lock, a push whose bundle cannot be fetched fails the e2e job.

**After a rollout, old chunks.** Bundles are content-hashed and the rollout is blue/green: once the new reader is promoted, a page
opened on the old one that lazy-loads a chunk it has not fetched yet gets a 404 (Cloudflare keeps the chunks it already cached for a
year). Recommendation for the client: on Vite's `vite:preloadError` (a dynamic import that failed), reload the page once. Alternative on
the platform side: keep the previous release's `dist/client/assets` in the new image. Neither is done here.

### Open questions

- On the `.org.il` host the reader reads its API with `Host: www.sefaria.org` and links Voices at `voices.sefaria.org` (both come from
  `domains.root[0]`). Django's pages on that host link `chiburim.sefaria.org.il`. Recommendation: derive both per request from the
  host (the client side is a Voices-adjacent change, so it waits for the owner).
- `/texts` is 3.8 MB of HTML (the catalog is written into the page); trim before production (carried over from 2026-10-06).
- `reader` mode's node pods use `nodejs.resources` / `nodejs.heapSize`, sized for the legacy server; unimportant while reader mode is
  never deployed.

## First cauldron (2026-10-06): what went wrong, and the fixes

- **Restore hook**: `mongo-restore.yaml` tested `"MONGO_REPLICASET_NAME"` without `$`, so every restore URI ended in an empty
  `replicaSet=`; the newer "verify restore completeness" step (mongo shell) rejects it. Fixed in the chart (0.89.2-reader-next.2+).
  A failed first install can leave the hook ConfigMap `mongo-restore-<name>` behind, and every later install then fails with
  "already exists" while Flux stalls: delete that ConfigMap and `flux reconcile helmrelease <name> --reset`.
- **Django readiness waited on itself**: `/healthz` also checked the Node server; in reader mode that request reaches the client,
  which passes it back to Django. Fixed: the check skips Node when `USE_NODE` is off (reader/views.py).
- **Scale to zero**: KEDA starts web, node and redis on the first external request. Django can crash once while redis starts, and
  boots for a few minutes; the first page may be the "temporarily unavailable" error (a 502/503/504 from Varnish now says so).
- **Internal origin leaked into the page**: preload links for neighbouring sections used `SEFARIA_API_ORIGIN`
  (`http://varnish-…:8040`). Anything the browser will request must use `PUBLIC_CONFIG.apiOrigin`.
- **Verified on the cauldron**: reader pages, book and category pages, search (all tabs), `/api/topics-toc`, `/login`, `/register`
  rendered by the client; `/about`, `/topics/*`, the 404 page passed through to Django; `/healthz` all ready; Adobe Garamond loads;
  the analytics and sign-in keys arrive from the secret.
