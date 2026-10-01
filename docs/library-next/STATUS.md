# Library Next — status

Kept in sync with what shipped on `mf3`. One row per agent; details in each agent's doc.

| Wave | Agent | State | Notes |
|---|---|---|---|
| 1 | foundation | shipped | Seam, template, bundle, router, i18n, store, persona, shell, onboarding, dock slot, harness, smoke, jest, FOUNDATION.md, DEV.md |
| 1–2 | assistant | shipped | ai-chatbot `mf3`: `persona`, starter prompts, prompt guidance, `mode="panel"`, `initial-prompt` (no PR → no preview; cauldron uses chat-dev). Dock: greeting, starter prompts, embedded widget, sign-in fallback, `library-next:assistant` event, header action. See ASSISTANT.md |
| 2 | browse | — | `/`, `/texts`, `/texts/*`, book page, `/calendars` (placeholders today) |
| 2 | reader | — | `ref` route + tool contract (placeholder today; `placeholders.matchRef` is the stand-in) |
| 2 | discover | — | `/search`, `/topics`, `/topics/*` (placeholders today) |
| 2 | my-library | — | `/my/*`, collection schemas, export/import UI |
| 3 | learn-tools | — | |
| 3 | teach-research-tools | — | |
| 3 | qa | — | |

## Foundation — verified

- `PYTHONPATH=. pytest --noconftest reader/tests/library_next_test.py` — 16 passed.
- `npx jest static/js/library-next` — 7 suites, 38 tests; full `npx jest` — 36 suites, 464 tests.
- `npm run build-library-next` — compiles; `npm run build-client` still compiles.
- Harness: `/api/texts/Genesis.1?context=0` returns JSON through the CONNECT tunnel; `/` is the shell;
  `?lang=he` → `dir="rtl"`; `/data.js` proxied and cached.
- `npm run library-next-smoke` — `/`, `/Genesis.1`, `/texts`, `/texts?lang=he` render in headless
  Chromium with no console errors; onboarding opens; persona chip updates.

## Assistant dock — verified

- `npx jest static/js/library-next` — 8 suites, 44 tests (6 new in `AssistantDock.test.jsx`).
- `npm run build-library-next` compiles; `npm run library-next-smoke` — 4 pages ok.
- Not exercised here: a real chat round-trip (needs a user token for chat-dev); the harness takes
  `CHATBOT_USER_TOKEN` for that.

## Open issues for the next wave

- The cauldron serves the chat-dev widget, which has no `mode="panel"`: the dock shows prompts and a
  "simulated" badge while the chat floats in the page corner. An ai-chatbot PR from `mf3` plus
  `?chatbot_version=<PR#>` gives the inline, persona-aware chat.

- The real `ref` matcher belongs to the reader agent; the placeholder (`placeholders.matchRef`) claims
  any single-segment path not in `NOT_A_REF`, so an unlisted classic page under `/<something>` shows
  "Page not found"-style placeholder instead of falling through to the server. Extend `NOT_A_REF` or
  replace the matcher.
- `library_next_props` does one `UserProfile` lookup for logged-in users (slug, name, assistant
  setting). Anonymous requests do no Mongo queries beyond `library.get_last_cached_time()`.
- Hebrew interface title/description in `LIBRARY_NEXT_PAGE_META` go through Django `_()`; the
  SPA sets `document.title` on load so the server title only matters for crawlers (pages are `noindex`).
- The Django side could not be executed here (no Django/Mongo in the sandbox): `reader/views.py`
  changes are syntax-checked and mirror `ng-mobile`'s plumbing, but the first run on the cauldron
  should load `/`, `/texts`, `/Genesis.1`, `/topics`, `/search`, `/my` and `?library=classic`.
- `/my/notes` keeps its classic redirect (`^my(?!/notes)` in `urls_library.py`); the hub owns every
  other `/my/*` path.
- Search autocomplete in the header is not wired (plain submit to `/search?q=`); the discover agent
  may add `Sefaria.getName()` suggestions to `SearchBox` in `Shell.jsx` (one component, shared).
