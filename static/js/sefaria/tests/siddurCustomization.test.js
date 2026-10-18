/* Testing done using Jest */
import {
  CHANGE_EVENT,
  STORAGE_KEY,
  buildTree,
  firstVisibleSectionRef,
  flattenLeaves,
  getHiddenRefs,
  isCustomizableSiddur,
  isRefHidden,
  leafSectionRefs,
  pruneSchema,
  setHiddenRefs,
  skipHidden,
  subscribeHiddenRefs,
} from '../siddurCustomization';

const TITLE = "The Koren Shalem Siddur; Ashkenaz";
const ref = path => `${TITLE}, ${path}`;
const leaf = (title, extra = {}) => ({title, heTitle: `he ${title}`, nodeType: "JaggedArrayNode", depth: 1, content_counts: 5, ...extra});

// A slice of the Koren schema, plus a depth-2 leaf with an empty chapter and
// sibling titles where one is a prefix of the other.
const SCHEMA = {
  title: TITLE,
  nodes: [
    leaf("Preface"),
    {title: "Weekdays", heTitle: "he Weekdays", nodes: [leaf("On Waking"), leaf("Tallit"), leaf("Tefillin"), leaf("Morning Blessings")]},
    {title: "Shabbat", heTitle: "he Shabbat", nodes: [
      leaf("Barekhi Nafshi"),
      leaf("Ethics of the Fathers", {depth: 2, content_counts: [10, 0, 5, 0]}),
      leaf("Se'uda Shelishit for Shabbat"),
    ]},
    {title: "Festivals", heTitle: "he Festivals", nodes: [leaf("Hoshanot"), leaf("Hoshanot for Hoshana Raba")]},
  ],
};
const LEAVES = flattenLeaves(buildTree(SCHEMA, TITLE));

describe('siddur customization', () => {
  beforeEach(() => window.localStorage.clear());

  test('only the Koren siddur is customizable', () => {
    expect(isCustomizableSiddur(TITLE)).toBe(true);
    expect(isCustomizableSiddur("Siddur Sefard")).toBe(false);
  });

  test('buildTree composes refs the way the book TOC does', () => {
    const tree = buildTree(SCHEMA, TITLE);
    expect(tree.map(n => n.ref)).toEqual([ref("Preface"), ref("Weekdays"), ref("Shabbat"), ref("Festivals")]);
    expect(tree[1].children[1]).toMatchObject({ref: ref("Weekdays, Tallit"), en: "Tallit", he: "he Tallit"});
    expect(LEAVES).toHaveLength(10);
  });

  describe('isRefHidden', () => {
    const hidden = [ref("Weekdays, Tallit"), ref("Festivals, Hoshanot"), ref("Shabbat, Ethics of the Fathers")];
    test.each([
      [ref("Weekdays, Tallit"), true],
      [ref("Weekdays, Tallit 3"), true],
      [ref("Shabbat, Ethics of the Fathers 3"), true],
      [ref("Shabbat, Ethics of the Fathers 3:2"), true],
      [ref("Weekdays, Tefillin"), false],
      [ref("Festivals, Hoshanot for Hoshana Raba"), false],
      [ref("Festivals, Hoshanot for Hoshana Raba 2"), false],
      [null, false],
    ])('%s -> %s', (r, expected) => expect(isRefHidden(r, hidden)).toBe(expected));
  });

  test('pruneSchema drops hidden leaves and emptied parents without mutating', () => {
    const hidden = [ref("Weekdays, Tallit"), ref("Festivals, Hoshanot"), ref("Festivals, Hoshanot for Hoshana Raba")];
    const pruned = pruneSchema(SCHEMA, TITLE, hidden);
    expect(pruned.nodes.map(n => n.title)).toEqual(["Preface", "Weekdays", "Shabbat"]);
    expect(pruned.nodes[1].nodes.map(n => n.title)).toEqual(["On Waking", "Tefillin", "Morning Blessings"]);
    expect(SCHEMA.nodes[1].nodes).toHaveLength(4);
    expect(pruneSchema(SCHEMA, TITLE, [])).toBe(SCHEMA);
    expect(pruneSchema(SCHEMA, TITLE, LEAVES.map(l => l.ref)).nodes).toEqual([]);
  });

  test('leafSectionRefs skips empty chapters', () => {
    const ethics = LEAVES.find(l => l.en === "Ethics of the Fathers");
    expect(leafSectionRefs(ethics)).toEqual([ref("Shabbat, Ethics of the Fathers 1"), ref("Shabbat, Ethics of the Fathers 3")]);
    expect(leafSectionRefs(LEAVES[0])).toEqual([ref("Preface")]);
    expect(leafSectionRefs({ref: "x", depth: 1, contentCounts: 0})).toEqual([]);
  });

  describe('skipHidden', () => {
    test('passes through refs that are not hidden', () => {
      expect(skipHidden(ref("Weekdays, Tefillin"), "next", LEAVES, [ref("Weekdays, Tallit")])).toBe(ref("Weekdays, Tefillin"));
      expect(skipHidden(null, "next", LEAVES, [ref("Weekdays, Tallit")])).toBe(null);
    });

    test('skips a run of hidden leaves in either direction', () => {
      const hidden = [ref("Weekdays, Tallit"), ref("Weekdays, Tefillin")];
      expect(skipHidden(ref("Weekdays, Tallit"), "next", LEAVES, hidden)).toBe(ref("Weekdays, Morning Blessings"));
      expect(skipHidden(ref("Weekdays, Tefillin"), "prev", LEAVES, hidden)).toBe(ref("Weekdays, On Waking"));
    });

    test('skips a whole root section', () => {
      const hidden = LEAVES.filter(l => l.ref.startsWith(ref("Weekdays"))).map(l => l.ref);
      expect(skipHidden(ref("Weekdays, On Waking"), "next", LEAVES, hidden)).toBe(ref("Shabbat, Barekhi Nafshi"));
      expect(skipHidden(ref("Weekdays, Morning Blessings"), "prev", LEAVES, hidden)).toBe(ref("Preface"));
    });

    test('lands on the first or last chapter of a deeper leaf', () => {
      const hidden = [ref("Shabbat, Barekhi Nafshi"), ref("Shabbat, Se'uda Shelishit for Shabbat")];
      expect(skipHidden(ref("Shabbat, Barekhi Nafshi"), "next", LEAVES, hidden)).toBe(ref("Shabbat, Ethics of the Fathers 1"));
      expect(skipHidden(ref("Shabbat, Se'uda Shelishit for Shabbat"), "prev", LEAVES, hidden)).toBe(ref("Shabbat, Ethics of the Fathers 3"));
    });

    test('skips every chapter of a hidden deeper leaf', () => {
      const hidden = [ref("Shabbat, Ethics of the Fathers")];
      expect(skipHidden(ref("Shabbat, Ethics of the Fathers 1"), "next", LEAVES, hidden)).toBe(ref("Shabbat, Se'uda Shelishit for Shabbat"));
      expect(skipHidden(ref("Shabbat, Ethics of the Fathers 3"), "prev", LEAVES, hidden)).toBe(ref("Shabbat, Barekhi Nafshi"));
    });

    test('returns null when nothing visible remains', () => {
      const hidden = [ref("Festivals, Hoshanot"), ref("Festivals, Hoshanot for Hoshana Raba")];
      expect(skipHidden(ref("Festivals, Hoshanot"), "next", LEAVES, hidden)).toBe(null);
      expect(skipHidden(ref("Preface"), "prev", LEAVES, [ref("Preface")])).toBe(null);
    });
  });

  test('firstVisibleSectionRef', () => {
    expect(firstVisibleSectionRef(LEAVES, [])).toBe(ref("Preface"));
    expect(firstVisibleSectionRef(LEAVES, [ref("Preface"), ref("Weekdays, On Waking")])).toBe(ref("Weekdays, Tallit"));
    expect(firstVisibleSectionRef(LEAVES, LEAVES.map(l => l.ref))).toBe(null);
  });

  describe('storage', () => {
    test('round-trips per title and clears when empty', () => {
      setHiddenRefs(TITLE, [ref("Weekdays, Tallit")]);
      setHiddenRefs("Other", ["Other, A"]);
      expect(getHiddenRefs(TITLE)).toEqual([ref("Weekdays, Tallit")]);
      setHiddenRefs(TITLE, []);
      expect(getHiddenRefs(TITLE)).toEqual([]);
      expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({Other: ["Other, A"]});
    });

    test('survives corrupt storage', () => {
      window.localStorage.setItem(STORAGE_KEY, "{not json");
      expect(getHiddenRefs(TITLE)).toEqual([]);
      setHiddenRefs(TITLE, [ref("Preface")]);
      expect(getHiddenRefs(TITLE)).toEqual([ref("Preface")]);
    });

    test('subscribers get the current value and later changes until unsubscribed', () => {
      setHiddenRefs(TITLE, [ref("Preface")]);
      const callback = jest.fn();
      const unsubscribe = subscribeHiddenRefs(TITLE, callback);
      expect(callback).toHaveBeenLastCalledWith([ref("Preface")]);
      setHiddenRefs(TITLE, [ref("Weekdays, Tallit")]);
      expect(callback).toHaveBeenLastCalledWith([ref("Weekdays, Tallit")]);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({[TITLE]: []}));
      window.dispatchEvent(new StorageEvent("storage", {key: STORAGE_KEY}));
      expect(callback).toHaveBeenLastCalledWith([]);
      unsubscribe();
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
      expect(callback).toHaveBeenCalledTimes(3);
    });

    test('subscribing to other books is a no-op', () => {
      const callback = jest.fn();
      subscribeHiddenRefs("Genesis", callback)();
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
