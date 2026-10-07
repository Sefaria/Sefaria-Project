# Deployment: the reader client in the cluster

Written 2026-10-06. The client replaces the legacy Node SSR server (`node/server.js`) in the `node` pods. Everything below lives on
the Sefaria-Project branch `reader-next`, where this repository is the folder `reader-next/` (a squashed git subtree).

## Request flow

```
Cloudflare → nginx (www server)
               ├─ /api/search/…        → Elasticsearch            (unchanged)
               ├─ /static/…            → nginx's own files         (unchanged)
               ├─ /api/…               → Varnish → Django          (never touches the client)
               └─ everything else      → node (this client)
                                           ├─ reader / library page → rendered here; data read from Varnish
                                           ├─ Django's page (topics, sheets, profile…), any write, or our 404
                                           │                         → passed to Varnish → Django, answer returned as is
                                           └─ client down (502/503/504) → nginx falls back to Varnish → Django
```

- Server-side API reads go to `http://varnish-<env>-<revision>:8040` with `Host: www.<root domain>`, so cached answers never reach
  Django. The browser calls `/api/…` on its own origin, which nginx sends to Varnish.
- Which paths are always Django's: `src/server/pass-through.ts` (`DJANGO_PREFIXES`); every non-GET request is passed through too.
- Django's own server rendering is off in this mode (`USE_NODE = False`), because the node pods no longer render for Django. Django
  pages still work and hydrate in the browser, but their first HTML no longer contains rendered React (an SEO cost for topics,
  sheets and profiles until those move to this client, or until the legacy server is run as a separate deployment).

## Pieces

| Piece | Where |
|---|---|
| Runtime config (env → server, `window.__SEFARIA_CONFIG__` → browser) | `src/lib/config.ts` |
| Pass-through to Django, `/healthz-reader` | `src/start.ts`, `src/server/pass-through.ts` |
| Host header on internal API reads (Node's `fetch` ignores `Host`; `node:http` is used for the plain-http Varnish origin) | `src/server/internal-fetch.ts` |
| Production server (srvx: static files with long-lived cache headers, then SSR) | `server/index.mjs`, `npm start` |
| Image | `Dockerfile` here; `build/node/Dockerfile` in Sefaria-Project (context = repository root) |
| Helm switch | `nodejs.mode` in `helm-chart/sefaria/values.yaml`: `reader` (default on the branch) or `legacy` |
| Helm changes | `conf/nginx.template.conf.tpl` (node upstream, `/api/`, `@varnish`), `templates/rollout/nodejs.yaml` (env, probes), `templates/configmap/local-settings-file.yaml` (`USE_NODE`) |

Environment variables of the node container in reader mode: `SEFARIA_API_ORIGIN`, `SEFARIA_API_HOST`, `PUBLIC_API_ORIGIN=""`,
`PUBLIC_SITE_ORIGIN=""`, `SEFARIA_PASS_THROUGH=1`, `PORT=3000`, and for sign-in the same public keys Django uses:
`GOOGLE_SSO_CLIENT_ID`, `APPLE_SSO_CLIENT_ID`, `RECAPTCHA_PUBLIC_KEY` (empty = that button / the captcha is not shown). These are not in
the Helm chart yet (`templates/rollout/nodejs.yaml` needs them, from the same values/secrets the web pods use).

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
   `sefaria-node-reader-next` (this client) and `sefaria-asset-reader-next`; `helm.yaml` publishes the prerelease chart.
2. Read the chart version from the workflow's "Get chartVersion" step or the `helm-chart-*` tag it creates.
3. In the cauldrons repository: `./create-cauldron.sh -n reader-next -b reader-next -c <chart version>` (add `-d` to review the
   HelmRelease first). The script's node resources (400Mi limit) are enough.
4. Open `https://www.reader-next.cauldron.sefaria.org/Genesis.1` (this client) and `/topics` (Django through the client). Response
   header `x-served-by: django` marks a passed-through page.

Updating: `git subtree pull --prefix=reader-next ../sefaria-reader main --squash` in Sefaria-Project, then push; the image policy
picks up the new node image. Chart changes need a new prerelease (another `helm:` commit) and `-c` / `repoint-cauldron.sh`.

## Verified locally (2026-10-06)

- `helm template` renders in both modes; `legacy` matches master except one blank line. `nginx -t` passes on the rendered config.
- nginx (rendered config) → client container → stand-in Varnish (proxy to www.sefaria.org): `/Genesis.1`, `/texts` rendered by the
  client; `/about`, `/topics/light`, `/login`, the 404 page passed to Django; `/api/…` straight to Varnish; with the client stopped,
  `/Genesis.1` is answered by Django.
- Locally, `npm start` against `https://www.sefaria.org` can fail TLS inside the macOS sandbox ("unable to verify the first
  certificate"); the container and the cluster (plain http to Varnish) are not affected.

## Before this goes beyond a cauldron

- Canonical and Open Graph URLs need an absolute origin (`PUBLIC_SITE_ORIGIN` is empty on purpose for links).
- Decide whether Django keeps server rendering (a separate legacy node deployment) or accepts client-only rendering for its pages.
- `/texts` is 3.8 MB of HTML (the catalog is written into the page); trim before production.
- Add the cauldron and production hosts to the Adobe Fonts kit `aeg8div`, or the English face falls back.
- `nodejs.mode` must be `legacy` (and `build/node/Dockerfile` the legacy one) on any branch that has not switched.

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
