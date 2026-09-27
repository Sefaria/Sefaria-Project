/**
 * Loading for the associated-texts panel and the stream's badges and pins, through the data
 * layer (static/js/sefaria/sefaria.js) and its caches.
 *
 * Order matters on a phone: counts come first (/api/links/<ref>?with_text=0, a few KB for most
 * segments), then text, one commentator at a time, through a single queue. Opening a
 * commentator moves it to the front of that queue. /api/related (every link, sheet and topic,
 * megabytes for a chapter) is never used.
 *
 * Browser only: nothing here runs during SSR (the panel and the stream call it from effects).
 */
import Sefaria from '../sefaria/sefaria';
import {groupSourceRefs, panelLinks} from './associated';
import {pickVersions} from './text';
import {refToUrlPath} from './url';

const TEXT_VERSIONS = [{languageFamilyName: 'primary'}, {languageFamilyName: 'translation'}];

/**
 * A queue that runs one task at a time (or `concurrency`), deduplicated by key. `front` moves
 * a waiting task ahead of the others; a failed task can be retried.
 */
export function createTaskQueue(concurrency = 1) {
  const waiting = [];
  const jobs = new Map();
  let running = 0;
  const pump = () => {
    while (running < concurrency && waiting.length) {
      const job = waiting.shift();
      running += 1;
      job.started = true;
      Promise.resolve().then(job.task).then(
        (value) => { job.done = true; job.value = value; running -= 1; job.resolve(value); pump(); },
        (error) => { jobs.delete(job.key); running -= 1; job.reject(error); pump(); },
      );
    }
  };
  return {
    run(key, task, {front = false} = {}) {
      const existing = jobs.get(key);
      if (existing) {
        if (front && !existing.started) {
          waiting.splice(waiting.indexOf(existing), 1);
          waiting.unshift(existing);
        }
        return existing.promise;
      }
      const job = {key, task, started: false, done: false};
      job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
      jobs.set(key, job);
      if (front) { waiting.unshift(job); } else { waiting.push(job); }
      pump();
      return job.promise;
    },
    /** The result of a finished task, or undefined. */
    peek(key) {
      const job = jobs.get(key);
      return job && job.done ? job.value : undefined;
    },
    clear() { waiting.length = 0; jobs.clear(); running = 0; },
  };
}

// One queue for all commentary text, so a phone fetches one commentator at a time.
export const textQueue = createTaskQueue(1);
// Counts for the stream's badges: small, independent requests.
export const countQueue = createTaskQueue(2);

/** For tests. */
export function resetAssociatedCaches() {
  textQueue.clear();
  countQueue.clear();
}

/** Links (no text) for a ref, filtered to what the panel shows. */
export function loadLinks(ref) {
  return Promise.resolve(Sefaria.getLinks(ref)).then(data => panelLinks(Array.isArray(data) ? data : []));
}

/** Every non-empty HTML string in a text value (a string, or arrays of them), in order. */
export function paragraphs(value) {
  if (typeof value === 'string') { return value.trim() ? [value] : []; }
  if (Array.isArray(value)) { return [].concat(...value.map(paragraphs)); }
  return [];
}

/**
 * Normalize an /api/v3/texts response into {ref, heRef, he, en, heVersion, enVersion}, where
 * `he` and `en` are the raw text values (a string, or nested arrays for ranges and sections).
 */
export function textFromApi(data) {
  if (!data || data.error || !Array.isArray(data.versions)) { return null; }
  const [primary, translation] = pickVersions(data.versions);
  const meta = (v) => (v ? {versionTitle: v.versionTitle, lang: v.actualLanguage || v.language || null, direction: v.direction || null} : null);
  return {
    ref: data.ref,
    heRef: data.heRef || data.ref,
    indexTitle: data.indexTitle || data.book || null,
    heIndexTitle: data.heIndexTitle || null,
    categories: data.categories || [],
    he: primary ? primary.text : null,
    en: translation ? translation.text : null,
    heVersion: meta(primary),
    enVersion: meta(translation),
  };
}

/** Fetch a ref's source and translation (with refs inside wrapped as links), through the data layer. */
export function fetchText(ref) {
  return Promise.resolve(Sefaria.getTextsFromAPIV3(ref, TEXT_VERSIONS, true, 'wrap_all_entities')).then(textFromApi);
}

/** The value at a 0-based `path` inside nested text arrays. */
export function pick(value, path) {
  let v = value;
  for (const i of path) {
    if (!Array.isArray(v)) { return path.length ? null : v; }
    v = v[i];
  }
  return v;
}

function comment(link, he, en) {
  const hePars = paragraphs(he);
  const enPars = paragraphs(en);
  return {
    ref: link.sourceRef || link.ref,
    heRef: link.sourceHeRef || link.sourceRef || link.ref,
    he: hePars,
    en: enPars,
    hasEnglish: enPars.length > 0,
  };
}

/**
 * The comments of one work on one segment: its links' texts, fetched as few ranges as possible
 * ("Rashi on Genesis 1:1:1-3"), each range falling back to its single refs if it fails.
 * Resolves to [{ref, heRef, he: [html], en: [html], hasEnglish}] in link order.
 */
export function loadBookComments(book) {
  const links = [];
  const seen = new Set();
  for (const link of book.links) {
    const ref = link.sourceRef || link.ref;
    if (!seen.has(ref)) { seen.add(ref); links.push(link); }
  }
  const linkByRef = new Map(links.map(l => [l.sourceRef || l.ref, l]));
  const groups = groupSourceRefs(links.map(l => l.sourceRef || l.ref));
  const single = (ref) => fetchText(ref).then(t => comment(linkByRef.get(ref), t && t.he, t && t.en))
    .catch(() => comment(linkByRef.get(ref), null, null));
  return Promise.all(groups.map(group => {
    if (group.refs.length === 1) { return single(group.ref).then(c => [c]); }
    return fetchText(group.ref).then(t => {
      if (!t) { throw new Error('no text'); }
      return group.refs.map((ref, i) => comment(linkByRef.get(ref), pick(t.he, [i]), pick(t.en, [i])));
    }).catch(() => Promise.all(group.refs.map(single)));
  })).then(parts => [].concat(...parts));
}

const bookQueueKey = (book) => `book:${book.links.map(l => l.sourceRef || l.ref).join('|')}`;

/** A work's comments through the text queue; `front` when the reader is waiting for it. */
export function queueBookComments(book, {front = false} = {}) {
  return textQueue.run(bookQueueKey(book), () => loadBookComments(book), {front});
}

export function peekBookComments(book) {
  return textQueue.peek(bookQueueKey(book));
}

/** A cited ref (a tangent) through the text queue, ahead of previews. */
export function queueRefText(ref) {
  return textQueue.run(`ref:${ref}`, () => fetchText(ref), {front: true});
}

export function peekRefText(ref) {
  return textQueue.peek(`ref:${ref}`);
}

/**
 * The signed-in reader's own notes on a ref. Resolves to [] when signed out or on failure.
 * (Public notes come only with /api/related, which the panel does not load.)
 */
export function loadPrivateNotes(ref, uid) {
  if (!uid) { return Promise.resolve([]); }
  const url = `${Sefaria.apiHost}/api/notes/${refToUrlPath(ref)}?private=1`;
  return Promise.resolve(Sefaria._ApiPromise(url))
    .then(data => (Array.isArray(data) ? data.filter(n => n && (n.text || n.title)) : []))
    .catch(() => []);
}

// ------------------------------------------------------------------ stream badges and pins

export const CHUNK_SIZE = 8;

/** The fixed chunk of a section a segment number falls in, as a range ref ("Genesis 1:9-16"). */
export function chunkFor(section, number) {
  const numbers = section.segments.map(s => s.number);
  const last = numbers[numbers.length - 1];
  const start = Math.floor((number - 1) / CHUNK_SIZE) * CHUNK_SIZE + 1;
  const end = Math.min(start + CHUNK_SIZE - 1, last);
  const segments = section.segments.filter(s => s.number >= start && s.number <= end);
  if (!segments.length) { return null; }
  const prefix = segments[0].ref.slice(0, segments[0].ref.length - String(segments[0].number).length);
  const first = segments[0].number;
  const lastInChunk = segments[segments.length - 1].number;
  return {
    key: `${section.ref}#${start}`,
    ref: first === lastInChunk ? `${prefix}${first}` : `${prefix}${first}-${lastInChunk}`,
    segmentRefs: segments.map(s => s.ref),
  };
}

/**
 * Split a chunk's links by the segments they attach to. A link on a range ("Genesis 1:1-2:3")
 * belongs to every segment it covers (anchorRefExpanded).
 */
export function splitBySegment(links, segmentRefs) {
  const out = {};
  for (const ref of segmentRefs) { out[ref] = []; }
  for (const link of links) {
    const anchors = link.anchorRefExpanded || [link.anchorRef];
    for (const anchor of anchors) {
      if (out[anchor] && !out[anchor].includes(link)) { out[anchor].push(link); }
    }
  }
  return out;
}

/** Links for a chunk of segments, split per segment. */
export function loadChunk(chunk) {
  return countQueue.run(`chunk:${chunk.ref}`, () => loadLinks(chunk.ref).then(links => splitBySegment(links, chunk.segmentRefs)));
}

/**
 * The section of a commentary that runs alongside a base section: "Rashi on Genesis" + section
 * "Genesis 1" -> "Rashi on Genesis 1". Returns null when the base ref isn't title + address.
 */
export function commentarySectionRef(indexTitle, section) {
  const address = section.ref.indexOf(section.indexTitle) === 0 ? section.ref.slice(section.indexTitle.length).trim() : null;
  return indexTitle && address ? `${indexTitle} ${address}` : null;
}

/** 0-based path of `sourceRef` inside `sectionRef`'s text arrays, or null if it lies elsewhere. */
export function pathWithin(sourceRef, sectionRef) {
  if (!sourceRef || !sectionRef || sourceRef.indexOf(`${sectionRef}:`) !== 0) { return null; }
  const rest = sourceRef.slice(sectionRef.length + 1).split(':');
  if (!rest.every(p => /^\d+$/.test(p))) { return null; }
  return rest.map(p => Number(p) - 1);
}

/** A whole commentary section (for pins), behind anything the reader is waiting for. */
export function queueSectionText(ref) {
  return textQueue.run(`section:${ref}`, () => fetchText(ref));
}

/**
 * A pinned work's comments on one segment, using its whole-section text when the comment lies
 * inside it and a single fetch otherwise. Resolves to [{ref, heRef, he, en, hasEnglish}].
 */
export function loadPinnedComments(links, section) {
  const bySection = new Map();
  const tasks = links.map(link => {
    const sref = commentarySectionRef(link.index_title, section);
    const path = pathWithin(link.sourceRef, sref);
    if (path) {
      if (!bySection.has(sref)) { bySection.set(sref, queueSectionText(sref)); }
      return bySection.get(sref).then(t => {
        const he = t && pick(t.he, path);
        const en = t && pick(t.en, path);
        if (paragraphs(he).length || paragraphs(en).length) { return comment(link, he, en); }
        return textQueue.run(`ref:${link.sourceRef}`, () => fetchText(link.sourceRef)).then(s => comment(link, s && s.he, s && s.en));
      });
    }
    return textQueue.run(`ref:${link.sourceRef}`, () => fetchText(link.sourceRef)).then(s => comment(link, s && s.he, s && s.en));
  });
  return Promise.all(tasks.map(t => t.catch(() => null))).then(list => list.filter(c => c && (c.he.length || c.en.length)));
}
