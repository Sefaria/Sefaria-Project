/* Testing done using Jest */
import SUBSECTIONS from '../siddurSubsections.json';
import {
  CHANGE_EVENT,
  STORAGE_KEY,
  buildCustomizeTree,
  buildTree,
  firstVisibleSectionRef,
  flattenLeaves,
  DEFAULT_OPTIONS,
  OPTIONS_KEY,
  getDisplayOptions,
  getHiddenRefs,
  hiddenRun,
  hiddenSegmentsFor,
  hintGroups,
  interleaveHints,
  isBlankHtml,
  namesFor,
  setDisplayOptions,
  stripInstructions,
  visibleSegments,
  isCustomizableSiddur,
  isRefHidden,
  leafSectionRefs,
  normalizeHiddenRefs,
  pruneSchema,
  resolveHidden,
  setHiddenRefs,
  skipHidden,
  subscribeCustomization,
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
      const unsubscribe = subscribeCustomization(TITLE, callback);
      expect(callback).toHaveBeenLastCalledWith([ref("Preface")], DEFAULT_OPTIONS);
      setHiddenRefs(TITLE, [ref("Weekdays, Tallit")]);
      expect(callback).toHaveBeenLastCalledWith([ref("Weekdays, Tallit")], DEFAULT_OPTIONS);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({[TITLE]: []}));
      window.dispatchEvent(new StorageEvent("storage", {key: STORAGE_KEY}));
      expect(callback).toHaveBeenLastCalledWith([], DEFAULT_OPTIONS);
      unsubscribe();
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
      expect(callback).toHaveBeenCalledTimes(3);
    });

    test('subscribing to other books is a no-op', () => {
      const callback = jest.fn();
      subscribeCustomization("Genesis", callback)();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('weekday sub-sections', () => {
    const MINHA = ref("Weekdays, Minha for Weekdays");
    const ON_WAKING = ref("Weekdays, On Waking");
    const subsSchema = {title: TITLE, nodes: [
      {title: "Weekdays", heTitle: "he Weekdays", nodes: [leaf("On Waking"), leaf("Tallit"), leaf("Minha for Weekdays")]},
    ]};

    test('the curated map partitions every leaf it lists', () => {
      const check = (nodes, from, to) => {
        expect(nodes[0].from).toBe(from);
        expect(nodes[nodes.length - 1].to).toBe(to);
        nodes.forEach((node, i) => {
          expect(node.en && node.he).toBeTruthy();
          if (i) { expect(node.from).toBe(nodes[i - 1].to + 1); }
          if (node.children) { check(node.children, node.from, node.to); }
        });
      };
      const leaves = Object.entries(SUBSECTIONS[TITLE]);
      expect(leaves.length).toBeGreaterThan(10);
      leaves.forEach(([path, nodes]) => {
        expect(path.startsWith("Weekdays, ")).toBe(true);
        check(nodes, 1, nodes[nodes.length - 1].to);
      });
    });

    test('buildCustomizeTree hangs sub-sections, nested, off their leaves', () => {
      const weekdays = buildCustomizeTree(subsSchema, TITLE)[0];
      const [onWaking, tallit, minha] = weekdays.children;
      expect(onWaking.children.map(n => n.en)).toContain("Tzitzit");
      expect(onWaking.children.find(n => n.en === "Tzitzit").ref).toBe(`${ON_WAKING} 8-12`);
      expect(tallit.children).toEqual([]);
      const amida = minha.children.find(n => n.en === "The Amida");
      expect(amida.ref).toBe(`${MINHA} 9-93`);
      expect(amida.children.map(n => n.en)).toEqual(expect.arrayContaining(["Patriarchs", "Kedusha", "Elokai Netzor"]));
      expect(buildTree(subsSchema, TITLE)[0].children[0].children).toEqual([]);
    });

    test('normalizeHiddenRefs expands refs saved before a leaf had sub-sections', () => {
      const tree = buildCustomizeTree(subsSchema, TITLE);
      const refs = normalizeHiddenRefs(tree, [ON_WAKING, ref("Weekdays, Tallit"), "stale"]);
      expect(refs).toContain(`${ON_WAKING} 8-12`);
      expect(refs).toContain(ref("Weekdays, Tallit"));
      expect(refs).not.toContain(ON_WAKING);
      expect(refs).not.toContain("stale");
    });

    test('resolveHidden: partial hides become paragraph ranges', () => {
      const r = resolveHidden(TITLE, [`${ON_WAKING} 8-12`, ref("Weekdays, Tallit")]);
      expect(r.leafRefs).toEqual([ref("Weekdays, Tallit")]);
      expect(r.segments).toEqual({[ON_WAKING]: [{from: 8, to: 12, en: "Tzitzit", he: "לבישת ציצית"}]});
    });

    test('resolveHidden: a parent with every child hidden hides its whole range', () => {
      const tree = buildCustomizeTree(subsSchema, TITLE);
      const amida = tree[0].children[2].children.find(n => n.en === "The Amida");
      const r = resolveHidden(TITLE, [...amida.children.map(n => n.ref), `${MINHA} 1-3`]);
      expect(r.segments[MINHA].map(r => [r.from, r.to, r.en])).toEqual([[1, 3, "Ashrei"], [9, 93, "The Amida"]]);
    });

    test('resolveHidden: all sub-sections hidden hides the whole leaf', () => {
      const tree = buildCustomizeTree(subsSchema, TITLE);
      const r = resolveHidden(TITLE, flattenLeaves([tree[0].children[0]]).map(n => n.ref));
      expect(r.leafRefs).toEqual([ON_WAKING]);
      expect(r.segments).toEqual({});
      expect(resolveHidden(TITLE, [ON_WAKING]).leafRefs).toEqual([ON_WAKING]);
    });

    test('hiddenSegmentsFor matches the section ref of a leaf', () => {
      const segments = {[ON_WAKING]: [[8, 12]]};
      expect(hiddenSegmentsFor(ON_WAKING, segments)).toEqual([[8, 12]]);
      expect(hiddenSegmentsFor(ref("Weekdays, Tallit"), segments)).toBe(null);
    });
  });

  describe('display options', () => {
    beforeEach(() => window.localStorage.clear());

    test('default to showing instructions and no notes, per title', () => {
      expect(getDisplayOptions(TITLE)).toEqual({showInstructions: true, showHints: false});
      const callback = jest.fn();
      subscribeCustomization(TITLE, callback);
      setDisplayOptions(TITLE, {showInstructions: false});
      expect(getDisplayOptions(TITLE)).toEqual({showInstructions: false, showHints: false});
      expect(getDisplayOptions("Other")).toEqual(DEFAULT_OPTIONS);
      expect(callback).toHaveBeenLastCalledWith([], {showInstructions: false, showHints: false});
      window.localStorage.setItem(OPTIONS_KEY, "nope");
      expect(getDisplayOptions(TITLE)).toEqual(DEFAULT_OPTIONS);
    });
  });

  describe('stripInstructions', () => {
    // Paragraphs as they appear in the Koren text.
    test.each([
      ['<i class="instruction">Wash hands and say the following blessings.</i><br><i class="instruction">Some have the custom to say “Wisdom begins” on page 10 at this point.</i>', ''],
      ['<i class="instruction">Leader:</i> יִתְגַּדַּל Magnified', ' יִתְגַּדַּל Magnified'],
      ['<small><i class="instruction">On Ḥanukka:</i><br>עַל הַנִּסִּים [We thank You]<br><i class="instruction">Continue with “For all these things.”</i></small>',
       '<small>עַל הַנִּסִּים [We thank You]</small>'],
      ['the holy God. /<i class="instruction">Between Rosh HaShana and Yom Kippur:</i> the holy King./', 'the holy God. / the holy King./'],
      ['מוֹדֶה I thank You', 'מוֹדֶה I thank You'],
      ['', ''],
    ])('%s', (html, expected) => expect(stripInstructions(html)).toBe(expected));

    test('instruction-only paragraphs come out blank', () => {
      expect(isBlankHtml(stripInstructions('<i class="instruction">Sit upright.</i>'))).toBe(true);
      expect(isBlankHtml(stripInstructions('<small><i class="instruction">I</i></small>'))).toBe(true);
      expect(isBlankHtml('<small>LORD</small>')).toBe(false);
    });
  });

  describe('notes for hidden sections', () => {
    test('hintGroups merges adjacent ranges into one note', () => {
      const groups = hintGroups([
        {from: 9, to: 93, en: "The Amida", he: "עמידה"},
        {from: 1, to: 3, en: "Ashrei", he: "אשרי"},
        {from: 4, to: 8, en: "Half Kaddish", he: "חצי קדיש"},
      ]);
      expect(groups.map(g => [g.from, g.to, g.names.map(n => n.en)])).toEqual([[1, 93, ["Ashrei", "Half Kaddish", "The Amida"]]]);
      expect(hintGroups([{from: 1, to: 3, en: "A"}, {from: 5, to: 6, en: "B"}])).toHaveLength(2);
    });

    test('hiddenRun lists the hidden leaves up to the next visible one', () => {
      const hidden = [ref("Weekdays, Tallit"), ref("Weekdays, Tefillin")];
      expect(hiddenRun(ref("Weekdays, Tallit"), "next", LEAVES, hidden)).toEqual(hidden);
      expect(hiddenRun(ref("Weekdays, Tefillin"), "prev", LEAVES, hidden)).toEqual(hidden);
      expect(hiddenRun(ref("Weekdays, Morning Blessings"), "next", LEAVES, hidden)).toEqual([]);
      expect(hiddenRun(null, "next", LEAVES, hidden)).toEqual([]);
    });

    test('namesFor names whole nodes where it can', () => {
      const tree = buildTree(SCHEMA, TITLE);
      const shabbat = LEAVES.filter(l => l.ref.startsWith(ref("Shabbat"))).map(l => l.ref);
      expect(namesFor(tree, [ref("Weekdays, Morning Blessings"), ...shabbat, ref("Festivals, Hoshanot")]).map(n => n.en))
        .toEqual(["Morning Blessings", "Shabbat", "Hoshanot"]);
      expect(namesFor(tree, [ref("Weekdays, Tallit")])).toEqual([{en: "Tallit", he: "he Tallit"}]);
    });
  });

  describe('rendering helpers', () => {
    const seg = (number, en, he = "") => ({number, en, he});
    const SEGMENTS = [
      seg(1, '<i class="instruction">Wash hands.</i>'),
      seg(2, 'Blessed are You', 'בָּרוּךְ'),
      seg(3, '<i class="instruction">Leader:</i> Magnified', 'יִתְגַּדַּל'),
      seg(4, 'TZITZIT'),
      seg(5, 'Blessed... tasseled garments'),
    ];

    test('visibleSegments drops hidden ranges and instruction-only paragraphs', () => {
      expect(visibleSegments(SEGMENTS, [{from: 4, to: 5}], false).map(s => s.number)).toEqual([1, 2, 3]);
      const noInstructions = visibleSegments(SEGMENTS, [], true);
      expect(noInstructions.map(s => s.number)).toEqual([2, 3, 4, 5]);
      expect(noInstructions[1].en).toBe(' Magnified');
      expect(SEGMENTS[2].en).toContain('Leader:');
    });

    test('interleaveHints places each note before the next visible paragraph', () => {
      const visible = visibleSegments(SEGMENTS, [{from: 1, to: 1}, {from: 4, to: 5}], false);
      const out = interleaveHints(visible, visible.map(s => s.number), hintGroups([{from: 1, to: 1, en: "A"}, {from: 4, to: 5, en: "B"}]), g => `hint ${g.names[0].en}`);
      expect(out).toEqual(["hint A", 2, 3, "hint B"]);
    });
  });
});
