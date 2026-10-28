---
area: versions
title: Versions & translations
domain: Reader
document: architecture
owner: unassigned
status: exploring  # baseline → exploring → proposed → agreed
updated: 2026-10-16

updated: 2026-10-19
---
# Versions & translations — architecture

> Part of the future-reader specification (`docs/reader-future/`), maintained in Slack **#reader-future** by Claude Tag with the
> `capture-future-spec` skill. The sections above the BASELINE block belong to the channel; the block is generated from the
> Feature Atlas and refreshed by `tools/seed.py`. Claims about either codebase cite files on `master` (legacy) or `reader-next`.

## Summary

No target architecture yet. Research in the thread mapped version URL parameters, how each client resolves the source and
translation, where preferences are stored, and the gaps in `reader-next`. Interface and content language are in
[Language & accessibility](../i18n-a11y/architecture.md). Everything under not-to-port and open questions is an *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792386183143639).

## Legacy approach vs new approach

**URL parameters.**
- Legacy (`master` @ 121350b): `ven` / `vhe` (and `ven<n>` / `vhe<n>`) as `family|Version_Title`; the old path
  `/<ref>/<lang>/<vtitle>` is redirected to `?v<lang>=` ([`reader/views.py:544-553`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L544-L553)). Every parameter is matched against the
  ref's versions (title and family, then family, then title), filtered by direction (left-to-right for `ven`, right-to-left for
  `vhe`), and the page redirects with the corrected values, removing those that match nothing ([`reader/views.py:424-499`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L424-L499)).
- New (`reader-next` @ 837d585): same grammar plus `vside` ([`src/lib/reader/url-state.ts:5-9`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/reader/url-state.ts#L5-L9)). A value without `|` is
  dropped ([`src/lib/reader/url-state.ts:51-54`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/reader/url-state.ts#L51-L54)), so old title-only links lose their version. No matching, no redirect; an
  unknown value stays in the URL (RTE-028).

**Resolution order.**
- Legacy client ([`static/js/sefaria/sefaria.js:790-822`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/sefaria/sefaria.js#L790-L822)): source = the URL's version if it is a primary, else the API default.
  Translation = the URL's version if it exists → the corpus preference (by title) → the highest-priority version in the
  translation-language preference → the API default. Server rendering ignores preferences
  ([`sefaria/model/text_request_adapter.py:15-34`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/model/text_request_adapter.py#L15-L34)), so the client refetches and a different translation can flash in. For
  later panels `override_version_with_preference` never changes anything ([`reader/views.py:1120-1131`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L1120-L1131)).
- New `resolveTranslation` ([`src/lib/versions/preferences.ts:86-103`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/versions/preferences.ts#L86-L103)): the URL's `ven` if it exists → corpus preference →
  translation-language preference → server default. It runs in the route loader, server rendering included, when any
  preference exists, with a second fetch only when the choice differs ([`src/features/reader/reader-route.ts:41-67`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/reader-route.ts#L41-L67)). No flash.

**Stored preferences.**
- Legacy: `version_preferences_by_corpus` (`{corpus: {en: title}}`) and `translation_language_preference` are read from the
  profile first, then the cookie ([`sefaria/system/middleware.py:164-165`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L164-L165), [`sefaria/system/middleware.py:179-182`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L179-L182)). Choosing a
  translation in the main panel writes the cookie and POSTs the profile ([`static/js/VersionBlock/VersionBlock.jsx:69-75`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/VersionBlock/VersionBlock.jsx#L69-L75),
  [`static/js/sefaria/sefaria.js:1114-1122`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/sefaria/sefaria.js#L1114-L1122)); the translation language is set by `setTranslationLanguagePreference`
  ([`static/js/ReaderApp.jsx:2145-2158`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/ReaderApp.jsx#L2145-L2158)) and the account page.
- New: cookies only ([`src/lib/versions/preferences.ts:31-52`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/versions/preferences.ts#L31-L52), [`src/lib/versions/prefs-source.ts:10-15`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/versions/prefs-source.ts#L10-L15)). Choosing a
  translation writes the corpus cookie for a year ([`src/features/reader/TextPanel.tsx:413-420`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L413-L420)). The translation-language
  cookie is read but never written. No profile read or write (VER-002 partial).

**Suggestion banner.** Legacy suggests a translation language when none is set or was suggested: the first language of the
visitor's country (`cf-ipcountry`) in the supported list (en, es, fr, de), never English
([`sefaria/system/middleware.py:166-177`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sefaria/system/middleware.py#L166-L177), [`sites/sefaria/site_settings.py:13`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/sites/sefaria/site_settings.py#L13)); the banner reads only the cookie
([`static/js/TextColumnBanner.jsx:13-16`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/TextColumnBanner.jsx#L13-L16)). Not built in `reader-next` (VER-004 todo).

**Gaps in `reader-next`, found on the way** (likely bugs, read from the code, not tested).
- A URL with only `vhe`: the loader resolves a preferred translation, but the panel uses the URL's versions whenever either side
  is set ([`src/features/reader/TextPanel.tsx:84`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/TextPanel.tsx#L84)), so the column swaps back to the default translation.
- An unknown explicit `ven` is never dropped: with no preferences, or none that match, the API returns the source only and no
  translation is shown, not the default ([`src/features/reader/reader-route.ts:61-66`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/features/reader/reader-route.ts#L61-L66)). The API's `warnings` are stored but not
  read ([`src/lib/text/model.ts:74`](https://github.com/Sefaria/Sefaria-Project/blob/837d5851180be4d26c08f3276752d8bdad8fa607/reader-next/src/lib/text/model.ts#L74)).

## Legacy behaviour not to port

Each is an *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792386183143639).
- `override_version_with_preference` is a no-op: `versionEn` / `versionHe` are always non-empty dicts, so `not versionEn` is
  never true ([`reader/views.py:1120-1131`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L1120-L1131)).
- Direction-filtered correction: the client writes `ven` for any translation and `vhe` for primaries
  ([`static/js/VersionBlock/VersionBlock.jsx:65-75`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/static/js/VersionBlock/VersionBlock.jsx#L65-L75)), but matching filters `ven` to left-to-right and `vhe` to right-to-left
  versions ([`reader/views.py:438-463`](https://github.com/Sefaria/Sefaria-Project/blob/121350b2659ef01e08ef618cf7bbefd54f8799ed/reader/views.py#L438-L463)), so a right-to-left translation or a left-to-right source is stripped on reload.

## Target architecture

- Version choice stays behind `src/lib/versions` and `src/lib/text` (paths under `reader-next/`): screens see `VersionMeta` and a
  version selection, never how the backend stores editions, so editions stored apart from text (as in [Rethinking Sefaria's text data model](https://github.com/YishaiGlasner/textual-systems-notes/blob/main/papers/rethinking-sefarias-text-data-model.md)) change only those
  modules. — *idea* · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792041146749969?thread_ts=1792041146.749969&cid=C0C9EGTL468)
- Forward compatibility with that model: [Cross-cutting → Assessment: a new backend text model](../CROSS_CUTTING.md#assessment-a-new-backend-text-model).
  Today a segment carries one primary and one translation string, and a version is chosen per side as
  `languageFamilyName|versionTitle` (`reader-next/src/lib/text/model.ts:100-101`, `reader-next/src/lib/versions/preferences.ts:64`).

## Dependencies on other areas

- [URLs & routing](../routing/architecture.md): version parameter correction (RTE-028).
- [Accounts & sign-in](../accounts/architecture.md): profile storage of preferences.
- [Language & accessibility](../i18n-a11y/architecture.md): the same cookie / profile split for interface and content language.
- [Text display & reading settings](../text-display/architecture.md): the proposed settings registry (PR #3822).

## Risks and open questions

All *ideas*, not decisions · [Slack](https://sefaria.slack.com/archives/C0C9EGTL468/p1792386183143639).
- Sync version and translation-language preferences to the profile for signed-in readers: read the profile first and POST on
  each choice, as legacy does? Legacy reads a cookie for a signed-in reader with empty profile preferences but never saves it
  back.
- Unknown or title-only `ven` / `vhe` (RTE-028): redirect to corrected values as legacy does (without its direction filter), or
  fall back in the loader and use the API's warnings?
- Version and translation-language preferences as entries in the proposed settings registry ("Settings → display model
  (proposal)" in Text display, PR #3822), with a per-corpus scope?

## Decisions

_None yet. Every decision is also logged in `../DECISIONS.md`._

<!-- BASELINE:START (generated by docs/reader-future/tools/seed.py — do not edit by hand) -->

## Baseline: the two clients today

### Legacy client (`master`)

Where the atlas found this area's behaviour (files cited by its features, most-cited first):

- [`static/js/VersionBlock/VersionBlock.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/VersionBlock/VersionBlock.jsx) (8)
- [`static/js/sefaria/sefaria.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/sefaria.js) (8)
- [`static/js/ReaderApp.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderApp.jsx) (5)
- [`static/js/ReaderPanel.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/ReaderPanel.jsx) (3)
- [`static/js/VersionsTextList.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/VersionsTextList.jsx) (3)
- [`reader/views.py`](https://github.com/Sefaria/Sefaria-Project/blob/master/reader/views.py) (3)
- [`static/js/AboutBox.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/AboutBox.jsx) (2)
- [`static/js/VersionBlock/VersionBlockWithPreview.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/VersionBlock/VersionBlockWithPreview.jsx) (2)
- [`static/js/sefaria/VersionPreferences.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/sefaria/VersionPreferences.js) (1)
- [`static/js/TextColumnBanner.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TextColumnBanner.jsx) (1)
- [`static/js/NavSidebar.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/NavSidebar.jsx) (1)
- [`static/js/TranslationsBox.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/TranslationsBox.jsx) (1)
- [`static/js/VersionBlock/VersionBlockHeader.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/VersionBlock/VersionBlockHeader.jsx) (1)
- [`static/js/constants.js`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/constants.js) (1)
- [`static/js/VersionBlock/VersionInformation.jsx`](https://github.com/Sefaria/Sefaria-Project/blob/master/static/js/VersionBlock/VersionInformation.jsx) (1)

Long-form audit write-up: `reader-next/docs/features/inv_04_connections.md`, `reader-next/docs/features/inv_02_reader_shell.md`.

### New client (`reader-next`, folder `reader-next/`)

Rebuild status of this area's features: done 10, partial 5, not started 6.

Implemented in (most features first):

- [`src/lib/versions/prefs-source.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/versions/prefs-source.ts) (1)
- [`src/features/reader/TextPanel.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/TextPanel.tsx) (1)
- [`src/lib/reader/header.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/reader/header.ts) (1)
- [`src/ui/AboutView/AboutView.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/AboutView/AboutView.tsx) (1)
- [`src/features/reader/ConnectionsPane.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/features/reader/ConnectionsPane.tsx) (1)
- [`src/ui/DownloadVersions/DownloadVersions.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/DownloadVersions/DownloadVersions.tsx) (1)
- [`src/ui/TranslationsView/TranslationOpenView.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/TranslationsView/TranslationOpenView.tsx) (1)
- [`src/lib/versions/preferences.ts`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/lib/versions/preferences.ts) (1)
- [`src/ui/VersionInfo/VersionInfo.tsx`](https://github.com/Sefaria/Sefaria-Project/blob/reader-next/reader-next/src/ui/VersionInfo/VersionInfo.tsx) (1)

### Gaps: core and standard features not done (7)

| ID | Tier | Feature | Rebuild status |
|---|---|---|---|
| VER-001 | standard | Translation language preference (shell handling) | partial |
| VER-002 | standard | Version preferences by corpus cookie | partial |
| VER-004 | standard | Translation suggestion and 'change translation' banners | not started |
| VER-010 | standard | Translation preview with truncation | partial |
| VER-013 | standard | Translation Open sub-mode | partial |
| VER-016 | standard | Version block display | partial |
| VER-019 | standard | Edit version metadata (moderator) | not started |

_Generated 2026-10-14 from the atlas and `rebuild-status.json`. Architecture of each client as a whole: `reader-next/docs/ARCHITECTURE.md`._

<!-- BASELINE:END -->
