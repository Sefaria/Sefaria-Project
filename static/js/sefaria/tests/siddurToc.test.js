import { filterSiddurToc, flattenSiddurToc, normalizeTocQuery } from '../siddurToc';

// Shape of /api/v2/index/<title> `schema`, trimmed.
const schema = {
  nodes: [
    {title: "Weekday Shacharit", heTitle: "שחרית לימות החול", nodes: [
      {title: "Morning Blessings", heTitle: "בִּרְכוֹת הַשַּׁחַר", depth: 1},
      {title: "Amidah", heTitle: "עמידה", depth: 1},
    ]},
    {title: "Weekday Maariv", heTitle: "ערבית לימות החול", nodes: [
      {title: "Ma'ariv Amidah", heTitle: "עמידה", depth: 1},
      {title: "Sefirat HaOmer", heTitle: "ספירת העומר", depth: 1},
    ]},
    {title: "Ethics", heTitle: "פרקי אבות", nodes: [
      {title: "Chapter One", heTitle: "פרק א", nodes: [{default: true, depth: 1}, {title: "Mishna", heTitle: "משנה", depth: 1}]},
    ]},
    {title: "Bedtime Shema", heTitle: "קריאת שמע שעל המיטה", depth: 1},
  ],
};
const refs = items => items.map(i => i.ref.replace("Siddur X, ", ""));

describe('flattenSiddurToc', () => {
  const items = flattenSiddurToc(schema, "Siddur X");
  test('lists every titled node depth-first with ref paths, depth and parent', () => {
    expect(refs(items)).toEqual([
      "Weekday Shacharit", "Weekday Shacharit, Morning Blessings", "Weekday Shacharit, Amidah",
      "Weekday Maariv", "Weekday Maariv, Ma'ariv Amidah", "Weekday Maariv, Sefirat HaOmer",
      "Ethics", "Ethics, Chapter One", "Ethics, Chapter One, Mishna",
      "Bedtime Shema",
    ]);
    expect(items[1]).toEqual({ref: "Siddur X, Weekday Shacharit, Morning Blessings", en: "Morning Blessings",
      he: "בִּרְכוֹת הַשַּׁחַר", depth: 1, parent: 0, isLeaf: true});
    expect(items[0].isLeaf).toBe(false);
    expect(items[8]).toMatchObject({depth: 2, parent: 7});
    expect(items[9]).toMatchObject({depth: 0, parent: null, isLeaf: true});
  });
  test('handles a missing schema', () => {
    expect(flattenSiddurToc(undefined, "Siddur X")).toEqual([]);
  });
});

describe('filterSiddurToc', () => {
  const items = flattenSiddurToc(schema, "Siddur X");
  test('an empty query keeps everything', () => {
    expect(filterSiddurToc(items, "  ")).toBe(items);
  });
  test('keeps matches and their ancestors', () => {
    expect(refs(filterSiddurToc(items, "amidah"))).toEqual([
      "Weekday Shacharit", "Weekday Shacharit, Amidah", "Weekday Maariv", "Weekday Maariv, Ma'ariv Amidah",
    ]);
    expect(refs(filterSiddurToc(items, "mishna"))).toEqual(["Ethics", "Ethics, Chapter One", "Ethics, Chapter One, Mishna"]);
  });
  test('a matching section keeps everything inside it', () => {
    expect(refs(filterSiddurToc(items, "maariv"))).toEqual([
      "Weekday Maariv", "Weekday Maariv, Ma'ariv Amidah", "Weekday Maariv, Sefirat HaOmer",
    ]);
  });
  test('matches Hebrew titles ignoring nikud', () => {
    expect(refs(filterSiddurToc(items, "ברכות השחר"))).toEqual(["Weekday Shacharit", "Weekday Shacharit, Morning Blessings"]);
    expect(refs(filterSiddurToc(items, "עמידה"))).toHaveLength(4);
  });
  test('no match leaves nothing', () => {
    expect(filterSiddurToc(items, "zzz")).toEqual([]);
  });
});

describe('normalizeTocQuery', () => {
  test('folds case, nikud, apostrophes and whitespace', () => {
    expect(normalizeTocQuery("  Ma'ariv   AMIDAH ")).toBe("maariv amidah");
    expect(normalizeTocQuery("שַׁחֲרִית")).toBe("שחרית");
    expect(normalizeTocQuery(null)).toBe("");
  });
});
