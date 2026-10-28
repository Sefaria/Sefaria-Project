---
area: i18n-a11y
title: Language & accessibility
domain: Site & accounts
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-28
---
# Language & accessibility — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

Akiva asked for every default behind interface language, content language and version selection to be mapped and gathered into
one object, saved in the user's settings when signed in and in the session (cookies) otherwise, so a future settings page can give
readers more control. The way preferences are stored stays as it is · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793194426019629). Below are the inventory, a *proposed* object and
resolver, and the gaps. Nothing here is decided. The step-by-step walkthrough of each client's language rules is in PR #3826
(2026-10-19, still open).

## Legacy approach vs new approach

### Preference defaults: inventory

Each "sources" cell lists sources in order, and the first one with a value wins. Legacy citations are `master` @
[`e18dacc`](https://github.com/Sefaria/Sefaria-Project/tree/e18dacc0d3b2781fb2bacff89406a4d718fcac69). New-client citations are under `reader-next/` @ [`837d585`](https://github.com/Sefaria/Sefaria-Project/tree/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next). Both were read from
the code, not tested in a browser.

| Setting | Legacy: sources | New client: sources | Signed in: stored in | Anonymous: stored in | Written by |
|---|---|---|---|---|---|
| **Interface language** | profile `settings.interface_language` → `interfaceLang` cookie → `cf-ipcountry` (`IL` gives hebrew) → Accept-Language → `english` (`sefaria/system/middleware.py:90-96`, `:121-128`). Then the domain rule: a person whose language differs from the host's is redirected (302) to the other domain, and a bot gets the host's language (`:130-150`). Non-Torah sites are always English (`:161-163`). | `interfaceLang` cookie → `english` (`src/routes/__root.tsx:36-42`) | `settings.interface_language` (`sefaria/model/user_profile.py:408`) | `interfaceLang` cookie, on the parent domain (`.sefaria.org`; `sefaria/utils/domains_and_languages.py:137`) | Legacy: `/interface/<lang>` (`reader/views.py:1687-1721`), `?set-language-cookie` after a domain redirect (`sefaria/system/middleware.py:211-235`), registration copies the request's language (`sefaria/views.py:210-211`, `sso/adapters.py:176-177`), account settings (profile only; `templates/account_settings.html:268-292`). New: its own `/interface/<lang>`, which sets a host-only cookie and does not touch the profile (`src/lib/shell/interface-language.ts:16-26`). |
| **Content language** (panel default) | `?lang` → `contentLang` cookie → `hebrew` if the interface is Hebrew, else `bilingual` (`sefaria/system/middleware.py:153-158`). Each panel's `lang` / `lang<n>` overrides it (`reader/views.py:857`, `:877` sheets) | panel `lang` → `language` cookie → `contentLang` cookie → `bilingual` (`src/lib/reader/url-state.ts:79-85`, `src/lib/reader/settings.ts:34`, `:65`) | **none** | `contentLang` and `language` cookies, host-only (`static/js/ReaderPanel.jsx:542-547`; new `src/features/reader/settings-context.tsx:14-36`) | the display-settings menu |
| **Translation language** | profile `settings.translation_language_preference` → cookie of the same name → none (`sefaria/system/middleware.py:166`). If neither is set and the reader has not been asked yet, a suggestion is made from the country's languages that are in `en, es, fr, de`, never English (`:167-178`) | cookie → none (`src/lib/versions/preferences.ts:50-51`) | `settings.translation_language_preference`, `settings.translation_language_preference_suggested` | cookies `translation_language_preference`, `translation_language_preference_suggested` (host-only) | Legacy: the translation banner and the globe menu (`static/js/ReaderApp.jsx:2152-2165`), account settings. New: **nothing writes it** |
| **Translation version** | `ven` → corpus preference `{corpus: {en: title}}` if this text has that version → best translation in the translation language → API default (`static/js/sefaria/sefaria.js:790-821`). Server rendering ignores preferences (`reader/views.py:629-633`); the client fetches again (`:649`). | the same order, applied in the route loader, so it holds for server rendering too (`src/lib/versions/preferences.ts:86-103`, `src/features/reader/reader-route.ts:55-67`) | `version_preferences_by_corpus`, a top-level profile field, not under `settings` (`sefaria/model/user_profile.py:413`) | cookie `version_preferences_by_corpus` (URL-encoded JSON, host-only) | Picking a translation. Legacy: cookie + `POST /api/profile` (`static/js/sefaria/sefaria.js:1114-1121`). New: cookie only, kept for a year (`src/lib/versions/prefs-source.ts:21-25`) |
| **Source version** | `vhe` → API `primary` (highest `priority` with `isPrimary`) (`static/js/sefaria/sefaria.js:795-799`; `sefaria/model/text_request_adapter.py:15-34`, `:96-121`) | `vhe` → API `primary` (`src/lib/text/queries.ts:30`) | **none**: a source choice is never stored (`static/js/sefaria/sefaria.js:1115`) | **none** | — |
| **API default** (apps, embeds, new client) | `/api/v3/texts`: with no `version` param it returns `primary`. The keywords `primary`, `source`, `translation`, `<language>` and `all` take the highest `priority` match. No user preference is applied (`api/views.py:68-70`; `sefaria/model/text_request_adapter.py:96-121`). The v1 `/api/texts` takes `transLangPref` (`reader/views.py:1797`). | same API | — | — | — |
| **Textual custom** (calendars) | profile `settings.textual_custom` (default `sephardi`) → for anonymous readers `ashkenazi` (`sefaria/model/user_profile.py:409`, `reader/views.py:1334-1340`) | not sent: `/api/calendars?diaspora=1` (`src/lib/library/calendars.ts:31`) | `settings.textual_custom` | **none** | account settings |
| **Israel / diaspora** (calendars) | `cf-ipcountry` → `PINNED_IPCOUNTRY` → `us`; diaspora unless the country is `il` (`sefaria/system/middleware.py:66-83`) | always diaspora (`src/lib/library/calendars.ts:31`) | **none** | **none** | — |
| **Display settings**: layout ×3, `biLayout`, `vowels`, `punctuationTalmud`, `aliyotTorah`, `fontSize`, `color` | cookie of the same name → site default (`reader/views.py:351-362`). Panel `aliyot` overrides (`reader/views.py:868-869`). | the same cookies and defaults (`src/lib/reader/settings.ts:33-76`) | **none** | cookies of the same names, host-only (`static/js/ReaderPanel.jsx:547`; new `src/features/reader/settings-context.tsx:14-36`) | the display-settings menu |

Account-only settings that a settings page would also show: `email_notifications`, `reading_history`, `library_assistant`
(`sefaria/model/user_profile.py:406-412`, `templates/account_settings.html:268-286`). The mobile app syncs a free-form `settings` dict
through `POST /api/profile/sync`, where the newest timestamp wins (`reader/views.py:4404-4422`). Which keys the app sends is not
in this repository (**unverified**).

## Target architecture

_Items carry a status: idea · proposed · agreed · decided._

### Effective preferences: one object, one resolver — *proposed* (Claude Tag draft) · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793194426019629)

Every default in the inventory is computed in one place, as a value plus where it came from, so the reader and a settings page
read the same thing. Storage does not change. Each field reads and writes the stores listed in the inventory.

```ts
type Source =
  | "url"            // ?lang, ven/vhe: this view only, never saved
  | "profile"        // UserProfile.settings / version_preferences_by_corpus
  | "cookie"         // anonymous (or signed-in fallback) cookie
  | "domain"         // host pinned to a language (bots; .org.il)
  | "geo"            // cf-ipcountry
  | "browser"        // Accept-Language
  | "interface"      // derived from the interface language (content default)
  | "text"           // the text's own default (API priority)
  | "site";          // hard-coded default

interface Pref<T> { value: T; source: Source }

interface ReaderPreferences {
  interfaceLang: Pref<"english" | "hebrew">;
  contentLang: Pref<"bilingual" | "hebrew" | "english">;    // default for new panels
  translationLanguage: Pref<string | null>;                 // ISO code
  translationLanguageSuggestion?: string;                   // derived, never stored
  versionsByCorpus: Pref<Record<string, { en?: string; he?: string }>>;
  textualCustom: Pref<"ashkenazi" | "sephardi">;
  diaspora: Pref<boolean>;
  display: {                                                // the existing ReaderSettings fields
    [K in keyof ReaderSettings as Exclude<K, "language">]: Pref<ReaderSettings[K]>;
  };
}

// Pure: same code on the server (root beforeLoad, where getRequestPrefs runs today) and in the browser.
function resolvePreferences(req: {
  host: string; domainLang?: "english" | "hebrew"; country?: string; acceptLanguage?: string;
  isBot: boolean; torahSpecific: boolean; query: { lang?: string };
}, stored: { profile?: ProfileSettingsSubset; cookies: Record<string, string> }): ReaderPreferences;

// Per panel, per text: which versions to request and why.
function resolvePanelVersions(prefs: ReaderPreferences, text: { corpus?: string; versions: VersionMeta[] },
  url: { ven?: string; vhe?: string }): {
  primary: Pref<string>; translation: Pref<string>;          // "family|title" or an API keyword
  fallback?: "preferred-version-missing" | "no-translation-in-language" | "no-translation";
};
```

- **Precedence** is legacy's for parity (inventory table). Where legacy behaves badly (Risks below), the fix is a separate decision
  and not part of this object.
- **Writes** go through one `savePreference(key, value)`. Signed in, it POSTs the existing `/api/profile` fields (`settings.*` or
  `version_preferences_by_corpus`) and also writes the cookie, so server rendering and a later sign-out keep the value. Anonymous,
  it writes the cookie only. This wraps the stores that exist today and adds no new ones.
- **Where it lives in `reader-next`**: computed by the server function in the root route's `beforeLoad`
  (`src/routes/__root.tsx:36-42`, which today reads only cookies), dehydrated into router context, and re-run on the client
  after a change. `reader-route.ts` and `settings-context.tsx` read it instead of parsing cookies themselves. It fits the
  settings registry ideas in Text display (PR #3822) and the integration command layer (`../CROSS_CUTTING.md`): a
  `sefaria:settings-updated` event becomes one `savePreference` per field.
- **Settings page** shows each field's `source`, for example "Hebrew (from your location)" or "English (you chose)", and lets
  the reader replace it or reset it to the default.

**Mapping onto existing stores.** Fields marked "none" in the inventory have no store today: content language and display
settings (signed in), textual custom (anonymous), Israel / diaspora, and source version. These are gaps to decide on, not a new
storage design.

## Dependencies on other areas

- [Versions & translations](../versions/architecture.md): `resolvePanelVersions`, version and translation-language stores.
- [Text display & reading settings](../text-display/architecture.md): the `display` group (theme included) and the settings registry (PR #3822).
- [Accounts & sign-in](../accounts/architecture.md): the account settings page (ACC-003, still Django at `/settings`), the profile read path.
- [Calendars](../calendars/architecture.md): textual custom and Israel / diaspora.
- [URLs & routing](../routing/architecture.md): `/interface`, `DJANGO_PREFIXES`, the language domains (I18-010).

## Risks and open questions

**Gaps and silent overrides** (read from the code; *ideas* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1793194426019629)).

1. **Every profile has an interface language.** The default `"english"` (`sefaria/model/user_profile.py:408`) means the profile
   always wins for a signed-in reader (`sefaria/system/middleware.py:125-126`). A reader who never chose cannot be told apart from
   one who chose English, so cookie, location and browser are never used for them.
2. **Guesses are saved as if the reader chose them.** A location-based domain redirect sets `interfaceLang` and, when signed in,
   the profile (`sefaria/system/middleware.py:229-234`). Registration copies the request's language, which may come from location,
   into the profile (`sefaria/views.py:210-211`). Neither store keeps where a value came from, so `source` is `profile` /
   `cookie` for existing data. The only "was it chosen" flag today is `translation_language_preference_suggested`.
3. **Browser language is ignored behind Cloudflare.** `cf-ipcountry` is always present, so any country but `IL` gives English
   before Accept-Language is read (`sefaria/system/middleware.py:93-96`).
4. **Domain vs choice.** The language picks the domain, not the reverse. An explicit English choice opened on sefaria.org.il
   redirects to sefaria.org (`sefaria/system/middleware.py:133-148`). Only bots are pinned. `reader-next` has no domain rule at
   all, so bots on .org.il get English (I18-010).
5. **Signed-in preferences are not read by `reader-next`.** Interface, translation language and corpus versions come from cookies
   only (`src/routes/__root.tsx:36-42`, `src/lib/versions/prefs-source.ts:10-15`). A new device loses them. Legacy pages copy the
   profile's corpus preferences into the cookie on every load (`static/js/sefaria/VersionPreferences.js:7`, `:27-29`), so the
   loss shows only before the reader visits a Django page. No JSON GET returns the owner's settings and version preferences:
   `GET /api/profile/<slug>` leaves them out (`sefaria/model/user_profile.py:768-801`), and `/api/profile/sync` returns
   `settings` only (`reader/views.py:4452`). Legacy puts them in page props (`reader/views.py:310-311`).
6. **`reader-next` never writes preferences to the profile** (version choice: `src/features/reader/TextPanel.tsx:413-420`;
   interface: `src/lib/shell/interface-language.ts:16-26`). It never writes the translation-language cookie either (VER-001).
   `/interface` is answered by the new client, not Django (`interface` is not in `src/server/pass-through.ts:17-23`, RTE-034).
7. **Sign-in does not merge.** Registration copies only the interface language. Translation language, corpus versions and
   display cookies are not saved to the new profile. At read time the profile replaces the whole cookie object instead of
   merging per corpus (`sefaria/system/middleware.py:166`, `:183`).
8. **Cookie and profile disagree silently.** Legacy picks the profile. The new client picks the cookie. The same signed-in reader
   can see different languages on Django pages and on new-client pages.
9. **Host-only cookies split the site.** Only `interfaceLang` is set on the parent domain. Content language, display, translation
   language and corpus cookies are host-only (`static/js/ReaderPanel.jsx:543-547`, `static/js/sefaria/VersionPreferences.js:28`,
   `static/js/ReaderApp.jsx:2159-2160`; new `settings-context.tsx:16`, `prefs-source.ts:24`). So a choice made on
   www.sefaria.org does not carry to voices.sefaria.org (sheets) or to sefaria.org.il. Legacy cookies have no `expires` and last
   only for the browser session. The new client's last a year.
10. **Translation language with no translation in that language.** The client falls through to the API's `translation`: the
    highest-priority non-source version in any language (`sefaria/model/text_request_adapter.py:102-103`). The reader is not
    told. The same happens when a corpus preference names a version this text lacks.
11. **No stored source-version preference.** Choosing a Hebrew or source version is dropped (`static/js/sefaria/sefaria.js:1115`;
    the new client remembers translations only). Preferences are per corpus, so a text without a corpus can never get one.
12. **Content language is never stored for signed-in readers**, and `reader-next` does not follow a Hebrew interface: Hebrew
    interface with no cookie gives `hebrew` in legacy and `bilingual` in the new client (`sefaria/system/middleware.py:153`;
    `src/lib/reader/settings.ts:34`). The same applies to display settings and theme (cookies only).
13. **Calendars.** `textual_custom` defaults disagree: `sephardi` for profiles, `ashkenazi` for anonymous readers
    (`sefaria/model/user_profile.py:409`, `reader/views.py:1339`). Israel / diaspora comes from location only and cannot be set.
    `reader-next` hard-codes diaspora and sends no custom (`src/lib/library/calendars.ts:31`).
14. **Apps vs web.** `/api/v3/texts` applies no preferences (`api/views.py:68-70`), so every client re-implements the order. Web
    `POST /api/profile` does not bump `attr_time_stamps.settings` (`reader/views.py:4199`), so a later app sync with a newer clock
    overwrites the keys it sends (`reader/views.py:4415-4422`). Which keys the app sends is **unverified**.
15. **API and auth paths skip the profile.** `/api/`, `/interface/` and `/accounts/` resolve language from request signals only,
    with content fixed to `bilingual` and no preferences (`sefaria/system/middleware.py:109-119`).

**Open questions.**

- Keep legacy precedence for launch, or fix 1–4 with it (Accept-Language before country; a stored-but-unchosen interface
  language treated as no choice)?
- Should the missing stores (content language, display, source version, Israel / diaspora) get profile keys under the existing
  `settings` dict? That is a data change, not a new architecture.
- Sync and merge: on sign-in, write the cookie values into empty profile fields? Which side wins when they disagree?
- Share preference cookies across `.sefaria.org` (as `interfaceLang` is), or keep them per host?

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
