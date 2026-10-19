import { lzwCompress, lzwDecompress, encodeShare, decodeShare, lessonToShare, shareToLesson, lessonShareUrl } from '../share';

const lesson = {
  id: 'abc', ts: 5, title: 'Creation and light',
  sources: [
    { id: 's1', ref: 'Genesis 1:1-5', title: 'Genesis 1:1-5', heTitle: 'בראשית א׳:א׳-ה׳', he: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ', en: 'When God began to create heaven and earth', note: 'read aloud' },
    { id: 's2', ref: 'Rashi on Genesis 1:1:1', title: 'Rashi on Genesis 1:1:1', heTitle: '', he: 'בראשית. אמר רבי יצחק', en: 'Said Rabbi Yitzchak', note: '' },
  ],
  questions: [{ id: 'q1', en: 'Why light first?', he: 'למה אור קודם?' }, { id: 'q2', en: 'What is tohu?', he: 'What is tohu?' }],
  handoutNotes: 'Bring chumashim. 45 minutes.',
};

test('LZW round-trips binary strings, including repeats and the KwKwK case', () => {
  for (const s of ['', 'a', 'aaaaaaaaaaaaaaaa', 'abababababababab', 'TOBEORNOTTOBEORTOBEORNOT', unescape(encodeURIComponent(JSON.stringify(lesson))), String.fromCharCode(...Array.from({ length: 256 }, (_, i) => i))]) {
    expect(lzwDecompress(lzwCompress(s))).toBe(s);
  }
  const big = Array.from({ length: 4000 }, (_, i) => `{"ref":"Genesis ${i % 50 + 1}:${i % 31 + 1}","note":"x${i}"}`).join(',');
  const packed = lzwCompress(big);
  expect(packed.length).toBeLessThan(big.length / 2);     // code width grows past 12 bits here and still decodes
  expect(lzwDecompress(packed)).toBe(big);
  expect(() => lzwCompress('שלום')).toThrow(TypeError);
});

test('encodeShare / decodeShare round-trip unicode and reject garbage', () => {
  const data = { v: 1, t: 'שלום', list: [1, 2, { x: 'ü€😀' }] };
  const encoded = encodeShare(data);
  expect(encoded).toMatch(/^1[A-Za-z0-9_-]+$/);           // URL-safe, no padding
  expect(decodeShare(encoded)).toEqual(data);
  expect(decodeShare('')).toBeNull();
  expect(decodeShare('2abc')).toBeNull();
  expect(decodeShare('1!!!not base64')).toBeNull();
  expect(decodeShare(encoded.slice(0, 8))).toBeNull();
  expect(decodeShare(null)).toBeNull();
});

test('lesson → hash → lesson keeps everything the handout needs and drops ids', () => {
  const wire = lessonToShare(lesson);
  expect(wire.s[0]).toEqual({ r: 'Genesis 1:1-5', t: 'Genesis 1:1-5', h: 'בראשית א׳:א׳-ה׳', he: lesson.sources[0].he, en: lesson.sources[0].en, n: 'read aloud' });
  const url = lessonShareUrl(lesson, 'https://example.org');
  expect(url.startsWith('https://example.org/my/lessons/shared#1')).toBe(true);
  const hash = url.split('#')[1];
  const back = shareToLesson(decodeShare(hash));
  expect(back.title).toBe(lesson.title);
  expect(back.handoutNotes).toBe(lesson.handoutNotes);
  expect(back.sources.map(({ id, ...s }) => s)).toEqual(lesson.sources.map(({ id, ...s }) => s));
  expect(back.questions.map(({ id, ...q }) => q)).toEqual(lesson.questions.map(({ id, ...q }) => q));
  expect(back.sources[0].id).toBeTruthy();
  expect(hash.length).toBeLessThan(JSON.stringify(lesson).length);   // compressed
});

test('shareToLesson tolerates partial or foreign data', () => {
  expect(shareToLesson(null)).toBeNull();
  expect(shareToLesson({ v: 2, t: 'x' })).toBeNull();
  expect(shareToLesson({ v: 1, t: 'Only a title' })).toEqual({ title: 'Only a title', sources: [], questions: [], handoutNotes: '' });
  expect(shareToLesson({ v: 1, t: 'x', s: [{ nope: true }, { r: 'Exodus 1' }], q: [{}, { he: 'שאלה' }] })).toMatchObject({
    sources: [{ ref: 'Exodus 1', title: 'Exodus 1' }], questions: [{ en: 'שאלה', he: 'שאלה' }],
  });
});
