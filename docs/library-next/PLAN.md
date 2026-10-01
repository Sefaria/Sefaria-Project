# Library Next (mf3) — Plan

A ground-up rebuild of the **sefaria.org Library** experience (not Voices/sheets) as a proof of
concept, serving four personas: **newcomers, learners, educators, scholars**. EN and HE interface,
Hebrew/English/bilingual content. Heavy use of `localStorage`. Anything the current stack can't do
is **faked convincingly** so the concept is visible.

| | |
|---|---|
| Branch | `mf3` (Sefaria-Project, off `master`); `mf3` (ai-chatbot, off `main`) |
| Cauldron | `mf3` → https://mf3.cauldron.sefaria.org (feature mode, shared DB) |
| Escape hatch | `?library=classic` (sticky cookie) returns the classic site; `?library=next` forces the new one |
| Status | POC. Not meant to merge as is. |

## Architecture decision

**Client-rendered SPA, served by a thin Django seam, reusing the existing data layer.**

```
Django (urls_library) ──► @library_next_route on library views (home, texts, calendars, topics,
                           search) + one check in text_panels (the ref catch-all)
                       ──► templates/library_next/app.html  (shell skeleton, DJANGO_VARS, /data.js,
                           React 16 UMD, jQuery, client-library-next bundle)
Browser                ──► static/js/library-next/  (React 16, own router, i18n, store, persona)
                       ──► static/js/sefaria/sefaria.js  (existing API wrapper + caches) → /api/*
```

Why: the `ng-mobile` branch proved the "separate tree + dispatch seam" pattern; dropping SSR
removes the Node heap risk on cauldrons and lets every vertical be pure JS/CSS. Every page is a
route in one bundle. CSS is imported from components (style-loader). No `ReaderApp.jsx`,
`Misc.jsx` or `s2.css` imports — enforced by a jest import-boundary test.

Dev harness (`npm run library-next-dev`): serves the shell at `http://localhost:8787` and proxies
`/api/*`, `/data*.js`, `/static/*` to `https://www.sefaria.org`, so the SPA runs end to end
here and in Playwright without Django or Mongo.

## Names

| Thing | Name |
|---|---|
| Product label in UI | "Sefaria Library" / "ספריית ספריא" (no code names in the UI) |
| JS tree | `static/js/library-next/` |
| Bundle / webpack config | `client-library-next` / `clientLibraryNextConfig`; `WEBPACK_LOADER['LIBRARY_NEXT']` |
| Django module | `reader/library_next.py` |
| Template | `templates/library_next/app.html` |
| Cookie / param | `library_next` / `?library=next|classic|auto` |
| Setting | `LIBRARY_NEXT_DEFAULT` (True on this branch) |
| localStorage prefix | `sefaria.libnext.` |

## Shared contracts (foundation owns; everyone consumes)

- **Router** `router.js`: `registerRoute({ name, match(pathname, search) → params|null, component, title(params,t) })`,
  `<Link to>`, `navigate(to, {replace})`, `useRoute()`. History via `pushState`; back/forward supported.
  Unknown library URLs fall through to the server (full navigation).
- **i18n** `i18n.js`: `useT()` → `t(key, vars)`, `lang` (`en|he`), `dir`; strings in per-feature
  `strings.js` files `{ key: { en, he } }` merged via `addStrings()`. Interface language follows the
  Django interface language (`DJANGO_VARS.props.interfaceLang`) and the header toggle; toggle sets the
  classic `interfaceLang` cookie and navigates. `<html dir>` follows.
- **Content language** `contentLang.js`: `he | en | bi`, persisted; `useContentLang()`.
- **Store** `store.js`: `createCollection(name, {version, migrate})` → `{ list(), get(id), put(item), remove(id), subscribe }`,
  `useCollection(name)`; `kv.get/set`; `exportAll()`/`importAll(json)`. Namespaced
  `sefaria.libnext.<collection>`. Fires a `storage` style event so tabs stay in sync.
- **Persona** `persona.js`: `newcomer | learner | educator | scholar`; `usePersona()` → `{ persona, setPersona, def }`.
  Defs carry label, tagline, icon, default content language, home modules order, reader tool set.
- **Shell slots**: `<Shell>` renders header, `<main>`, footer, `<AssistantDock>`, toasts (`toast(msg)`),
  modal (`openModal(node)`), onboarding (first visit: pick a persona; skippable → newcomer).
- **Reader tool contract** (reader owns, wave 3 consumes): `registerReaderTool({ id, personas, icon, label,
  component })`; the component receives `{ selection: { ref, he, en, segments }, book, close }`.
- **Collections other agents write to** (my-library owns the schemas):
  `history` (ref, title, ts, persona), `shelf` (saved refs/books with tags), `notes` (ref, text, ts),
  `highlights` (ref, color), `flashcards` (front, back, ref, due), `plans` (learner study plans),
  `lessons` (educator lesson plans: title, sources[], questions[], handoutNotes), `notebook`
  (scholar entries: ref, versions compared, citation, text), `streak` (dates read).
- **Assistant** `<lc-chatbot>` is embedded by the dock with `persona="<persona>"`, `interface-lang`,
  `mode="panel"`, `origin="library-next"`. ai-chatbot `mf3` understands `persona`.

## Personas — what each one gets

| | Newcomer | Learner | Educator | Scholar |
|---|---|---|---|---|
| Home | "Start here" path, this week's parasha explained, glossary, 5-minute reads | Continue reading, study plans + streak, today's Daf/Parasha/Mishnah, recommendations | Lesson plans, source collections, "Build a lesson", parasha for class | Research notebook, recent refs, saved comparisons, advanced search |
| Browse | Plain-language category descriptions, "where to start" picks | Progress per book, "add to plan" | "Add to lesson" everywhere, printable | Version/link counts, author/era metadata |
| Reader defaults | English-first, glossary tooltips, "What am I reading?" explainer card | Bilingual, notes/highlights/flashcards, mark read | Bilingual, lesson builder side panel, discussion prompts, handout view | Hebrew-first, versions compare, manuscripts, apparatus, lexicon, cite/export |
| Search/topics | Simplified results, topic "explainers" | Filters + save search | Filter by grade-appropriate (faked tag), add results to lesson | Advanced filters (exact, version, era), export results |
| My Library | Progress through "start here" | Plans, streak, flashcards, notes | Lessons (shareable via URL hash), handouts | Notebook, citations, comparisons, data export |

Faked on purpose (clearly labeled "simulated" in a subtle way, never broken): account sync, class
codes/sharing (lesson state encoded in the URL hash — actually works offline), AI-generated
discussion questions (templates; the assistant is one tap away), recommendations (heuristics over
local history), notifications, grade tags.

## Team and waves

| Wave | Agent | Repo | Owns |
|---|---|---|---|
| 1 | `foundation` | Sefaria-Project | seam, bundle, template, settings, router, i18n, store, persona, tokens/CSS, Shell, onboarding, dock slot, dev harness, import-boundary test |
| 1 | `assistant` | ai-chatbot | `persona` attribute end to end, persona starter prompts, i18n, tests; then (wave 2) `AssistantDock` in Sefaria-Project |
| 2 | `browse` | Sefaria-Project | `/`, `/texts`, `/texts/<cats>`, book page, `/calendars` |
| 2 | `reader` | Sefaria-Project | text page: stream, bilingual layouts, versions, connections, selection, toolbelt + tool contract |
| 2 | `discover` | Sefaria-Project | `/search`, `/topics`, `/topics/<slug>` |
| 2 | `my-library` | Sefaria-Project | `/my/*`, collections schemas, export/import, fake sync, your-data |
| 3 | `learn-tools` | Sefaria-Project | newcomer + learner reader tools |
| 3 | `teach-research-tools` | Sefaria-Project | educator + scholar reader tools |
| 3 | `qa` | both | build, jest, Playwright smoke (EN + HE/RTL) via dev harness, fix list |

Each agent works in its own git worktree on `mf3-<agent>` branched from `mf3`; the orchestrator
merges into `mf3` after each wave. File ownership is by directory under `static/js/library-next/<feature>/`;
shared files (`routes.js` registry, `strings` merges) get one-line additions only.

## Rules

- Conventional-style, small commits. `npm run build-library-next` and `npx jest static/js/library-next` must pass before a commit.
- No `sc-NNNNN` story IDs in file content. No model names in commits.
- EN and HE for every string; RTL checked for every layout.
- Keep this document and `docs/library-next/STATUS.md` in sync with what shipped.
