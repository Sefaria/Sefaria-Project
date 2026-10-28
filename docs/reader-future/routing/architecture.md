---
area: routing
title: URLs & routing
domain: Platform
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-28
---
# URLs & routing — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

**Integrations.** The new client keeps reader state in the URL through TanStack Router: a validated query schema, a workspace codec
and pure panel operations, all reached through a React context. Other applications drive sefaria.org's reader today with DOM events
on `document` (the chatbot's `sefaria:bootstrap-url`, the settings page's `sefaria:settings-updated`) and a BroadcastChannel; the new
client handles none of them yet. The requirement (decided) is parity with those events and an easy way for any integration to update
state; the proposed shape is a small command layer over the router, a legacy-event adapter, and a state-changed event. [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193924097339)

## Legacy approach vs new approach

**Integrations: events other applications use to drive or observe the reader.** Legacy `master` @ `e18dacc0d`; chatbot `Sefaria/ai-chatbot` @ `b2d3c8a`; new client
`reader-next` (code identical on `reader-future/daily-2026-10-28`).

| Event or channel | Direction | Sent by → handled by | Payload | Effect on the reader (sefaria.org) | Legacy source | `reader-next` |
|---|---|---|---|---|---|---|
| `sefaria:bootstrap-url` (CustomEvent on `document`) | in | `<lc-chatbot>`: links in answers, location pin, topic suggestion → `ReaderApp` | `detail`: a URL string, or `{url, replaceHistory?}`; relative or absolute | URL must parse and its host be the page's or contain `sefaria.org`; unsaved-editor confirm first. A ref closes every panel and opens it alone; any other path goes through `openURL` (topics, search, sheets…). `replaceHistory` has no effect for refs (passed as panel options). | `static/js/ReaderApp.jsx:235`, `:270`, `:1253-1265`, `:1279-1310`, `:1056-1058`, `:1730-1737`; sent at `src/components/LCChatbot.svelte:1487` (`{url: path, replaceHistory: true}`), `:1694` (`{url}`, absolute), `:1708` (`{url: "/topics/<slug>"}`) | **missing**: no listener in `reader-next/src` |
| `sefaria:settings-updated` (CustomEvent on `document`) | in | account settings page after save → `ReaderApp` | `{translationLanguagePreference, readingHistory, textualCustom?, diaspora?}` | Sets the translation-language preference, `Sefaria.is_history_enabled`, and refetches calendars. An interface-language or assistant change reloads the page instead. | `ReaderApp.jsx:236`, `:1266-1278`; `templates/account_settings.html:300-318` | **missing**: settings are React state + cookies (`src/features/reader/settings-context.tsx:27-37`); translation preference cookie is read only (VER-001 partial); account settings page not in the new client |
| `BroadcastChannel('refresh-editor')`, message `"refresh"` | cross-tab | add to sheet (sidebar) → open sheet editors | `"refresh"` | Open sheet editors reload the sheet from the server. | `static/js/AddToSourceSheet.jsx:299-300`; `static/js/Editor.jsx:2827-2830` | **missing**: no `BroadcastChannel` in `reader-next/src` (sheet editor not built) |
| `<lc-chatbot>` attributes | out (reader → assistant) | `ReaderApp` → assistant | `user-id` (token), `api-base-url`, `origin`, `is-moderator`, `placement`, `default-open`, `mode`, `max-input-chars`, `max-prompts`, `interface-lang` | Mounts the assistant on desktop Library pages when enabled; script from `chatbot_script_url`. | `ReaderApp.jsx:2586-2588`, `:2621-2633`; `templates/base.html:75-76`; `sefaria/system/context_processors.py:125-172` | **missing** (AI-011 not started) |
| Reader location, read by the assistant | out (pulled) | assistant reads `window.location.href` when a message is sent | the page URL | Labels the message with the ref being read. | `LCChatbot.svelte:1064`, `:1104`, `:1618-1640`; `src/lib/api.js:70` | **done** while URLs match sefaria.org's (SHL-066 done, `src/lib/workspace/url.ts`) |
| `chatbot:opened` · `chatbot:closed` · `chatbot:message_sent` · `chatbot:error` (on `document`); `appetizer_click` (on the element) | out (assistant → page) | assistant → nobody in the reader | per event | None in the reader (no listener on `master`). | `LCChatbot.svelte:426-432`, `:516`, `:529`, `:1215`, `:1264`, `:1718` | n/a (none either) |
| `window.Sefaria` | global | `sefaria.js` → any script | the client object | Any script can read and call the client's internals. | `static/js/sefaria/sefaria.js:30` | **replaced, no equivalent**: only `window.__SEFARIA_CONFIG__` (`src/lib/config.ts:91`) and the analytics log `window.__SEFARIA_ANALYTICS__` (`src/lib/analytics/core.ts:40`) |

Not found on `master`: no `window.postMessage` handler, no mobile-app webview bridge, no reader API on `window` besides `Sefaria`. The
linker (`static/js/linker.v3/`) runs on other sites and reaches the reader only through URLs. The assistant's Chrome extension
(`Sefaria/ai-chatbot` `chrome-extension/content.js`) injects `<lc-chatbot>` on any page; on sefaria.org its links use the same
`sefaria:bootstrap-url`. The declarative analytics events (`inputStart`, bubbling `toggle`, `scrollIntoView`,
`static/js/analyticsEventTracker.js:179-243`) are internal: see Analytics.

**How `reader-next` holds state today.**

- One router with the old site's query-string format (`parseSearch` / `stringifySearch`), `reader-next/src/router.tsx:9-30`.
- The reader route `/$` validates its query with `validateReaderSearch` and reloads only when text params change
  (`src/routes/$.tsx:22-31`; schema `ReaderSearch`, `src/lib/reader/url-state.ts:20-59`).
- The open panels and sidebars are a `Workspace` decoded from and encoded to the URL (`src/lib/workspace/url.ts:61`, `:148`) and
  changed by pure operations: `openOnly`, `openNextTo`, `replace`, `close`, `updatePanel`, `openAside`, `updateAside`, `closeAside`
  (`src/lib/workspace/ops.ts:57-139`).
- Every change is `WorkspaceNavProvider.go(ws, {replace, state})` → `router.navigate` (`src/features/workspace/navigation.tsx:110-127`).
  History state (`NavState`: `nav`, `panel`, `ref`, `terms`) records why the URL changed and carries state kept out of the URL, such as
  search-term highlights (`:24-32`); `router.history.subscribe` saves reading positions (`:84-95`). This lives in React context: code
  outside the React tree cannot reach it.
- Display settings are React state written to the old cookies (`src/features/reader/settings-context.tsx:27-37`); the mobile menu is a
  small module store (`src/features/shell/mobile-menu.ts:15`). No zustand or TanStack Store.
- Nothing for integrations yet: no `sefaria:*` listener, no `window` API, no `postMessage`, no `BroadcastChannel`, no `<lc-chatbot>`
  (search of `reader-next/src`, 2026-10-28).

## Target architecture

_Items carry a status: idea · proposed · agreed · decided._

**Integrations.**

- TanStack Router is the reader's state layer, and the URL it holds is the source of truth for reader state. — *decided* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193924097339) ·
  `reader-next/docs/WORKSPACE.md`
- Every legacy integration event in the inventory above keeps its effect in the new client. — *decided* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193924097339) · RTE-057 · SHL-068
- Any integration can update reader state easily, through one documented interface. — *decided* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193924097339)

The interface's shape is a **proposal** (Claude Tag draft, from the code; not discussed yet):

- **Command layer** (new module, e.g. `src/lib/integration/`): typed commands — `openUrl(url, {replace})`,
  `openRef(ref, {panel, versions, lang, replace})`, `openSidebar(view, {panel})` / `closeSidebar`, `setLanguage(lang, {panel})`,
  `openTopic(slug)`, `search(query)`. Each builds the next `Workspace` with `lib/workspace/ops.ts`, checks it with the same validators
  as the route (`validateReaderSearch`, ref resolution), and navigates through the router like `go()`. It resolves when the router
  reports `onResolved`, with the new URL or a typed error. No second store: a command is only a navigation, so history, back/forward,
  SSR and sharing behave as for a click. — *proposed* (Claude Tag draft)
- **Router outside React**: commands take the router instance (`getRouter()`, `src/router.tsx`) instead of `useWorkspaceNav()`, and
  the URL defaults now read from settings context (`navigation.tsx:72-73`) move to something code outside React can read. Commands
  that arrive before hydration are queued. — *proposed* (Claude Tag draft)
- **Legacy adapter**: one client-only listener mounted from `src/routes/__root.tsx` maps `sefaria:bootstrap-url` → `openUrl` (same host
  check and unsaved-changes guard as `ReaderApp.jsx:1279-1300`) and `sefaria:settings-updated` → settings update; `refresh-editor`
  is wired when the sheet editor lands. Names and payloads unchanged. — *proposed* (Claude Tag draft)
- **State out**: on `router.subscribe("onResolved")`, dispatch one event (name to agree, e.g. `sefaria:state-changed`) with
  `{version, url, panels: [{ref, versions, lang, sidebar}], interfaceLang}` derived from `decodeWorkspace`, plus a `getState()` to
  read it on demand. — *proposed* (Claude Tag draft)
- **Window global** (optional): `window.sefariaReader = {version, getState, subscribe, …commands}` for scripts that prefer calls to
  events. — *idea* (Claude Tag draft)
- **Cross-origin** (optional): a `postMessage` channel with an origin allowlist and a reduced command set, for iframes and embeds;
  same-page events stay the default. — *idea* (Claude Tag draft)
- **Versioning and tests**: a `version` field in every payload, additive changes only; the legacy events are version 0. A contract
  test replays every inbound row of the inventory (payloads copied from the `Sefaria/ai-chatbot` call sites) and checks that the
  resulting URL equals what sefaria.org produces, and checks the outbound event's shape. — *proposed* (Claude Tag draft)

## Dependencies on other areas

- Integrations: [Reader shell & panels](../reader-shell/architecture.md) (which panel a command targets; unsaved-changes guard,
  SHL-068), [AI features](../ai/architecture.md) (the assistant is the main client; mounting, AI-011),
  [Connections](../connections/architecture.md) (sidebar views in the `with` grammar), [Versions](../versions/architecture.md)
  (translation preference, VER-001), [Sheets: editing](../sheets-editor/architecture.md) (`refresh-editor`, SHE-020),
  [Accounts](../accounts/architecture.md) (the account settings page that sends `sefaria:settings-updated`, ACC-003),
  [Linker & embeds](../linker-embeds/architecture.md) (cross-origin), [Analytics](../analytics/architecture.md) (whether state-changed
  events feed analytics).

## Risks and open questions

Integrations (product questions are in `product.md` → Open questions):

- **Reaching the router outside React.** `go()` and the URL defaults live in React context today (`navigation.tsx:70-127`); the
  command layer needs them without a component, and must not fire before hydration.
- **Security.** Any same-page script already has full power, so the event adapter adds no new exposure; a `postMessage` channel does,
  and needs an origin allowlist, no navigation to other hosts (keep the legacy host check), and probably no writes on the user's behalf.
- **`replaceHistory` and panel targeting.** Matching sefaria.org exactly means ignoring `replaceHistory` for refs and replacing every
  panel; matching intent changes behaviour the assistant may already rely on.
- **Payload drift.** The assistant is built and released apart from the reader; without a written contract and a test on both sides,
  either can break the other silently.

## Decisions

- 2026-10-28 — Reader state in the new client is managed with TanStack Router; other applications must be able to update it easily, and for parity every integration event sefaria.org's reader handles keeps its effect. Akiva Berger (owner). [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193924097339)

_Every decision is also logged in `../DECISIONS.md`._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: the two clients today

### Legacy client (`master`)

Where the atlas found this area's behaviour (files cited by its features, most-cited first):

- [`reader/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py) (70)
- [`static/js/ReaderApp.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx) (27)
- [`sefaria/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/views.py) (8)
- [`sefaria/urls_library.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/urls_library.py) (6)
- [`sefaria/system/middleware.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/system/middleware.py) (6)
- [`sefaria/urls_shared.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/urls_shared.py) (5)
- [`sourcesheets/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sourcesheets/views.py) (4)
- [`static/js/sefaria/sefaria.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/sefaria.js) (4)
- [`helm-chart/sefaria/conf/nginx.template.conf.tpl`](https://github.com/Sefaria/Sefaria-Project/blob/master/helm-chart/sefaria/conf/nginx.template.conf.tpl) (3)
- [`sefaria/settings.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/settings.py) (2)
- [`sefaria/model/text.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/model/text.py) (2)
- [`static/js/auth/utils.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/auth/utils.js) (2)
- [`sites/sefaria/urls.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sites/sefaria/urls.py) (2)
- [`static/js/sefaria/util.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/util.js) (2)
- [`sefaria/system/context_processors.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/system/context_processors.py) (2)

Long-form audit write-up: `reader-next/docs/features/inv_01_urls_routing.md`, `reader-next/docs/features/inv_04_connections.md`.

### New client (`reader-next`, folder `reader-next/`)

Rebuild status of this area's features: done 18, partial 1, todo 3, deferred 6, replaced 3, not started 33.

Implemented in (most features first):

- [`src/lib/workspace/url.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/workspace/url.ts) (12)
- [`src/routes/_auth.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/routes/_auth.tsx) (1)
- [`src/lib/auth`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/auth) (1)
- [`src/server/pass-through.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/server/pass-through.ts) (1)
- [`src/routes/interface.$lang.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/routes/interface.$lang.tsx) (1)
- [`src/lib/reader/position-store.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/position-store.ts) (1)

### Gaps: core and standard features not done (25)

| ID | Tier | Feature | Rebuild status |
|---|---|---|---|
| RTE-001 | core | Library and Voices hosts split by domain | deferred |
| RTE-004 | core | Edge redirects to Voices for sheets, collections, profile | deferred |
| RTE-009 | core | Library home and texts navigation URLs | todo |
| RTE-021 | core | Voices home and sheets-with-ref URLs | deferred |
| RTE-022 | core | Sheet URLs | deferred |
| RTE-029 | core | Search URL | todo |
| RTE-030 | core | Topics URLs | todo |
| RTE-039 | core | Cross-module redirect rules | deferred |
| RTE-040 | core | 404 and error pages | partial |
| RTE-059 | core | Language-domain redirect | deferred |
| RTE-003 | standard | Maintenance mode | not started |
| RTE-005 | standard | Bare root domain redirects to www | not started |
| RTE-006 | standard | Mobile message and sitemap passthrough at edge | not started |
| RTE-007 | standard | robots.txt rules | not started |
| RTE-010 | standard | Learning schedules and calendar URLs | not started |
| RTE-011 | standard | Translations page URLs | not started |
| RTE-013 | standard | Account settings URL | not started |
| RTE-020 | standard | Download URLs | not started |
| RTE-023 | standard | Collections URLs | not started |
| RTE-024 | standard | Profile URLs | not started |
| RTE-031 | standard | Saved, history and notifications URLs | not started |
| RTE-037 | standard | Legacy redirects (complete list) | not started |
| RTE-045 | standard | Sidebar sub-state params (vside, lookup, sbsq, namedEntity) | not started |
| RTE-048 | standard | Menu tab param (tab) | not started |
| RTE-052 | standard | Other page params (login/next, activity, topic, profile) | not started |

_Generated 2026-10-14 from the atlas and `rebuild-status.json`. Architecture of each client as a whole: `reader-next/docs/ARCHITECTURE.md`._

<!-- BASELINE:END -->
