---
area: promotions
title: Promotions & CMS
domain: Site & accounts
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-16
---
# Promotions & CMS — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

Pop-ups and banners (CMS modals and banners, donation asks, the sign-up prompt, the translations strip, the cookie notice, later
onboarding tips) should all be shown through **one notice manager**, so that limits, auto-close and a reader-facing control can be
added in one place rather than in each feature. Nothing of this is built yet; this records the seam so the CMS notices
(PRM-010 to PRM-014) are built on it. Checked for forward compatibility on request: [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792041146749969?thread_ts=1792041146.749969&cid=C0C9EGTL468).

## Legacy approach vs new approach

- **Legacy (`master`):** the CMS modal and banner are chosen in `static/js/Promotions.jsx` with `strapiSelection.js` and
  `strapiTargeting.js` (dates, language, country, audience, past dismissals: PRM-013); the site-wide banner keeps its own
  "maybe later" back-off (`static/js/SiteWideBanner.jsx`, PRM-014). Each notice keeps its own state. (Files from the atlas
  baseline below.)
- **New (`reader-next`):** no shared surface yet. Each notice is mounted by the feature that owns it and stores its own dismissal.
  Paths are under `reader-next/` on `reader-next`.
  - Cookie notice: mounted in the root (`src/routes/__root.tsx:140`), own cookie `cookiesNotificationAccepted` for twenty years
    (`src/ui/CookieNotice/CookieNotice.tsx:9`, `:20-23`).
  - Translations strip (TXD-064): decided inside each text panel (`src/features/reader/TextPanel.tsx:437-438`, `:531-537`); session
    cookie `open_trans_banner_shown`, read on the server so the strip is in the first paint or not at all
    (`src/lib/reader/translations-banner.ts:9`, `src/lib/reader/banner-source.ts:12-17`).
  - Sign-up modal: mounted separately by the text panel and by the sidebar (`src/features/reader/TextPanel.tsx:529`,
    `src/features/reader/ConnectionsPane.tsx:673`).
  - The only coordination: Google One Tap waits while any "interruptive UI" is visible, found by a list of DOM selectors
    (`src/features/auth/use-google-one-tap.ts:17-19`).
  - Reusable parts exist: an accessible `Modal` on the native `<dialog>` (`src/ui/Modal/Modal.tsx:21`) and `TextColumnBanner`.
  - CMS modal and banner, ranking, targeting and donation prompts: not started (baseline below).
- **Forward compatibility:** fine today, because the notices that need limits are not built yet. Moving the three existing
  notices onto a manager is a small change (a few files). Building PRM-010 to PRM-014 without one would scatter caps and
  dismissal state again.

## Target architecture

- One notice manager for every pop-up and banner, mounted once in the app shell. Features and the CMS do not render notices
  themselves; they register a notice and the manager decides whether and when it shows. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792041146749969?thread_ts=1792041146.749969&cid=C0C9EGTL468)
  - **Notice descriptor** (declarative): `id`; `slot` (modal · top banner · column strip · bottom bar · toast); `priority`;
    `audience` (interface language, country, signed in or not, dates: PRM-013); `cap` (at most N per session / day / ever, and a
    snooze back-off as in PRM-014); `autoClose` (after N seconds, or on navigation); `dismissible` and "don't show again";
    `ssr` (may appear in the server render: the translations strip must, a modal must not); `category` (announcement, donation,
    tip, account, legal).
  - **Manager:** at most one notice per slot at a time, queued by priority; a global cap on interrupting notices (for example one
    modal per session) that category `legal` and notices the reader triggered (sign-up after "Save") do not count against; the
    single answer to "is interruptive UI showing", replacing One Tap's selector list.
  - **State:** one store of impressions and dismissals keyed by notice id: a cookie for anonymous readers (so the server render
    agrees with the browser) and the profile for signed-in readers, so a dismissal follows the reader across devices. Existing
    cookie names are kept for parity.
  - **Sources:** notices built into the client are registered in code; CMS (Strapi) modals, banners and sidebar promos map to the
    same descriptor; the CMS can switch a notice or a category off remotely.
  - **Reader control:** a settings entry with on/off per category (announcements, donation asks, tips), reading the same store. —
    *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792041146749969?thread_ts=1792041146.749969&cid=C0C9EGTL468)
  - **Analytics:** impression, click and close events come from the manager, not from each notice (ANL-004, ANL-006).

## Dependencies on other areas

- [Global UI](../global-ui/architecture.md): the `Modal`, cookie notice and sign-up modal become notices shown by the manager.
- [Accounts & sign-in](../accounts/architecture.md) and [Profiles & social](../profile-social/architecture.md): dismissal state and
  notice preferences stored on the profile for signed-in readers.
- [Text display](../text-display/architecture.md): the translations strip (TXD-064) is a column-strip notice rendered on the server.
- [SSR, SEO & platform](../platform-seo/architecture.md): a notice that is not in the server render must not move the text (CLS).
- [Analytics](../analytics/architecture.md): banner and modal events.

## Risks and open questions

- What are the caps (per session, per day), and who sets them: product in code, or editors in the CMS? · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792041146749969?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- Is the reader control a settings page with categories, or only "don't show again" on each notice? · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792041146749969?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- Saving dismissals on the profile needs a field and an endpoint on the server (not in the API today).
- Auto-close: after how long, and is it allowed for notices that ask for an action (donation, sign-up), given that screen-reader
  users may not reach them in time?

## Decisions

_None yet. Every decision is also logged in `../DECISIONS.md`._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: the two clients today

### Legacy client (`master`)

Where the atlas found this area's behaviour (files cited by its features, most-cited first):

- [`static/js/Misc.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Misc.jsx) (6)
- [`static/js/Promotions.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Promotions.jsx) (4)
- [`static/js/context.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/context.js) (3)
- [`static/js/ReaderApp.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx) (3)
- [`static/js/NavSidebar.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/NavSidebar.jsx) (3)
- [`sefaria/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/views.py) (3)
- [`static/js/Header.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Header.jsx) (2)
- [`static/js/sefaria/strapiSelection.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/strapiSelection.js) (2)
- [`static/js/sefaria/sefaria.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/sefaria.js) (2)
- [`static/js/SiteWideBanner.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/SiteWideBanner.jsx) (2)
- [`static/js/sefaria/sidebarAds.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/sidebarAds.js) (1)
- [`static/js/AddToSourceSheet.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/AddToSourceSheet.jsx) (1)
- [`static/js/sefaria/strapiTargeting.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/strapiTargeting.js) (1)
- [`static/js/sefaria/countryCandidates.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/countryCandidates.js) (1)
- [`templates/messages`](https://github.com/Sefaria/Sefaria-Project/blob/master/templates/messages) (1)

Long-form audit write-up: `reader-next/docs/features/inv_08_other.md`, `reader-next/docs/features/inv_02_reader_shell.md`, `reader-next/docs/features/inv_04_connections.md`.

### New client (`reader-next`, folder `reader-next/`)

Rebuild status of this area's features: not started 17.

### Gaps: core and standard features not done (15)

| ID | Tier | Feature | Rebuild status |
|---|---|---|---|
| PRM-005 | core | Donate links with source attribution | not started |
| PRM-010 | core | Interrupting modal (Strapi) | not started |
| PRM-011 | core | Top banner (Strapi) | not started |
| PRM-012 | core | Strapi CMS content pipeline | not started |
| PRM-013 | core | Promo eligibility, ranking and country targeting | not started |
| PRM-001 | standard | Interrupting modal message (CMS) | not started |
| PRM-002 | standard | Top banner message (CMS) | not started |
| PRM-003 | standard | Strapi data provider and content selection | not started |
| PRM-004 | standard | Donate link variants | not started |
| PRM-006 | standard | Ad keyword targeting context | not started |
| PRM-007 | standard | Sidebar ads (not in connections panel) | not started |
| PRM-008 | standard | Sidebar ads | not started |
| PRM-014 | standard | Site-wide banner with maybe-later back-off | not started |
| PRM-016 | standard | Newsletter signup form | not started |
| PRM-017 | standard | NavSidebar promo and donation modules | not started |

_Generated 2026-10-14 from the atlas and `rebuild-status.json`. Architecture of each client as a whole: `reader-next/docs/ARCHITECTURE.md`._

<!-- BASELINE:END -->
