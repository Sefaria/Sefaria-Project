---
area: analytics
title: Analytics
domain: Platform
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-28
---
# Analytics — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

The future reader keeps every analytics event and dimension sefaria.org sends today, captured the same way: same tags, the same
vanilla JS data tag (`data-anl-*` attributes read by `AnalyticsEventTracker`), same event names and parameters, same page views.
Parity is checked event by event against the inventory below. — *decided* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193685517999)

## Legacy approach vs new approach

**Legacy (`master`).** Django's `templates/base.html` loads every tag on every page, the reader included:

| Tag / script | Where (`master`) | `reader-next` today |
|---|---|---|
| Google Tag Manager container (`GOOGLE_TAG_MANAGER_CODE`) | `templates/base.html:143-150`, noscript `:210-215` | done: `reader-next/src/lib/analytics/scripts.ts:30-34` |
| GA4 gtag.js, `config` with `user_id`, `traffic_type` (`sefariaemail`), `site_lang`, `site_version` | `templates/base.html:285-299` | done: `scripts.ts:36-39`, user from the root loader (`src/routes/__root.tsx:52`) |
| **The vanilla JS data tag**: `static/js/analyticsEventTracker.js`, loaded before the React bundle and attached to `#s2, #staticContentWrapper` for `click`, `scrollIntoView`, `toggle`, `mouseover`, `input`, `inputStart` | `templates/base.html:257`, `:301`; tracker `static/js/analyticsEventTracker.js:1-288` | **a TypeScript port**, not the file: `src/lib/analytics/declarative.ts:1-157`, attached in a `useEffect` after hydration (`src/routes/__root.tsx:121`) |
| Simple Analytics: `sa_event` queue, `sa_metadata` (logged_in, interface_lang, device_type, user_type, custom_session_id, sefaria_id, traffic_type), script with `data-collect-dnt` | `templates/base.html:185-192`, `:311-346` | done: `scripts.ts:41-63`, `__root.tsx:146-160` |
| Sentry (`CLIENT_SENTRY_DSN`) | `templates/base.html:221-229` | done: `src/lib/analytics/sentry.ts:30` |
| `Sefaria.track` (Universal Analytics `ga` calls; reach GA4 through GTM's `ga` shim, per `reader-next/src/lib/analytics/core.ts:6-10`) | `static/js/sefaria/track.js:1-126` | done as `uaEvent`: `core.ts:89-98` |
| `TrackG4.gtagClick` → `onclick_<component>` | `static/js/sefaria/trackG4.js:13-22` | missing |
| VWO (`is_spa=1`, hides `<body>` until loaded), Hotjar, Unbounce | `templates/base.html:152-166`, `:171-183`, `:194-195` | not loaded (`scripts.ts:10`, owner decision pending) |
| Cookie notice (informational; sets `cookiesNotificationAccepted`, gates no tag) | `static/js/Misc.jsx:2820-2860` | same cookie: `src/ui/CookieNotice/CookieNotice.tsx:9` |

**The data tag's schema** (`static/js/analyticsEventTracker.js:2-13`, `:33-55`, `:96-112`, `:130-150`):

- `data-anl-event="<name>:<type>|<name>:<type>…"`: the GA4 event name and the DOM trigger (`click`, `mouseover`, `input`,
  `inputStart` = first input only, `toggle` on `<details>`, `scrollIntoView` = first time on screen).
- `data-anl-<field>`: one parameter; `data-anl-batch`: a JSON object of parameters. Parameters are gathered from the target and
  every ancestor up to the root, the closest declaration winning; then `toggle` adds `from`/`to`, `input` adds `text`.
- Only whitelisted fields are sent: project, panel_type, panel_number, item_id, version, content_lang, content_id, content_type,
  panel_name, panel_category, position, ai, text, experiment, feature_name, from, to, action, engagement_value, engagement_type,
  logged_in, site_lang, traffic_type, promotion_name, link_type, form_name, form_destination. Sent as `gtag("event", name, params)`
  (`:171-173`).
- On the reader, every panel carries `data-anl-batch` with `panel_type`, `panel_number`, `content_lang`, `panel_name`
  (`static/js/ReaderPanel.jsx:706-713`, `:1183`), so any data-tag event inside a panel inherits them.

**Page views.** `gtag('config')` sends the first page view (`templates/base.html:292`). On client-side navigation the reader only
calls `history.pushState` (`static/js/ReaderApp.jsx:930`); its own page-view call is commented out (`:413`) and `trackPageview`
only sets Universal Analytics dimensions (`:360-418`, ANL-010, tiered *retire*). So SPA page views come from GTM or GA4 settings
(history-change trigger or enhanced measurement), which are not in the repository.

**New (`reader-next`).** One module, `reader-next/src/lib/analytics/` (decision 2026-10-06): the same tags and IDs, the data-tag
port, and one function per legacy call site with the legacy names (`reader.ts`, `search-box.ts`, `search-flow.ts`, `session.ts`,
`src/lib/auth/analytics.ts`). No page-view code: like the legacy reader it relies on GTM/GA4 seeing history changes.

## Target architecture

_Items carry a status: idea · proposed · agreed · decided._ Requirement IDs are `ANL-PAR-n`; atlas IDs in brackets.

- **ANL-PAR-1 Same tags.** Reader pages load every tag in the table above with the same IDs and `config` parameters, wherever they
  load on sefaria.org (ANL-014). — *decided* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193685517999)
- **ANL-PAR-2 Same vanilla JS data tag.** Events declared with `data-anl-*` are collected by the same data tag, with the same
  attribute schema, triggers, field whitelist and parameter inheritance (ANL-015). — *decided* · same source
- **ANL-PAR-3 Same attributes on equivalent elements.** Every element that carries `data-anl-*` on sefaria.org carries the same
  attributes and values on its reader-next equivalent, including each panel's `data-anl-batch`. — *decided* · same source
- **ANL-PAR-4 Every event, same names and parameters.** Every event in the inventory below fires on the same user action with the
  same name, parameters and channel (gtag, Simple Analytics, `Sefaria.track`) (ANL-001…017). — *decided* · same source
- **ANL-PAR-5 Same page views.** One page view per navigation that sefaria.org counts as one, with the same URL and parameters,
  including client-side navigation (ANL-001). — *decided* · same source
- **ANL-PAR-6 Server rendering and hydration.** `data-anl-*` attributes are in the server-rendered HTML; the data tag listens on
  the server-rendered root before hydration, as `base.html` attaches it before the bundle runs; hydration and re-rendering of the
  head send no extra page view or `config` call. — *proposed* (how ANL-PAR-2/3/5 apply to server rendering) · same source
- **ANL-PAR-7 Launch gate.** Parity is checked against this inventory (`window.__SEFARIA_ANALYTICS__` log in reader-next and a
  dataLayer recording on sefaria.org) before reader-next serves a page type in place of sefaria.org. — *proposed* · same source

### Event inventory

Channel: **gtag** = `gtag("event", …)`; **sa** = Simple Analytics; **ua** = `Sefaria.track.event(category, action, label)`;
**tag** = declared with `data-anl-*`. Legacy refs are on `master`, reader-next refs under `reader-next/src/`. Status: **done**,
**partial**, **missing**, **not built** (the feature itself is not in reader-next yet; the events come with it), **dropped**
(not ported, see open questions).

**Page, session and header**

| Event | Ch. | Trigger | Legacy | reader-next |
|---|---|---|---|---|
| `page_view` (first) | gtag | page load (`config`) | `templates/base.html:292` | done: `lib/analytics/scripts.ts:38` |
| `page_view` (client navigation) | gtag | `pushState` seen by GTM/GA4 | `static/js/ReaderApp.jsx:930` (config not in repo) | no code; same mechanism assumed, unverified |
| UA content groups, dimensions 1-7, 10 | ua | each history push | `static/js/ReaderApp.jsx:360-410`, `static/js/sefaria/track.js:64-99` | dropped (ANL-010 *retire*) |
| `reader_app_mounted` | gtag+sa | first app mount per session | `static/js/ReaderApp.jsx:251-254` | done: `lib/analytics/session.ts:110` |
| `intersection_observer_not_supported` | gtag+sa | once per browser | `static/js/ReaderApp.jsx:257-260` | done: `session.ts:113` |
| `print` | gtag | print | `static/js/ReaderApp.jsx:2212-2213` | done: `session.ts:119` |
| `Javascript Errors` | ua | `window.onerror` | `static/js/sefaria/track.js:7-9` | dropped (Sentry instead) |
| `header_viewed` (`regular_header`) | gtag+sa | header fully visible, once per session | `static/js/Header.jsx:232-234` | done: `ui/SiteHeader/SiteHeader.tsx:121` |
| `header_viewed` (`category_color_line`) | gtag+sa | colour line fully visible | `static/js/Misc.jsx:1635-1636` | done: `ui/CategoryColorLine/CategoryColorLine.tsx:16` |
| `banner_probe_viewed` | gtag+sa | probe visible | `static/js/BannerImpressionProbe.jsx:34-35` | done: `features/shell/BannerImpressionProbe.tsx:24` |
| `modswitch_open`, `modswitch_close` | tag, gtag | module switcher button; passive close | `static/js/common/DropdownMenu.jsx:255`, `static/js/Header.jsx:158-162` | done: `ui/SiteHeader/SiteHeader.tsx:50`, `:61` |
| `modswitch_item_click` | tag | module switcher item | `static/js/common/DropdownMenu.jsx:138`, `static/js/Header.jsx:172`, `:196` | done: `SiteHeader.tsx:154-160` |
| `recently_viewed` | gtag | history item / "all history" in nav sidebar | `static/js/NavSidebar.jsx:111`, `:130` | not built |
| `auth_flow_started` … `auth_flow_ended` (5) | gtag | sign-in/up funnel | `static/js/auth/authAnalytics.js:11-15` | **partial**: sends the older `sign_up_*` names (`lib/auth/analytics.ts:22-28`) |

**Text reading**

| Event | Ch. | Trigger | Legacy | reader-next |
|---|---|---|---|---|
| panel `data-anl-batch` (panel_type, panel_number, content_lang, panel_name) | tag | inherited by tag events in a panel | `static/js/ReaderPanel.jsx:706-713`, `:1183` | **missing** |
| `select_content` | gtag | text column mounts | `static/js/TextColumn.jsx:37-41` | done: `features/reader/TextColumn.tsx:73` |
| `copy_text`, `bilingual_copy_text`, `spanning_copy_text` | gtag | copy in a panel | `static/js/ReaderApp.jsx:2216-2243` | done: `TextColumn.tsx:265`, `lib/analytics/session.ts:163` |
| Reader / Text Segment Click | ua | segment click | `static/js/TextRange.jsx:525` | done: `features/reader/TextPanel.tsx:230` |
| Reader / Open Connections Panel | ua | segment click opens sidebar | `static/js/ReaderPanel.jsx:174` | done: `TextPanel.tsx:230` |
| Reader / Open Connections Panel from Header | ua | header resources button | `static/js/ReaderPanel.jsx:1313` | **missing** |
| Reader / Citation Link Click | ua | citation in text or lexicon | `static/js/TextRange.jsx:479`, `static/js/LexiconBox.jsx:292` | done: `TextPanel.tsx:319`, `features/reader/ConnectionsPane.tsx:348` |
| Reader / Named Entity Link Click | ua | topic link in text | `static/js/TextRange.jsx:522` | done: `TextPanel.tsx:369` |
| Reader / Change Language | ua | language buttons | `static/js/ReaderPanel.jsx:457`, `:460` | done: `TextPanel.tsx:280`, `ui/ContentLanguage/ContentLanguage.tsx:21` |
| Reader / Display Option Click | ua | `ToggleOption` | `static/js/Misc.jsx:883` | dropped (`lib/analytics/reader.ts:5`: no current control sends it) |
| Saved / saving | ua | save button | `static/js/Misc.jsx:1376` | done: `features/reader/use-reader-history.ts:87` |
| `onclick_ToolTipped` | gtag | save, display-settings, guide and ⋯ buttons | `static/js/Misc.jsx:1458-1460` (via `static/js/sefaria/trackG4.js:20`) | **missing** |

**Versions and translations**

| Event | Ch. | Trigger | Legacy | reader-next |
|---|---|---|---|---|
| Reader / Choose Version | ua | version chosen for a panel | `static/js/ReaderApp.jsx:1654`, `:1657` | done: `features/reader/TextPanel.tsx:403`, `:415` |
| `onClick_version_title` | gtag | version title (open in sidebar) | `static/js/VersionBlock/VersionBlock.jsx:47` | done: `features/reader/ConnectionsPane.tsx:489`, `:541` |
| `onClick_select_version` | gtag | Select (open in panel) | `static/js/VersionBlock/VersionBlock.jsx:59` | done: `ConnectionsPane.tsx:487`, `:537` |
| Reader / Set Translation Language Preference | ua | translation-language preference | `static/js/ReaderApp.jsx:2162` | **missing** (helper `lib/analytics/reader.ts:29` has no caller) |
| Reader / Set Version Preference | ua | version preference saved | `static/js/sefaria/sefaria.js:1120` | **missing** |
| Reader / Version Download | ua | download a version | `static/js/NavSidebar.jsx:1005` | done: `ui/DownloadVersions/DownloadVersions.tsx:75` |

**Connections sidebar**

| Event | Ch. | Trigger | Legacy | reader-next |
|---|---|---|---|---|
| `feature_clicked` (`tools_button_<en>`) | gtag | any tools button | `static/js/ConnectionsPanel.jsx:1114` | done: `ui/ConnectionsPanel/ResourcesView.tsx:113`, `:156` |
| Tools / `<mode>` Click | ua | mode set from a tools button | `static/js/ReaderPanel.jsx:558` | done: `ResourcesView.tsx:113` |
| Tools / Prompt Login | ua | signed-out tool needing an account | `static/js/ReaderPanel.jsx:560` | **missing** |
| Reader / Connections Category Click | ua | category in Related Texts | `static/js/ConnectionFilters.jsx:20` | done: `ResourcesView.tsx:151` |
| Reader / Category Filter Click | ua | "All <category>" | `static/js/ConnectionFilters.jsx:17` | done: `ui/ConnectionsPanel/CategoryView.tsx:51` |
| Reader / Text Filter Click, … in Recent Click | ua | book filter; recent filter | `static/js/ConnectionFilters.jsx:101-102` | **partial**: "in Recent" never sent (`CategoryView.tsx:66`) |
| Reader / Click Text from TextList | ua | connected text opened | `static/js/TextList.jsx:267`, `static/js/TextRange.jsx:98` | done: `features/reader/ConnectionsPane.tsx:633` |
| Lexicon / `<action>` | ua | dictionary lookup opened | `static/js/LexiconBox.jsx:67` | done: `ConnectionsPane.tsx:267` |
| Reader / Click Dictionary Entry from Lookup | ua | lexicon entry | `static/js/LexiconBox.jsx:296` | done: `ConnectionsPane.tsx:349` |
| Tools / Note Save Private, Note Save Public | ua | note saved | `static/js/ConnectionsPanel.jsx:1307` | **partial**: Private only (`ConnectionsPane.tsx:396`) |
| Tools / Delete Note | ua | note deleted | `static/js/sefaria/sefaria.js:2171` | done: `ConnectionsPane.tsx:401` |
| Tools / Add Connection | ua | connection saved | `static/js/ConnectionsPanel.jsx:1510` | done: `ConnectionsPane.tsx:435` |
| Tools / Add to Source Sheet Save | ua | added to sheet (ref, or "Outside Source") | `static/js/AddToSourceSheet.jsx:293`, `:295` | **partial**: ref only (`ConnectionsPane.tsx:695`) |
| Tools / Edit Text Click, Add Translation Click | ua | advanced tools | `static/js/ConnectionsPanel.jsx:1059`, `:1068` | **missing** |
| Tools / Send Feedback | ua | feedback sent | `static/js/Misc.jsx:2705` | done: `ConnectionsPane.tsx:449` |
| Tools / My Sheet Click, Sheet Click, Sheet Owner Click, Topic Click; Sheets / Opened via Connections Panel | ua | sheet list in the sidebar | `static/js/Misc.jsx:1710-1726` (via `static/js/TextList.jsx:151`) | not built (sheets open Voices in a new tab, CON-017) |
| `guide_question_clicked`, `guide_answer_clicked` | gtag | Learning Guide | `static/js/GuideBox.jsx:134`, `:157` | not built |
| `guide_view_auto`, `guide_view_manual`, `guide_close`, `guide_click`, `guide_nav` | gtag | guide overlay | `static/js/GuideOverlay.jsx:205-283` | not built |
| `ai_marker_hover`, `learn_more_click`, `feedback_click` | tag | AI marker in the guide | `static/js/Misc.jsx:1472-1520`, used at `static/js/GuideBox.jsx:187` | not built |

**Search from the reader and header**

| Event | Ch. | Trigger | Legacy | reader-next |
|---|---|---|---|---|
| `search_focus`, `search_defocus`, `search_navto`, `search_submit`; Search / Search Box … | gtag, ua | header search box | `static/js/HeaderAutocomplete.jsx:215-518` | done: `lib/analytics/search-box.ts:18-45` |
| Search / SidebarSearch Query: `<type>` | ua | search in this text | `static/js/ElasticSearchQuerier.jsx:427` | **missing** (only the search page's "Query: text", `lib/analytics/search-flow.ts:110`) |
| Search / Sidebar Search Result Click | ua | sidebar search result | `static/js/SearchTextResult.jsx:63` | **missing** |
| `search_flow_started`, `search_query_executed`, `search_element_clicked`, `search_flow_ended` | gtag | search page | `static/js/sefaria/searchAnalytics.js:2-14` | done: `lib/analytics/search-flow.ts` (search area) |
| Search / Search Result Text Click, Sheet Click, Sheet Owner Click, Card Click | ua | search page results | `static/js/SearchTextResult.jsx:65`, `static/js/SearchSheetResult.jsx:17`, `:21`, `static/js/SearchResultCard.jsx:166` | **missing** (search area) |

**Promotions shown on reader pages**

| Event | Ch. | Trigger | Legacy | reader-next |
|---|---|---|---|---|
| `promo_viewed`, `promo_clicked` | gtag | sidebar promo, site-wide banner | `static/js/Promotions.jsx:107`, `:114`, `static/js/SiteWideBanner.jsx:132`, `:159` | not built |
| `modal_viewed`, `modal_interacted_with_*` | gtag+sa | Strapi modal | `static/js/Misc.jsx:2144-2157` | not built |
| `banner_viewed`, `banner_interacted_with_*` | gtag+sa | Strapi banner | `static/js/Misc.jsx:2287-2299` | not built |

Out of the reader (listed for completeness, owned by their areas): topics and topic-landing data-tag events (`navto_topic`,
`related_click`, `filter`, `lang_toggle_select`, `select_promotion`/`view_promotion`, `form_start`/`form_submit`,
`package_toggle`/`package_viewed`, `clickto_reader`, `search`/`sort_by` in `FilterableList`), Following, Newsletter, products page,
the old sheet editor (`static/js/sheets.js`) and Hotjar's `using_new_editor` (`static/js/Editor.jsx:2833`).

## Dependencies on other areas

- Events live in [Reader shell](../reader-shell/architecture.md) (panel `data-anl-batch`, page views on navigation),
  [Text display](../text-display/architecture.md), [Connections](../connections/architecture.md),
  [Versions](../versions/architecture.md), [Search](../search/architecture.md), [Accounts](../accounts/architecture.md)
  (auth funnel), [Promotions](../promotions/architecture.md) and [Topics](../topics/architecture.md).
- [SSR, SEO & platform](../platform-seo/architecture.md): head scripts and hydration (ANL-PAR-6).

## Risks and open questions

- **GTM and GA4 configuration is not in the repository.** Which tags, triggers and the `ga` shim GTM runs, and whether GA4
  enhanced measurement counts history changes as page views, can only be read in GTM/GA4. Someone with access should export the
  container so ANL-PAR-5 can be checked.
- **Same file or a port?** reader-next has a TypeScript port of the data tag (`declarative.ts`), not `analyticsEventTracker.js`
  itself. Does "the same vanilla JS data tag" mean loading the legacy file, or is a port with the same behaviour (shared tests)
  enough?
- **Attach timing.** The legacy tag listens before React runs (`templates/base.html:301` before `:307`); the port attaches after
  hydration (`src/routes/__root.tsx:121`), so clicks and on-screen events before hydration are lost.
- **Duplicate page views.** `gtag('config')` sends a page view each time it runs. `setAnalyticsUser` calls it again
  (`src/lib/analytics/session.ts:24`; no caller yet), and head scripts must not re-run on client navigation.
- **`Sefaria.track` timing.** The legacy wrapper checks for GTM's `ga` once, at bundle load (`static/js/sefaria/track.js:3-15`),
  and drops events when GTM is not ready yet; reader-next checks on every send (`core.ts:93`), so it may report events the old site
  drops. Same counts, or the corrected behaviour?
- **Vestigial events.** Keep or drop: `Display Option Click`, `Javascript Errors` (UA), UA page dimensions (ANL-010),
  `UI / <message>Accepted` (`static/js/Misc.jsx:2782`, `ReaderMessage` is no longer rendered), the sidebar sheet-list events if the
  sidebar keeps sending sheets to Voices.
- **Event names that move on `master`.** `master` now sends the auth funnel as `auth_*` (`static/js/auth/authAnalytics.js`);
  reader-next and the atlas have the `sign_up_*` names of `signupAnalytics.js`, which is no longer on `master`. Parity has to
  follow `master` until the switch.
- **VWO, Hotjar, Unbounce** are not loaded by reader-next; ANL-PAR-1 makes them required unless someone decides otherwise.

## Decisions

- 2026-10-28 — Analytics parity: keep every analytics event and dimension the current reader has, captured the same way, with the
  same vanilla JS data tag. Akiva Berger (owner). [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793193685517999)
- 2026-10-06 — One analytics module, same GA4/GTM property, same event names and parameters as sefaria.org. Akiva (owner).
  `reader-next/docs/PHASE7_PLAN.md` §3

_Every decision is also logged in `../DECISIONS.md`._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: the two clients today

### Legacy client (`master`)

Where the atlas found this area's behaviour (files cited by its features, most-cited first):

- [`static/js/ReaderApp.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx) (11)
- [`static/js/Misc.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Misc.jsx) (4)
- [`static/js/Header.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Header.jsx) (2)
- [`static/js/BannerImpressionProbe.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/BannerImpressionProbe.jsx) (2)
- [`static/js/HeaderAutocomplete.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/HeaderAutocomplete.jsx) (1)
- [`static/js/ReaderPanel.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderPanel.jsx) (1)
- [`static/js/ConnectionsPanel.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ConnectionsPanel.jsx) (1)
- [`static/js/auth/signupAnalytics.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/auth/signupAnalytics.js) (1)
- [`static/js/auth/useSignUpTracking.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/auth/useSignUpTracking.js) (1)
- [`templates/base.html`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/base.html) (1)
- [`static/js/analyticsEventTracker.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/analyticsEventTracker.js) (1)
- [`static/js/sefaria/track.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/track.js) (1)
- [`static/js/sefaria/trackG4.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/trackG4.js) (1)
- [`static/js/client.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/client.jsx) (1)
- [`sefaria/settings_utils.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/settings_utils.py) (1)

Long-form audit write-up: `reader-next/docs/features/inv_02_reader_shell.md`, `reader-next/docs/features/inv_08_other.md`, `reader-next/docs/features/inv_01_urls_routing.md`, `reader-next/docs/features/inv_04_connections.md`.

### New client (`reader-next`, folder `reader-next/`)

Rebuild status of this area's features: done 13, partial 3, not applicable 1.

Implemented in (most features first):

- [`src/lib/analytics/session.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/session.ts) (3)
- [`src/lib/analytics/scripts.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/scripts.ts) (2)
- [`src/features/shell/BannerImpressionProbe.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/shell/BannerImpressionProbe.tsx) (2)
- [`src/lib/analytics/reader.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/reader.ts) (2)
- [`src/features/auth/signup-source.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/auth/signup-source.ts) (1)
- [`src/ui/SiteHeader`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/SiteHeader) (1)
- [`src/lib/analytics/search-box.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/search-box.ts) (1)
- [`src/lib/auth/analytics.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/auth/analytics.ts) (1)
- [`src/lib/analytics/declarative.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/declarative.ts) (1)
- [`src/lib/analytics/core.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/core.ts) (1)
- [`src/lib/analytics/sentry.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/sentry.ts) (1)

### Gaps: core and standard features not done (3)

| ID | Tier | Feature | Rebuild status |
|---|---|---|---|
| ANL-009 | standard | Reader interaction event names | partial |
| ANL-012 | standard | Sidebar analytics events | partial |
| ANL-014 | standard | Third-party analytics and testing scripts | partial |

_Generated 2026-10-14 from the atlas and `rebuild-status.json`. Architecture of each client as a whole: `reader-next/docs/ARCHITECTURE.md`._

<!-- BASELINE:END -->
