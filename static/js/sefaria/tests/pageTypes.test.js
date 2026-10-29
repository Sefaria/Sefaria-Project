/* Testing done using Jest */
import {
  PAGE_TYPE,
  normalizePageType,
  classifyPanel,
  classifyPanels,
  topicPageTypeOf,
  adMatchesPageTypes,
} from "../pageTypes";

// Every function here is pure — panel state in, string out — so these tests need no React, no
// Strapi payloads, and no mocks. They are the single source of truth for the classification
// rules; the Playwright suite proves the same rules end-to-end through real pages.

describe("classifyPanel", function () {
  it("returns homepage for the navigation menu with no categories", function () {
    expect(classifyPanel({ menuOpen: "navigation", navigationCategories: [] })).toBe(PAGE_TYPE.HOMEPAGE);
  });

  it("returns category_toc for the navigation menu with categories", function () {
    // Includes collection TOCs like Covenant and Conversation — a deliberate fold, since the
    // client cannot structurally distinguish a collective work's Category from a canon Category.
    expect(classifyPanel({ menuOpen: "navigation", navigationCategories: ["Tanakh", "Torah"] })).toBe(
      PAGE_TYPE.CATEGORY_TOC,
    );
  });

  it.each([
    ["book toc"],
    ["extended notes"],
  ])("returns book_toc for the %s menu", function (menuOpen) {
    expect(classifyPanel({ menuOpen })).toBe(PAGE_TYPE.BOOK_TOC);
  });

  it("returns topic_category_toc when a topic category is open", function () {
    expect(classifyPanel({ menuOpen: "topics", navigationTopicCategory: "torah-portions" })).toBe(
      PAGE_TYPE.TOPIC_CATEGORY_TOC,
    );
  });

  it("returns null for a topic panel with a specific topic — TopicPage's override is authoritative", function () {
    // Author-vs-topic is only knowable from fetched topic data; guessing topic_page here would
    // flash an ad that stops matching when the data upgrades the answer to author_page.
    expect(classifyPanel({ menuOpen: "topics", navigationTopic: "jonathan-sacks" })).toBeNull();
  });

  it("returns topics_landing for the topics menu with neither topic nor category", function () {
    expect(classifyPanel({ menuOpen: "topics" })).toBe(PAGE_TYPE.TOPICS_LANDING);
  });

  it.each([
    ["allTopics", PAGE_TYPE.ALL_TOPICS],
    ["calendars", PAGE_TYPE.CALENDARS],
    ["translationsPage", PAGE_TYPE.TRANSLATIONS],
    ["collection", PAGE_TYPE.COLLECTION_PAGE],
    ["collectionsPublic", PAGE_TYPE.PUBLIC_COLLECTIONS],
    ["saved", PAGE_TYPE.USER_LIBRARY],
    ["history", PAGE_TYPE.USER_LIBRARY],
    ["notes", PAGE_TYPE.USER_LIBRARY],
    ["notifications", PAGE_TYPE.NOTIFICATIONS],
    ["voices", PAGE_TYPE.VOICES_HOME],
  ])("maps the %s menu to %s", function (menuOpen, expected) {
    expect(classifyPanel({ menuOpen })).toBe(expected);
  });

  it("returns null for a reader-mode panel with no menu open", function () {
    expect(classifyPanel({ mode: "Text", currentlyVisibleRef: "Genesis 1" })).toBeNull();
  });

  it.each([["search"], ["profile"], ["modtools"]])(
    "returns null for the %s menu (no ad surface)",
    function (menuOpen) {
      expect(classifyPanel({ menuOpen })).toBeNull();
    },
  );

  it("returns null for a missing panel", function () {
    expect(classifyPanel(undefined)).toBeNull();
  });
});

describe("classifyPanels", function () {
  it("dedupes types and drops unclassifiable panels", function () {
    const panels = [
      { menuOpen: "book toc" },
      { menuOpen: "extended notes" }, // same type as above — deduped
      { mode: "Text" }, // unclassifiable — dropped
      { menuOpen: "calendars" },
    ];
    expect(classifyPanels(panels)).toEqual([PAGE_TYPE.BOOK_TOC, PAGE_TYPE.CALENDARS]);
  });

  it("returns an empty array for missing panels", function () {
    expect(classifyPanels(undefined)).toEqual([]);
  });
});

describe("topicPageTypeOf", function () {
  it("returns portal_page for a topic with a portal_slug", function () {
    expect(topicPageTypeOf({ portal_slug: "sacks" })).toBe(PAGE_TYPE.PORTAL_PAGE);
  });

  it("returns portal_page, not author_page, when a portal topic is also an author — portal is exclusive", function () {
    // jonathan-sacks is both (subclass "author" AND portal_slug "sacks"). An author-targeted ad
    // must never land on a sponsor-branded portal page; editors target portals deliberately.
    expect(topicPageTypeOf({ portal_slug: "sacks", subclass: "author" })).toBe(PAGE_TYPE.PORTAL_PAGE);
  });

  it("returns author_page for subclass author", function () {
    // subclass is the authoritative signal, NOT indexes.length: an author with no cataloged
    // works (jonathan-sacks on a stock local DB: subclass "author", zero indexes) is still an
    // author page.
    expect(topicPageTypeOf({ subclass: "author", indexes: [] })).toBe(PAGE_TYPE.AUTHOR_PAGE);
  });

  it("returns topic_page for a non-author topic", function () {
    expect(topicPageTypeOf({ slug: "shabbat" })).toBe(PAGE_TYPE.TOPIC_PAGE);
  });

  it("returns topic_page for missing topic data rather than throwing", function () {
    expect(topicPageTypeOf(undefined)).toBe(PAGE_TYPE.TOPIC_PAGE);
  });
});

describe("normalizePageType", function () {
  it.each([[null], [undefined], [""]])("maps %s to all_pages", function (raw) {
    expect(normalizePageType(raw)).toBe(PAGE_TYPE.ALL_PAGES);
  });

  it("passes an unknown value through unchanged so it fails closed in matching", function () {
    // Normalizing unknowns to all_pages would turn a CMS typo into a site-wide campaign; passing
    // them through means the typo'd ad shows nowhere and gets noticed.
    expect(normalizePageType("hompage")).toBe("hompage");
  });

  it("passes every known value through unchanged", function () {
    Object.values(PAGE_TYPE).forEach((value) => expect(normalizePageType(value)).toBe(value));
  });
});

describe("adMatchesPageTypes", function () {
  it("passes all_pages ads regardless of active page types", function () {
    expect(adMatchesPageTypes(PAGE_TYPE.ALL_PAGES, [])).toBe(true);
    expect(adMatchesPageTypes(PAGE_TYPE.ALL_PAGES, [PAGE_TYPE.HOMEPAGE])).toBe(true);
    expect(adMatchesPageTypes(PAGE_TYPE.ALL_PAGES, undefined)).toBe(true);
  });

  it("passes a specific type only when it is among the active types", function () {
    expect(adMatchesPageTypes(PAGE_TYPE.BOOK_TOC, [PAGE_TYPE.BOOK_TOC, PAGE_TYPE.CALENDARS])).toBe(true);
    expect(adMatchesPageTypes(PAGE_TYPE.BOOK_TOC, [PAGE_TYPE.CATEGORY_TOC])).toBe(false);
    expect(adMatchesPageTypes(PAGE_TYPE.BOOK_TOC, [])).toBe(false);
  });

  it("never passes an unknown page type value", function () {
    // The fail-closed half of normalizePageType's pass-through: an unknown string can never be
    // produced by classifyPanel, so it can never be in the active set.
    expect(adMatchesPageTypes("hompage", Object.values(PAGE_TYPE))).toBe(false);
  });
});
