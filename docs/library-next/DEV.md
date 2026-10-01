# Library Next — dev harness

Runs the SPA end to end without Django, Mongo or Node SSR: a small Node server serves the shell and
the built bundle, and proxies the data layer to a live Sefaria. Used by hand, by the headless smoke
test, and by the `qa` agent's Playwright runs.

```
npm run build-library-next          # or watch-library-next in another terminal
npm run library-next-dev            # Library Next dev harness  http://localhost:8787
```

Open http://localhost:8787/ , `/Genesis.1`, `/texts`, `/topics/moses`, `/search?q=light`, `/my`.
Pick the interface language with `?lang=he` / `?lang=en` (also stored in the `interfaceLang` cookie, as
Django does) or the header toggle (`/interface/hebrew?next=…` is emulated).

| | |
|---|---|
| `PORT` | default `8787` |
| `UPSTREAM` | default `https://www.sefaria.org`; e.g. `https://mf3.cauldron.sefaria.org` |
| `HTTPS_PROXY` | honoured for all upstream calls: a CONNECT tunnel built with core `http`/`tls` (no proxy libs) |
| `NODE_EXTRA_CA_CERTS` | CA bundle for the proxy; `/root/.ccr/ca-bundle.crt` is picked up automatically when present |
| `CDN=1` or `?cdn=1` | add the Google Fonts / Typekit links (off by default so the page is self-contained offline) |
| `CHATBOT_API_BASE_URL` | passed through in `DJANGO_VARS.props.chatbot_api_base_url` |
| `CHATBOT_USER_TOKEN` | optional encrypted user token → `chatbot_user_token`; the dock then loads the widget script from the API host and chats (see ASSISTANT.md) |

What the harness serves:

- `/` and any other GET page path → the shell: a hand-written equivalent of
  `templates/library_next/app.html` with anonymous `DJANGO_VARS.props` (`_uid: null`, `interfaceLang`,
  `activeModule: "library"`, `path`, `route: "dev"`, `libraryNext: true`). The bundle file name comes
  from `node/webpack-stats.client-library-next.json`.
- `/vendor/react.js`, `/vendor/react-dom.js`, `/vendor/jquery.js` → the UMD builds in `node_modules`
  (what the production CDN tags load), so no CDN is needed.
- `/static/bundles/client-library-next/*` and any `/static/*` file that exists locally → from the
  worktree; other `/static/*` → upstream.
- `/api/*`, `/_api/*`, `/searchapi/*`, `/data*.js`, `/site.webmanifest` → upstream, anonymous
  (cookies stripped). `/data*.js` (~9 MB) is cached in memory for the life of the process.
- `POST`/`PUT` to `/api/*` are proxied too; anything else non-GET gets 405.

Checks:

```
curl -s 'http://localhost:8787/api/texts/Genesis.1?context=0' | head -c 200   # JSON from upstream
curl -s 'http://localhost:8787/texts?lang=he' | grep -o '<html[^>]*>'          # dir="rtl"
npm run library-next-smoke                                                      # headless Chromium
```

`dev/smoke.js` starts its own harness on a free port, opens `/`, `/Genesis.1`, `/texts` and
`/texts?lang=he` in Chromium, and fails on any console error, uncaught page error or failed
request (font CDNs excepted), on a wrong `dir`, a missing header/search/dock, or onboarding not
opening; it then picks a persona and checks the chip. It uses Playwright's own Chromium when
installed, else the newest build under `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`);
`CHROMIUM_PATH` overrides. `SMOKE_URLS="/a,/b"` runs other pages (ltr, no heading check).

Limits: everything is anonymous (no login, no profile sync — the SPA fakes those in
`localStorage` by design); analytics and Sentry are off; `last_cached` is null so `/data.js` is
loaded without a cache key.
