/**
 * Loading for associated texts (associatedData.js): counts before text, text one commentator
 * at a time, ranges instead of one request per comment, and the per-chunk links behind the
 * stream's badges and pins. The data layer is the real Sefaria singleton with its network
 * methods stubbed.
 */
import Sefaria from '../../sefaria/sefaria';
import {
  chunkFor, commentarySectionRef, createTaskQueue, loadBookComments, loadChunk, loadLinks, loadPinnedComments,
  loadPrivateNotes, paragraphs, pathWithin, peekBookComments, pick, queueBookComments, queueRefText, resetAssociatedCaches,
  splitBySegment, textFromApi,
} from '../associatedData';
import {booksFromLinks, groupLinks} from '../associated';
import {sectionFromApi} from '../text';
import {fixture, v3} from './helpers';

const GENESIS_LINKS = require('./fixtures/links-genesis-1-1.json');

/** A controllable promise. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return {promise, resolve, reject};
}

const tick = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { resetAssociatedCaches(); });
afterEach(() => { jest.restoreAllMocks(); });

describe('the task queue', () => {
  test('runs one task at a time, in order, and deduplicates by key', async () => {
    const q = createTaskQueue(1);
    const log = [];
    const a = deferred();
    const b = deferred();
    const pa = q.run('a', () => { log.push('start a'); return a.promise; });
    const pb = q.run('b', () => { log.push('start b'); return b.promise; });
    expect(q.run('a', () => { log.push('again'); })).toBe(pa);
    await tick();
    expect(log).toEqual(['start a']);
    a.resolve(1);
    await pa;
    await tick();
    expect(log).toEqual(['start a', 'start b']);
    b.resolve(2);
    expect(await pb).toBe(2);
    expect(q.peek('a')).toBe(1);
  });

  test('`front` moves a waiting task ahead; a failed task can be retried', async () => {
    const q = createTaskQueue(1);
    const log = [];
    const first = deferred();
    q.run('first', () => first.promise);
    q.run('preview', () => { log.push('preview'); });
    q.run('opened', () => { log.push('opened'); }, {front: true});
    first.resolve();
    await tick(); await tick(); await tick();
    expect(log).toEqual(['opened', 'preview']);
    await expect(q.run('bad', () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await q.run('bad', () => 'ok')).toBe('ok');
  });
});

describe('texts', () => {
  test('source and translation from a v3 response; nested values flatten into paragraphs', () => {
    const t = textFromApi(v3('Rashi on Genesis 1:1:1-2', ['<b>a</b>', 'b'], ['A', '']));
    expect(t.he).toEqual(['<b>a</b>', 'b']);
    expect(t.en).toEqual(['A', '']);
    expect(paragraphs(t.en)).toEqual(['A']);
    expect(paragraphs([['x', ['y']], '  ', null])).toEqual(['x', 'y']);
    expect(pick([['a', 'b'], ['c']], [0, 1])).toBe('b');
    expect(pick('flat', [0])).toBeNull();
    expect(textFromApi({error: 'nope'})).toBeNull();
  });

  test("a work's comments on a segment come in one range request", async () => {
    const get = jest.spyOn(Sefaria, 'getTextsFromAPIV3').mockImplementation((ref) =>
      Promise.resolve(v3(ref, ['rashi 1', 'rashi 2', 'rashi 3'], ['one', 'two', 'three'])));
    const rashi = booksFromLinks(GENESIS_LINKS).find(b => b.key === 'Commentary|Rashi');
    const comments = await loadBookComments(rashi);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('Rashi on Genesis 1:1:1-3', expect.any(Array), true, 'wrap_all_entities');
    expect(comments.map(c => [c.ref, c.he[0], c.en[0], c.hasEnglish])).toEqual([
      ['Rashi on Genesis 1:1:1', 'rashi 1', 'one', true],
      ['Rashi on Genesis 1:1:2', 'rashi 2', 'two', true],
      ['Rashi on Genesis 1:1:3', 'rashi 3', 'three', true],
    ]);
  });

  test('a failed range falls back to its single refs; a failed single ref becomes an empty comment', async () => {
    const get = jest.spyOn(Sefaria, 'getTextsFromAPIV3').mockImplementation((ref) => {
      if (ref.includes('-')) { return Promise.reject(new Error('range not supported')); }
      if (ref.endsWith(':2')) { return Promise.reject(new Error('offline')); }
      return Promise.resolve(v3(ref, `he ${ref}`));
    });
    const rashi = booksFromLinks(GENESIS_LINKS).find(b => b.key === 'Commentary|Rashi');
    const comments = await loadBookComments(rashi);
    expect(get.mock.calls.map(c => c[0])).toEqual(['Rashi on Genesis 1:1:1-3', 'Rashi on Genesis 1:1:1', 'Rashi on Genesis 1:1:2', 'Rashi on Genesis 1:1:3']);
    expect(comments.map(c => c.he.length)).toEqual([1, 0, 1]);
    expect(comments[0].hasEnglish).toBe(false);
  });
});

describe('lazy loading: counts first, then text one commentator at a time', () => {
  test('the links request carries no text; text requests start only after it, and never overlap', async () => {
    const links = deferred();
    const getLinks = jest.spyOn(Sefaria, 'getLinks').mockImplementation(() => links.promise);
    const inFlight = new Set();
    let maxInFlight = 0;
    const pending = [];
    const getText = jest.spyOn(Sefaria, 'getTextsFromAPIV3').mockImplementation((ref) => {
      inFlight.add(ref);
      maxInFlight = Math.max(maxInFlight, inFlight.size);
      const d = deferred();
      pending.push({ref, d});
      return d.promise.then(v => { inFlight.delete(ref); return v; });
    });

    const loaded = loadLinks('Genesis 1:1');
    expect(getLinks).toHaveBeenCalledWith('Genesis 1:1');
    await tick();
    expect(getText).not.toHaveBeenCalled();  // no text before the counts
    links.resolve(GENESIS_LINKS);
    const grouped = groupLinks(await loaded, {corpus: 'Tanakh'});

    // The panel queues the top five for previews, in order.
    const previews = grouped.top.map(book => queueBookComments(book));
    await tick();
    expect(getText.mock.calls.map(c => c[0])).toEqual(['Rashi on Genesis 1:1:1-3']);
    // The reader opens Sforno: it jumps ahead of Ibn Ezra, which hasn't started.
    const sforno = grouped.top.find(b => b.title === 'Sforno');
    queueBookComments(sforno, {front: true});
    for (let i = 0; i < 5; i++) {
      const next = pending.shift();
      next.d.resolve(v3(next.ref, ['x', 'y', 'z', 'w', 'v']));
      await tick(); await tick();
    }
    await Promise.all(previews);
    expect(maxInFlight).toBe(1);
    expect(getText.mock.calls.map(c => c[0].split(' on ')[0])).toEqual(['Rashi', 'Sforno', 'Ramban', 'Ibn Ezra', 'Onkelos Genesis 1:1']);
    expect(peekBookComments(sforno)).toHaveLength(sforno.count);
  });

  test('a cited text jumps the queue', async () => {
    const order = [];
    jest.spyOn(Sefaria, 'getTextsFromAPIV3').mockImplementation((ref) => { order.push(ref); return Promise.resolve(v3(ref, 'x')); });
    const books = booksFromLinks(GENESIS_LINKS);
    const blocker = deferred();
    // Keep the queue busy so later work has to wait its turn.
    const {textQueue} = require('../associatedData');
    textQueue.run('busy', () => blocker.promise);
    queueBookComments(books.find(b => b.key === 'Commentary|Ramban'));
    const cited = queueRefText('Psalms 111:6');
    blocker.resolve();
    await cited;
    await tick(); await tick();
    expect(order[0]).toBe('Psalms 111:6');
  });

  test('the reader\'s own notes load only when signed in, from the notes API', async () => {
    const api = jest.spyOn(Sefaria, '_ApiPromise').mockResolvedValue([{_id: 'n1', text: 'my note'}, {_id: 'n2'}]);
    expect(await loadPrivateNotes('Genesis 1:1', null)).toEqual([]);
    expect(api).not.toHaveBeenCalled();
    expect(await loadPrivateNotes('Genesis 1:1', 7)).toEqual([{_id: 'n1', text: 'my note'}]);
    expect(api).toHaveBeenCalledWith('/api/notes/Genesis.1.1?private=1');
    api.mockRejectedValueOnce(new Error('403'));
    expect(await loadPrivateNotes('Genesis 1:2', 7)).toEqual([]);
  });
});

describe('stream chunks (badges and pins)', () => {
  const genesis = sectionFromApi(fixture('genesis-1').initialPanel.text);
  const berakhot = sectionFromApi(fixture('berakhot-2a').initialPanel.text);

  test('segments fall in fixed chunks of eight, as range refs', () => {
    expect(chunkFor(genesis, 1)).toMatchObject({key: 'Genesis 1#1', ref: 'Genesis 1:1-8'});
    expect(chunkFor(genesis, 8).ref).toBe('Genesis 1:1-8');
    expect(chunkFor(genesis, 9).ref).toBe('Genesis 1:9-16');
    expect(chunkFor(genesis, 31)).toMatchObject({ref: 'Genesis 1:25-31', segmentRefs: expect.arrayContaining(['Genesis 1:31'])});
    expect(chunkFor(berakhot, 14).ref).toBe('Berakhot 2a:9-14');
  });

  test('a chunk\'s links split by the segments they attach to, ranges included', () => {
    const a = {anchorRefExpanded: ['Genesis 1:1']};
    const range = {anchorRefExpanded: ['Genesis 1:1', 'Genesis 1:2', 'Genesis 1:3']};
    const split = splitBySegment([a, range], ['Genesis 1:1', 'Genesis 1:2']);
    expect(split).toEqual({'Genesis 1:1': [a, range], 'Genesis 1:2': [range]});
  });

  test('loading a chunk is one links request, deduplicated', async () => {
    const getLinks = jest.spyOn(Sefaria, 'getLinks').mockResolvedValue(GENESIS_LINKS);
    const chunk = chunkFor(genesis, 3);
    const [split] = await Promise.all([loadChunk(chunk), loadChunk(chunk)]);
    expect(getLinks).toHaveBeenCalledTimes(1);
    expect(getLinks).toHaveBeenCalledWith('Genesis 1:1-8');
    expect(split['Genesis 1:1'].length).toBeGreaterThan(300);
    expect(split['Genesis 1:5']).toEqual([]);
  });

  test('a pinned work reads its comments out of the whole commentary section', async () => {
    expect(commentarySectionRef('Rashi on Genesis', genesis)).toBe('Rashi on Genesis 1');
    expect(commentarySectionRef('Steinsaltz on Berakhot', berakhot)).toBe('Steinsaltz on Berakhot 2a');
    expect(pathWithin('Rashi on Genesis 1:1:2', 'Rashi on Genesis 1')).toEqual([0, 1]);
    expect(pathWithin('Steinsaltz on Berakhot 2a:3', 'Steinsaltz on Berakhot 2a')).toEqual([2]);
    expect(pathWithin('Tzror HaMor on Torah, Exodus 1:1', 'Tzror HaMor on Torah, Genesis 1')).toBeNull();

    const get = jest.spyOn(Sefaria, 'getTextsFromAPIV3').mockImplementation((ref) => Promise.resolve(
      ref === 'Rashi on Genesis 1' ? v3(ref, [['r1', 'r2', 'r3'], ['r4']], [['e1', 'e2', 'e3'], ['e4']]) : v3(ref, `single ${ref}`)));
    const rashi = booksFromLinks(GENESIS_LINKS).find(b => b.key === 'Commentary|Rashi').links;
    const comments = await loadPinnedComments(rashi, genesis);
    expect(get.mock.calls.map(c => c[0])).toEqual(['Rashi on Genesis 1']);
    expect(comments.map(c => [c.he[0], c.en[0]])).toEqual([['r1', 'e1'], ['r2', 'e2'], ['r3', 'e3']]);
    // Genesis 1:2 in the same section needs no new request.
    await loadPinnedComments([{...rashi[0], sourceRef: 'Rashi on Genesis 1:2:1', anchorRefExpanded: ['Genesis 1:2']}], genesis);
    expect(get).toHaveBeenCalledTimes(1);
  });

  test('a pinned comment outside the section, or missing from it, is fetched on its own', async () => {
    const get = jest.spyOn(Sefaria, 'getTextsFromAPIV3').mockImplementation((ref) => Promise.resolve(
      ref === 'Rashi on Genesis 1' ? v3(ref, [[]], [[]]) : v3(ref, `single ${ref}`)));
    const links = [
      {sourceRef: 'Rashi on Genesis 1:1:1', index_title: 'Rashi on Genesis', collectiveTitle: {en: 'Rashi'}},
      {sourceRef: 'Tzror HaMor on Torah, Exodus 1:1', index_title: 'Tzror HaMor on Torah', collectiveTitle: {en: 'Tzror HaMor'}},
    ];
    const comments = await loadPinnedComments(links, genesis);
    expect(get.mock.calls.map(c => c[0]).sort()).toEqual(['Rashi on Genesis 1', 'Rashi on Genesis 1:1:1', 'Tzror HaMor on Torah, Exodus 1:1']);
    expect(comments.map(c => c.he[0])).toEqual(['single Rashi on Genesis 1:1:1', 'single Tzror HaMor on Torah, Exodus 1:1']);
  });
});

test('texts ask for the source and the English, and a work written in English reads as English', async () => {
  const get = jest.spyOn(Sefaria, 'getTextsFromAPIV3').mockResolvedValue({ref: 'Abraham Cohen 1', versions: [
    {versionTitle: 'Soncino', languageFamilyName: 'english', isPrimary: true, isSource: true, direction: 'ltr', text: 'A note'}]});
  const {fetchText} = require('../associatedData');
  const text = await fetchText('Abraham Cohen 1');
  expect(get.mock.calls[0][1]).toEqual([{languageFamilyName: 'primary'}, {languageFamilyName: 'english'}]);
  expect(text.he).toBeNull();
  expect(text.en).toBe('A note');
});
