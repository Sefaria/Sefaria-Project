# The future reader: target architecture

One document that says how every decided, proposed and wished-for feature of the future reader fits together. It integrates:

- the spec in this folder (29 areas, `DECISIONS.md`, `CROSS_CUTTING.md`);
- the seven open pull requests into `reader-next` (#3818, #3821, #3822, #3826, #3870, #3907 and the POC #3892);
- the owner's decisions of 2026-10-28 on the seven product questions those PRs left open (§2);
- an audit of the code as it is: `reader-next/` at `837d585`, the legacy client on `master`, and the backend pieces both use.

Status words are the spec's: **decided** (an owner decision), **proposed**, **idea**. "Built" means it is in `reader-next/` today.
Where this document and the code disagree, the code wins; fix this document.

**Contents**

1. [Fixed points](#1-fixed-points)
2. [Decisions of 2026-10-28](#2-decisions-of-2026-10-28)
3. [System context](#3-system-context)
4. [A page request, end to end](#4-a-page-request-end-to-end)
5. [Client layers and rules](#5-client-layers-and-rules)
6. [Subsystems](#6-subsystems)
7. [Area by area](#7-area-by-area)
8. [Future functionality register](#8-future-functionality-register)
9. [Aliyot: verification](#9-aliyot-verification)
10. [Work plan](#10-work-plan)
11. [State of the work: audit for continuous work](#11-state-of-the-work-audit-for-continuous-work)
12. [Open questions that remain](#12-open-questions-that-remain)

---

## 1. Fixed points

These do not move without a new owner decision. Every subsystem below is designed around them.

| # | Rule | Source |
|---|---|---|
| F1 | **The URL is the reader state.** Legacy URLs are read and written byte for byte as sefaria.org writes them (`p2=`, `w2=`, `lang=`, `ven=`/`vhe=`, `with=`, `aliyot=`…). | Decided 2026-10-06; tenet 3 |
| F2 | **TanStack Router is the state layer.** Other applications must be able to change reader state easily, and every event the legacy reader listens to keeps its effect. | Decided 2026-10-28 (#3907) |
| F3 | **Server-rendered first paint.** The node pods answer page requests first; text is in the SSR HTML; the server render seeds the client cache. Django's pages, every write and our own 404s pass through to Varnish. | Decided 2026-10-06; tenet 7 |
| F4 | **Analytics parity.** Same tags, same GA4/GTM property, same event names and parameters, same `data-anl-*` data tag, same page views. The GA4 data stream must not change. | Decided 2026-10-06, extended 2026-10-28 |
| F5 | **Dark mode** is a supported feature on desktop and mobile. | Decided 2026-10-28 |
| F6 | **Local library cache** is the backbone: TanStack Query + IndexedDB per query, section-granular texts. | Tenet 1 |
| F7 | **The server is the source of truth.** Writes are plain requests plus cache invalidation; no CRDTs, no live sync. | Tenet 2 |
| F8 | **Every book type is first class**, driven by index metadata, never by titles (except recorded legacy special cases). | Tenet 4 |
| F9 | A citation in the text closes what is next to its panel and opens there. A sidebar belongs to the panel that opened it. | Decided 2026-10-06 |
| F10 | English text in Adobe Garamond Pro; Hebrew search merges Dicta. | Decided 2026-10-06 |

---

## 2. Decisions of 2026-10-28

The owner answered the seven questions in §F of the consolidation (`READER_FUTURE_CONSOLIDATION.md`). These are recorded in
`DECISIONS.md`; post them as `Decision:` messages in #reader-future so the channel record matches.

| # | Question | Decision | Architecture consequence |
|---|---|---|---|
| D1 | Real-user monitoring and targets | **Google `web-vitals` (attribution build) reporting LCP, INP, CLS to GA4, plus Sentry tracing at a low sample rate.** Targets: Core Web Vitals "good" at p75 on real phone sessions (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1); CI lab gate on a Pixel 7 profile, 4× CPU, slow 4G. **Condition: the existing GA4 data stream stays exactly the same.** | Vitals are sent as one *additional* event (`web_vitals`) through the same `gtag` already loaded; no new `config` call, no change to existing events, page views or parameters; sampled by remote config (§6.5). The parity launch gate (§6.10) diffs the stream with and without vitals. |
| D2 | VWO, Hotjar, Unbounce | **VWO and Hotjar load according to remote-config attributes**, and remote config itself must be kept working (§6.5). **Unbounce loads only on the pages that use it.** | A runtime-config read in the node server; one client-visible config object; a third-party script registry that decides per page type. Legacy `base.html` reads the same keys so one switch controls both clients while they coexist. |
| D3 | Dark mode | Accepted: follow the device by default, with a Light / Dark / System control; drop sepia at launch; every page the new client renders; cookie + profile; content with its own colours shown on a light "paper" surface. **Plus: dark mode is behind a feature flag and can be switched on and off.** | Flag in remote config (§6.5); when off, the control is hidden and the theme is forced light without losing the reader's stored choice. Theme resolved on the server (no flash). |
| D4 | Integrations | Accepted: honour `replaceHistory`; keep "a ref closes all panels" at launch with optional panel targeting in versioned commands; no cross-origin `postMessage` at launch; reader team owns the interface and its contract test, AI team the chatbot side; re-read preferences on focus while `/settings` is Django. | §6.12. |
| D5 | Preferences | Accepted: legacy precedence at launch; stop persisting location guesses as choices now; new profile keys only content language and theme; sign-in merge fills empty profile fields, profile wins; preference cookies on `.sefaria.org`. | §6.4. |
| D6 | Sidebar model and word lookup | Accepted: parity at launch (segment click opens the sidebar); build the seams now; test the new model on a cauldron; desktop gesture double-click; phone gesture open. | §6.2, §6.3. |
| D7 | POC behaviours | Accepted: adopt stacks + `layout=`, resizable dividers, drag with keyboard equivalent, stable panel ids, phone rule; bookmarks-with-layout folded into the user-state store; right-click menu, focus mode and definition card stay experiments. | §6.2, §6.8. |
| D8 | Aliyot | Verify that aliyot work. | §9. |

---

## 3. System context

```
                         ┌──────────────── other apps ────────────────┐
                         │ Library Assistant (<lc-chatbot>) · /settings│
                         │ (Django) · sheet editor · Voices · embeds   │
                         └───────────────┬─────────────────────────────┘
                         sefaria:* events │  window.sefariaReader (versioned)
                                          ▼
 Browser ── Cloudflare ── nginx ──┬── /            ─► node pods: reader-next (TanStack Start SSR)
                                  │                    │  own routes ─► render
                                  │                    │  Django paths, writes, own 404 ─► pass-through
                                  │                    ▼
                                  ├── /api/*       ─► Varnish ─► Django web pods ─► MongoDB · Postgres · Redis · ES
                                  └── /static/*                     │
                                                                    └─► Celery (search index, linker, LLM, CRM, email)
 Third parties (browser): GTM · GA4 · Simple Analytics · Sentry · VWO* · Hotjar* · Unbounce*   (* = remote-config gated)
 Runtime config: Postgres RemoteConfigEntry ─► Django process cache ─► GET /api/remote-config ─► node TTL cache ─► page
```

What lives where, for good:

| Concern | Owner | Notes |
|---|---|---|
| Texts, indexes, links, topics, sheets, users | Django + Mongo | Unchanged. New read endpoints only where the client needs a cheaper shape (§6.7). |
| Accounts, sessions, admin, Remote Config, Guides, Chatbot config | Django + Postgres | Unchanged. Sign-in UI is ported (built); the session is Django's allauth. |
| Page rendering for ported areas | node (reader-next) | Grows area by area; everything else passes through. |
| HTTP caching | Varnish (+ Cloudflare for static) | API responses; node pages are not cached by Varnish today (decide in §12). |
| Runtime flags | Remote Config (Postgres) | The single runtime switchboard for both clients (D2, D3). |

---

## 4. A page request, end to end

```
GET /Genesis.1.1?lang=bi&with=Rashi
 1  nginx ─► node
 2  pass-through check: Django prefix or non-GET? ─► Varnish, done
 3  root beforeLoad (server):
      resolveRuntimeConfig()        remote config, TTL-cached in the node process (§6.5)
      resolvePreferences(req)       interface, content language, translation language, versions, theme, … with sources (§6.4)
      resolveViewer(req)            signed-in? (allauth session) — only when the route needs it
 4  route loader: parse URL ─► Workspace {panels, layout} ─► per panel: text section(s) + index in parallel (cache first)
 5  render: head (meta, theme, fonts, analytics + gated third-party scripts) · body (text in HTML, data-anl-* attributes)
 6  dehydrate: TanStack Query cache + router context (prefs, runtime config's client part) into the page
 7  browser: data tag listens on document (before hydration) · hydrate · integration layer drains its queue
 8  after hydration: web-vitals, Sentry (rates from runtime config), idle prefetch of next/prev sections
```

Budgets that gate this path (D1): TTFB, JS, CSS and hydration time in CI; LCP / INP / CLS from the field.

---

## 5. Client layers and rules

```
src/routes/        thin: parse URL ─► load via cache ─► render a feature
src/features/      composition: reader, workspace, shell, search, library, book, auth, (later) topics, sheets, profile…
src/ui/            component library, Storybook-catalogued; receives display data, never settings or API shapes
src/lib/
  integration/     NEW  commands in, state out; legacy event adapters (§6.12)
  runtime-config/  NEW  remote config read + flags + third-party registry (§6.5)
  preferences/     NEW  resolvePreferences / savePreference / resolvePanelVersions (§6.4)
  settings/        NEW  defineSetting registry ─► resolveSettings ─► resolveDisplayModel (§6.3)
  notices/         NEW  notice manager (§6.9)
  user/            one user-state store (history, saved, notes, reading position, bookmarks) (§6.8)
  theme/           NEW  tokens, theme resolution, `theme-color` (§6.6)
  analytics/       built: GA4/GTM/SA/Sentry; adds data tag on SSR HTML, web-vitals, third-party loader
  api, cache, ref, text, versions, connections, catalog, toc, lexicon, search, topics, …   adapters (§6.7)
  layout, workspace  layout tree + Workspace model + URL codec
```

Rules, enforced by tests (a vitest architecture test, so it runs in the existing suite):

1. **Adapter boundary.** Only `src/lib/*` adapters see API response shapes; features and UI get reader-owned types. Shape change ⇒ bump the cache buster.
2. **`src/ui/**` never imports settings, preferences, runtime config or the router.** It receives props.
3. **Every URL change goes through the router** (`navigate` with history state `{nav, panel, ref}`), never `history.replaceState`.
4. **Every runtime switch is a remote-config key with a code default**, read through `src/lib/runtime-config`, never `fetch('/api/remote-config')` in a component.
5. **Every colour is a token** with light and dark values; no literal hex in `*.module.css` (lint).
6. **Tests point at atlas features** (`// @feature ID`); the atlas status is only "done" when a test backs it.

---

## 6. Subsystems

Each subsystem: what it is for, the shape, what is built, what changes, and the room it leaves for the future.

### 6.1 Routing, URL state and the integration seam

- **Built:** file routes; custom legacy query serializer (`+` = space, no JSON quoting); `pathParamsAllowedCharacters` keeps commas;
  URL sync through `navigate` with history state `{nav: scroll|stay|select|go, panel, ref}`; workspace URL codec for `p2=`/`w2=`.
- **Change:** move `go()` and the URL defaults out of `features/workspace/navigation.tsx` context into `src/lib/workspace` so the
  integration layer (§6.12) can call them without React. Each navigation resolves a promise on the router's `onResolved`.
- **Future room:** `layout=` (§6.2) and versioned commands extend the grammar; legacy parameters stay authoritative.

### 6.2 Workspace and panels

- **Model (built):** `Workspace = {panels, layout}`; the layout tree is rows/columns of leaves; a panel owns its asides (sidebar).
- **Decided (D7):** adopt from the POC:
  - **Stable panel ids** (fixes bug: panels keyed by position reuse React state). Ids are in memory and in history state, not in the URL.
  - **Vertical stacks** written as a `layout=` parameter. Plain rows write no parameter, so legacy URLs stay identical (F1).
  - **Resizable dividers** (sizes in `layout=`), **drag to arrange** with a keyboard equivalent (move-panel menu).
  - **Phone rule:** `layout=` stays in the URL but is ignored for display on phones (single panel + switcher).
- **Launch behaviour (D6, F9):** segment click opens the sidebar beside its panel, as today.
- **Future room:** floating panels; two asides stacked; saved and shared workspaces (needs a backend model and API); inline
  commentary as a panel content type; "scroll together" for linked panes (POC `linked-verse.ts`).

### 6.3 Reader settings and the display model

- **Built:** typed `ReaderSettings` (cookie-backed: `language`, `layout*`, `color`, `fontSize`, `aliyotTorah`, `vowels`,
  `punctuationTalmud`, `biLayout`…), one store, a hand-written menu.
- **Target (proposed, #3822):**
  `defineSetting({key, scope, codec, default, appliesTo, resolve, layer, requires, control})` ⇒ `resolveSettings(stored, url, text)`
  ⇒ `resolveDisplayModel(passages, settings, data)` ⇒ blocks with `before` / `after` / `inline` slots ⇒ kind→component registry.
  Parashah and aliyah headers become `before` slots (§9); the menu is generated; each setting's `requires()` drives what data loads.
- **Seams for D6 now:** sidebar-open state already separate from selection; add a **lookup surface** (pop-up at the word) and
  remove "mouse-up selection ⇒ dictionary lookup" (selection triggers nothing). The lookup opens on double-click on desktop.
  On phones the gesture is open.
- **Theme is a setting** (`color`: `light | dark | system`; `sepia` read as `light` while dropped) whose `control` is hidden when
  the dark-mode flag is off (§6.6).

### 6.4 Preferences (effective, with sources)

- **Target (proposed, #3826/#3907; D5 accepted):**
  - `resolvePreferences(req, stored)` in root `beforeLoad` ⇒ `ReaderPreferences`, each value carrying `{value, source}` where source
    is one of `url | profile | cookie | country | browser | default`. Covers interface language, content language, translation
    language, versions by corpus, textual custom, diaspora, display settings and theme.
  - `resolvePanelVersions(prefs, text, url)` with a `fallback` reason (replaces `resolveTranslation`).
  - `savePreference(key, value)`: profile POST when signed in, cookie always.
- **Launch rules (D5):** legacy precedence (profile → cookie → country → browser, domain pinning as today); location guesses are
  never written to cookies or the profile as if chosen; new profile keys only `content_language` and `theme`; sign-in merge fills empty
  profile fields from cookies, profile wins on conflict; preference cookies scoped to `.sefaria.org`.
- **Backend needed:** a JSON GET of the owner's `settings` and `version_preferences_by_corpus` (today `/api/profile/<slug>` omits them);
  `POST /api/profile` must bump `attr_time_stamps.settings` (bug) so the apps' sync does not overwrite web changes.
- **Integration:** while `/settings` is Django, re-read preferences on `visibilitychange`/focus (D4); when the settings page is ported
  it calls `savePreference` and emits `sefaria:settings-updated` for parity.

### 6.5 Runtime config and feature flags (Remote Config)

**Today (audited):**

| Piece | Where | Behaviour |
|---|---|---|
| Store | `remote_config/models.py` `RemoteConfigEntry` (Postgres) | `key`, `raw_value`, `value_type` (`string`/`int`/`bool` as `"1"`/`"0"`/`json`), `is_active`; edited in Django admin |
| Cache | `remote_config/cache.py` | **Process-local** dict, primed in `AppConfig.ready()`; `save()`/`delete()` call `reload()` **in the saving process only** |
| Server reads | `remoteConfigCache.get(key, default)` | linker version, ref cache limit, webpages, legacy cookies, Sentry server config, chatbot limits, search boosts |
| Client exposure (legacy) | `reader/views.py:225` | Only `feature.client.remote_config_json` is put in page props as `remoteConfig` (Sentry rates, `chatbot.hide`) |
| Public endpoint | `GET /api/remote-config` (`urls_shared.py:321`) | All active keys as JSON. Live response: `Vary: Cookie`, Varnish `age: 0`, Cloudflare `DYNAMIC` (not cached) |
| New client | `src/lib/analytics/sentry.ts` | Browser fetches `/api/remote-config` on every page load to read `sentry` rates; nothing else reads remote config |
| Third-party tags | `templates/base.html` | GTM; **VWO** hard-coded (account 682715, `hide_element='body'`, 2 s tolerance); **Hotjar** if `HOTJAR_ID` (prod 2695522); **Unbounce** unconditional on every page. All four are live on `/Genesis.1` today. |

**Gaps that break "remote config is maintained" (fix first):**

1. **Changes do not reach other processes.** Every gunicorn worker on every pod keeps its own copy; only the worker that saved the
   entry reloads. Today a flag flip takes effect fully only after a restart. Fix: either publish a reload over the existing
   multi-server pub/sub (`ServerCoordinator`, as other caches do) or give the cache a short TTL (re-read when older than 60 s).
   The TTL is simpler and also covers Celery workers; do that, and keep the pub/sub as an optional fast path.
2. **The README claims new values propagate without a restart.** Correct it with the fix.
3. **The new client has no server-side read.** It must read remote config on the node server (to decide which scripts go in the
   head, and the theme) instead of a browser fetch per page.
4. **No schema for the client JSON.** `feature.client.remote_config_json` is free-form; document its sub-keys in `keys.py` and validate
   them in `clean()`.

**Target:**

```
Postgres RemoteConfigEntry ─► Django cache (TTL 60 s + reload on save) ─► GET /api/remote-config
      ─► node: src/lib/runtime-config  (TTL 60 s, stale-on-error, code defaults if unreachable)
            ├─ server-only keys      used during SSR (script registry, theme flag, perf sampling)
            └─ client part           = feature.client.remote_config_json only, written into window.__SEFARIA_CONFIG__.remoteConfig
                                       (same object legacy puts in props.remoteConfig)
```

Keys. Client-visible values go inside `feature.client.remote_config_json` (so both clients read one object; legacy already ships it to
the browser). Flags use `0`/`1` like the existing `chatbot.hide`.

```json
{
  "sentry":   { "tracesSampleRate": 0.0, "sampleRate": 1.0, "replaysSessionSampleRate": 0.0, "replaysOnErrorSampleRate": 0.0 },
  "chatbot":  { "hide": 0 },
  "thirdParty": {
    "vwo":      { "enabled": 1, "accountId": 682715, "pageTypes": ["*"], "hideElement": 1, "settingsTolerance": 2000 },
    "hotjar":   { "enabled": 1, "siteId": 2695522, "pageTypes": ["*"], "sampleRate": 1.0, "loadAfterIdle": 0 },
    "unbounce": { "enabled": 1, "pageTypes": ["home", "library", "static"] }
  },
  "darkMode":   { "enabled": 0 },
  "webVitals":  { "enabled": 1, "sampleRate": 1.0 }
}
```

- **VWO and Hotjar (D2):** load iff `enabled` and the page type is listed. `hideElement: 0` drops the anti-flicker `<body>` hide
  (the performance cost found in #3818); marketing chooses per test. The values above reproduce today's behaviour exactly, so a data
  migration can create the row before either client reads it. The code default when the key is missing is **off** (fresh
  environments, cauldrons and tests load nothing), per the remote-config README's "always provide a default".
- **Legacy reads the same keys.** `base.html` wraps VWO and Hotjar in the same check (via a context processor), so one switch
  controls both clients during coexistence. `HOTJAR_ID` stays an env setting; remote config can only turn it off or narrow it.
- **Unbounce (D2):** only on the page types that host Unbounce banners (the list above is a placeholder: ask marketing for the real
  list); its CSS (`unbounce-banner.css`) loads with it.
- **Page types** come from one vocabulary defined in `src/lib/runtime-config` and aligned with the analytics `panel_type` values,
  so scripts and analytics name pages the same way (the names in the example are placeholders until that list is written).
- **Testing:** a unit test per script for on/off/page type; an e2e that injects a runtime config and checks the head; a legacy Django
  test that renders `base.html` with the flags off and on.

### 6.6 Theme and design tokens (dark mode)

- **Built:** `light-dark()` tokens exist; `ReaderSettings.color` is read from the legacy `color` cookie (`light | sepia | dark`); about
  100 literal hex lines remain in 41 `*.module.css` files; `data-theme` hook unused.
- **Target (F5, D3):**
  - Every colour a token; lint bans literal colours in module CSS.
  - `theme = flag off ? "light" : (cookie/profile choice ?? "system")`, resolved on the server: `<html data-theme>` +
    `color-scheme`, and `theme-color` meta; `system` uses `prefers-color-scheme` through `light-dark()` so no script and no flash.
  - Control: Light / Dark / System in the display menu; hidden when the flag is off; the stored choice survives the flag being off.
  - Storage: `color` cookie (legacy name) + profile `theme` when signed in, through `savePreference`.
  - Scope: every page reader-next renders; Django pages stay light until ported.
  - Content with its own colours (sheet inline colours, images, manuscripts, embeds) sits on a light "paper" surface.
  - Stories and contrast checks in both themes; parity screenshots in light only.
- **Future room:** share tokens with the native apps and the toolkit (§6.13); sepia can return as a third token set.

### 6.7 Data layer: adapters, cache and backend contract

- **Built:** TanStack Query + IndexedDB per query; policies by data class; section-granular text store with ref alias table;
  `/api/links/<section>?with_text=0` for the text column; vendored toolkit client.
- **Change (client):** adapter boundary as a rule (map `RelatedLink` etc. to reader-owned types); stop persisting multi-MB link arrays
  to IndexedDB (memory only); load only what each state shows (nothing for connections when dots are off and the sidebar is closed);
  route loader fetches passage + index in parallel; decide a cross-request server cache for the catalog (TOC, index) in node.
- **Change (backend):**
  - Stored **per-segment / per-section counts** (links by category and book, sheets, topics, manuscripts, media, guides), updated
    where Varnish is purged; served with the text or by a counts endpoint.
  - `/api/related?include=` and leaner link rows; category filter in the Mongo query; sheets as counts.
  - Owner `settings` GET (§6.4).
  - Bugs to fix: `get_media_for_ref` uses the last record for every result; `/api/related` topics sorted by interface language but
    cached once; sheet publish does not purge `/api/related`; `override_version_with_preference` is a no-op; version URL correction
    strips RTL translations/LTR sources.
- **Future room:** the backend text model (Glasner paper) fits for default structures; several structures per work would touch the
  planner, cache keys and URL; decide before building it.

### 6.8 User state

- **Built:** signed-in detection (allauth session + `/api/user_stats/<id>`); Save, reading history, notes, add to sheet, add connection,
  add translation in the sidebar; Continue Reading is device-only; four stores fed from four places.
- **Target (idea #3826, D7):** one store in `src/lib/user`; one **"now reading" signal per panel** feeding URL, last place, history,
  back/forward and analytics; `ReadingPosition {work, ref, anchorId?, structure?, versions?, updatedAt}`; bookmarks share the anchor
  (POC bookmarks-with-layout move here, stored server-side rather than localStorage); last-write-wins sync; obeys "reading history
  off"; Continue Reading cross-device from `UserHistory.last_place`.

### 6.9 Notices

- **Target (idea #3821):** a notice manager with declarative descriptors (`slot, priority, audience, cap, autoClose, ssr, category`),
  one dismissal store (cookie; profile when signed in), and one rule: **a notice never moves text** (reserved space, overlay or SSR).
  Move the cookie notice, translations strip and sign-up modal onto it before porting promotions (PRM-010…014). Google One Tap's
  selector list becomes a notice slot.

### 6.10 Analytics and monitoring

- **Built:** one module (`src/lib/analytics`): GTM, gtag `config` with `user_id`, `traffic_type`, `site_lang`, `site_version`; Simple
  Analytics with `sa_metadata`; Sentry with rates from remote config; 33 of 59 events; a TypeScript port of the data tag attached
  after hydration; `window.__SEFARIA_ANALYTICS__` log for tests.
- **To reach F4 (ANL-PAR-1…7):**
  - Data tag listens on `document` **before hydration** (SSR HTML carries `data-anl-*`), so early clicks are not lost; no extra page
    view or `config` from hydration.
  - Panel `data-anl-batch` on every panel; the missing and partial events (consolidation A2-4/5); auth events renamed to `auth_*`.
  - Export the GTM/GA4 container into the repo so page-view behaviour can be checked.
  - **Launch gate per page type:** record the dataLayer on sefaria.org and on reader-next for the same journeys and diff them.
- **Web vitals (D1):** `web-vitals/attribution` after hydration; on each metric send **one** GA4 event
  `web_vitals {metric_name, metric_value, metric_rating, metric_id, page_type, debug_target}` through the existing `gtag` (no new
  `config`, no new property); sampled by `webVitals.sampleRate`; plus Sentry `tracesSampleRate` > 0 (e.g. 0.05) via remote config.
  The parity diff ignores exactly this event name and nothing else, which is how "the GA4 stream stays the same" is checked.
- **Third-party loader:** §6.5 registry decides VWO/Hotjar/Unbounce per page type and flag.

### 6.11 Performance

- **Targets (D1):** field p75 phone LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; lab gate in CI on Pixel 7 / 4× CPU / slow 4G.
- **Budgets in CI:** JS, CSS, hydration time, TTFB on the main page types.
- **Known costs to remove:** blocking Adobe Fonts stylesheet with `font-display: auto` (conflicts with F10 → self-host or async load
  with size-matched fallbacks; licence check needed); 7 font preloads (2 TTF); panel state update per verse and a URL replace per
  scroll pause; VWO body hide (now switchable, §6.5); banners that move text (§6.9).

### 6.12 Integrations

- **`src/lib/integration`** (decided F2, shape proposed; D4 accepted):
  - Commands: `openUrl`, `openRef {ref, panel?, replaceHistory?}`, `openSidebar`/`closeSidebar`, `setLanguage`, `openTopic`, `search`;
    validated like the route; resolve on `onResolved`; queued before hydration; versioned (`v: 1`).
  - Out: `sefaria:state-changed` events and `getState()`.
  - Legacy adapters: `sefaria:bootstrap-url` (host check, unsaved-changes guard, **honour `replaceHistory`**, "a ref closes all panels"
    at launch), `sefaria:settings-updated` (re-read preferences), `refresh-editor` BroadcastChannel when add-to-sheet and the sheet
    editor land.
  - Optional `window.sefariaReader` for same-origin apps; no cross-origin `postMessage` at launch.
  - Mount `<lc-chatbot>` with its attributes (AI-011); hidden by `remoteConfig.chatbot.hide` as today.
  - Ownership: reader team owns the interface, its docs (`reader-next/docs/INTEGRATION.md`) and a contract test that replays the
    chatbot's real payloads against sefaria.org's resulting URLs; the AI team owns the chatbot side.

### 6.13 Embeds and the toolkit

- **Idea (#3870):** embeds and the next linker are built on the Sefaria frontend toolkit (Lit, MIT); the reader keeps React SSR and
  shares tokens and `text-transform` with it. Housekeeping: fix `VENDOR.md` provenance (now `Sefaria/…`, MIT, not GPL), upstream the
  poetry-span and web-pages-null fixes, choose vendor vs npm, map reader tokens onto the toolkit's, daily OpenAPI drift check.

### 6.14 Accounts and auth

- **Built:** SSO login/register/password reset pages (`src/features/auth`, `src/lib/auth`); writes go to Django; captcha; Google/Apple
  provider buttons from env.
- **Needed by later areas:** a `requireViewer` route guard and a permission model (moderator, editor, collection owner) read from
  Django, used by sheets editor, collections, profile, notifications and admin tools.

### 6.15 Language and accessibility

- **Target:** server-side interface resolution (§6.4) with domain pinning; `/interface/<lang>` routed to Django or reimplemented with
  profile save + domain switch + one cookie scope (bug: today it bypasses Django); Hebrew content default for a Hebrew interface;
  menus follow the interface; Storybook a11y checks in both themes and both directions.

### 6.16 Coexistence with Django

- Pass-through prefixes (`src/server/pass-through.ts`) shrink as areas are ported; each port removes its prefix and adds a parity
  gate. Legacy `base.html` and reader-next must read the **same** runtime config (§6.5) and set the **same** analytics context, so a
  reader moving between a node page and a Django page sees one site.
- Order of porting (proposed): reader areas → library/book → topics → calendars → sheets view → profiles/collections → sheets editor →
  notifications → static pages → admin tools last (or never: they can stay Django).

---

## 7. Area by area

All 29 areas, from their BASELINE blocks (atlas, generated 2026-10-14). Every area's top sections are still "Not discussed yet";
the 2026-10-06 decisions sit only in `DECISIONS.md` and are not yet mirrored into the areas' Decisions sections.

**Who renders what today.** reader-next renders `/` (library home), `/texts`, `/texts/<category>`, any ref (reader) or bare book (book
page), `/search`, `/login`, `/register`, `/password/reset/…` and `/interface/<lang>`. Everything else passes through to Django
(`DJANGO_PREFIXES`), and any path reader-next 404s falls back to Django.

### 7.1 Shared capabilities the areas need (build once)

| # | Capability | Exists? | Needed by |
|---|---|---|---|
| S1 | **Signed-in user state beyond the session**: follow, saved, unread count, memberships, assistant eligibility | Session + `user_stats` (SSR) | connections, user-library, profile, collections, notifications, topics, sheets, ai, promotions, library-nav, global-ui |
| S2 | **Roles and permissions** (owner, collection editor/member, moderator, staff) with a `requireViewer`/`requireRole` guard | `isStaff` only | connections, versions, library-nav, sheets, collections, profile, admin-tools, topics |
| S3 | **Authenticated write layer**: CSRF + session, query invalidation after writes | `lib/auth/csrf.ts` | connections, user-library, sheets-editor, collections, profile, notifications, accounts, admin-tools |
| S4 | **Library / Voices module and host model**, cross-module redirects (RTE-001/004/039, PLT-014, all deferred) | No | routing, platform-seo, search, topics, sheets-view, collections, static-pages, library-nav, connections |
| S5 | **Panel-type registry**: non-text panels (sheet, topic, profile, search, library) and the compare panel (SHL-034/037/038/060) | No (text panels only) | reader-shell, sheets-view, text-types, library-nav, book-pages, search, topics |
| S6 | **Rich-text editor framework + image/media upload** | No dependency | sheets-editor, profile (photo), collections (image), admin editors, notes |
| S7 | **CMS (Strapi via Django's cached proxy)** with targeting and dismissal → feeds the notice manager (§6.9) | No | promotions, library-nav, topics, admin-tools (webhooks), static-pages |
| S8 | **Newsletter / CRM endpoint** | No | topics, library-nav, promotions, notifications, static-pages |
| S9 | **Server-side preference and language resolution** (§6.4) + **string catalogue with the Weblate pipeline** (I18-009) | Partial / no i18n library | i18n-a11y, versions, text-display, reader-shell, routing, promotions, every new page |
| S10 | **Per-route SEO head builder** (title, canonical, hreflang, OG, JSON-LD, noindex) | Titles only | platform-seo and every area leaving Django |
| S11 | **Shared list / tab / card primitives** (LIB-065/066, GUI-021/022/024) | Partial | library-nav, topics, search entity tabs, profile, collections, user-library, sheet listings |
| S12 | **Calendar / parashah data adapter** | No | calendars, topics (TOP-009/010/026), library-nav (LIB-038…040) |
| S13 | **Autocomplete and ref/topic resolution** (header autocomplete is not built) | No | search header, topics, sheets-editor, book-pages, dictionaries |
| S14 | **Analytics parity and the gated third-party loader** (§6.5, §6.10) | Partial | every area |
| S15 | **Cache invalidation after edits** (client query + IndexedDB; backend Varnish/multi-server) | Partial | admin-tools, sheets-editor, connections, versions, promotions |
| S16 | **Django pass-through** as the transitional mechanism; each port removes a prefix and adds a route + adapter + parity gate | Built | all unported areas |

Nothing in the spec needs websockets: unread counts poll, cross-tab sheet refresh uses BroadcastChannel (collaboration is retired),
and async work (find-refs, publish side effects, email, exports) stays in Django/Celery.

### 7.2 Per area

Counts: total features (core/standard/optional/retire) · new client done. Gap IDs are core + standard features not done.

| Area | Counts | Rendered by | Main gaps (IDs) | Architecture needs (beyond §6) | Retire / do not port |
|---|---|---|---|---|---|
| **reader-shell** | 75 (39/25/7/4) · 33 done | reader-next | Non-text panels SHL-032/034/056/060; compare SHL-037/038; link routing + history SHL-050/054/067/069; panel chrome SHL-024/029/036/042/057/073/074; language/layout SHL-012/013/014/021; sidebar/search state SHL-051/058/070; editor guard SHL-075 | S5 panel-type registry; unsaved-changes hook shared with the editor; URL codec for non-text panels | SHL-001/002/003/005; SHL-004 history-state bugs |
| **text-display** | 69 (42/21/4/2) · 45 | reader-next | v3 contract TXD-016/018/019/020/024; inline images TXD-026; search highlight TXD-029; RTL + fonts TXD-032/044/060/066; selection guard TXD-057; translation banner TXD-063; TOC labels TXD-015 | §6.3 display model; written server contract for v3 (merge, sanitising, warnings); highlight state from search → reader | TXD-004, TXD-051 |
| **text-types** | 27 (10/14/3/0) · 12 | reader-next | TXT-001 Tanakh, TXT-016 commentary as base, TXT-026 sheet in a panel; Talmud TXT-010/011; categories TXT-014/019/020/024; commentary markers TXT-017/018; TXT-027 | Per-category rendering policy driven by metadata (F8); sheet renderer mountable in a panel (S5) | TXT-013 folio (broken) |
| **connections** | 71 (26/26/15/4) · 41 | reader-next | Sidebar state CON-002/005/007/016; filters CON-022/028/031; writes CON-034/035/048/050/055/056/065; lexicon CON-043; compare CON-066 | S2, S3; counts-driven loading (R10) | CON-010/018/051/058; CON-040, CON-059 broken |
| **versions** | 21 (4/13/3/1) · 10 | reader-next | VER-001/002 prefs; VER-004/010/013/016 UI; VER-019 moderator edit | §6.4 `resolvePanelVersions`; admin form (S6/S2) | VER-015; VER-006/007/021 broken |
| **library-nav** | 69 (10/49/9/1) · 25 | reader-next (home, categories); `/translations` Django | Nav primitives LIB-065/066/068; home extras LIB-002/004/005/007/013; compare LIB-003/018; translations LIB-020/021; ~20 sidebar modules LIB-025…057 | Sidebar module registry with data from topics (trending/pool), CMS (S7), history (S1), collections, social; CRM (S8) | LIB-022 |
| **book-pages** | 23 (12/9/0/2) · 14 | reader-next | BOK-001/006; TOC depth BOK-012/013; dictionaries BOK-016/019; compare BOK-004 | S5 compare; S13 for dictionary search | BOK-020/021 |
| **topics** | 32 (9/18/4/1) · 0 | Django | Routing TOP-001; topic page TOP-015…026/030; landing TOP-002…010; categories + A–Z TOP-011…014; backend TOP-031 | Routes `/topics…`; `src/lib/topics` adapter (topic, links, pools, trending, featured); S4, S8, S10, S12; admin editors ADM-005/007 | TOP-032 |
| **calendars** | 3 (1/2/0/0) · 0 | Django | CAL-001/002/003 | `/calendars` route, S12, diaspora/custom input from §6.4 | — |
| **search** | 110 (41/52/11/6) · 26 | reader-next (`/search`); header autocomplete missing | Header + autocomplete SRC-001…024, 099; results state SRC-016/041/043…064; query + filters SRC-047/079/080/082/083/084/086/109/110; entity tabs SRC-067…072; Voices search SRC-027/088…098 (deferred); dictionary SRC-020…025; SRC-058 | S13, S4 (module switch), Dicta merge (decided, SRC-082 not started), sheets index | SRC-014/030/059/065/077/101; SRC-008/026/087/095 broken |
| **sheets-view** | 27 (9/12/5/1) · 0 | Django | Routing + SSR SHV-001…004; rendering SHV-005…013/017/026; actions SHV-011/018…023; SHV-024 | S4, sheets adapter, renderer as page and panel (S5), S2, media sanitising, S10 | SHV-015; SHV-014 broken |
| **sheets-editor** | 29 (14/10/1/4) · 0 | Django | Editor core SHE-001…004/013…016; insertion SHE-007…012; saving SHE-018…020/023/025; publishing SHE-017/021/022/029; SHE-006 | S6 editor framework, autosave + conflict handling, `refresh-editor` BroadcastChannel (§6.12), upload endpoint, S13 citation parsing, server sanitising, Celery side effects, SHL-075 guard | SHE-024 collaboration, SHE-026/027/028 |
| **collections** | 10 (1/8/1/0) · 0 | Django | COL-001/003/009 pages; COL-004/005 membership; COL-006/007 editing; COL-008/010 backend | Adapter, S2 roles, upload, invite email (NTF-007), S4 | — |
| **profile-social** | 12 (3/7/1/1) · 0 | Django | PRO-001/002/003; follow PRO-004/008/011; edit PRO-005/006; APIs PRO-007/012 | Adapter, owner check (S2), photo upload + crop (S6), shared follow state (S1) | PRO-009; PRO-005 legacy page |
| **user-library** | 12 (5/4/2/1) · 8 | Django pages (`/saved`, `/history`, `/my/notes`); writes in the reader | USL-003, USL-008 | §6.8 user store; routes over it; Library/Voices split | USL-006 |
| **notifications** | 11 (1/9/1/0) · 0 | Django | In-app NTF-001…003; email NTF-005…010 (backend); CRM NTF-011 | Route + adapter; unread badge in header (S1, polling); email stays Django/cron/CRM | — |
| **global-ui** | 28 (12/11/4/1) · 8 | reader-next | Header + mobile nav GUI-001/003/011/014/026; primitives GUI-008/015/020…025; GUI-017 inputs; GUI-027 feedback | S11 primitives; accessible dropdown/tabs | GUI-005 |
| **accounts** | 16 (9/5/2/0) · 11 | reader-next (sign-in); Django (settings) | ACC-003 settings page, ACC-004 email / connected accounts (both flagged: rebuild, not port) | Settings page writing via `savePreference` (R14); allauth headless email change; mobile token endpoints stay Django | — |
| **promotions** | 17 (5/10/1/1) · 0 | — | CMS pipeline PRM-003/012/013; modals + banners PRM-001/002/010/011/014; sidebar ads PRM-006…008; donate + newsletter PRM-004/005/016/017 | S7 CMS + §6.9 notice manager; country input from server; reading-context signal for targeting (§6.8); S8 | PRM-015 |
| **static-pages** | 19 (2/5/10/2) · 0 | Django (404 fallback) | STA-005/007 serving + legal; STA-001/006/013 content; STA-002/018 redirects | Decide: keep Django templates (then the React header over Django pages, SHL-023, needs another route) or move to CMS/MDX; redirect table | STA-014/015 |
| **i18n-a11y** | 13 (9/3/1/0) · 2 | reader-next | I18-001/010 resolution; I18-009 strings/Weblate; I18-006/008 language UI; I18-013 RTL; I18-003/004/005/011 a11y | S9; §6.15 | — |
| **ai** | 20 (0/6/14/0) · 0 | — | AI-001 banner, AI-003 token, AI-004 opt-in, AI-011 widget; AI-008/017 disclosure | Server-issued short-lived token as SSR prop; eligibility (S1 + module + opt-in); `<lc-chatbot>` mount (§6.12); `chatbot.hide` from runtime config; LLM work stays in Celery | — (14 optional: Guided Learning, AI translation POC…) |
| **routing** | 64 (29/17/12/6) · 18 | reader-next + pass-through | Modules/domains RTE-001/004/039/059 (deferred); page families RTE-009/010/011/013/020…024/029…031; edge RTE-003/005/006/007/040; redirects RTE-037; params RTE-045/048/052 | S4; redirect table; shrink `DJANGO_PREFIXES` per port | RTE-014/017/025/060/061/064; RTE-018/019 legacy |
| **platform-seo** | 32 (14/14/4/0) · 2 | reader-next | Meta PLT-006…009/027; crawl PLT-025/026; modules PLT-014/020/021; app links PLT-001/018/023/024; head PLT-010/015/016/019/030; ops PLT-031/032 | S10 head builder; module manifests and icons; health endpoints on node; sitemaps + cron stay Django | — |
| **api-data** | 17 (5/12/0/0) · 0 | Django (consumed) | API-001…017 contracts | Typed adapter per family on one write layer (S3); decide OpenAPI-generated client; backend additions in §6.7 | — |
| **analytics** | 17 (1/11/4/1) · 13 | reader-next | ANL-009, ANL-012, ANL-014 | §6.10; every new area emits legacy events and declarative `data-anl-*` | ANL-010; ANL-016 legacy wrapper |
| **linker-embeds** | 14 (5/6/2/1) · 0 | Django | Linker v3 LNK-003…006/010; distribution LNK-002/011; tracking LNK-008; share images LNK-001/014; embeds LNK-013 | Separate bundle outside the app; CORS find-refs (Celery); image generation; later on the toolkit (§6.13). Can stay Django-served | LNK-009 |
| **admin-tools** | 58 (3/30/22/3) · 0 | Django | Core ADM-029/053/057; inline editors ADM-003…009/030/031; modtools + bulk ADM-014…025; ops ADM-032/033/038/039; moderation ADM-042…044; linker admin ADM-045…050; curation ADM-054 | S2 roles, S6 admin form framework, S15 invalidation; remote-config admin stays Django (ADM-053). Most can stay Django pages | ADM-026/027/028 |
| **legacy-pages** | 30 (0/3/10/17) · 0 | Django | LEG-008, LEG-018 (replace by ADM-008, PRO-005), LEG-025 (= RTE-003/040) | None beyond replacements | 17 retired (LEG-001…007, 012, 014…017, 026…030); LEG-009/010/011/013/019…022/024 legacy |

---

## 8. Future functionality register

Everything said to be wanted later, in the spec, the PRs or the POC, with the hook in this architecture that keeps it possible
**now**, so nothing built before it has to be undone. "Hook" items are cheap and belong in current work.

| # | Future functionality | Status · source | Hook to keep now | Needs later |
|---|---|---|---|---|
| R1 | Sidebar with its own open/close control, docked when closed, may start open | idea · #3822 (CON-008); D6: test on a cauldron | Sidebar-open state separate from selection (built); open state in URL/asides, not derived from selection | Click handling change; data loading for an always-open sidebar must come from counts (R10) |
| R2 | Word lookup pop-up at the word, "open in sidebar" | idea · #3822; POC definition card; D6: double-click on desktop | Selection triggers nothing (B3); lookup surface as a `notices`-free overlay slot; lexicon adapter returns a reader type | Phone gesture decision; pop-up placement in single-panel |
| R3 | Drag to reorder, vertical stacks, resizable dividers, `layout=` | **decided** (D7) · #3818, #3892 | Stable panel ids; layout tree; `layout=` codec that writes nothing for plain rows | — (build now) |
| R4 | Floating panels; two asides stacked | idea · #3818; WORKSPACE.md | Layout tree leaves carry a `kind` (`docked`, later `floating`) | Floating geometry, focus management, a11y |
| R5 | Saved and shared workspaces (study sessions) | idea · #3818 | Workspace serialises to a plain object (URL codec already does) | Backend model + API (`/api/workspaces`), share links |
| R6 | Inline commentary inside a panel | idea · #3818 | Display model blocks with `inline` slots (§6.3) | New panel content type; overlap rules with the sidebar |
| R7 | Scroll together (linked panes, lock toggle) | POC · #3892 | "Now reading" signal per panel (§6.8) | Sync policy between panels of different structures |
| R8 | Bookmarks that follow your reading; bookmarks page | POC; idea · #3826; D7: into user-state store | `ReadingPosition` with anchor; one user store | Backend storage and LWW sync |
| R9 | Continue Reading across devices | idea · #3826 | Same store; read `UserHistory.last_place` | Write path that respects "reading history off" |
| R10 | Per-segment stored counts; `/api/related?include=`; leaner rows | idea · #3822 | Connections adapter hides the endpoint; UI reads counts not rows | Backend counts + purge hooks |
| R11 | Notice manager with caps, auto-close, reader control of pop-ups | idea · #3821 (PRM-010…014) | Port cookie notice, translations strip, sign-up modal onto it first | Profile-backed dismissals; CMS descriptors |
| R12 | Backend text model (several structures per work) | idea · #3821 (Glasner) | Adapter boundary; section keys built in one place | Planner, cache keys and URL for non-default structures |
| R13 | Embeds and next linker on the toolkit | idea · #3870 | Tokens and `text-transform` shared, not forked | Embed build, linker v4 |
| R14 | Settings page that shows each value's source | proposed · #3826 | `{value, source}` in `ReaderPreferences` | Port `/settings`; emit `sefaria:settings-updated` |
| R15 | "Read in your language" suggestion; version fallbacks | idea · #3826 (VER-004, RTE-028) | `resolvePanelVersions` returns a `fallback` reason | Notice slot for the suggestion |
| R16 | Cross-origin integrations (`postMessage`) | D4: not at launch | Commands are serialisable and versioned | Allowlist, origin checks |
| R17 | Panel targeting for "open ref" | D4: optional in versioned commands | `openRef {panel?}` parameter reserved | — |
| R18 | Theme tokens shared with native apps; sepia back | D3 / A1-6 | Tokens in one source file | Export pipeline |
| R19 | Right-click menu, focus mode, hover ref preview, favourite commentaries | experiments · #3892 | None needed beyond R2/R7 seams | Product decision per feature |
| R20 | Chatbot opening a ref in a chosen panel / reading state out to the assistant | F2; D4 | `sefaria:state-changed`, `getState()` | AI team contract v2 |
| R21 | Everything in the atlas not yet ported (topics, sheets, collections, profiles, notifications, static pages, admin) | baseline | Pass-through keeps them working; §7 lists per area what each needs | Per-area ports (§7) |

---

## 9. Aliyot: verification

Checked 2026-10-28 against www.sefaria.org with Playwright (1280×900), plus 126 passing unit tests (parashah, url-state, TocView,
DisplaySettingsMenu, settings, toc). **Verdict: aliyot work and match sefaria.org, with two bugs.**

| Check | Result | Notes |
|---|---|---|
| Markers in the text | **Pass** | Off by default on both sites (SHL-007). With aliyot off, only the parashah name shows ("Bereshit" before Gen 1:1, "Noach" before 6:9). With aliyot on: "BERESHIT: SECOND" before 2:4, "MISHPATIM: SECOND" before Ex 21:20, "V'ZOT HABERACHAH: SEVENTH" before Deut 34:1. Markers work mid-chapter and on segment 1; none appear in Isaiah or Rashi. |
| Toggle in the display menu | **Pass** | Only on Torah books (including Onkelos). Writes cookie `aliyotTorah=aliyotOn` and `aliyot=1` in the URL. A fresh page then opens with aliyot on. |
| Torah Portions in the book TOC | **Pass** (list) / **Fail** (aliyah click) | Same links as legacy. Clicking an aliyah collapses the range (bug A). |
| `/Parashat_Noach` and parashah ranges | **Partial** | Redirect, header placement, continuous scroll and URL tracking all work. The range collapses to its first verse (bug A). |
| Haftarah, combined parashot | **Pass** (parity) | Neither site shows haftarot in the text or the TOC. Vayakhel and Pekudei are listed separately on both. |
| Header | **Pass** (parity) | Legacy shows the ref, not the parashah name. |
| Hebrew labels | **Pass** | "בראשית: שני" with `lang=he`. Labels follow the content language, as on legacy. |

**Bugs** (work plan B6):

- **A. A range URL collapses to its first verse** (`src/features/reader/TextPanel.tsx:177-184`).
  - The code comment says legacy never highlights a range as a whole. Legacy does keep aliyah and parashah ranges when they come from TOC clicks, from `/Parashat_X` and from typed URLs, and highlights them. `/Exodus.35.1-40.38` kept all 214 verses. Legacy itself is inconsistent: one run of `/Parashat_Noach` out of three collapsed.
  - Fix: keep the range and its highlight on arrival, at least for ranges that match an aliyah or parashah. Product call: match legacy fully, or only for alt-structure ranges.
- **B. `?aliyot=1` is ignored on Onkelos** (`src/lib/workspace/url.ts:88,110`).
  - `isTorah` matches only Genesis to Deuteronomy, so the panel state drops `aliyot`. Legacy drops it from the URL too, but still applies it.
  - Fix: keep `panel.aliyot` in state when the URL does not write it. Better, decide "is Torah" from the index's `Parasha` alt structure, as `isTorahBook` in `src/lib/toc/model.ts:271` already does (F8).

**Fixed 2026-10-28** in `~/Sefaria/dev/sefaria-reader` (not yet committed or synced into `reader-next/`):
- **A.** A range that starts at a portion or aliyah marker stays in the URL, is highlighted across chapters, and the header names its verses in the current chapter ("Genesis 6:9-22"; `narrowToVerses` in `src/lib/reader/header.ts`). Short arbitrary ranges still collapse, as on sefaria.org.
  The column had never passed a range highlight to its sections, so this also adds that wiring (`TextColumn` `highlight` prop).
- **B.** An Onkelos panel keeps an `aliyot` its URL set. Torah and other URLs are byte-identical to before (legacy-URL tests pass).
- Tests: unit (1,191 pass) and e2e `scroll.spec.ts` "verse ranges" (4 new). The related specs (scroll, toc, routing, panels, book-types, settings: 61) pass.

**Atlas corrections:**
- RTE-064 says writing `aliyot=0` back into the URL on load was "not ported". It was: `/Genesis.1?lang=bi` becomes `…&aliyot=0`, and `e2e/scroll.spec.ts:63` expects this.
- The range highlight behind bug A has no atlas entry. Add one under RTE or SHL.

**Future:** with the display model (§6.3), parashah and aliyah headers become `before` slots on the first segment of each range.

---

## 10. Work plan

Ordered by dependency, not by size. Each step names its subsystem; S/M/L is complexity. Bugs from the consolidation (§D) ride along with
the step that touches the same code.

**Phase A — foundations (unblock everything else)**

| # | Step | § | Where | Size |
|---|---|---|---|---|
| A1 | Remote config: TTL reload (+ optional pub/sub) in Django; correct the README; schema for `feature.client.remote_config_json` in `keys.py` + `clean()` validation; data migration that writes today's VWO/Hotjar/Unbounce values | 6.5 | BE | S |
| A2 | `src/lib/runtime-config`: node TTL cache of `/api/remote-config`, defaults, client part into `__SEFARIA_CONFIG__.remoteConfig`; Sentry reads it instead of fetching | 6.5 | RN | S |
| A3 | Third-party script registry (VWO, Hotjar, Unbounce) gated by runtime config + page type; legacy `base.html` reads the same keys | 6.5 | RN + BE | S |
| A4 | CI for `reader-next/`: unit + story tests + a smoke e2e on every PR to `reader-next`; budgets job (JS/CSS/hydration) | 6.11, §11 | INF | S |
| A5 | Move `go()` and URL defaults out of React context; stable panel ids | 6.1, 6.2 | RN | M |
| A6 | Architecture test: adapter boundary, `src/ui` import ban, no literal colours | 5 | RN | S |

**Phase B — decided features**

| # | Step | § | Where | Size |
|---|---|---|---|---|
| B1 | Tokens for every colour; theme resolved on the server; Light/Dark/System control; `darkMode.enabled` flag; `theme-color`; stories in both themes | 6.6 | RN | M |
| B2 | Data tag on SSR HTML before hydration; panel `data-anl-batch`; missing/partial events; `auth_*` names; GTM container export; parity diff harness | 6.10 | RN + INF | M |
| B3 | `web-vitals` → GA4 `web_vitals` event (sampled), Sentry tracing rate; field dashboard | 6.10 | RN + INF | S |
| B4 | `src/lib/integration`: commands, legacy adapters (`bootstrap-url` honouring `replaceHistory`, `settings-updated`), `state-changed`, `<lc-chatbot>`, contract test, `INTEGRATION.md` | 6.12 | RN | M |
| B5 | Stacks + `layout=`, dividers, drag + keyboard move, phone rule | 6.2 | RN | M |
| B6 | ~~Aliyot fixes found in §9~~ done 2026-10-28 (sync into `reader-next/` pending) | 9 | RN | S |

**Phase C — proposed, now accepted in principle (D5, D6)**

| # | Step | § | Where | Size |
|---|---|---|---|---|
| C1 | `resolvePreferences` / `savePreference` / `resolvePanelVersions`; stop persisting location guesses; `.sefaria.org` cookies; sign-in merge | 6.4 | RN | M |
| C2 | Owner settings GET; `attr_time_stamps.settings` bump on web POST; profile keys `content_language`, `theme` | 6.4 | BE | S |
| C3 | Settings registry → display model (parashah/aliyah headers into slots), generated menu | 6.3 | RN | L |
| C4 | Selection triggers nothing; lookup surface on double-click; sidebar-model experiment on a cauldron | 6.3, R1, R2 | RN | M |
| C5 | Performance: parallel loader, catalog server cache, font strategy for Adobe Garamond, fewer state updates per scroll | 6.11 | RN | M |
| C6 | Notice manager; move the three existing notices onto it | 6.9 | RN | M |
| C7 | One user-state store, "now reading" signal, `ReadingPosition`, cross-device Continue Reading | 6.8 | RN + BE | M |

**Phase D — backend data contract** (can start any time; unblocks R1, R10)

| # | Step | Where | Size |
|---|---|---|---|
| D1 | Stored per-section counts + purge hooks; counts endpoint or with the text | BE | L |
| D2 | `/api/related?include=`, leaner rows, Mongo-side category filter, sheets as counts | BE | M |
| D3 | Backend bugs: media builder, topics sort vs cache, sheet publish purge, `override_version_with_preference`, RTL version URL correction | BE | S–M |

**Phase E — area ports** in the §6.16 order, each with its parity gate, using the per-area needs in §7.

---

## 11. State of the work: audit for continuous work

What someone picking this up tomorrow needs to know, checked on 2026-10-28.

**Repositories and branches**

| Item | State | Risk / action |
|---|---|---|
| `~/Sefaria/dev/sefaria-reader` | The client's development repo; **no git remote**; clean; HEAD `a8e5366` | Single copy on one laptop. Either push it to GitHub or make `reader-next/` on `reader-next` the only source and retire the subtree flow. |
| `reader-next` branch | `837d585`; `reader-next/` is a squashed subtree of `sefaria-reader` (last squash `34c9ec1..a8e5366`, in sync) | Update with `git subtree pull --prefix=reader-next ../sefaria-reader main --squash`. |
| Worktree | `~/Sefaria/dev/Sefaria-Project-reader-next` on `reader-next`, clean | Use it for reader-next work; this file lives there. |
| Open PRs into `reader-next` | #3818, #3821, #3822, #3826, #3870, #3907 (spec digests), #3892 (POC, do not merge) | GitHub reports all mergeable individually, but merged in date order #3822, #3826 and #3907 conflict with each other (additive: keep both sides). Merge them before the next digest so Claude Tag works on one base. |
| Decisions | 2026-10-28 rows added to `DECISIONS.md` here; #3907 adds three more 2026-10-28 rows | Post D1–D7 in #reader-future as `Decision:` messages so the channel record matches. |

**Tests and CI**

- No GitHub workflow runs `reader-next/` tests (`.github/workflows/*` has none). Unit (vitest), story (vitest browser) and 30 Playwright
  specs (`e2e/`) run only locally. → A4.
- The worktree's `reader-next/` has no `node_modules`; tests and the dev server currently run from `~/Sefaria/dev/sefaria-reader`.
- e2e hits the live API; signed-in specs use the Sefaria-Project e2e `.env` accounts; feedback is intercepted.
- `npm run features:coverage -- --unknown` checks atlas IDs in tests.

**Docs that are stale**

- `reader-next/docs/ARCHITECTURE.md`: says 941 features (atlas has 946 entries), vendor licence GPL-3.0 from `arithmomaniac/…` (now
  `Sefaria/…`, MIT per #3870), and "E2E: Playwright (later)" (30 specs exist).
- `reader-next/docs/VENDOR.md`: licence line (same).
- `remote_config/README.md`: claims saves propagate without a restart (only in the saving process).
- Atlas marks not backed by code (consolidation §D-12): RTE-028, RTE-034, SHL-007, VER-014 marked done; VER-012 note stale; SHL-014
  missing. Area BASELINE blocks were generated 2026-10-14; re-run `tools/seed.py` after fixing the marks.

**Facts corrected by this audit**

- Production Sentry `sampleRate` is **1.0** (errors) with tracing 0.0 (`/api/remote-config`), not "all rates 0".
- VWO, Hotjar (2695522) and Unbounce are all live on reader pages today.

**How to run** (reader-next): `npm run dev` (port 3100), `npm run storybook`, `npm test`, `npm run test:stories`, `npm run test:e2e`,
`node scripts/jank-probe.mjs <base> <path> <verse>`. Deployment: `reader-next/docs/DEPLOYMENT.md` (helm `nodejs.mode: reader|legacy`;
cauldrons need a published prerelease chart passed with `-c`).

---

## 12. Open questions that remain

1. **Unbounce page list** — which page types host Unbounce banners (ask marketing).
2. **VWO on reader pages** — is any VWO test targeting reader pages? If not, set `pageTypes` to exclude them at launch.
3. **Node page caching** — should Varnish or Cloudflare cache anonymous node-rendered pages (big TTFB win; needs `Vary` on the
   preference cookies)?
4. **Adobe Garamond loading** — licence allows self-hosting? Otherwise async Typekit with size-matched fallbacks (F10 vs §6.11).
5. **Data tag** — load the legacy `analyticsEventTracker.js` itself, or keep the TypeScript port with shared tests (conflict C3)?
6. **"Beside"** — reading order (right in English, left in Hebrew, as today) or always one side (B2-2)?
7. **Settings registry details** — scope per setting, keep legacy cookie names, ESLint vs vitest for the import ban (B4-6).
8. **Vestigial analytics events** (UA dimensions, Display Option Click, UA JS errors) and `Sefaria.track` timing (A2-8).
9. **Phone lookup gesture** (D6 left it open).
10. **Range arrival** — done as: portion/aliyah ranges kept, short arbitrary ranges collapse (matches the sefaria.org probes). Revisit if product wants every range kept.
11. **sefaria-reader repository** — push it, or make the branch the only source (§11)?
