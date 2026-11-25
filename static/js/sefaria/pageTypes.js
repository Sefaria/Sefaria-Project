// Page-type classification for sidebar-ad targeting.
//
// Sidebar ads have always been targeted by KEYWORDS — free-text tags derived from whatever refs,
// categories, or topics the open reader panels show (ReaderApp.getUserContext). Keywords answer
// "WHAT is the reader looking at" but not "what KIND of page are they on": a Talmud book TOC and
// the Talmud category browse page both emit the keyword "talmud", and nothing distinguished them.
// This module adds that second axis. An ad in Strapi may carry a single `pageType` string; an ad
// only renders when the current page's classified type matches (Promotions.getCurrentMatchingAds
// ANDs this gate with all the existing ones — keywords, language, dates, audience — which stay
// exactly as they were).
//
// The values are STRINGS, not Symbols, because they cross the wire: each one is an option of the
// Strapi enumeration field, chosen by a content editor. This frozen map is the single place the
// vocabulary is defined on the client; the Strapi content type must offer the same strings.

const PAGE_TYPE = Object.freeze({
  // Not a page: the wildcard an editor picks (and the default a missing/older document gets) to
  // mean "no page-type restriction" — the pre-feature behavior.
  ALL_PAGES: "all_pages",

  HOMEPAGE: "homepage",
  // Any /texts/<category-path> browse page. This DELIBERATELY includes "collection TOCs" like
  // /texts/.../Jonathan Sacks/Covenant and Conversation: a collective work's grouping node and a
  // broad canon category are both plain Category records — same Mongo model, same TOC node shape,
  // same React component — so the client cannot tell them apart (decision 2026-08-31: fold them
  // together; target a specific collection with pageType category_toc + a keyword, e.g.
  // "covenant and conversation").
  CATEGORY_TOC: "category_toc",
  BOOK_TOC: "book_toc",
  TOPIC_PAGE: "topic_page",
  // A topic page whose topic is an author (backend AuthorTopic, e.g. /topics/samson-raphael-hirsch).
  // Distinguished from TOPIC_PAGE because the audience differs: someone on an author page is
  // browsing a corpus/person, not a theme.
  AUTHOR_PAGE: "author_page",
  // A topic page with a `portal_slug` (e.g. /topics/jonathan-sacks -> the 'sacks' portal):
  // TopicPage swaps in the sponsor-branded PortalNavSideBar, making it its own kind of page.
  // Classification is EXCLUSIVE (decision 2026-09-01): a portal page is portal_page and nothing
  // else — Sacks is also an author, but an author_page-targeted ad must not land on a
  // sponsor-branded page; editors target portals deliberately or not at all.
  PORTAL_PAGE: "portal_page",
  TOPIC_CATEGORY_TOC: "topic_category_toc",
  TOPICS_LANDING: "topics_landing",
  ALL_TOPICS: "all_topics",
  CALENDARS: "calendars",
  TRANSLATIONS: "translations",
  COLLECTION_PAGE: "collection_page",
  PUBLIC_COLLECTIONS: "public_collections",
  USER_LIBRARY: "user_library",
  NOTIFICATIONS: "notifications",
  VOICES_HOME: "voices_home",
});

// Stable console prefix (SKIPPED_ROWS_LOG pattern) so vocabulary drift between the Strapi
// enumeration and this module is findable in a console or a test, instead of surfacing months
// later as "why did that campaign get zero impressions".
const UNKNOWN_PAGE_TYPE_LOG = "Unknown sidebar-ad pageType from Strapi (ad will match no page):";

const KNOWN_PAGE_TYPES = new Set(Object.values(PAGE_TYPE));

// Strapi value -> internal value.
//
// Absence (null/undefined/"") means the document predates the field, or came from a Strapi
// environment that doesn't have it yet — either way the ad must behave exactly as ads always did,
// i.e. unrestricted. An UNKNOWN string is passed through UNCHANGED, on purpose: it can never equal
// anything classifyPanel produces, so a typo'd or future value fails CLOSED (the ad shows nowhere)
// rather than leaking onto every page. Normalizing unknowns to all_pages would turn a typo in the
// CMS into a site-wide campaign. The warn keeps the failure VISIBLE while staying closed: without
// it, a renamed CMS option would be indistinguishable from "no campaign running".
const normalizePageType = (rawPageType) => {
  if (rawPageType && !KNOWN_PAGE_TYPES.has(rawPageType)) {
    console.warn(`${UNKNOWN_PAGE_TYPE_LOG} "${rawPageType}"`);
  }
  return rawPageType || PAGE_TYPE.ALL_PAGES;
};

// The menuOpen values that map 1:1 onto a page type, with no further discrimination needed.
// menuOpen names come from ReaderPanel.jsx's render branches; see classifyPanel for the values
// that need more than a lookup.
const MENU_TO_PAGE_TYPE = Object.freeze({
  "book toc": PAGE_TYPE.BOOK_TOC,
  // The same BookPage component repurposed for a book's editorial notes — still "about one book".
  "extended notes": PAGE_TYPE.BOOK_TOC,
  allTopics: PAGE_TYPE.ALL_TOPICS,
  calendars: PAGE_TYPE.CALENDARS,
  translationsPage: PAGE_TYPE.TRANSLATIONS,
  collection: PAGE_TYPE.COLLECTION_PAGE,
  collectionsPublic: PAGE_TYPE.PUBLIC_COLLECTIONS,
  // Three menus, one component (UserHistoryPanel), one audience: "the reader's own material".
  saved: PAGE_TYPE.USER_LIBRARY,
  history: PAGE_TYPE.USER_LIBRARY,
  notes: PAGE_TYPE.USER_LIBRARY,
  notifications: PAGE_TYPE.NOTIFICATIONS,
  voices: PAGE_TYPE.VOICES_HOME,
});

// One reader panel's state -> a PAGE_TYPE value, or null when the panel isn't classifiable.
//
// null is a real answer, not a failure. It covers:
//   - panels with no menu open (the text/sheet reader itself, connections) and menus with no ad
//     surface (search, profile, admin) — a page-type-restricted ad simply can't match there,
//     while all_pages ads are unaffected;
//   - a topic panel showing a SPECIFIC topic. Whether that topic is an author is only knowable
//     from fetched topic data, which lives in TopicPage's component state — this module runs off
//     panel state alone and must not guess, because a guess of topic_page that later upgrades to
//     author_page would flash an ad and then yank it. TopicPage resolves the question itself and
//     passes the answer to Promotions as the pageTypeOverride prop once its data has loaded
//     (topicPageTypeOf below); until then the panel is deliberately unclassified.
const classifyPanel = (panel) => {
  if (!panel?.menuOpen) return null;
  if (panel.menuOpen === "navigation") {
    return panel.navigationCategories?.length ? PAGE_TYPE.CATEGORY_TOC : PAGE_TYPE.HOMEPAGE;
  }
  if (panel.menuOpen === "topics") {
    if (panel.navigationTopicCategory) return PAGE_TYPE.TOPIC_CATEGORY_TOC;
    if (panel.navigationTopic) return null; // TopicPage's pageTypeOverride is authoritative — see above
    return PAGE_TYPE.TOPICS_LANDING;
  }
  return MENU_TO_PAGE_TYPE[panel.menuOpen] || null;
};

// All open panels -> the deduped set of page types in play, nulls dropped.
// A union, mirroring how keywordTargets already merges all panels: an ad targeting book_toc shows
// while a book TOC is open in ANY panel.
const classifyPanels = (panels) => [
  ...new Set((panels || []).map(classifyPanel).filter(Boolean)),
];

// Fetched topic data -> portal_page | author_page | topic_page.
//
// Portal wins first and EXCLUSIVELY: a portal topic is only ever portal_page (see the
// PORTAL_PAGE note above). After that, `subclass` — serialized by the backend for
// AuthorTopic/PersonTopic (sefaria/model/topic.py) — is the authoritative author signal. It
// deliberately does NOT fall back to `indexes.length` (the field TopicPage uses for its
// author-works tab): an author with no cataloged works — verified against a live API, e.g.
// jonathan-sacks on a stock local DB has subclass "author" and zero indexes — is still an
// author page.
const topicPageTypeOf = (topicData) => {
  if (topicData?.portal_slug) return PAGE_TYPE.PORTAL_PAGE;
  return topicData?.subclass === "author" ? PAGE_TYPE.AUTHOR_PAGE : PAGE_TYPE.TOPIC_PAGE;
};

// The matching gate Promotions ANDs in with the existing keyword/language/date/audience checks.
// all_pages passes everywhere (including pages that classify to null/[]); anything else must be
// among the active types — so an unknown value from Strapi, passed through by normalizePageType,
// matches nothing.
const adMatchesPageTypes = (adPageType, activePageTypes) =>
  adPageType === PAGE_TYPE.ALL_PAGES || (activePageTypes || []).includes(adPageType);

export {
  PAGE_TYPE,
  normalizePageType,
  classifyPanel,
  classifyPanels,
  topicPageTypeOf,
  adMatchesPageTypes,
};
