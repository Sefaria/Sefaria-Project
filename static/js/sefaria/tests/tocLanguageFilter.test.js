/* Testing done using Jest */
import Sefaria from '../sefaria';
import {
  categoryPathKey,
  computeCategoryMatches,
  buildMatchData,
  getFilterLanguageOptions,
  getTocLanguageFilterSnapshot,
  setTocLanguageFilter,
  subscribeTocLanguageFilter,
  _resetTocLanguageFilterForTests,
} from '../tocLanguageFilter';

const toc = [
  {category: "Tanakh", contents: [
    {category: "Torah", contents: [
      {title: "Genesis", categories: ["Tanakh", "Torah"]},
      {title: "Exodus", categories: ["Tanakh", "Torah"]},
    ]},
    {category: "Prophets", contents: [
      {title: "Joshua", categories: ["Tanakh", "Prophets"]},
    ]},
    {category: "Writings", contents: [
      {title: "Hidden Book", hidden: true},
    ]},
    {category: "Rishonim on Tanakh", contents: [
      {category: "Rashi", contents: [
        {title: "Rashi on Exodus"},
      ]},
    ]},
  ]},
  {category: "Talmud", contents: [
    {category: "Bavli", contents: [{title: "Berakhot"}]},
  ]},
  {category: "Collections", contents: [{isCollection: true, title: "Some Collection", slug: "c"}]},
];

describe('tocLanguageFilter pure helpers', () => {
  test('categoryPathKey joins the category path', () => {
    expect(categoryPathKey(["Tanakh", "Torah"])).toBe("Tanakh|Torah");
    expect(categoryPathKey(undefined)).toBe("");
  });

  test('a category matches when any book anywhere below it matches', () => {
    const m = computeCategoryMatches(toc, new Set(["Rashi on Exodus"]));
    expect(m.get("Tanakh")).toBe(true);
    expect(m.get("Tanakh|Rishonim on Tanakh")).toBe(true);
    expect(m.get("Tanakh|Rishonim on Tanakh|Rashi")).toBe(true);
    expect(m.get("Tanakh|Torah")).toBe(false);
    expect(m.get("Tanakh|Prophets")).toBe(false);
    expect(m.get("Talmud")).toBe(false);
    expect(m.get("Talmud|Bavli")).toBe(false);
  });

  test('hidden books and collections never count as a match', () => {
    const m = computeCategoryMatches(toc, new Set(["Hidden Book", "Some Collection"]));
    expect(m.get("Tanakh|Writings")).toBe(false);
    expect(m.get("Collections")).toBe(false);
    expect(m.get("Tanakh")).toBe(false);
  });

  test('buildMatchData exposes a title set and category matches', () => {
    const d = buildMatchData("fr", ["Genesis", "Berakhot"], toc);
    expect(d.lang).toBe("fr");
    expect(d.titles.has("Genesis")).toBe(true);
    expect(d.titles.has("Exodus")).toBe(false);
    expect(d.catMatches.get("Tanakh|Torah")).toBe(true);
    expect(d.catMatches.get("Tanakh|Prophets")).toBe(false);
    expect(d.catMatches.get("Talmud|Bavli")).toBe(true);
  });

  test('language options are exactly the Translations widget languages', () => {
    const expected = Object.keys(Sefaria.ISOMap).filter(k => Sefaria.ISOMap[k].showTranslations);
    expect(getFilterLanguageOptions()).toEqual(expected);
    expect(getFilterLanguageOptions()).not.toContain("he");
  });
});

describe('tocLanguageFilter store', () => {
  let apiSpy;
  beforeEach(() => {
    _resetTocLanguageFilterForTests();
    window.localStorage.clear();
    Sefaria.toc = toc;
    // Mimic the jQuery deferred _ApiPromise really returns: a thenable with no .catch
    apiSpy = jest.spyOn(Sefaria, '_ApiPromise').mockImplementation(() => {
      const p = Promise.resolve({titles: ["Genesis"]});
      return {then(onOk, onErr) { p.then(onOk, onErr); return {}; }};
    });
  });
  afterEach(() => apiSpy.mockRestore());

  test('setting a language persists it, notifies, and loads match data', async () => {
    const listener = jest.fn();
    subscribeTocLanguageFilter(listener);
    setTocLanguageFilter("fr");
    expect(getTocLanguageFilterSnapshot().lang).toBe("fr");
    expect(window.localStorage.getItem("sefaria.tocLanguageFilter")).toBe("fr");
    await new Promise(r => setTimeout(r, 0));
    const snap = getTocLanguageFilterSnapshot();
    expect(snap.data.catMatches.get("Tanakh|Torah")).toBe(true);
    expect(snap.data.catMatches.get("Talmud")).toBe(false);
    expect(listener).toHaveBeenCalled();
    expect(apiSpy.mock.calls[0][0]).toContain("/api/texts/translation-titles/fr");
  });

  test('clearing or setting an unknown language removes the filter', () => {
    setTocLanguageFilter("fr");
    setTocLanguageFilter("xx");
    expect(getTocLanguageFilterSnapshot().lang).toBe(null);
    expect(window.localStorage.getItem("sefaria.tocLanguageFilter")).toBe(null);
  });
});
