# Reader Next: plan to finish and launch

Written 2026-11-09 for the agent (Opus) that finishes the work. Owner and sign-off for every gate: Akiva Berger.
Read this file fully before touching code, then the documents in §1.3.

**The goal:** real users reading in the new reader, by opt-in, on production, without ever being dropped into the legacy client.
This plan covers everything between today's `reader-next` branch and that point. It does not cover making the new reader the
default or retiring the legacy one (§8).

---

## 1. Start here

### 1.1 Where to work

| | |
|---|---|
| Code | worktree `/Users/akiva/Sefaria/dev/Sefaria-Project-reader-next`, branch `reader-next`, client in `reader-next/` (run npm from there) |
| Never edit | `~/Sefaria/dev/sefaria-reader` (retired), the legacy client `static/js` (no legacy changes during this work) |
| Decisions | `docs/reader-future/DECISIONS.md` (add a row for every decision this plan settles) |
| Feature atlas | `reader-next/docs/features/features.json` + `rebuild-status.json`; rules in `reader-next/docs/HANDOFF.md` §4 |
| Team wiki | `/Users/akiva/Sefaria/sefaria-wiki/wiki/projects/reader-next/` (publish with `scripts/wiki-sync.sh publish` after edits) |

### 1.2 Standing rules (owner's; do not relax)

1. **No way out to the legacy client** from any page an opted-in reader can reach (2026-11-05). Port the page or point the link at a new-reader page.
2. **Parity, but legacy bugs are not ported.** Each deliberate difference gets an atlas note and a `DECISIONS.md` row.
3. **The atlas is the source of truth.** Fix it in the same commit as the code. Look IDs up by name before tagging tests.
4. **Verify against www.sefaria.org with Playwright**, screenshots and computed styles, desktop and phone User-Agent. Never from memory.
5. **Reading never jumps.** Run `e2e/smoothness.spec.ts` after touching the column, fonts, sidebar or layout.
6. **Every URL change goes through the router**; every write carries CSRF and goes to Django.
7. **Ask before** sending real data to Sefaria on a user's behalf, pushing chart changes that affect shared environments, or merging to `master`.

### 1.3 Read next

`reader-next/docs/DEPLOYMENT.md`, `docs/reader-future/TARGET_ARCHITECTURE.md` §6.16, §7, §12, `docs/reader-future/CODE_REVIEW_2026-10-28.md` §6–7,
wiki `_index.md`, `exits-to-legacy.md`, `ref-resolution.md`, and `reader-pre-deploy-test-list.md`.
`reader-next/docs/HANDOFF.md` and `PROGRESS.md` describe early October and are stale except for the working method (HANDOFF §4–6).

---

## 2. Where the work stands (checked 2026-11-09)

- **Branch.** `reader-next` is in step with `origin/reader-next`, 157 commits ahead of `master` and 2 behind. Draft PR #3788 ("DO NOT MERGE"). Three files are modified and uncommitted in the worktree (`reader-next/src/lib/text/queries.ts`, `queries.test.ts`, `plan.test.ts`): the ref-resolution work of 2026-11-02.
- **Open PRs into it.** #3950 dark theme passes axe (CI running). #3981 Ruff and Prettier (CI failed).
- **Size.** 686 source files, 228 test files, 64 stories, 47 e2e specs.
- **What it renders (Library host).** Reader (all text types, multi-panel, sidebar with every reading tool), book pages, `/texts` and categories, `/search` and header autocomplete, `/login`, `/register`, password reset, `/translations/<lang>`, `/calendars`, `/compare`, `/topics…`, `/saved`, `/history`, `/texts/notes`, `/activity/<ref>/<lang>/<version>`, `/interface/<lang>`, the Library Assistant. Follow Me and Recording exist behind labs flags.
- **What it passes to Django.** Everything in `DJANGO_PREFIXES` (`src/lib/routing/django-paths.ts`), the whole Voices host, and every write.
- **Atlas.** 961 features. 447 have a rebuild status: 317 done, 57 partial, 10 todo, 22 deferred, 22 n/a, 19 replaced. **514 have no status at all** (admin-tools 58, sheets 56, search 51, library-nav 33, legacy-pages 28, routing 27, reader-shell 27, connections 25, …).
- **Deployment.** Three chart modes exist on the branch: `legacy`, `reader` (new client replaces the node pods), `optin` (both, split at nginx by the cookie `reader_version=next`; Account Settings has the switch). **The branch's `values.yaml:194` defaults to `reader`.** Cauldrons `reader-next` and `reader-optin` have run. Nothing is on `master`.
- **Voices never reaches the new reader in the cluster.** The Voices nginx server block has no mode branch and proxies `/` straight to Varnish (`helm-chart/sefaria/conf/nginx.template.conf.tpl:306-379`), and nginx answers `/sheets`, `/collections` and `/profile` on www with a 307 to Voices before the reader sees them (`:293-300`). The client's Voices logic (`isVoicesHost`, `LIBRARY_ONLY_PREFIXES`) is exercised only in local dev. The wiki says otherwise.
- **Every miss is a legacy page.** A path the reader does not own, and every reader 404, is handed to Django (`reader-next/src/start.ts:55`), so any dead link or typo drops an opted-in reader into the legacy client. An upstream failure is a plain-text 503.
- **No domain bounce.** Django's `LanguageSettingsMiddleware` moves a reader between sefaria.org and sefaria.org.il by interface language; the reader's pages only write hreflang links.
- **Django changes that live only on this branch.** `/api/topics-toc`, `/api/topics/library-count`, `pools` in the v2 topic answer, `/api/activity/<ref>/<lang>/<version>`, `/api/library-assistant`, `ReaderChoiceMiddleware` + `sefaria/helper/reader_choice.py` + the settings switch, the password-reset resend fix (R-34), the `/healthz` change. On PR #3788 the PyTest, Playwright and sandbox jobs are **skipped**, so none of this Python has run in CI.
- **Never done.** The pre-deploy test list has an empty run log. Compare's Apply Change and the Feedback form have never written to a real Django. CI e2e is not deterministic (review F13).

---

## 3. Scope contract

Two launch stages. Scope is frozen when the owner accepts this plan; anything new goes to §8.

| Stage | Who | What must be true |
|---|---|---|
| **L0 internal opt-in** | Sefaria staff, on production | Workstreams A–E done; gates in §7.1 |
| **L1 public opt-in (beta)** | Any signed-in user who switches it on | Workstreams F–H done; gates in §7.2 |

**Time box.** L0 work is stabilising and shipping what exists: no new features. If an L0 task grows beyond its size, cut it and record it in §8 rather than extend L0. Parity polish (workstream G) ends at the L1 gate; what is left is listed, briefed to Support, and scheduled, not chased.

**Not in this launch** (§8 has reasons): default-on and legacy retirement, the sheet editor, admin and moderator tools that are Django forms, stacked panels and drag (work plan B5), the settings registry (C3), the notice manager (C6), the user-state store (C7), backend counts for connections (Phase D), Follow Me, Recording and the relay, dark mode switched on, tzurat hadaf, `ven`/`vhe` renaming, sefaria.org.il consolidation.

---

## 4. Decisions (accepted by the owner, 2026-11-09)

> **Amended 2026-11-10 (owner):** all work lands on `reader-next`, with no PRs to `master` and no per-lane PRs. D-2 and workstream B
> below are superseded: the Django changes stay on `reader-next`, and `reader-next` → `master` is one later merge. How the work runs
> in parallel: `PARALLEL_PLAN.md`.

**All twelve defaults below were accepted by Akiva on 2026-11-09** and are recorded in `docs/reader-future/DECISIONS.md`. They are settled: build on them. Scope (§3) is frozen from this date; anything new goes to §8.

| # | Decision | Decided | Blocks |
|---|---|---|---|
| D-1 | **Launch topology** | `optin` only. `reader` mode (replace) is not deployed anywhere shared: it turns Django's server rendering off for sheets, topics on Voices and profiles | C |
| D-2 | **How the code reaches production** | Merge to `master` early, switched off (`nodejs.mode: legacy` is the default; the client folder is inert). Backend changes go first as small PRs (workstream B). Do not keep deploying from a long-lived branch | A, B, C |
| D-3 | **Library/Voices host model (Q-E1)** | One app serves both hosts; the module comes from the host in the route context; the Voices shell (header, module switcher) is a variant of the existing shell | F1 |
| D-4 | **Sheets at L1** | Port the **read-only** sheet page, sheets-with-ref, a collection page and the public profile. The sheet **editor** stays Django at L1; "Edit" is a recorded, signed-off exit to an authoring tool | F1 |
| D-5 | **Static information pages** | One mechanism: Django returns the page's content block without its shell; the new reader renders its own header and footer around it (F3). No per-page ports | F3 |
| D-6 | **Explore and Visualizations** (old D3 pages) | Stay Django, open in a new tab, recorded as an accepted exit: they are standalone tools, not the reading client | F2 |
| D-7 | **Text freshness** | Text and catalog are revalidated at most 1 hour after they were fetched (today: text 7 days). Staff always revalidate. See E1 | E |
| D-8 | **Browser error reporting** | Required before any real user. Datadog browser logs/RUM if the org's Datadog plan allows, else a small error beacon to a Django log endpoint. Sentry stays out | D |
| D-9 | **Dark mode at launch** | Flag off. When it is switched on later: default Light, with a Light / Dark / System control (amends 2026-10-28, per Daniel's and Penina's replies in #reader-future) | — |
| D-10 | **Labs** (Follow Me, Recording, relay) | Off in production (`PUBLIC_LABS` unset, remote-config keys absent); the relay is not deployed. Not part of launch QA | C |
| D-11 | **Who signs off L0 and L1** | The owner alone, against §7. Reviewers are invited per area (§9), not as a gate | 7 |
| D-12 | **Opt-in audience at L1** | Signed-in users only (the switch is in Account Settings). Anonymous opt-in and A/B wait for §8 | I |

---

## 5. Workstreams and tasks

`[P]` = can run in parallel with its neighbours. Sizes: S ≤ 1 day, M 2–4 days, L about a week. Every task ends with suites green, the atlas updated, and one commit.

### A. Consolidate the branch (L0)

Acceptance: one branch, everything committed, CI green **including Python**, e2e deterministic.

| ID | Task | Done when | Size |
|---|---|---|---|
| T-A01 | Finish and commit the uncommitted ref-resolution work (`lib/text/queries.ts`: every text answer teaches the ref index; a segment the book shape allows but the server lacks goes to the server). Update wiki `ref-resolution.md` "What was built" | unit + `e2e/routing`, `scroll`, `connections` pass; no uncommitted files | S |
| T-A02 | Land #3981 (lint) and #3950 (dark axe gate): fix the failing CI run on #3981 first | both merged into `reader-next` | S |
| T-A03 | Merge `origin/master` into `reader-next`; port any `static/js` behaviour changes since 2026-11-08 (ask an agent to map the diff to reader-next; method in memory `sefaria-reader-rebuild`) | merge commit; a ported-changes note in the PR | S–M |
| T-A04 | **Deterministic e2e (F13).** Host the API recordings as a versioned bundle (Actions artifact or release asset keyed by a hash), record Dicta, run CI in `replay` | a CI run with the network to sefaria.org blocked passes | M |
| T-A05 [P] | Delete dead branches and worktrees that are fully merged (`reader-next-ports`, `-port-*`, `-signed-in-parity`, `-library-assistant`, `-target-architecture`, `-review-fixes`, `reader-optin`): list them for the owner, delete only on a yes | owner-approved list executed | S |
| T-A06 [P] | Refresh stale docs: `reader-next/docs/ARCHITECTURE.md`, `VENDOR.md`, `HANDOFF.md` (point it at this plan), `PROGRESS.md` (replace with a pointer to `rebuild-status.json`), `DEPLOYMENT.md` (it documents only `reader` and `legacy`). Wiki `_index.md`: the ports are merged; only `?editor=1` topics are Django's; eight Library-only prefixes, not six; Voices is bypassed at nginx; opt-in is on `reader-next`, not only `reader-optin` | docs match code; wiki published | S |
| T-A07 | **Atlas triage of the 514 entries with no status.** One pass: each gets `done / partial / todo / deferred / n/a / replaced` with a note. Admin, sheets-editor, linker and legacy-pages entries are mostly `deferred` (§8). Bugs recorded as `BUG` are `n/a` | `rebuild-status.json` covers all 961; `features:coverage --status` prints the table; the L1 todo list is generated from it | M |

### B. Backend to master first (L0)

Acceptance: `master`'s Django serves everything the client calls, with tests that ran in CI. Each is its own small PR to `master`, opened from a fresh branch, never from `reader-next`.

| ID | Task | Notes | Size |
|---|---|---|---|
| T-B01 [P] | `/api/topics-toc`, `/api/topics/library-count`, `pools` in the v2 topic answer | Ask Noah/Lev whether the topic TOC was kept out of the API on purpose (unpublished topics, size). Tests exist on the branch | S |
| T-B02 [P] | `/api/activity/<ref>/<lang>/<version>` (`segment_history_api`) | Until deployed, the revision-history page 404s into Django | S |
| T-B03 [P] | Password-reset resend fix (R-34) + its tests | Tests need Mongo: CI must run them; they never have | S |
| T-B04 [P] | `/api/library-assistant` + tests | Check with the AI team that the token and eligibility rules match master's banner logic | S |
| T-B05 | Opt-in backend: `ReaderChoiceMiddleware`, `reader_choice.py`, the Account Settings switch behind `READER_OPTIN` (off by default), `/healthz` skipping Node when `USE_NODE` is off | Add: the switch is shown only to staff while a remote-config key `feature.reader.optin.audience` = `staff`; `all` opens L1 | M |
| T-B06 | Content-only rendering for static pages (D-5): a query flag or header that makes `static_pages` templates return only their content block + the list of CSS they need | Pairs with T-F31 | S |
| T-B07 | Create the `expandedRefs_1` index on `sheetsTree` wherever it is missing (cauldron 500 on `with_sheet_links=1`); confirm production has it and how it is created | A migration or documented step | S |

### C. Launch topology and infrastructure (L0)

Acceptance: production runs `optin`; a user with the cookie gets the new reader; without it nothing changes; one switch turns it off for everyone.

| ID | Task | Done when | Size |
|---|---|---|---|
| T-C01 | Chart to `master` with `nodejs.mode: legacy` as default (**the branch has `reader`: flip it before any merge**); `helm template` in `legacy` is byte-identical to today's master (modulo whitespace); `build/node/Dockerfile` on master stays the legacy one, the reader image builds from its own Dockerfile | reviewed chart PR; the DevOps owner agrees | M |
| T-C02 | Reader pods' environment in the chart: `SEFARIA_API_ORIGIN/HOST`, public origins, `GOOGLE_SSO_CLIENT_ID`, `APPLE_SSO_CLIENT_ID`, `RECAPTCHA_PUBLIC_KEY`, GA4/GTM ids, from the same secrets as web (DEPLOYMENT.md says they are not in the chart yet: verify) | sign-in buttons and analytics work on a cauldron installed from the published chart | S |
| T-C03 | **Kill switch.** nginx honours the cookie only while a chart value (or the reader service's health) says so; a remote-config key makes the client clear `reader_version` and reload into legacy. Document the two-minute rollback | rollback rehearsed on a cauldron | S |
| T-C04 | **Shorter path for Django's pages.** For opted-in users nginx sends the known Django prefixes (generated from `DJANGO_PREFIXES` at build time, one source) straight to Varnish; only the rest goes to the reader. Today every settings, editor and static-page request of an opted-in user is proxied through Node, and `/favicon.ico`, `/site.webmanifest`, `/manifest.json`, `/llms.txt` and `.well-known/*` each cost a failed render before Django answers | nginx map generated in CI; pass-through e2e still green | M |
| T-C05 [P] | Cookie and host matrix: `reader_version` scope on `www.sefaria.org`, `voices.sefaria.org`, `www.sefaria.org.il`, `chiburim.sefaria.org.il`; what an opted-in reader gets on each; shared static files stay out of the split | a table in DEPLOYMENT.md, verified on staging | S |
| T-C06 [P] | Sizing and probes: reader pod requests/limits from a load test (anonymous Genesis 1, Berakhot 2a, `/texts`, search) at expected opt-in traffic ×10; readiness/liveness; scale rules; graceful shutdown | numbers in DEPLOYMENT.md; no restart under the test | M |
| T-C07 [P] | Adobe Fonts kit `aeg8div`: add production and staging hosts; decide Q-P2 (self-host if the licence allows) | English face loads on staging | S |
| T-C08 [P] | Absolute origin for canonical and Open Graph URLs (`PUBLIC_SITE_ORIGIN` is empty on purpose for links: add a separate canonical origin) | head tags on staging show `https://www.sefaria.org/...` | S |
| T-C09 | Staging deploy in `optin`, then production with the switch visible to staff only | L0 gate | S |

### D. Observability (L0)

Acceptance: a broken page for a real user is visible to us within minutes.

| ID | Task | Done when | Size |
|---|---|---|---|
| T-D01 | Browser error reporting (D-8): uncaught errors, unhandled rejections, React error boundaries, hydration mismatches; with release id, route kind, signed-in flag; sampled; no text content or user ids beyond what legacy sends | an induced error on staging shows up in the chosen tool | M |
| T-D02 [P] | Server logs in the fields operations already alert on for the legacy Node server (ask Lev which); request id passed to Django; 5xx and pass-through failures counted | Datadog shows reader 5xx rate and p95 render time | S |
| T-D03 [P] | Web-vitals dashboard from the GA4 `web_vitals` event, split new vs legacy reader; targets LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75 on phones | dashboard link in the wiki | S |
| T-D04 | **Analytics parity gate.** The diff harness (work plan B2): the same scripted session on legacy and new, GA4 hits captured and compared (names, parameters, order, `dimension5` page type, which the new shell does not send yet). Confirm the report owner accepts the differences | diff is empty or each line is signed off | M |
| T-D05 [P] | A "Back to the classic reader" control and a "Report a problem" link in the new reader's account menu and phone menu while the opt-in exists. The control does the write itself (profile setting + clears `reader_version`), because today the only switch is on `/settings/account`, a legacy page. Both send an analytics event | visible on every page; switching back needs no legacy page | S |

### E. Correctness risks that come from the new architecture (L0)

Acceptance: the three ways the new design can show wrong content are closed or measured.

| ID | Task | Done when | Size |
|---|---|---|---|
| T-E01 | **Freshness (D-7).** `text` and `catalog` `staleTime` → 1 hour (disk retention unchanged, so first paint stays instant and the refresh goes through Varnish). Staff and moderators: `staleTime` 0. After any write from this client (text edit return via `?next=`, version flags, link add/remove, lexicon edit, topic edit) invalidate the matching queries and their disk entries | test: edit a segment in Django, return, the new text shows without a hard reload; a second browser shows it within the hour | M |
| T-E02 | **Ref torture corpus.** Take the server's own ref test cases (`sefaria/model/tests/ref_test.py` and the tricky list in wiki `consultation-questions.md`: complex schemas, default nodes, alt structures, commentary ranges, amud ranges, Hebrew refs, titles with `/`). For each: the new reader lands on the same canonical URL and highlights the same segments as www.sefaria.org | an e2e/parity script with the corpus; every difference fixed or recorded | M |
| T-E03 [P] | **History rules.** A non-canonical, multi-section or whole-chapter ref is rewritten to its canonical section by *replacing* the history entry, never adding one; Back never walks verse by verse. Sidebar open below ~1075 px window width does not move the text | `e2e/history.spec.ts` cases added | S |
| T-E04 [P] | **Storage on real browsers.** iOS Safari (it evicts script-written storage after 7 days without a visit), private windows, storage-full: the reader works with IndexedDB missing, throwing, or empty mid-session; the 150 MB budget holds on a phone | Playwright WebKit run + one real iPhone pass; notes in the pre-deploy list | M |
| T-E05 [P] | **Signed-in state across the two clients.** Sign in, out and switch accounts in one client, then load the other: header, saved, history and preferences agree; signed-in pages are never served from a shared cache | e2e on a cauldron in `optin` | S |
| T-E06 | Run the two writes that have never run: Compare's Apply Change and Feedback, once each on staging, with the owner's go-ahead | results in the run log | S |
| T-E07 [P] | **Domain and interface language.** Reproduce what `LanguageSettingsMiddleware` does for a page request (sefaria.org ⇄ sefaria.org.il by interface language, cookie, bots pinned by domain) in the reader's server, or have nginx send the first request of a session through Django. Verify on staging with both domains | an opted-in Hebrew-interface reader lands on the same domain as in legacy, for every route kind | M |
| T-E08 [P] | Legacy URL forms the reader claims because the first segment is a ref: `/<ref>/<lang>/<version>` (`old_versions_redirect`), `/<Category>` titles such as `/Tanakh`. Add them to the T-E02 corpus | same redirect target as www.sefaria.org | S |

### F. Close the ways out (L1)

Acceptance: a crawl from every new-reader page, signed in and signed out, desktop and phone, finds no same-site link answered by Django except the recorded exits in D-4 and D-6. The crawl (method in wiki `exits-to-legacy.md`) becomes a CI check with an allowlist.

**F0. Mechanics**

| ID | Task | Size |
|---|---|---|
| T-F01 | Turn the 2026-11-05 crawl into `scripts/exits-crawl.mjs` + an allowlist file; run it signed in as well (the first crawl was signed out) | M |
| T-F02 [P] | Absolute `${SITE_ORIGIN}/…` links to relative, so they navigate inside the app (topics from the sidebar, book page, autocomplete, named-entity popup; header `/texts`, `/topics`) | S |
| T-F03 [P] | Version source "links" that are not addresses render as plain text (deliberate difference from legacy) | S |

**F1. Voices pages (needs D-3, D-4). Largest item of the launch.**

| ID | Task | Done when | Size |
|---|---|---|---|
| T-F10 | Module in the route context: host → `library` / `voices`; Voices shell (header, module switcher, footer, Hebrew host `chiburim.sefaria.org.il`, which `ConnectionsPane.tsx:242` hard-codes today); `LIBRARY_ONLY_PREFIXES` replaced by a per-module route table. **nginx:** give the Voices server block the same cookie split as www (it bypasses the reader today), keep the www 307s for `/sheets`, `/collections`, `/profile`. Fix `/` on a Voices host (the client would 302 it to `/texts`) | an opted-in reader on voices.* gets the new reader for ported pages and Django for the rest; Library pages asked for on Voices behave as on voices.sefaria.org, verified per route | L |
| T-F11 | **Sheet page, read-only** `/sheets/<id>[.<node>]`: all source types (ref, outside text, bilingual outside text, comment, media, section headers), sheet metadata, author, topics, collections it is in; ref links open the reader; SSR; head tags; noindex rules as live; private/unlisted sheet permission answers. Atlas SHV-001…013, 017, 024, 026 | parity script on 20 real sheets, desktop and phone | L |
| T-F12 | Sheet actions that do not need the editor: save, share, copy, add a sheet's source to my sheet, print view. "Edit" and "New sheet" go to Django (recorded exit, D-4) | atlas SHV-011, 018…023 statused | M |
| T-F13 [P] | `/sheets-with-ref/<ref>` list (the sidebar's "Sheets (n)" link) | parity on Genesis 1:1 and Berakhot 2a | M |
| T-F14 [P] | Collection page `/collections/<slug>` read-only (contents, description, pinned sheets, members list); editing stays Django | parity on three collections | M |
| T-F15 [P] | Public profile `/profile/<slug>` read-only (sheets, collections, followers; follow/unfollow write); profile editing stays Django | parity on two profiles, own and someone else's | M |
| T-F16 | Voices home and listing pages an opted-in reader reaches from the module switcher: decide per page from the crawl (port, or the switcher link becomes the recorded exit to the Voices product). Default: port only what the sheet, collection and profile pages link to | crawl allowlist reviewed by the owner | M |

**F2. Library pages still Django's** (all `[P]`)

| ID | Page | Reached from | Size |
|---|---|---|---|
| T-F20 | `/notifications` list + the header's unread count. The new header has **no** notifications link at all, so this is a missing feature rather than an exit | signed-in header on legacy | M |
| T-F21 | `/torahtracker` | account menu | S |
| T-F22 | `/updates` (New Additions) | account menu, signed-out menu | S |
| T-F23 | `/settings/account`: stays a Django form at L1, but opens with a way back; the opt-in switch also lives in the new reader's menu (T-D05). Record as an accepted exit, or port the page if the crawl shows it traps the reader | account menu | S |
| T-F24 | `/explore`, `/visualizations`, `/visualize/…`: new tab, allowlisted (D-6) | library sidebars | S |
| T-F25 | Site-wide and per-user `/activity`, leaderboard: remove the links or port the list (the revision-history page already exists) | history lists | S |
| T-F26 | Redirects answered by the reader's server instead of a Django round trip: `/people`, `/person/<name>` (to topics; `SearchPage.tsx:411` links `/people`), `/my/notes` (to `/texts/notes`), `/texts/recent`, `/random`, `/community`, `/contributors/<uid>`. `/topics/…?editor=1` stays Django for moderators (recorded) | search, topic pages, old links | S |
| T-F27 | Editors that return with `?next=` (`/edit/…`, `/translate/…`, `/add/…`, `/admin/reset/…`): keep Django, verify each returns into the **new** reader and that T-E01 refreshes what changed | sidebar, book page | S |
| T-F28 | The new reader's own 404 page, served for every miss once Django has also said 404 (keep the hand-off for paths Django does own), and a real error page in place of the plain-text 503 | any bad URL, any dead link | S |

**F3. Information pages** (needs D-5, T-B06)

| ID | Task | Size |
|---|---|---|
| T-F31 | One `static-page` route: server-fetch the content block from Django, sanitise, render inside the new shell with the page's CSS; covers all 46 `static_pages` in `sites/sefaria/urls.py:10-56` plus `/about` and `/ways-to-give` (served by language) and `/digitized-by-sefaria`. The ones linked from the new reader today: `/about`, `/terms`, `/privacy-policy`, `/ways-to-give`, `/newsletter`, `/products`, `/educators`, `/mobile`, `/torah-tab`, `/linker`, `/ai`, `/mobile-about-menu`, `/digitized-by-sefaria`, `/william-davidson-talmud`, `/shraga-silverstein` | M |
| T-F32 | Check each page for inline scripts and forms (newsletter sign-up, donate widgets, Unbounce); port the few that need behaviour as small components | M |

### G. Parity polish in what is already rendered (L1)

Acceptance: every `partial` and `todo` in the areas the new reader renders is `done` or moved to §8 with a note; the parity scripts pass on the matrix.

| ID | Task | Size |
|---|---|---|
| T-G01 | Work the generated list from T-A07: 57 partial + 10 todo first, then new `todo`s from the triage. One commit per feature, the per-feature loop of HANDOFF §5 | L |
| T-G02 [P] | Hebrew interface shell: header labels ("טקסטים" vs "מקורות"), search box; run every parity script with the Hebrew interface cookie | M |
| T-G03 [P] | Library and reader modules that depend on other systems: Recently Viewed (3 books, no sheets), the daily dedication (live Google Sheet), sidebar promotions/ads with page-type and donor targeting, Strapi banners and modals, newsletter sign-up, Guided Learning in the Resources bundle (it disappears silently if dropped). Minimal CMS reader: enough for parity, not the notice manager | L |
| T-G04 [P] | Signed-in gaps: per-item save button on `/saved`, Add to Sheet on a note, partial word selection in Add to Sheet, the image guard, private sheets in the Sheets count | M |
| T-G05 [P] | Reader details: verse numbers readable (reported as too small: an accessibility requirement), manuscript image in bilingual shows the translation's image only, download offered for public-domain versions only, siddur display options, dictionary search box in the TOC, segment-number collisions in continuous layout, Zohar paragraph offsets | M |
| T-G06 [P] | Topic pages: `dimension5`, `data-anl-*` on landing modules, synthetic vs real bold line breaks (accept and record) | S |
| T-G07 | Full parity run: `parity-text`, `parity-shots`, `parity-book`, `parity-library`, `parity-search`, `parity-page`, `parity-header-states` × {English, Hebrew interface} × {desktop, phone UA} × {signed out, signed in, moderator}. Results table committed | M |
| T-G08 | Accessibility: axe on every route kind in both languages; keyboard pass on reader, sidebar, search, sheet page; screen-reader smoke on the reader | M |

### H. Performance and the pre-deploy list (L1)

| ID | Task | Done when | Size |
|---|---|---|---|
| T-H01 | Run the whole pre-deploy list (SB-01…09) on staging and fill the run log; legacy numbers beside ours | every row has a number | M |
| T-H02 | Fix what SB-02 and SB-03 already say fails: the sidebar must not leave a 504 as an endless spinner, and Resources must not download the links a second time (`/api/related` after `/api/links`) | SB-02, SB-03 pass their proposed thresholds or the owner changes the threshold | M |
| T-H03 [P] | Split the `$` route by page kind (reader vs book page) so each hydrates with its own chunk; the two attempts that failed are described in CODE_REVIEW §6 | reader JS before interactive drops; smoothness spec green on a production build | M |
| T-H04 [P] | CI budgets at today's measured values (JS, CSS, hydration, TTFB on the Pixel 7 profile), failing on regression | budget job in `reader-next-client.yaml` | S |

### I. Rollout

| ID | Step | Gate |
|---|---|---|
| T-I01 | Preview early: keep a cauldron in `optin` current from the first week and post it in #reader-future with what changed | — |
| T-I02 | L0: staff opt-in on production. Two weeks minimum. Error rate, web vitals and "Back to classic" clicks reviewed twice a week | §7.1 |
| T-I03 | Support brief before L1: what the beta is, how to switch back, the known differences list (generated from the atlas's deliberate differences and §8) | Support has it a week before |
| T-I04 | L1: the switch visible to all signed-in users; an announcement only after a quiet first week | §7.2 |
| T-I05 | After L1: weekly review of the three numbers; follow-up fixes each get an owner and a date in §8, not "later" | — |

---

## 6. Order of work

1. **Now, in parallel:** A (all), B01–B04, D-decisions to the owner.
2. **Then:** B05–B07, C01–C08, D01–D05, E01–E06 → **L0 (T-C09, T-I02)**.
3. **While L0 runs:** F0, then F1 (start with T-F10; T-F11 is the long pole), F2 and F3 in parallel lanes, G and H alongside.
4. **L1** when §7.2 holds.

Parallel lanes that never touch the same files: {F1 Voices}, {F2 small Library pages}, {F3 static pages}, {G polish in reader/library}, {H performance}. Use one worktree and one integration branch per lane, as the 2026-11-04 ports did, and merge into `reader-next` through the lane review.

---

## 7. Launch gates

### 7.1 L0 (staff opt-in on production)
- [ ] `reader-next` merged to `master` (or deployed from a release branch cut from master, D-2), CI green including PyTest and the reader client workflow in `replay`.
- [ ] All workstream B PRs deployed to production Django.
- [ ] Production in `optin`; kill switch rehearsed (T-C03); staging soak of three days with no reader 5xx above legacy's rate.
- [ ] Browser errors and server metrics visible (T-D01, T-D02); analytics diff signed off (T-D04).
- [ ] T-E01…E06 done. The ref corpus has no unexplained difference.
- [ ] "Back to the classic reader" works from every page.

### 7.2 L1 (public opt-in)
- [ ] Exits crawl green with only the D-4 and D-6 allowlist, signed in and out, desktop and phone, English and Hebrew interface.
- [ ] `rebuild-status.json` has no `todo` in rendered areas; every `partial` has a note the owner has seen.
- [ ] Parity run (T-G07) and accessibility run (T-G08) committed.
- [ ] Pre-deploy list run; web vitals at p75 on phones no worse than legacy for opted-in staff, LCP better.
- [ ] Two weeks of L0 with no data-loss or wrong-text report open.
- [ ] Support briefed; known-differences list published.

---

## 8. Not in this launch (register)

Owner is **unassigned** unless named. Nothing here is rejected; it is sequenced after L1.

| Item | Why it waits |
|---|---|
| Default-on for everyone, A/B, anonymous opt-in, legacy retirement | Needs: anonymous HTML caching (Q-E8), full SEO head builder (canonical, hreflang, JSON-LD, sitemaps check), sefaria.org.il and bot handling, the sheet editor, load at full traffic |
| Sheet editor, new sheet, collection editing, profile editing | Needs the editor framework decision (Q-E3). Largest remaining area (29 features) |
| Admin and moderator Django tools (modtools, linker admin, index and version editors, topic editor page) | Recommendation stands: keep in Django (Q-E7) |
| Stacks, drag, `layout=`, resizable dividers (B5); settings registry (C3); notice manager (C6); user-state store and cross-device Continue Reading (C7) | Not parity. The seams exist; building them now adds surface to a client with no production users |
| Per-section counts and a leaner `/api/related` (Phase D); whether to keep the dots | Backend work with its own review; dots stay at launch (parity). Product has not decided |
| Follow Me, Recording, the Cloudflare relay | Labs; off (D-10) |
| Dark mode switched on | Product has not prioritised it; default must change first (D-9) |
| `ven`/`vhe` → source/translation names | Needs server redirects for old links (Yishai) |
| Tzurat hadaf view, docked sidebar, word pop-up, learning-workspace features, the separate POCs (Copy Tool, NG Mobile Web, Library Next, Siddur Nusach) | Product directions, each its own decision |
| Linker, embeds, share images | Stay Django-served |
| A second analytics system beside GA4 | Raised in #reader-future (Daniel, Sarah); separate project |

---

## 9. People to consult (not gates)

| Area | Who | Ask |
|---|---|---|
| SSR, pass-through, sidebar, analytics, topics API | Noah | T-B01; analytics events that feed real dashboards; whether anything relied on the browser-only render fallback |
| Caching, catalog, name API as route authority, Node logs | Lev | T-E01 lifetimes; `is_ref` cost under load; which log fields alert |
| v3 texts, versions, sign-in, Ref API behind Varnish | Yishai | version fallback when a requested version is missing; ref corpus sources |
| Chart, nginx, rollout | DevOps owner | T-C01, T-C03, T-C04 |
| GA4 reports | whoever owns them (ask Yitzhak/Daniel) | T-D04 sign-off |
| Product: sheets scope, Hebrew shell, dark mode default | Penina, Sarah, Daniel | D-4, D-9 |
| Support | Rachel | T-I03 |
