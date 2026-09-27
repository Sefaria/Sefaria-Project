# Dark-mode screenshot harness

`scripts/darkmode/screenshots.js` screenshots live www.sefaria.org pages rendered with **this
branch's** CSS, client bundle and static files, in light and dark, on desktop and mobile. It can
also pixel-diff two runs. It needs no Django, Mongo or cauldron, and has no dependencies beyond
the repo's Playwright.

## How it works

Every request the page makes is fetched by Node and handed to Chromium through `page.route`.
Chromium never opens a connection of its own, and TLS is always verified: Node trusts
`NODE_EXTRA_CA_CERTS` and uses `HTTPS_PROXY` when `NODE_USE_ENV_PROXY=1` is set. The script
re-runs itself with that flag when a proxy is configured. On the way through:

| Request | Served from |
| --- | --- |
| `/static/css/*` | `--css-dir` (default `static/css`) |
| `/static/bundles/client/client-*.js` | newest `client-*.js` in `--bundle-dir` (default `static/bundles/client`) |
| any other `/static/*` that exists in the branch | the branch (icons, images, JS libs); `--no-local-static` turns this off |
| unpkg React / ReactDOM, cdnjs jQuery / jQuery UI | `node_modules` development builds (the dev bundle needs them) |
| gstatic charts loader | a stub (`TextsPage`'s `Dedication` crashes without `google.visualization`) |
| `/api/strapi/graphql-cache` | an empty payload (no banners or modals) |
| analytics, ads, sign-in SDKs | aborted |
| everything else | www.sefaria.org |

The page HTML is changed for each run:

* `<html data-theme="light|dark">`, plus a `theme` cookie with the same value;
* `<meta name="theme-color">` set to `#181818` on dark runs;
* the branch's `templates/elements/theme_head.html` (if present, `{% comment %}` stripped),
  inserted after the theme-color meta and before any stylesheet, as `base.html` does;
* `<link>`s to `theme-tokens.css` (after `color-palette.css`) and `theme-dark-overrides.css`
  (after `s2.css`), if those files exist in `--css-dir` and the HTML does not already load them;
* `DJANGO_VARS.props.theme`, and `interfaceLang` plus the body class for Hebrew runs;
* with `--render client` (the default), the production SSR markup in `#s2` is replaced by
  `#appLoading`, so the branch bundle renders the app from scratch instead of hydrating
  production markup from production JSX.

## Usage

```bash
npm run build-client        # the bundle under test (static/bundles is gitignored)

# light + dark, desktop + mobile, every default page
node scripts/darkmode/screenshots.js --out /tmp/shots

# the base branch, light only, with the mobile menu open as an extra shot
node scripts/darkmode/screenshots.js --out /tmp/base --themes light --mobile-menu-open

# a few pages, Hebrew interface too
node scripts/darkmode/screenshots.js --out /tmp/he --pages /texts,/Genesis.1 --hebrew

# pixel diff (for example base vs. branch, light): diff PNGs + summary.json
node scripts/darkmode/screenshots.js --compare /tmp/base /tmp/branch --out /tmp/diff --fail-on-diff
```

In the agent containers, point it at the Chromium that is installed there. Never run
`playwright install`:

```bash
export DARKMODE_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

`--help` lists every option: `--css-dir`, `--bundle-dir`, `--repo`, `--out`, `--pages`,
`--themes`, `--viewports`, `--mobile-menu-open`, `--hebrew`, `--base-url`, `--render`,
`--no-local-static`, `--full-page`, `--concurrency`, `--settle`, `--compare`, `--threshold`
and `--fail-on-diff`.

### Pages

The defaults are `/texts`, `/Genesis.1`, `/Genesis.1?lang=bi`, `/Genesis.1.1?with=all` (reader plus
connections panel), `/topics`, `/topics/shabbat`, `/search?q=moses`, `/calendars`, `/about`,
`/login`, `/register`, and `he:/texts`. A `he:` prefix renders a page with the Hebrew interface.
Each default page has a content selector. A shot whose selector never appeared is still written,
but it is flagged `contentReady: false` and counted as a WARN.

### Output

* `<page>__<desktop|mobile>__<light|dark>[__menu].png`
* `manifest.json`, one row per shot, with these fields:
  * `data-theme` and body background at capture time;
  * whether the app and the page content rendered;
  * page errors, HTTP errors and a count of React development warnings;
  * how many requests were served locally and how many remotely;
  * what was injected.

  The exit code is 1 if any page failed to render.
* Compare mode writes `<name>.diff.png` for each changed pair and a `summary.json`. The summary
  lists differing pixels, the ratio and the bounding box for each pair, plus files found in only
  one run. A pixel differs when any channel differs by more than `--threshold` × 255 (default
  0.1). `--fail-on-diff` exits with 2 if any pair differs or a file is missing from one run. The
  diff runs on a canvas in Chromium because the repo has no pngjs or pixelmatch.

### Light-mode regression gate

1. Check out the base and build it.
2. `--themes light --out /tmp/base`
3. Check out the branch and build it.
4. `--themes light --out /tmp/branch`
5. `--compare /tmp/base /tmp/branch --fail-on-diff`

Run base and branch on the same day. Calendar and daily-learning content change daily.

## Limitations (from the agent containers)

* **Voices** (`voices.sefaria.org`) and **www.sefaria.org.il** are blocked. Hebrew is simulated
  on `.org` by patching the interface language and rendering client-side. Static-page bodies
  (for example `/about`) stay in English because their Django templates are production's. There
  are no Voices pages and no sheets: `/sheets/<id>` redirects to Voices.
* **The proxy allows GET only**, so search results never load (search is a POST) and
  `/search?q=moses` shows the no-results state. It also rejects any path containing `;`, so a
  topic's `/api/bulktext` batches that include such a ref fail and some sources are missing.
  `/topics/moses` loses all its sources; `/topics/shabbat` loses a batch below the fold.
* **Anonymous only.** Logged-in pages need a session cookie, which the harness does not have.
* **Server-side changes are not exercised.** The HTML is production's, apart from the injected
  pieces above. The authoritative end-to-end check is the Playwright suite against the `dark`
  cauldron (`e2e-tests/library/theme-toggle.spec.ts`, `e2e-tests/mobile web/theme-toggle.spec.ts`).
