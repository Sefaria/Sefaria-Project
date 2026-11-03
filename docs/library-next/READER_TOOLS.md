# Library Next — reader tools

The reader (`static/js/library-next/reader/`) shows a **toolbelt** when the reader selects one or
more segments (click, shift-click for a range, `j`/`k` or arrow keys). The toolbelt lists the
persona's tools; picking one opens it in the **tool panel** (a side panel from 900px up, a bottom
sheet below). Wave-3 agents add tools by registering them; nothing in the reader needs editing.

## Registering a tool

```js
// static/js/library-next/learn/tools/notes.jsx   (your module; import it from your routes.js)
import { registerReaderTool } from '../../reader/tools/registry';
import NoteTool from './NoteTool';

registerReaderTool({
  id: 'notes',                              // unique; use the ids in PERSONAS[*].readerTools (persona.js)
  personas: ['learner', 'educator'],        // or 'all'
  icon: 'note',                             // built-in icon name (below) or a React element (20px, currentColor)
  label: { en: 'Note', he: 'הערה' },         // or an i18n key you registered with addStrings()
  component: NoteTool,                      // rendered inside the panel body
});
```

Rules the registry enforces: `id` is a non-empty string, `component` is a function, `label` is
present, `personas` is `'all'` or a non-empty list of `newcomer | learner | educator | scholar`.
Re-registering an `id` replaces the earlier tool. The registry notifies subscribers, so a tool
registered after the page mounted still appears.

**Order in the toolbelt**: the persona's `readerTools` ids first (in that order), then every other
eligible tool in registration order. Built-ins are registered with `personas: 'all'`:
`connections`, `shelf` (Save to shelf), `cite` (Copy / cite).

Built-in icon names: `connections, shelf, cite, note, highlight, flashcard, check, lesson, question,
print, versions, manuscript, lexicon, glossary, info`.

## The component contract

```jsx
export default function NoteTool({ selection, book, close }) { … }
```

| prop | shape |
|---|---|
| `selection.ref` | human ref covering the selection: `Genesis 1:3`, `Genesis 1:3-5`, `Genesis 1:30-2:2` |
| `selection.heRef` | the Hebrew form: `בראשית א׳:ג׳-ה׳` |
| `selection.he`, `selection.en` | the selected segments' HTML (as served by `/api/texts`), joined with `\n` |
| `selection.segments` | `[{ ref, heRef, n, label, heLabel, he, en, sectionRef, heSectionRef, path }]` in reading order |
| `book.title`, `book.heTitle` | index title (`Genesis` / `בראשית`) |
| `book.categories`, `book.primaryCategory` | `['Tanakh','Torah']`, `'Tanakh'` |
| `book.sectionRef`, `book.heSectionRef` | the section in view |
| `book.versionTitle`, `book.heVersionTitle` | the versions currently rendered (English / Hebrew) |
| `book.next`, `book.prev` | neighbouring section refs or null |
| `book.data` | the raw `/api/texts` response for the section (versions, sectionNames, lengths, …) |
| `close()` | closes the panel and returns focus to the opener |

Hosts may pass extra props (today: `hint` from `?with=`); ignore what you do not know.

Helpers you can reuse from `reader/textData.js`: `plainText(html)`, `selectionText(segments,
{ vowels, cantillation })`, `stripHebrewMarks`, `citation({ ref, book, versionTitle, style })`,
`canonicalUrl(ref)`; from `reader/refKind.js`: `refToPath(ref)` for in-app links; from
`reader/ReaderHeader.jsx`: `copyToClipboard(text)`.

Writing to the shared collections: `import { createCollection } from '../../store'` with the names
and fields in PLAN.md (`notes`, `highlights`, `flashcards`, `lessons`, `notebook`, …). The reader
already writes `history` (`id: h:<sectionRef>, ref, heRef, title, heTitle, ts, persona`), `streak`
(`id: YYYY-MM-DD, date, ts`) and `shelf` (`id: s:<ref>, ref, heRef, title, heTitle, tags, type, ts, persona`)
through `reader/collections.js`.

## Behaviour the host provides

- Keyboard: `j`/`k` and arrows move the selection (shift extends); `Esc` closes the panel, then clears the selection.
- Focus moves to the panel's close button on open and back to the opener on close.
- The panel is a `role="dialog"` labelled by the tool's label; on small screens a backdrop closes it.
- Selection and panel persist while the reader loads next/previous sections; they reset on a new ref.
- Content language (`useContentLang`) and the reading settings (`kv.reader.*`: `biLayout`, `flow`,
  `fontScale`, `vowels`, `cantillation`) are available to tools through the store hooks.

## Testing a tool

`reader/tests/ReaderPage.test.jsx` shows the pattern: mock `Sefaria.getText` / `getLinks` with the
fixtures in `reader/tests/fixtures/`, render `<App/>` at a ref URL, click a segment, click your tool's
button (`[data-tool="<id>"]`) and assert on `.ln-reader-panel[data-tool="<id>"]`. Call
`_resetReaderTools()` + `registerBuiltinTools()` (from `reader/tools/builtin.jsx`) when a test needs a
clean registry.
