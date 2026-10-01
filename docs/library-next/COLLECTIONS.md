# Library Next — shared collections

The `my-library` agent owns the schemas of everything Library Next keeps in `localStorage`
(`sefaria.libnext.<collection>`, through `store.js`). Other features write through the factories in
`static/js/library-next/my/collections.js`; they never call `createCollection` with their own field
names. Every factory validates (TypeError on bad input), fills defaults and returns the stored row
(`{ id, ts, …fields }`).

```js
import { addHistory, markStreakToday, saveToShelf, addNote, addHighlight, addFlashcard } from '../my/collections';
import { useCollection } from '../store';
import { collectionOptions } from '../my/collections';

addHistory('Genesis 1:1', 'Genesis 1:1', { heTitle: 'בראשית א׳:א׳' });   // the reader, on every ref it shows
const { items } = useCollection('notes', collectionOptions('notes'));     // read with the right version
```

## Collections and fields

| Collection | Fields (besides `id`, `ts`) | Written by |
|---|---|---|
| `history` | `ref`, `title`, `heTitle`, `book`, `persona` | reader (`addHistory`) |
| `streak` | `id` = `date` (`YYYY-MM-DD`), `count` | `addHistory` (automatically) or `markStreakToday` |
| `shelf` | `ref`, `title`, `heTitle`, `kind` (`ref`\|`book`), `tags[]` — `id` is `shelf:<ref>` | browse, reader, discover (`saveToShelf`) |
| `notes` | `ref`, `text`, `title`, `heTitle`, `book` | learner tools (`addNote`) |
| `highlights` | `ref`, `color` (`yellow`\|`green`\|`blue`\|`pink`), `text`, `book` | learner tools (`addHighlight`) |
| `flashcards` | `front`, `back`, `ref`, `due` (ms), `interval` (days), `ease`, `reps` | learner tools (`addFlashcard`); review updates the SM-2 fields |
| `plans` | `title`, `heTitle`, `book`, `units[{ref,label,heLabel}]`, `unitsPerDay`, `startDate`, `done[]`, `reminders` | my-library, browse ("add to plan": `addToPlan`) |
| `lessons` | `title`, `sources[{id,ref,title,heTitle,he,en,note,category}]`, `questions[{id,en,he}]`, `handoutNotes` | my-library, educator tools (`addSourceToLesson`, `addQuestion`) |
| `notebook` | `ref`, `text`, `versions[]`, `citation`, `title`, `heTitle` | my-library, scholar tools (`addNotebookEntry`) |

`kv` keys the hub also uses: `historyPaused` (boolean), `lastSync` (ISO string of the simulated sync).

## Factories

```js
addHistory(ref, title, { heTitle, book, persona, ts })   // null while history is paused; a repeat of the latest ref refreshes its ts
clearHistory(); isHistoryPaused(); setHistoryPaused(bool)
markStreakToday(date = new Date())                       // idempotent per day; repeats raise `count`
getStreak(today) → { current, longest, total, days: { 'YYYY-MM-DD': count } }

saveToShelf({ ref, title, heTitle, kind = 'ref', tags = [] })   // re-saving merges tags
removeFromShelf(ref); isOnShelf(ref); setShelfTags(ref, tags)

addNote(ref, text, { title, heTitle, book }); updateNote(noteId, text)
addHighlight(ref, color = 'yellow', { text, book })

addFlashcard(front, back, { ref, due }); updateFlashcard(cardId, patch)

createPlan({ title, heTitle, book, units, unitsPerDay = 1, startDate = today, reminders = false })
addToPlan(planId, { ref, label, heLabel }); updatePlan(planId, patch); markPlanUnitDone(planId, ref, done = true)

createLesson({ title, sources = [], questions = [], handoutNotes = '' })
addSourceToLesson(lessonId, { ref, title, heTitle, he, en, note }); addQuestion(lessonId, 'text' | { en, he })
updateLesson(lessonId, patch); classCode(lessonId)   // six stable characters, shown as a simulated class code

addNotebookEntry({ ref, text, versions = [], citation, title, heTitle })   // citation defaults to citationFor(ref)
updateNotebookEntry(entryId, patch); citationFor(ref, { versionTitle, accessed })

collection(name)            // the versioned Collection instance (list/get/put/remove/clear/subscribe)
collectionOptions(name)     // { version, migrate } for useCollection(name, options)
counts()                    // { history: n, shelf: n, … }
bookOf(ref)                 // 'Rashi on Genesis 1:1:2' → 'Rashi on Genesis'
```

## Versioning

Each entry in `SCHEMAS` has `version` and `defaults`; the default `migrate` fills missing fields
with the defaults, so rows written before a field existed read back complete. To change a shape:
bump `version`, extend `migrate` for that collection, add a test in `my/tests/collections.test.js`
and update the table above.

## Assistant hand-off event

Any page can open the assistant dock with a prefilled prompt:

```js
import { askAssistant } from '../my/assistant';
askAssistant('Suggest three discussion questions for Genesis 1:1 for a high-school class.');
```

`askAssistant` dispatches `window.dispatchEvent(new CustomEvent('library-next:assistant', { detail: { prompt } }))`
and then calls `openAssistant()`. The dock (assistant agent) listens for `library-next:assistant`
and places `detail.prompt` in the chat input; `detail.source` (optional, e.g. `'lesson'`) says who asked.

## Export and import

`/my/data` wraps `exportAll()` / `importAll(json, { merge })` from `store.js`: a JSON download of
every collection plus `kv`, a file picker with a per-collection merge preview, a simulated
"Sync to account" (progress and timestamp only, labelled simulated) and a table of what the device
stores. Per-feature exports: notes + highlights as Markdown (`/my/notes`), the notebook as
BibTeX / CSV / JSON (`/my/notebook`), a lesson as a shareable URL hash (`/my/lessons/shared#…`).
