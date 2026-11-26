# Library Next — Foundation

One page for the agents building on the shell. Everything below exists on `mf3` and is covered by
jest (`npx jest static/js/library-next`). Read `PLAN.md` first for the product contract.

## File map

```
reader/library_next.py               mode resolution (?library=, cookie, default), @library_next_route, prop shape
reader/views.py                      render_library_next(), library_next_props(), my_library(); decorators on the
                                     library page views; the ref catch-all guard in text_panels()
reader/tests/library_next_test.py    pure-python tests (no Django needed)
templates/library_next/app.html      the shell document (DJANGO_VARS via json_script, data.js, React UMD, bundle)
sefaria/settings.py                  LIBRARY_NEXT_DEFAULT, WEBPACK_LOADER['LIBRARY_NEXT']
sefaria/urls_library.py              /my(/.*)  → my_library (the hub)
node/webpack.config.js               clientLibraryNextConfig → static/bundles/client-library-next/
node/webpack.library-next.js         single-config entry for build-/watch-library-next

static/js/library-next/
  client.jsx          bootstrap: DJANGO_VARS → Sefaria.setup(DJANGO_DATA_VARS, props) → ReactDOM.render(<App/>)
  App.jsx             resolves the route, sets document.title, renders <Shell><Page/></Shell>
  Shell.jsx           header, <main>, footer, dock, toasts, modal host, onboarding; re-exports toast/openModal/closeModal
  AssistantDock.jsx   dock button + side panel; <AssistantBody> is the slot the assistant agent fills
  Onboarding.jsx      first-visit persona picker; openOnboarding()
  router.js           registerRoute, matchRoute, Link, navigate, useRoute, useRouteParams
  routes.js           imports every feature's routes.js, then registerPlaceholders()
  placeholders.js     placeholder routes for names no feature registered yet; matchRef() + NOT_A_REF
  i18n.js             addStrings, t, pick, useT, useLang, lang/dir live bindings, switchInterfaceLang
  strings.js          shell strings (pattern for feature strings files)
  contentLang.js      he | en | bi; useContentLang()
  store.js            createCollection, useCollection, kv, useKv, exportAll, importAll, flush
  persona.js          PERSONAS, PERSONA_IDS, usePersona, PersonaIcon
  overlays.js         toast, openModal, closeModal (state behind Shell's hosts)
  pages/Placeholder.jsx, pages/NotFound.jsx
  styles/tokens.css   --ln-* tokens (type, color, space, radius, layers), Taamey Frank @font-face
  styles/base.css     reset, text faces, layout primitives, buttons/inputs/segmented, skeleton
  styles/shell.css    header/footer/dock/modal/toast/onboarding
  home/ browse/ reader/ discover/ my/   one routes.js stub each — yours to fill (and your components/CSS beside it)
  dev/serve.js, dev/smoke.js            harness + headless check (see DEV.md)
  tests/              router, i18n, store, persona+contentLang, Onboarding, Shell (en+he), importBoundary
```

Ownership: you own `static/js/library-next/<feature>/`. Shared files take one-line additions only;
`routes.js` already imports your `routes.js`, so normally you need no shared edits at all.

## Routes

```js
// static/js/library-next/discover/routes.js
import { registerRoute } from '../router';
import TopicPage from './TopicPage';
import './strings';

registerRoute({
  name: 'topic',                         // canonical names below
  path: '/topics/:slug',                 // static segments, :param, trailing * → params.rest
  component: TopicPage,                  // receives { params, pathname, search, query }
  title: (params, t) => params.slug,     // document.title = `${title} | Sefaria Library`
});
registerRoute({ name: 'ref', match: (pathname, search) => ..., component: Reader, title: p => p.tref });
```

Canonical names (placeholders register whichever of these are still free, so use exactly these):
`home` (`/`), `texts` (`/texts`), `texts-category` (`/texts/*`), `calendars`, `topics` (`/topics`),
`topic` (`/topics/*`), `search`, `my` (`/my/*`), `ref` (the text catch-all; `placeholders.matchRef`
and `NOT_A_REF` show the current heuristic — the reader agent owns the real one). Registration order
is `home → browse → reader → discover → my → placeholders`; first match wins; re-registering a
name replaces the earlier route.

Navigation: `<Link to="/texts/Tanakh">` for in-app paths (full page load for unknown paths,
other origins, modifier clicks, `target`); `navigate(to, { replace })`; `useRoute()` →
`{ route, params, pathname, search, query }`; `useRouteParams()`.

Server side, every library page URL and the ref catch-all already render the shell (`?library=classic`
escapes). A new top-level path needs a Django URL too: follow `/my` in `sefaria/urls_library.py`.

## Strings

```js
// <feature>/strings.js — imported by your routes.js
import { addStrings } from '../i18n';
addStrings({ 'topic.sources': { en: 'Sources', he: 'מקורות' } });

// in components
const { t, lang, dir } = useT();
t('topic.sources'); t('topic.count', { n: 12 });    // {n} placeholders
pick(topic.title);                                  // { en, he } objects from the API
```
Every key has `en` and `he`. Outside React use `t()` and the live `lang` / `dir` bindings. The header
toggle calls `switchInterfaceLang('hebrew'|'english')`, which sets the classic `interfaceLang`
cookie and reloads through `/interface/<language>?next=` — do not build a second toggle.

## Content language

`const [contentLang, setContentLang] = useContentLang()` → `'he' | 'en' | 'bi'`. Unset means the
persona default (`PERSONAS[id].contentLang`). The header's segmented control already sets it;
readers and lists should follow it. `CONTENT_LANG_LABELS` has bilingual labels.

## Store

```js
import { createCollection, useCollection, kv, exportAll, importAll } from '../store';

const notes = createCollection('notes', {
  version: 1,
  migrate: (items, fromVersion) => items,   // items is { id: item }; return the new shape
});
notes.put({ ref: 'Genesis 1:1', text: '…' });   // id + ts filled in when missing; same id = update
notes.list();                                   // newest first (by ts)
notes.get(id); notes.remove(id); notes.clear(); notes.subscribe(fn);

const { items, put, remove } = useCollection('notes');   // re-renders on change, any tab
kv.get('key', fallback); kv.set('key', value); kv.remove('key'); useKv('key', fallback);
exportAll();                 // JSON string { format: 'sefaria.libnext', data: { <collection>: {v, items} } }
importAll(json, { merge });  // replaces (default) or merges (existing ids win)
```
Keys are `sefaria.libnext.<collection>`. Writes are debounced 150 ms and flushed on `pagehide`;
`flush()` forces them (tests). Changes fire `libnext:store` on `window`; other tabs sync through
the native `storage` event. The `my-library` agent owns the collection schemas listed in PLAN.md
(`history`, `shelf`, `notes`, `highlights`, `flashcards`, `plans`, `lessons`, `notebook`, `streak`);
create them with `createCollection(name, { version })` and bump `version` with a `migrate` when a
shape changes. Nothing is simulated silently: label fake sync with `.ln-badge-simulated`.

## Persona

```js
const { persona, setPersona, def, chosen } = usePersona();
def.label / def.tagline      // { en, he }
def.contentLang              // default content language
def.homeModules              // ordered module ids for the home page (browse agent)
def.readerTools              // tool ids the reader shows by default (reader + wave-3 agents)
<PersonaIcon persona="scholar" size={20} />
```
`chosen` is false until onboarding or the chip stored a choice (`newcomer` applies meanwhile).
Non-React: `getPersona()`, `getPersonaDef()`, `setPersona(id)`.

## Shell slots

- `toast('Saved')` or `toast({ en, he })`, `toast(msg, { duration })`.
- `openModal(<Node/>, { label, dismissible, onClose })`, `closeModal()`.
- `openAssistant()` / `closeAssistant()` / `toggleAssistant()` from `AssistantDock.jsx`; to ask the
  assistant from a feature, dispatch `library-next:assistant` with `detail.prompt` (see ASSISTANT.md).
- `openOnboarding()` re-opens the persona picker.
- `<ContentLangControl>` is exported from `Shell.jsx` for reuse inside pages.

## CSS

Import CSS from the component that needs it (`import './TopicPage.css'`; style-loader bundles it,
jest maps it to a stub). Use the `--ln-*` tokens in `styles/tokens.css` and the primitives in
`styles/base.css` (`.ln-container`, `.ln-read`, `.ln-page-title`, `.ln-card`, `.ln-btn[-primary|-quiet]`,
`.ln-input`, `.ln-segmented`, `.ln-cat-rule` with `--cat`, `.ln-text-en` / `.ln-text-he`,
`.ln-skeleton-line`, `.ln-badge-simulated`, `.ln-sr-only`). Rules:

- Logical properties only (`margin-inline-start`, `inset-inline-end`, `padding-block`), so RTL is free.
- Mobile first; the content column is `--ln-content-max` (1200px), reading column `--ln-read-max`.
- Category color is the only vivid color: `style={{ '--cat': Sefaria.palette.categoryColor(cat) }}`.
- Prefix every class `ln-`; never import `s2.css`, `ReaderApp.jsx` or `Misc.jsx` (the import-boundary
  test fails the build of trust, not just the test).
- The data layer is `import Sefaria from '../../sefaria/sefaria'` — same caches and API wrappers the
  classic app uses; `Sefaria.setup()` has already run when your component mounts.

## Running things

```
npm run build-library-next        # bundle → static/bundles/client-library-next/ (+ stats json)
npm run watch-library-next        # rebuild on change
npx jest static/js/library-next   # or: npm run jest-library-next
npm run library-next-dev          # http://localhost:8787 (see DEV.md)
npm run library-next-smoke        # headless Chromium check against the harness
PYTHONPATH=. pytest --noconftest reader/tests/library_next_test.py   # Django seam (no Django needed)
```
Before every commit: `npm run build-library-next` and `npx jest static/js/library-next` green.
