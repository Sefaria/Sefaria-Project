import { hebrewNumeral, dafLabel, hebrewDaf, buildUnits, planFromIndex, unitsForDay, scheduleFor, nextUnit } from '../schedule';
import { dayKey, addDays, daysBetween, fromDayKey, isValidDayKey } from '../dates';

test('date helpers', () => {
  expect(dayKey(new Date(2026, 9, 1))).toBe('2026-10-01');
  expect(dayKey('2026-10-01T12:00')).toBe('2026-10-01');
  expect(addDays('2026-10-01', 31)).toBe('2026-11-01');
  expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  expect(daysBetween('2026-10-01', '2026-10-15')).toBe(14);
  expect(daysBetween('2026-10-15', new Date(2026, 9, 1))).toBe(-14);
  expect(fromDayKey('2026-03-29').getDate()).toBe(29);   // DST boundary is fine with local midnight math
  expect(isValidDayKey('2026-10-01')).toBe(true);
  expect(isValidDayKey('tomorrow')).toBe(false);
});

test('hebrew numerals and dafim', () => {
  expect(hebrewNumeral(1)).toBe('א׳');
  expect(hebrewNumeral(15)).toBe('ט״ו');
  expect(hebrewNumeral(16)).toBe('ט״ז');
  expect(hebrewNumeral(50)).toBe('נ׳');
  expect(hebrewNumeral(127)).toBe('קכ״ז');
  expect(hebrewNumeral(697)).toBe('תרצ״ז');
  expect(hebrewNumeral(1533)).toBe('א׳ תקל״ג');
  expect(dafLabel(3)).toBe('2a');
  expect(dafLabel(4)).toBe('2b');
  expect(dafLabel(127)).toBe('64a');
  expect(hebrewDaf('2a')).toBe('ב׳ א');
  expect(hebrewDaf('64b')).toBe('ס״ד ב');
});

test('buildUnits: chapters and dafim', () => {
  const gen = buildUnits({ title: 'Genesis', heTitle: 'בראשית', length: 50, sectionName: 'Chapter', heSectionName: 'פרק' });
  expect(gen).toHaveLength(50);
  expect(gen[0]).toEqual({ ref: 'Genesis 1', label: 'Chapter 1', heLabel: 'פרק א׳' });
  expect(gen[49].ref).toBe('Genesis 50');
  const ber = buildUnits({ title: 'Berakhot', length: 127, addressType: 'Talmud', sectionName: 'Daf' });
  expect(ber).toHaveLength(125);                       // 1a/1b are not real dafim
  expect(ber[0]).toEqual({ ref: 'Berakhot 2a', label: 'Daf 2a', heLabel: 'דף ב׳ א' });
  expect(ber[124].ref).toBe('Berakhot 64a');
  const mid = buildUnits({ title: 'Berakhot', length: 127, addressType: 'Talmud', sectionName: 'Daf', startSection: 23 });
  expect(mid[0].ref).toBe('Berakhot 12a');
  expect(() => buildUnits({ title: '', length: 3 })).toThrow(TypeError);
  expect(() => buildUnits({ title: 'x', length: 0 })).toThrow(TypeError);
});

test('planFromIndex uses the schema and refuses complex texts', () => {
  const index = { title: 'Mishnah Berakhot', heTitle: 'משנה ברכות', schema: { nodeType: 'JaggedArrayNode', lengths: [9, 57], sectionNames: ['Chapter', 'Mishnah'], heSectionNames: ['פרק', 'משנה'], addressTypes: ['Perek', 'Mishnah'] } };
  const args = planFromIndex(index, { unitsPerDay: 2, startDate: '2026-10-01' });
  expect(args).toMatchObject({ title: 'Mishnah Berakhot', heTitle: 'משנה ברכות', book: 'Mishnah Berakhot', unitsPerDay: 2, startDate: '2026-10-01', sectionName: 'Chapter' });
  expect(args.units.map(u => u.ref)).toEqual(['Mishnah Berakhot 1', 'Mishnah Berakhot 2', 'Mishnah Berakhot 3', 'Mishnah Berakhot 4', 'Mishnah Berakhot 5', 'Mishnah Berakhot 6', 'Mishnah Berakhot 7', 'Mishnah Berakhot 8', 'Mishnah Berakhot 9']);
  expect(planFromIndex({ title: 'Zohar', schema: { nodeType: 'SchemaNode', nodes: [] } })).toBeNull();
  expect(planFromIndex(null)).toBeNull();
});

const plan = {
  title: 'Genesis', startDate: '2026-10-01', unitsPerDay: 2, done: ['Genesis 1', 'Genesis 2', 'Genesis 3'],
  units: Array.from({ length: 7 }, (_, i) => ({ ref: `Genesis ${i + 1}`, label: `Chapter ${i + 1}`, heLabel: '' })),
};

test('daily chunking and schedule state', () => {
  expect(unitsForDay(plan, 0).map(u => u.ref)).toEqual(['Genesis 1', 'Genesis 2']);
  expect(unitsForDay(plan, 3).map(u => u.ref)).toEqual(['Genesis 7']);
  expect(unitsForDay(plan, -1)).toEqual([]);

  const day2 = scheduleFor(plan, new Date(2026, 9, 2));
  expect(day2).toMatchObject({ totalDays: 4, dayIndex: 1, endDate: '2026-10-04', doneCount: 3, pct: 43, behind: 0, status: 'active' });
  expect(day2.todayUnits.map(u => u.ref)).toEqual(['Genesis 3', 'Genesis 4']);
  expect(nextUnit(plan, new Date(2026, 9, 2)).ref).toBe('Genesis 4');

  const day3 = scheduleFor(plan, new Date(2026, 9, 3));
  expect(day3.behind).toBe(1);                              // Genesis 4 was due yesterday
  expect(day3.todayUnits.map(u => u.ref)).toEqual(['Genesis 5', 'Genesis 6']);
  expect(nextUnit(plan, new Date(2026, 9, 3)).ref).toBe('Genesis 5');

  expect(scheduleFor(plan, new Date(2026, 8, 20)).status).toBe('upcoming');
  expect(scheduleFor(plan, new Date(2026, 8, 20)).todayUnits).toEqual([]);
  const after = scheduleFor(plan, new Date(2026, 10, 1));
  expect(after.todayUnits).toEqual([]);
  expect(after.behind).toBe(4);
  expect(nextUnit(plan, new Date(2026, 10, 1)).ref).toBe('Genesis 4');

  const finished = { ...plan, done: plan.units.map(u => u.ref) };
  expect(scheduleFor(finished, new Date(2026, 9, 2))).toMatchObject({ status: 'complete', pct: 100 });
  expect(nextUnit(finished)).toBeNull();
  expect(scheduleFor({ ...plan, units: [], done: [] }).totalDays).toBe(1);
});
