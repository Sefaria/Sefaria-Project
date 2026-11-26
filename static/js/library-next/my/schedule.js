/**
 * Study-plan math, computed client side: units (sections) of a book, daily chunking, and where
 * a plan stands today. No data-layer imports so it is testable in isolation; `planFromIndex`
 * takes the `/api/v2/index/<title>` shape `Sefaria.getIndexDetails` returns.
 */
import { dayKey, addDays, daysBetween } from './dates';

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

/** Hebrew numeral (gematria) with geresh/gershayim, e.g. 15 → ט״ו, 1 → א׳. */
export function hebrewNumeral(n) {
  if (!Number.isInteger(n) || n < 1) { return String(n); }
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const r = rest % 100;
  let letters = HUNDREDS[Math.floor(rest / 100)] + (r === 15 ? 'טו' : r === 16 ? 'טז' : TENS[Math.floor(r / 10)] + ONES[r % 10]);
  if (letters.length === 1) { letters += '׳'; } else if (letters.length > 1) { letters = letters.slice(0, -1) + '״' + letters.slice(-1); }
  return (thousands ? hebrewNumeral(thousands) + ' ' : '') + letters;
}

/** 1-based Talmud section index → daf label: 3 → '2a', 4 → '2b' (sections 1–2 are the unused 1a/1b). */
export function dafLabel(i) {
  return `${Math.ceil(i / 2)}${i % 2 ? 'a' : 'b'}`;
}

export function hebrewDaf(label) {
  const m = /^(\d+)([ab])$/.exec(label);
  return m ? `${hebrewNumeral(Number(m[1]))} ${m[2] === 'a' ? 'א' : 'ב'}` : label;
}

const HE_SECTION_NAMES = { Chapter: 'פרק', Daf: 'דף', Mishnah: 'משנה', Siman: 'סימן', Verse: 'פסוק', Line: 'שורה', Paragraph: 'פסקה', Section: 'קטע', Halakhah: 'הלכה', Psalm: 'מזמור' };

/**
 * The top-level units of a book: `[{ ref, label, heLabel }]`.
 *   title/heTitle   index titles
 *   length          number of top-level sections (`schema.lengths[0]`)
 *   addressType     `schema.addressTypes[0]` ('Talmud' numbers dafim)
 *   sectionName/heSectionName   'Chapter' / 'פרק'
 *   startSection    1-based first section (Talmud defaults to 3 = daf 2a)
 */
export function buildUnits({ title, heTitle = '', length, addressType = 'Integer', sectionName = 'Chapter', heSectionName, startSection } = {}) {
  if (typeof title !== 'string' || !title) { throw new TypeError('title is required'); }
  if (!Number.isInteger(length) || length < 1) { throw new TypeError('length must be a positive integer'); }
  const talmud = addressType === 'Talmud';
  const first = startSection || (talmud ? 3 : 1);
  const heName = heSectionName || HE_SECTION_NAMES[sectionName] || sectionName;
  const units = [];
  for (let i = first; i <= length; i++) {
    const sec = talmud ? dafLabel(i) : String(i);
    const heSec = talmud ? hebrewDaf(sec) : hebrewNumeral(i);
    units.push({ ref: `${title} ${sec}`, label: `${sectionName} ${sec}`, heLabel: `${heName} ${heSec}` });
  }
  return units;
}

/** `createPlan` arguments for an index record (`/api/v2/index/<title>`), or null for complex texts. */
export function planFromIndex(index, { unitsPerDay = 1, startSection, startDate = dayKey(), title } = {}) {
  const schema = index && index.schema;
  if (!schema || schema.nodeType !== 'JaggedArrayNode' || !Array.isArray(schema.lengths) || !schema.lengths.length) { return null; }
  const sectionName = (schema.sectionNames || [])[0] || 'Section';
  const units = buildUnits({
    title: index.title, heTitle: index.heTitle, length: schema.lengths[0], addressType: (schema.addressTypes || [])[0],
    sectionName, heSectionName: (schema.heSectionNames || [])[0], startSection,
  });
  return { title: title || index.title, heTitle: index.heTitle || '', book: index.title, units, unitsPerDay, startDate, sectionName };
}

/** Units scheduled for day `dayIndex` (0-based from `startDate`). */
export function unitsForDay(plan, dayIndex) {
  const per = plan.unitsPerDay || 1;
  if (dayIndex < 0) { return []; }
  return (plan.units || []).slice(dayIndex * per, dayIndex * per + per);
}

/**
 * Where a plan stands on `today`:
 *   { totalDays, dayIndex, todayUnits, endDate, doneCount, pct, behind, status }
 * `dayIndex` is negative before the start; `behind` counts units scheduled before today that are
 * not done; `status` is 'upcoming' | 'active' | 'complete'.
 */
export function scheduleFor(plan, today = new Date()) {
  const per = plan.unitsPerDay || 1;
  const units = plan.units || [];
  const total = units.length;
  const totalDays = Math.max(1, Math.ceil(total / per));
  const done = new Set(plan.done || []);
  const doneCount = units.filter(u => done.has(u.ref)).length;
  const dayIndex = daysBetween(plan.startDate, dayKey(today));
  const todayUnits = dayIndex >= totalDays ? [] : unitsForDay(plan, dayIndex);
  const scheduledBefore = Math.max(0, Math.min(total, dayIndex * per));
  const behind = units.slice(0, scheduledBefore).filter(u => !done.has(u.ref)).length;
  const endDate = addDays(plan.startDate, totalDays - 1);
  const status = doneCount >= total && total > 0 ? 'complete' : dayIndex < 0 ? 'upcoming' : 'active';
  return { totalDays, dayIndex, todayUnits, endDate, doneCount, pct: total ? Math.round((doneCount / total) * 100) : 0, behind, status };
}

/** The first undone unit scheduled today, else the first undone unit at all (catch-up), else null. */
export function nextUnit(plan, today = new Date()) {
  const done = new Set(plan.done || []);
  const { todayUnits } = scheduleFor(plan, today);
  return todayUnits.find(u => !done.has(u.ref)) || (plan.units || []).find(u => !done.has(u.ref)) || null;
}
