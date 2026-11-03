/**
 * Reader tool registry (PLAN.md "Reader tool contract"). Tools appear in the toolbelt when a
 * reader selects text; wave-3 agents register theirs from their own modules.
 *
 *   import { registerReaderTool } from '../reader/tools/registry';
 *   registerReaderTool({
 *     id: 'notes',                              // unique; matches PERSONAS[*].readerTools ids
 *     personas: ['learner', 'educator'],        // or 'all'
 *     icon: 'note',                             // a built-in icon name (see Toolbelt.ICONS) or a React element
 *     label: { en: 'Note', he: 'הערה' },         // or an i18n key registered with addStrings
 *     component: NoteTool,                      // receives { selection, book, close }
 *   });
 *
 * The component props:
 *   selection: { ref, heRef, he, en, segments: [{ ref, heRef, he, en, n }] }   he/en are HTML
 *   book:      { title, heTitle, categories, primaryCategory, sectionRef, heSectionRef,
 *                versionTitle, heVersionTitle, data }                           data = the /api/texts response
 *   close():   closes the tool panel
 *
 * Order in the toolbelt: the persona's `readerTools` list first (in that order), then every other
 * eligible tool in registration order. See docs/library-next/READER_TOOLS.md.
 */
import { useEffect, useState } from 'react';
import { PERSONAS, PERSONA_IDS } from '../../persona';

const tools = new Map();
const listeners = new Set();

function notify() {
  listeners.forEach(fn => fn(getAllReaderTools()));
}

export function registerReaderTool(def) {
  if (!def || typeof def.id !== 'string' || !def.id) { throw new Error('registerReaderTool needs an `id`'); }
  if (typeof def.component !== 'function') { throw new Error(`Reader tool ${def.id} needs a \`component\``); }
  if (!def.label) { throw new Error(`Reader tool ${def.id} needs a \`label\``); }
  const personas = def.personas === undefined || def.personas === 'all' ? 'all' : def.personas;
  if (personas !== 'all') {
    if (!Array.isArray(personas) || !personas.length || personas.some(p => !PERSONA_IDS.includes(p))) {
      throw new Error(`Reader tool ${def.id}: \`personas\` must be 'all' or a list of ${PERSONA_IDS.join('|')}`);
    }
  }
  const entry = { icon: null, ...def, personas };
  tools.set(def.id, entry);
  notify();
  return entry;
}

export function unregisterReaderTool(id) {
  const had = tools.delete(id);
  if (had) { notify(); }
  return had;
}

export function getReaderTool(id) {
  return tools.get(id) || null;
}

export function getAllReaderTools() {
  return Array.from(tools.values());
}

export function toolAppliesTo(tool, persona) {
  return tool.personas === 'all' || tool.personas.includes(persona);
}

/** The tools `persona` sees, in toolbelt order. */
export function getReaderTools(persona) {
  const def = PERSONAS[persona];
  const preferred = def ? def.readerTools : [];
  const eligible = getAllReaderTools().filter(t => toolAppliesTo(t, persona));
  const rank = t => { const i = preferred.indexOf(t.id); return i === -1 ? preferred.length : i; };
  return eligible
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map(x => x.t);
}

export function subscribeReaderTools(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React: the tool list for `persona`, re-rendering when tools register (lazy wave-3 modules). */
export function useReaderTools(persona) {
  const [list, setList] = useState(() => getReaderTools(persona));
  useEffect(() => {
    setList(getReaderTools(persona));
    return subscribeReaderTools(() => setList(getReaderTools(persona)));
  }, [persona]);
  return list;
}

/** Test helper. */
export function _resetReaderTools() {
  tools.clear();
  listeners.clear();
}
