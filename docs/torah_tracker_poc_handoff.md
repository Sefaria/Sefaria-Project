# Torah Tracker POC: handoff notes

Working notes for continuing the Torah Tracker proof of concept in a new session. The code on this
branch is the source of truth; this file explains where things are and what's still open.

## Branches

| Branch | What's on it |
|---|---|
| `miguel` | The POC. `master` plus: Parsha header link, Torah Tracker "Previous Year" fix, "View as Ploni" demo + mock data, the new dashboard, sticky filter bar, year picker. No PR yet. |
| `claude/gallant-davinci-ffo4tj` | One-command local Docker setup: `dev_docker/setup_local.sh`, `dev_docker/local_settings.py` (Redis caches, localhost cookie fix, renamed recaptcha check), README section, `/dump` in `.dockerignore`. Not on `miguel` on purpose. No PR yet. |

Push POC work to `miguel` only. The designated Claude branch holds only the local-setup tooling.

## How the product owner runs it

- Mac, Docker Desktop, repo at `~/Sefaria-Project`, checked out on `miguel`, local site at http://localhost:8000.
- They don't run commands beyond one-time pastes and can't run Claude on their Mac (different account), so changes reach them by **pushing to `miguel`**.
- A sync loop runs in a terminal tab: every 60s it fetches `origin/miguel`, fast-forwards, runs `npm ci` when `package-lock.json` changed, then `npm run build-client`, and prints `Updated HH:MM:SS: <commit subject>`. Python changes reload by themselves; after CSS changes they need Cmd+Shift+R.
- Don't expect them to edit files in that folder (the loop only fast-forwards).
- Their `sefaria/local_settings.py` is the one from `dev_docker/local_settings.py` on the Claude branch.

## Torah Tracker architecture (on `miguel`)

- **Page:** `static/js/UserStats.jsx` (route `/torahtracker`). Observable Plot for charts, d3 v7 for the sunburst (both added to `package.json`). Styles at the end of `static/css/s2.css`, scoped to `.torahTracker`.
- **Data:** `GET /api/torah_tracker/<uid|ploni>` → `sefaria/helper/torah_tracker.py`. Returns the reader's history as compact rows `[epoch, ref, book, sidebar 0/1, lang]` (most recent 20,000) plus per-book metadata (categories, Hebrew title, compDate, era, commentator `partner`/`hePartner`, `base`, `chapters`). Own uid, staff for anyone, `ploni` when the demo is on. All aggregation is client-side.
- **Filters** (shared by every chart): time (All years / year picker, month via chart clicks), library path (breadcrumb; category › … › book › chapter), study partner. Commentary rows also match the library filter through their base text (`basePath`), so "Torah with Rashi" works.
- **Charts:** stat tiles, insights, learning-over-time line (click to zoom), category small multiples, multi-year calendar heatmap + day detail, library sunburst, study partners (Hebrew-initials avatars + year matrix), Tanakh 929-chapter map, composition-era dot plot, weekly rhythm punchcard, language mix, top passages. Every card has a table view.
- **Colors:** Sefaria's category colors fail colorblind separation as a chart palette, so category marks are always labeled or faceted. The sequential teal ramp (`#86bcc5 → #003f4d`) and language colors (`#2a78d6`, `#eb6834`, `#1baf7a`) pass the dataviz validator.

## "View as Ploni" demo

- `sefaria/helper/torah_tracker_demo.py`: Ploni is uid `-1` with no Django account. His history is seeded into `user_history` on first use and re-seeded when a week stale, shifted by whole weeks so his newest reading lands in the current week. His category trends are computed directly.
- `data/ploni_mock_data.json`: 3,689 records derived from a real production history with the user id and all sheet views removed and dates shifted by whole weeks. Committed with the product owner's explicit approval. Never commit the original export.
- Enabled only when the request host matches `TORAH_TRACKER_DEMO_HOSTS` (`localhost`, `127.0.0.1`, `.cauldron.sefaria.org`) **and** the data file exists; off for sefaria.org, sefaria.org.il and staging.

## Bug found along the way

- The Torah Tracker "Previous Year" window used Halifax local time against UTC history and was frozen at server start, so new readers always saw "haven't seen you in a while." Fixed in `sefaria/model/trend.py` (commit `8b93069` on `miguel`). Filed as Shortcut sc-47414, linked to the user report sc-43389.
- The weekly `trends` cron (fills the category charts) is `enabled: false` in the chart defaults and preprod. Prod values live outside this repo; worth checking.

## Open items

1. **Cauldron:** open a PR from `miguel` to `master` (a draft is fine) so CI builds the images, then run `./create-cauldron.sh -n miguel -b miguel` in `Sefaria/cauldrons`. The product owner's GitHub account has only read access to that repo, so someone with Write access has to run it (or grant access). The URL would be https://www.miguel.cauldron.sefaria.org.
2. Consider separate PRs to `master` for the "Previous Year" fix and for the local Docker setup.
3. Dashboard follow-ups: Hebrew interface strings (English only so far), a mobile pass, lazy-loading Plot/d3 (they're in the main client bundle), SSR with `USE_NODE` untested (Node can import both libraries), the old `/api/user_stats` endpoint is no longer used by the page.
4. Commentator portraits: only Rashi has a Sefaria topic image (a script sample); medieval commentators have no authentic likenesses. The page uses Hebrew-initials avatars; topic images could replace them where they exist.

## Reproducing the local site in a Claude cloud sandbox

The sandbox differs from a normal machine:

- Start Docker yourself with `nohup dockerd &`; the container gets recycled, so restart dockerd and `docker compose up -d db postgres cache web` whenever the daemon is gone.
- `deb.debian.org`, Wikimedia and Google's CDNs are blocked. Build the web image from `python:3.12-bookworm` with the apt line dropped, copy the proxy CA (`/root/.ccr/ca-bundle.crt`) into the build context, and build with `--network host` plus `HTTPS_PROXY`.
- `npm install` in `node:20` also needs `--network host`, `HTTPS_PROXY`, `npm_config_https_proxy` and `NODE_EXTRA_CA_CERTS`.
- Data: stream `https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz`, skip `webpages*`, then `mongorestore`. The disk is tight (the dump is about 12 GB unpacked).
- Playwright: use `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`, and stub `window.google` and `window.WebFont` so pages render without the blocked scripts.
- Google reCAPTCHA can't be reached, so create test accounts with `POST /api/register/` (`mobile_app_key=MOBILE_APP_KEY`, `password1` and `password2`).
