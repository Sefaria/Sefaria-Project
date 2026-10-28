---
area: i18n-a11y
title: Language & accessibility
domain: Site & accounts
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-19
---
# Language & accessibility — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

No target architecture yet. Research in the thread mapped how each client decides the **interface language** (UI strings,
direction, site domain) and the **content language** (Hebrew, English or bilingual text), what `reader-next` ports and what it
leaves out. Below: the rules in each client, legacy behaviour not to port, and open questions, all *ideas* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792386183143639). Version and
translation preferences are in [Versions](../versions/architecture.md).

## Legacy approach vs new approach

**Interface language: legacy (`master` @ 121350b).** Resolved per request in `LanguageSettingsMiddleware`
([`sefaria/system/middleware.py:120-187`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L120-L187)), after Django's LocaleMiddleware ([`sefaria/settings.py:120-146`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/settings.py#L120-L146)).
- Precedence: profile `settings.interface_language` → `interfaceLang` cookie → `cf-ipcountry` (`IL` → hebrew) →
  Accept-Language (`he`, `he-il`) → `english`; any other value becomes english ([`sefaria/system/middleware.py:89-96`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L89-L96),
  [`sefaria/system/middleware.py:120-125`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L120-L125)).
- API and account paths (`/api/`, `/interface/`, `/accounts/` …) use request signals only: no profile, no domain check, content
  fixed to `bilingual` ([`sefaria/system/middleware.py:108-118`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L108-L118)).
- Domain pinning: a host listed under one language is pinned ([`sefaria/utils/domains_and_languages.py:34-62`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/utils/domains_and_languages.py#L34-L62)); when the
  resolved language differs, the reader is sent (302) to the other domain with `?set-language-cookie`, keeping the module
  ([`sefaria/system/middleware.py:127-147`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L127-L147)). The language picks the domain, not the reverse.
- Bots (Googlebot, curl, `sefaria-node` …) are never redirected and get the domain's language
  ([`sefaria/system/middleware.py:131-136`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L131-L136)). Non-Torah sites force English interface and content
  ([`sefaria/system/middleware.py:160-162`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L160-L162)).
- Three writers of the setting:
  1. `/interface/<english|hebrew>?next=`: cookie on the parent cookie domain, profile save when signed in, domain switch
     ([`reader/views.py:1685-1718`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L1685-L1718)).
  2. `?set-language-cookie`: sets the cookie to the domain's language and saves the profile ([`sefaria/system/middleware.py:210-234`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L210-L234)).
  3. Account settings page: saves the profile only, no cookie ([`templates/account_settings.html:268-300`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/templates/account_settings.html#L268-L300)).

  The client never writes the cookie; it receives `interfaceLang` in base props ([`reader/views.py:349`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L349)).

**Interface language: new (`reader-next` @ 837d585).**
- Cookie only: `interfaceLang === "hebrew"`, else english, read in the root `beforeLoad`; it drives `<html lang dir>`
  ([`src/routes/__root.tsx:36-42`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/routes/__root.tsx#L36-L42)). No profile, domain, `cf-ipcountry` or Accept-Language (I18-010 todo).
- `/interface/<lang>?next=` is answered by the new client: a 302 to a same-site `next` with a host-only `interfaceLang` cookie
  that lasts a year ([`src/routes/interface.$lang.tsx:5-11`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/routes/interface.$lang.tsx#L5-L11), [`src/lib/shell/interface-language.ts:16-26`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/shell/interface-language.ts#L16-L26)). `interface` is not
  in `DJANGO_PREFIXES` ([`src/server/pass-through.ts:17-23`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/server/pass-through.ts#L17-L23)), so Django's handler never runs, even for links on Django-rendered
  pages: no profile save, no domain switch, no parent-domain cookie (RTE-034).
- Same cookie name and values, so each client reads the other's. Scope and lifetime differ (host-only, 1 year here; parent
  domain, session in Django), so two `interfaceLang` cookies with different values can coexist and both parsers take the last
  one ([`src/lib/reader/settings.ts:91-105`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/reader/settings.ts#L91-L105)). Read from the code, not tested in a browser.
- Signed in, Django pages follow the profile and the new client the cookie, so the two can show different languages.

**Content language: legacy.**
- Server default: `?lang` → `contentLang` cookie → `hebrew` if the interface is Hebrew, else `bilingual`
  ([`sefaria/system/middleware.py:149-156`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L149-L156)). Never stored in the profile.
- Per panel: `lang` for the first panel, `lang<n>` for later ones, else the default ([`reader/views.py:858-905`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L858-L905)). Changing it
  writes the `contentLang` cookie and the default for new panels ([`static/js/ReaderPanel.jsx:530-549`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/ReaderPanel.jsx#L530-L549)).
- Forced by context: topics, calendars and collections menus are bilingual in an English interface and Hebrew in a Hebrew
  one; other menus and sidebars not in list mode are Hebrew in a Hebrew interface, and bilingual becomes English otherwise
  ([`static/js/ReaderPanel.jsx:145-160`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/ReaderPanel.jsx#L145-L160)). Sidebars opened on the client are single-language ([`static/js/ReaderApp.jsx:1862`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/ReaderApp.jsx#L1862)).

**Content language: new.**
- `language` cookie, then `contentLang`, then `bilingual` ([`src/lib/reader/settings.ts:61-65`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/reader/settings.ts#L61-L65)); a panel's URL `lang` /
  `lang<n>` overrides it ([`src/lib/reader/url-state.ts:78-85`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/reader/url-state.ts#L78-L85)). The default ignores the interface language.
- Changing it writes both cookies for a year ([`src/features/reader/settings-context.tsx:14-36`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/settings-context.tsx#L14-L36)). A sidebar opens as Hebrew if
  the stored language is Hebrew, else English ([`src/features/reader/TextPanel.tsx:76`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L76)); a missing side falls back for display
  only, as in legacy ([`src/features/reader/TextPanel.tsx:88-97`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L88-L97)).

**Gaps in `reader-next`.**
- Interface resolution has no profile, location, browser language or domain (I18-010); `/interface` drops profile save, domain
  switch and parent-domain cookie (RTE-034).
- Content default is never Hebrew for a Hebrew interface (SHL-007); menus are not forced by interface language (SHL-013).
- Signed in, no language setting is read from or written to the profile.

## Legacy behaviour not to port

Each is an *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792386183143639).
- **Browser language is effectively ignored.** Cloudflare sends `cf-ipcountry` on every request, so the chain stops there and
  any country but Israel gives English; a Hebrew browser outside Israel gets English ([`sefaria/system/middleware.py:89-96`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L89-L96)).
- **Signed-in readers never get the cookie or location.** Every profile has `interface_language` (default `"english"`,
  [`sefaria/model/user_profile.py:404-410`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/model/user_profile.py#L404-L410)), even when the reader never chose, so a default profile opening sefaria.org.il is
  sent back to sefaria.org.
- **Unvalidated `lang` in reader views.** The raw `GET lang` skips the middleware's check: `?lang=fr` gives
  `settings.language = "fr"` ([`reader/views.py:858`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L858), [`reader/views.py:620-627`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L620-L627)).
- **`contentLang` is host-only**, so the choice is not shared between sefaria.org and sefaria.org.il
  ([`static/js/ReaderPanel.jsx:530-549`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/ReaderPanel.jsx#L530-L549)).

## Target architecture

_Not discussed yet. Items carry a status: idea · proposed · agreed · decided._

## Dependencies on other areas

- [Versions & translations](../versions/architecture.md): translation-language preference and version stickiness use the same
  cookie / profile split.
- [URLs & routing](../routing/architecture.md): `/interface`, the Django pass-through list and the language domains.
- [Accounts & sign-in](../accounts/architecture.md): profile settings for signed-in readers (ACC-003).
- [Text display & reading settings](../text-display/architecture.md): the proposed settings registry (PR #3822).

## Risks and open questions

All *ideas*, not decisions · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792386183143639).
- `/interface/*`: pass it through to Django (add `interface` to `DJANGO_PREFIXES`), or reimplement it in the new client with
  profile save, domain switch and the parent-domain cookie?
- Should the server resolve the interface language as legacy does (profile → cookie → country → browser language, with
  sefaria.org.il pinning), and if so check Accept-Language before the country header so it is not dead?
- Align `interfaceLang` scope and lifetime with Django (parent domain; session or 1 year) so there is one cookie, not two that
  diverge?
- Should the content-language default follow a Hebrew interface? Should content language be stored per user in the profile?
- Interface and content language as entries in the proposed settings registry ("Settings → display model (proposal)" in Text
  display, PR #3822), with their scope (per user; content language with a per-panel URL override) declared there?

## Decisions

_None yet. Every decision is also logged in `../DECISIONS.md`._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: the two clients today

### Legacy client (`master`)

Where the atlas found this area's behaviour (files cited by its features, most-cited first):

- [`static/js/Misc.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Misc.jsx) (7)
- [`sefaria/system/middleware.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sefaria/system/middleware.py) (4)
- [`static/js/ReaderApp.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx) (3)
- [`static/js/ReaderPanel.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderPanel.jsx) (3)
- [`static/js/Header.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/Header.jsx) (2)
- [`static/js/common/DropdownMenu.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/common/DropdownMenu.jsx) (2)
- [`static/js/common/Button.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/common/Button.jsx) (1)
- [`reader/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py) (1)
- [`static/js/sefaria/strings.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/strings.js) (1)
- [`static/js/sefaria/sefaria.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/sefaria.js) (1)
- [`static/js/sefaria/i18n/interface/en.json`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/i18n/interface/en.json) (1)
- [`sites/sefaria/site_settings.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/sites/sefaria/site_settings.py) (1)
- [`sites/generic`](https://github.com/Sefaria/Sefaria-Project/blob/master/sites/generic) (1)
- [`sites/s4d`](https://github.com/Sefaria/Sefaria-Project/blob/master/sites/s4d) (1)
- [`static/js/sefaria/util.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/util.js) (1)

Long-form audit write-up: `reader-next/docs/features/inv_02_reader_shell.md`, `reader-next/docs/features/inv_08_other.md`, `reader-next/docs/features/inv_01_urls_routing.md`.

### New client (`reader-next`, folder `reader-next/`)

Rebuild status of this area's features: done 2, partial 3, not started 8.

Implemented in (most features first):

- [`src/ui/SiteHeader`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/SiteHeader) (2)
- [`src/ui/SkipLink`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/SkipLink) (1)
- [`src/routes/__root.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/routes/__root.tsx) (1)
- [`src/features/reader/TextPanel.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx) (1)

### Gaps: core and standard features not done (10)

| ID | Tier | Feature | Rebuild status |
|---|---|---|---|
| I18-001 | core | Content, translation and version preferences | partial |
| I18-003 | core | Tabbing detection and panel focus management | partial |
| I18-008 | core | Interface language switcher | partial |
| I18-009 | core | Interface string translation system | not started |
| I18-010 | core | Interface and content language resolution | not started |
| I18-011 | core | Accessible custom dropdown and toggles | not started |
| I18-013 | core | Right-to-left layout and Hebrew numerals | not started |
| I18-004 | standard | Legacy toggle sets, tab view, radio, button a11y | not started |
| I18-005 | standard | ARIA landmarks and headings in shell | not started |
| I18-006 | standard | Interface language menu (anonymous) | not started |

_Generated 2026-10-14 from the atlas and `rebuild-status.json`. Architecture of each client as a whole: `reader-next/docs/ARCHITECTURE.md`._

<!-- BASELINE:END -->
