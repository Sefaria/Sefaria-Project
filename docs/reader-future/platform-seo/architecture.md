---
area: platform-seo
title: SSR, SEO & platform
domain: Platform
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-15
---
# SSR, SEO & platform — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

Server rendering and loading time are to be kept minimal, and repaints are to be monitored in production on load and on
interactions (scroll, click). The legacy sefaria.org reader (`master`) has a repainting issue that the new design must avoid
([Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792052319198069?thread_ts=1792048275.276949&cid=C0C9EGTL468)). Today
sefaria.org reports LCP above 4 s on every page (Google Search Console). The concrete legacy causes, and what `reader-next`
does about each, are in [Legacy load/repaint issues vs. new arc](#legacy-loadrepaint-issues-vs-new-arc).

## Legacy approach vs new approach

- **Legacy (`master`):** Django posts page props to the Node SSR server and injects its HTML; the browser then hydrates and
  seeds its caches from the same props (PLT-003, PLT-004, `reader/views.py:206-285`, `static/js/client.jsx:11-73`). On load
  the reader paints the top of the chapter first, then jumps to the linked segment after hydration (TXD-054, verified
  2026-10-04). Front-end performance traces go to Sentry (`static/js/client.jsx:21`, ANL-017).
- **New (`reader-next`):** the client renders reader pages on the node pods and passes the rest to Django (PLT-003, decision
  2026-10-06). Repaints and layout shift are checked in the lab only: per-step jump analysis and CLS in
  [`e2e/smoothness.spec.ts:120`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/e2e/smoothness.spec.ts#L120) and [`scripts/jank-probe.mjs:16`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/scripts/jank-probe.mjs#L16)
  (TXD-068). No production measurement of LCP, INP or CLS exists in `reader-next/src/`; Sentry tracing and replay are wired
  but their sample rates default to 0 ([`src/lib/analytics/sentry.ts:39-42`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/sentry.ts#L39-L42); live rates per ANL-017).

## Legacy load/repaint issues vs. new arc

"Current architecture" means the legacy sefaria.org reader (`master`) — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792052319198069?thread_ts=1792048275.276949&cid=C0C9EGTL468).
Each row is a cause of slow mobile LCP or of repaints found in `master`, checked against `reader-next` code (code beats spec).
Status: **solved** (code does it, with evidence), **partly**, **not solved**, **not in spec**. The gaps are not decisions; they
are listed under [Risks and open questions](#risks-and-open-questions).

*Lab numbers* (2026-10-15, indicative only): Playwright with Chromium, Pixel 7 emulation, 4× CPU slow-down, 1.6 Mbps / 150 ms.
Legacy = live www.sefaria.org; new = `reader-next` production build (`npm run build`, `node server/index.mjs`) against the live
API. In the test container unpkg, cdnjs and use.typekit.net were unreachable, so legacy fell back to its local development React
and neither client got Adobe Garamond.

| Page | Legacy LCP · CLS (load) | New LCP · CLS (load) |
|---|---|---|
| `/Genesis.1` | 27.6 s · 0.98 | 1.9 s · 0.006 |
| `/Berakhot.2a` | 25.2 s · 1.00 | 1.7 s · 0.17 |
| `/Genesis.1.5` (deep link) | 26.4 s · 0.03 | 2.7 s · 0.16 |

On legacy the LCP element is a translation segment (`span.contentSpan.en.translation`), painted only after the scripts run and
the text loads; before that, the largest paints are the "Want to change the translation?" strip and the cookie notice. Without
throttling legacy `/Genesis.1` still has LCP 5.2 s. On the new client the LCP element is the first Hebrew segment, in the server HTML.

| # | Issue | Legacy evidence (`master`) | New arc status (`reader-next`) | Gap / what's still needed |
|---|---|---|---|---|
| 1 | The text is not in the server HTML | `TextRange` starts with `data: null` and loads the text only in `componentDidMount`, so the server renders "Loading…" ([`static/js/TextRange.jsx:18-28`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L18-L28), [`:101-104`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L101-L104), [`:231-236`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextRange.jsx#L231-L236)), even though Django already put the text in the props ([`reader/views.py:629-652`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py#L629-L652)). Live `/Genesis.1`: 0 segments in the HTML. | **Solved.** The route loader fills the cache on the server and the page renders from it ([`src/features/reader/reader-route.ts:41-82`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/reader-route.ts#L41-L82)); built `/Genesis.1` HTML holds all 31 segments. | — |
| 2 | Server render path and its fallback | Django builds props, POSTs them to Node, Node calls `renderToString`; any Node error or a 5 s timeout falls back to a client-only loading page ([`reader/views.py:206-283`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py#L206-L283), [`node/server.js:87-138`](https://github.com/Sefaria/Sefaria-Project/blob/master/node/server.js#L87-L138), `NODE_TIMEOUT = 5` in [`helm-chart/…/local-settings-file.yaml:204`](https://github.com/Sefaria/Sefaria-Project/blob/master/helm-chart/sefaria/templates/configmap/local-settings-file.yaml#L204)). | **Partly.** One Node render, no Django hop (PLT-003). But the loader awaits its API calls one after another (passage, then index metadata, sometimes a second passage: [`reader-route.ts:51-68`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/reader-route.ts#L51-L68)) and each request gets a fresh query cache ([`src/router.tsx:10`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/router.tsx#L10)), so only Varnish caches texts between requests. | No server-time (TTFB) budget or server timing in the spec or code; no decision on a cross-request cache or streaming. |
| 3 | Large blocking JavaScript and data | `data.js` (9.4 MB raw, 1.4 MB gzip on the wire) as a blocking script ([`templates/base.html:258`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/base.html#L258)); React 16, jQuery and jQuery UI from third-party CDNs as blocking scripts ([`:251-254`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/base.html#L251-L254)); client bundle 3.6 MB raw / 0.9 MB gzip ([`:307`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/base.html#L307)); about 97 KB of props inline ([`:272`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/base.html#L272)); hydration waits for document ready ([`static/js/client.jsx:11`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/client.jsx#L11)). | **Solved for size, partly for budget.** One module entry with route chunks; about 300 KB of JS on the wire for a text page in the lab; no `data.js`; Sentry is imported only when it starts ([`src/lib/analytics/sentry.ts:34`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/sentry.ts#L34)). Hydration still finished at about 5.9 s on `/Berakhot.2a` in the lab (longest task 1.6 s on `/Genesis.1`). | No JS-size or hydration-time budget checked in CI ([`vite.config.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/vite.config.ts) has none). Until hydration, buttons and segment taps do nothing (plain links still work). |
| 4 | Web fonts hide or reflow the text | The WebFont loader is a blocking script ([`templates/base.html:79-102`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/base.html#L79-L102)) and `.wf-loading { visibility: hidden }` hides the page until Google and Adobe fonts load or time out ([`static/css/common.css:3-8`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/css/common.css#L3-L8)); Taamey Frank is uncompressed TTF with no `font-display` ([`static/css/font-faces.css:1-6`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/css/font-faces.css#L1-L6)). | **Partly.** Self-hosted woff2 with `font-display: swap` and preloads ([`src/routes/__root.tsx:53-66`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/routes/__root.tsx#L53-L66), [`src/ui/tokens/fonts.css:18-26`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/tokens/fonts.css#L18-L26)). But: the Adobe Fonts stylesheet is a blocking third-party stylesheet whose faces are `font-display: auto` ([`src/lib/fonts/typekit.ts:1-13`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/fonts/typekit.ts#L1-L13)); seven fonts are preloaded, two of them TTF; in the lab, the text shifts as Crimson Text and Taamey Frank arrive (CLS 0.16–0.17 at 3.4–4.8 s on `/Berakhot.2a` and `/Genesis.1.5`); on a deep link the text is hidden up to 600 ms while fonts load ([`src/features/reader/use-reading-scroll.ts:391-404`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/use-reading-scroll.ts#L391-L404)), the likely reason deep-link LCP is 2.7 s against 1.7–1.9 s. | A font policy: which faces are on screen at first paint, size-matched fallbacks or a font-load budget, and whether Adobe Garamond stays third-party (see `reader-next/docs/PARITY_SHOTS.md`). |
| 5 | A/B-test snippet hides the page | VWO SmartCode sets `body { opacity: 0 }` for up to 2 s (`settings_tolerance=2000`, `hide_element='body'`): [`templates/base.html:153-165`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/base.html#L153-L165); present on live pages today. | **Partly.** Not ported; marked as an owner decision ([`src/lib/analytics/scripts.ts:10`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/scripts.ts#L10), `reader-next/docs/PHASE7_PLAN.md:116`). GTM is still loaded ([`scripts.ts:30-33`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/scripts.ts#L30-L33)), and GTM can inject such tags. | Not in spec: whether page-hiding A/B tools (VWO or anything injected through GTM) are allowed. |
| 6 | Other third-party scripts in the head | Blocking Google Charts loader and optional chatbot script; Unbounce, Hotjar, Google and Apple sign-in, reCAPTCHA on every page ([`templates/base.html:75-77`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/base.html#L75-L77), [`:103`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/base.html#L103), [`:170-206`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/base.html#L170-L206)). | **Solved in code, not in spec.** Only GTM, gtag (async) and Simple Analytics (defer) ([`scripts.ts:28-63`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/scripts.ts#L28-L63)); Google sign-in loads after mount ([`__root.tsx:113-115`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/routes/__root.tsx#L113-L115)). | No rule or budget for third-party scripts, so this can regress as tools are ported. |
| 7 | Render-blocking CSS | 17 stylesheets in the head, `s2.css` alone 389 KB raw / 72 KB gzip ([`templates/base.html:105-134`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/base.html#L105-L134)). | **Partly.** About 36 KB of CSS on the wire in the lab, split per route; all of it is still render-blocking, including the third-party Adobe Fonts stylesheet (row 4). | No CSS budget. |
| 8 | Layout shift on load | "Loading…" blocks are replaced by the text, and scroll placeholders added after mount push the page by 90 px ([`static/js/TextColumn.jsx:34-35`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L34-L35), [`:209-223`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L209-L223)). Lab: one shift of 0.97 when the text arrives (`div.textRange.basetext` grows 772 px). | **Solved, except fonts** (row 4). Lab CLS 0.006 on `/Genesis.1`; lab gate "no layout shift on arrival" ([`e2e/smoothness.spec.ts:116-128`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/e2e/smoothness.spec.ts#L116-L128)), desktop viewport and dev server only. | The CLS gate does not run on a phone viewport or a production build. |
| 9 | Deep link paints the chapter top, then jumps (TXD-054) | After the text loads, `scrollToHighlighted` moves the page ([`static/js/TextColumn.jsx:185-205`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L185-L205), [`:225-239`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumn.jsx#L225-L239)). | **Solved**, at a cost (row 4). An inline script places the verse before first paint ([`use-reading-scroll.ts:391-406`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/use-reading-scroll.ts#L391-L406)); the router does not reset scroll on text pages ([`src/router.tsx:14-17`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/router.tsx#L14-L17)). | — |
| 10–13 | Scroll and click repaints | Segment numbers placed by jQuery after every load; infinite scroll inserting up to 10 sections above the reader; layout reads on every scroll event; opening the connections panel on a phone. | See [text display → Legacy approach vs new approach](../text-display/architecture.md#legacy-approach-vs-new-approach). | — |
| 14 | Banners and notices painted late | The cookie notice renders only in the browser ([`static/js/Misc.jsx:2820-2826`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Misc.jsx#L2820-L2826)) and in the lab was an LCP candidate at about 24–26 s; the translation strips decide from cookies at render time ([`static/js/TextColumnBanner.jsx:8-34`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumnBanner.jsx#L8-L34)); interrupting messages and banners always mount ([`static/js/ReaderApp.jsx:2585-2632`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx#L2585-L2632)). | **Partly.** The cookie notice is fixed-position and shown after mount, so it cannot move the text ([`src/ui/CookieNotice/CookieNotice.tsx:12-21`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/CookieNotice/CookieNotice.tsx#L12-L21)); the translation strip is in the server render and its height change is offset ([`src/features/reader/TextPanel.tsx:436-452`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx#L436-L452)). Interrupting messages, site-wide banners and Promotions are not ported. | Not in spec: how ported banners and modals avoid moving the text (reserved space, overlay, or server-rendered). |
| 15 | Nobody sees real-user numbers | Sentry tracing and replay default to rate 0 ([`static/js/client.jsx:22-34`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/client.jsx#L22-L34)); no LCP, INP or CLS collection in `static/js`. | **Not solved.** Same defaults ([`src/lib/analytics/sentry.ts:39-42`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/analytics/sentry.ts#L39-L42)); no LCP, INP or CLS code in `src/`; checks are lab-only ([`e2e/smoothness.spec.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/e2e/smoothness.spec.ts), [`scripts/jank-probe.mjs:1-16`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/scripts/jank-probe.mjs#L1-L16)). | Required by this spec (Target architecture, *proposed*), with no tool chosen. Without it no one can confirm that the GSC "100% above 4 s" changes. |

## Target architecture

- SSR payload and server time to first content are minimal; nothing that is not needed for the first screen is rendered or
  shipped up front. — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468)
- LCP on mobile within the "good" Core Web Vitals band (≤ 2.5 s per [web.dev](https://web.dev/articles/lcp)) is the target to
  consider; today GSC shows 100% of pages above 4 s. — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0B4Q00KNCA/p1791289154906489)
- Repaints and layout shifts are monitored in production (real users), both on load and on interactions such as scroll and
  click, not only in lab tests. — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468)
- The repainting issue of the legacy sefaria.org reader (`master`) is a known problem to design away from; its causes are listed
  in [Legacy load/repaint issues vs. new arc](#legacy-loadrepaint-issues-vs-new-arc). — *proposed* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792052319198069?thread_ts=1792048275.276949&cid=C0C9EGTL468)

## Dependencies on other areas

- [Text display](../text-display/architecture.md): scroll and click repaints in the reading column (TXD-052, TXD-068).
- [Analytics](../analytics/architecture.md): where real-user performance data is collected and reported (ANL-017).
- [Cross-cutting → Performance](../CROSS_CUTTING.md#performance).

## Risks and open questions

- Real-user monitoring tool: how and where repaints, LCP, INP and CLS are measured (Sentry tracing, a web-vitals beacon to GA4,
  Hotjar, or other). Not discussed yet. — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468)
- Targets for LCP, INP and CLS, and the device and network profile they hold for. — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468)
- Answered: "current architecture" is the legacy sefaria.org reader (`master`). Still open: is the repaint issue meant one of the
  causes in the table above, or a specific page and interaction that should become a test? — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792048342291029?thread_ts=1792048275.276949&cid=C0C9EGTL468) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792052319198069?thread_ts=1792048275.276949&cid=C0C9EGTL468)
- Gaps the new arc has not closed, found by checking `reader-next` code against the legacy causes (rows in the table above).
  They are listed by likely effect on mobile LCP and repaints. None is agreed yet; each needs someone to propose a requirement or
  drop it. — [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792052319198069?thread_ts=1792048275.276949&cid=C0C9EGTL468)
  1. No real-user LCP, INP or CLS measurement (row 15). Choosing the tool is the question above.
  2. Fonts (row 4): a blocking third-party Adobe Fonts stylesheet, seven preloads, reflow when faces arrive, and text hidden up
     to 600 ms on deep links. Is a font policy or budget needed?
  3. Page-hiding A/B and tag-manager scripts (row 5): are they allowed on reader pages?
  4. JS and hydration budget (row 3): should CI fail on bundle size or hydration time on a mid-range phone profile?
  5. Server time (row 2): is a TTFB budget needed, and should texts be cached across requests or fetched in parallel?
  6. Scroll and click work on the main thread ([text display](../text-display/architecture.md#risks-and-open-questions)).
  7. Banners and modals still to be ported (row 14): what rule keeps them from moving the text?
  8. Lab gates run on a desktop viewport and the dev server only (row 8): should they also run on a phone profile and a production build?

## Decisions

_None yet. Every decision is also logged in `../DECISIONS.md`._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: the two clients today

### Legacy client (`master`)

Where the atlas found this area's behaviour (files cited by its features, most-cited first):

- [`reader/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py) (22)
- [`static/js/sefaria/sefaria.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/sefaria.js) (10)
- [`templates/base.html`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/base.html) (9)
- [`static/js/client.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/client.jsx) (3)
- [`sefaria/sitemap.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/sitemap.py) (3)
- [`node/server.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/node/server.js) (2)
- [`sefaria/templatetags/sefaria_tags.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/templatetags/sefaria_tags.py) (2)
- [`sefaria/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/views.py) (2)
- [`static/js/sefaria/util.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/util.js) (2)
- [`sefaria/system/middleware.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/system/middleware.py) (2)
- [`templates/manifest.json`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/manifest.json) (2)
- [`scripts/scheduled/generate_sitemaps.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/scripts/scheduled/generate_sitemaps.py) (2)
- [`sites/sefaria/urls.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sites/sefaria/urls.py) (1)
- [`sefaria/system/context_processors.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/system/context_processors.py) (1)
- [`templates/js/data.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/js/data.js) (1)

Long-form audit write-up: `reader-next/docs/features/inv_08b_admin_linker_apps.md`, `reader-next/docs/features/inv_01_urls_routing.md`, `reader-next/docs/features/inv_08_other.md`.

### New client (`reader-next`, folder `reader-next/`)

Rebuild status of this area's features: done 2, partial 2, todo 4, deferred 1, replaced 5, not started 18.

Implemented in (most features first):

- [`src/router.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/router.tsx) (5)
- [`src/start.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/start.ts) (1)
- [`src/routes/$.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/routes/$.tsx) (1)

### Gaps: core and standard features not done (21)

| ID | Tier | Feature | Rebuild status |
|---|---|---|---|
| PLT-006 | core | Page titles and meta descriptions | partial |
| PLT-007 | core | Noindex rules | todo |
| PLT-008 | core | Canonical URLs and hreflang | todo |
| PLT-014 | core | Library and Voices module / domain helpers | deferred |
| PLT-019 | core | Mobile web specifics | partial |
| PLT-026 | core | Sitemaps | todo |
| PLT-027 | core | Canonical, hreflang, Open Graph and JSON-LD | todo |
| PLT-001 | standard | Favicons, manifest and app-link files | not started |
| PLT-009 | standard | Social sharing tags and JSON-LD | not started |
| PLT-010 | standard | Other head and third-party script items | not started |
| PLT-015 | standard | API helpers, breakpoints and page titles | not started |
| PLT-016 | standard | Cookie and browser storage inventory | not started |
| PLT-018 | standard | Universal links, app links and app promotion | not started |
| PLT-020 | standard | Per-module web manifest | not started |
| PLT-021 | standard | Module-specific favicons and app icons | not started |
| PLT-023 | standard | iOS universal links (apple-app-site-association) | not started |
| PLT-024 | standard | Android asset links | not started |
| PLT-025 | standard | robots.txt | not started |
| PLT-030 | standard | Print stylesheets | not started |
| PLT-031 | standard | Health checks and operational endpoints | not started |
| PLT-032 | standard | Scheduled jobs (cron) overview | not started |

_Generated 2026-10-14 from the atlas and `rebuild-status.json`. Architecture of each client as a whole: `reader-next/docs/ARCHITECTURE.md`._

<!-- BASELINE:END -->
