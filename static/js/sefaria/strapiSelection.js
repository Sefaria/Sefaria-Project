// Shared eligibility + ranking for Strapi banners and modals.
//
// Two different moments need the SAME answer to "may this viewer see this document?":
//   1. SELECTION (context.js) — the fetched list is narrowed to the single banner/modal this
//      viewer should get. Every gate must run here, otherwise a document the viewer can't see
//      (wrong language, wrong country, already dismissed...) wins the spot and the one written
//      for them is thrown away. That was bug sc-45891.
//   2. DISPLAY (Misc.jsx shouldShow) — re-checked at each mount before the reveal timer is
//      armed (never for an already-visible surface). The dismissal gate is what makes a
//      dismissal survive remounts: the dismissed document stays selected for the whole page
//      view, and the component's local "interacted" state resets on every navigation. It also
//      picks up cross-tab dismissals on the next remount — not live — and date windows that
//      expired while the tab stayed open, plus the render-only page guard (see isPathExcluded).
//
// Everything here except buildViewerContext is a pure function: the viewer's situation comes in
// as a plain `ctx` object, never read from globals. That keeps the logic unit-testable with no
// Sefaria or browser mocks.
//
// Documents are expected in the buildInterfaceTextDoc shape (strapiLocalization.js): localized
// fields as {en, he} objects, shared fields flat, plus a `locales` array of published locales.

import Sefaria from "./sefaria";
import { matchesCountryTarget, CountryMode } from "./strapiTargeting";
import { getViewerCountryCandidates } from "./countryCandidates";
import { INTERFACE_LANG_TO_LOCALE } from "./strapiLocalization";

// Enum for the two content types this module can judge. Symbols instead of the strings "modal"/
// "banner" so a typo fails loudly: CONTENT_FIELDS[ContentType.MODAL] always works, while a
// misspelled symbol name is a ReferenceError and a stray string key just returns undefined and
// is caught by the isEligible guard below.
const ContentType = Object.freeze({
  MODAL: Symbol("modal"),
  BANNER: Symbol("banner"),
});

// The values Strapi's `showTo` field can hold. These MUST stay strings (they compare against CMS
// data), so they live in a frozen map — same pattern as CountryMode in strapiTargeting.js.
const ShowTo = Object.freeze({
  LOGGED_IN_ONLY: "logged_in_only",
  LOGGED_OUT_ONLY: "logged_out_only",
  EVERYONE: "both_logged_in_and_logged_out",
});

// Modals and banners spell the same concepts with different field names. Everything downstream
// reads the names from here so no function needs to know which surface it is working on.
// `storagePrefix` keys the localStorage dismissal entries ("modal_<name>": "true").
const CONTENT_FIELDS = Object.freeze({
  [ContentType.MODAL]: {
    start: "modalStartDate",
    end: "modalEndDate",
    name: "internalModalName",
    storagePrefix: "modal_",
  },
  [ContentType.BANNER]: {
    start: "bannerStartDate",
    end: "bannerEndDate",
    name: "internalBannerName",
    storagePrefix: "banner_",
  },
});

// The dismissal key a document writes when the viewer closes it, e.g. "modal_shavuot-2026".
const dismissalKey = (doc, fields) => fields.storagePrefix + doc[fields.name];

// The four "user kind" checkboxes an editor can tick when showTo is EVERYONE.
const userKindFlags = (doc) => [
  doc.showToReturningVisitors,
  doc.showToNewVisitors,
  doc.showToSustainers,
  doc.showToNonSustainers,
];

// ── Eligibility predicates ──────────────────────────────────────────────────
// Each answers one question with the same signature (doc, ctx, fields) => boolean, so
// isEligible can run them as a uniform list. `fields` is the CONTENT_FIELDS entry.

// Is the document inside its scheduled date window right now?
const isDateActive = (doc, ctx, fields) =>
  ctx.now >= new Date(doc[fields.start]) &&
  ctx.now <= new Date(doc[fields.end]);

// Did the editor publish a version in the viewer's interface language?
const isPublishedInLocale = (doc, ctx) => doc.locales.includes(ctx.locale);

// Country targeting is localized (an editor can target each locale separately), so read the
// active locale's entry. No targeting set means "everyone" — matchesCountryTarget handles null.
const matchesCountry = (doc, ctx) =>
  matchesCountryTarget(
    doc.countriesToTarget?.[ctx.locale],
    ctx.countryCandidates,
  );

// The editor's audience choice: logged-in only, logged-out only, or everyone — where "everyone"
// can be narrowed further by the user-kind checkboxes (sustainer / new visitor / etc.).
const matchesAudience = (doc, ctx) => {
  switch (doc.showTo) {
    case ShowTo.LOGGED_IN_ONLY:
      return ctx.isLoggedIn;
    case ShowTo.LOGGED_OUT_ONLY:
      return !ctx.isLoggedIn;
    case ShowTo.EVERYONE: {
      // No boxes ticked means the editor put no restriction on user kind — show to all.
      if (!userKindFlags(doc).some(Boolean)) return true;
      const matchesAccountKind =
        ctx.isLoggedIn &&
        ((ctx.isSustainer && doc.showToSustainers) ||
          (!ctx.isSustainer && doc.showToNonSustainers));
      const matchesVisitKind =
        (ctx.isReturningVisitor && doc.showToReturningVisitors) ||
        (ctx.isNewVisitor && doc.showToNewVisitors);
      return matchesAccountKind || matchesVisitKind;
    }
    default:
      // An unrecognized showTo value matches nobody — safer to show nothing than to guess.
      return false;
  }
};

// A dismissed document stays ineligible while it is live, so selection falls through to the
// runner-up on the next page load instead of leaving the surface empty.
const isNotDismissed = (doc, ctx, fields) =>
  !ctx.hasDismissed(dismissalKey(doc, fields));

const ELIGIBILITY_PREDICATES = [
  isDateActive,
  isPublishedInLocale,
  matchesCountry,
  matchesAudience,
  isNotDismissed,
];

// May this viewer be shown this document at all? Used by BOTH stages: selection filters the
// whole list with it, and shouldShow re-checks the single chosen document before rendering.
const isEligible = (doc, ctx, contentType) => {
  const fields = CONTENT_FIELDS[contentType];
  if (!fields) {
    throw new Error(
      "Unknown content type - pass ContentType.MODAL or ContentType.BANNER",
    );
  }
  return ELIGIBILITY_PREDICATES.every((predicate) =>
    predicate(doc, ctx, fields),
  );
};

// ── Ranking ─────────────────────────────────────────────────────────────────
// When several documents are eligible for the same viewer, the winner is chosen by ONE value
// system with two principles, applied in that order (a later tier only matters when every
// earlier one ties):
//
//   SPECIFICITY OF INTENT (tiers 1-3) — how narrowly the editor aimed this document at this
//   viewer: named their country, restricted the audience, published only their language. A
//   campaign written FOR someone beats a catch-all. Specificity always outranks urgency —
//   ratified deliberately (2026-08-13) for both collisions: "country beats urgency" (tier 1
//   over 4) and "exclusivity beats urgency" (tier 3 over 4), each pinned by its own tests.
//
//   URGENCY (tiers 4-5) — how scarce the remaining chance to show the document is: a shorter
//   window is scarcer than a longer one, and among equal-length windows the one that started
//   earlier ends earlier, so it is scarcer still. Tier 5 is tier 4's principle at finer
//   granularity, NOT a new value — for equal lengths, earlier start IS earlier end.
//
// Payload order (tier 6) is only reachable when documents agree under both principles.

// 1 when the document names the viewer's country on an include list, 0 otherwise. Only ranked
// among ELIGIBLE documents, so include-mode here always means "and the viewer is on the list".
const countrySpecificity = (doc, ctx) =>
  doc.countriesToTarget?.[ctx.locale]?.countryMode === CountryMode.INCLUDE
    ? 1
    : 0;

// 1 when the editor restricted the audience: a logged-in/out-only choice, or SOME user-kind
// boxes ticked but not all — ticking every box is the same as no restriction.
const audienceSpecificity = (doc) => {
  if (doc.showTo !== ShowTo.EVERYONE) return 1;
  const flags = userKindFlags(doc);
  return flags.some(Boolean) && !flags.every(Boolean) ? 1 : 0;
};

// 1 when the document exists only in the viewer's language, 0 when it is bilingual.
const localeSpecificity = (doc) => (doc.locales.length === 1 ? 1 : 0);

// How long the document runs for, in milliseconds. A one-day special is more deliberately
// scheduled than a month-long campaign, so SHORTER ranks higher.
const windowMillis = (doc, fields) =>
  new Date(doc[fields.end]) - new Date(doc[fields.start]);

// When the document's window opened, in milliseconds since the epoch. Tie-break for
// SAME-LENGTH overlapping windows: they expire in start order, so the earlier one leaves the
// stage first — the viewer will still get to see the later one after it ends, which makes the
// earlier one the more urgent of the two right now. EARLIER ranks higher. This is windowMillis's
// urgency principle at finer granularity (see the Ranking header), not a competing rule.
const startMillis = (doc, fields) => new Date(doc[fields.start]).getTime();

// The document's rank as a comparable array, best = smallest. The specificity scores are
// negated because sortBy sorts ascending: a score of 1 becomes -1, which sorts before 0.
// windowMillis and startMillis are NOT negated — smaller (shorter, earlier) already sorts
// first. Array order (Strapi's return order) breaks any remaining tie, because sortBy is stable.
const specificityKey = (doc, ctx, fields) => [
  -countrySpecificity(doc, ctx),
  -audienceSpecificity(doc),
  -localeSpecificity(doc),
  windowMillis(doc, fields),
  startMillis(doc, fields),
];

// compareArrays([0, 5], [0, 9]) -> negative (first sorts before second). Element by element,
// like Ruby's Array#<=>.
const compareArrays = (a, b) => {
  const firstDifference = a.findIndex((value, i) => value !== b[i]);
  return firstDifference === -1 ? 0 : a[firstDifference] - b[firstDifference];
};

// sortBy([{n: 2}, {n: 1}], x => [x.n]) -> [{n: 1}, {n: 2}]. Lodash-style: sorts by a computed
// key without mutating the input. The explicit original-index tiebreak makes the stability
// (equal keys keep their order) visible rather than relying on the reader knowing sort() is stable.
const sortBy = (list, keyFn) =>
  list
    .map((item, index) => ({ item, key: keyFn(item), index }))
    .sort((a, b) => compareArrays(a.key, b.key) || a.index - b.index)
    .map(({ item }) => item);

// ── Selection ───────────────────────────────────────────────────────────────

// The one document this viewer should see: drop everything they may not see, then take the most
// specific of what remains. Returns null when nothing fits — the surface simply stays empty.
const selectContent = (docs, ctx, contentType) => {
  const fields = CONTENT_FIELDS[contentType];
  const eligible = docs.filter((doc) => isEligible(doc, ctx, contentType));
  return sortBy(eligible, (doc) => specificityKey(doc, ctx, fields))[0] ?? null;
};

// ── Render-only guard ───────────────────────────────────────────────────────
// Deliberately NOT part of eligibility: it depends on which page the viewer happens to be on.
// Selection stays page-independent — if the best-fit document is excluded on the current page,
// nothing shows there, rather than promoting a rival campaign on the page this one links to.

const ALWAYS_EXCLUDED_PATHS = ["/donate", "/mobile", "/app", "/ways-to-give"];

// Does this page refuse the document? True on the fixed list above and on the page the
// document's own button leads to — no point advertising the page someone is already reading.
const isPathExcluded = (doc, pathname) => {
  const buttonPathnames = Object.values(doc.buttonURL || {})
    .filter(Boolean)
    .map((url) => new URL(url).pathname);
  return [...ALWAYS_EXCLUDED_PATHS, ...buttonPathnames].includes(pathname);
};

// ── Viewer context ──────────────────────────────────────────────────────────

// The one impure function here: gathers everything the predicates need to know about the viewer
// from the Sefaria globals and the browser, into the plain object the pure functions take.
const buildViewerContext = () => ({
  now: new Date(),
  locale: INTERFACE_LANG_TO_LOCALE[Sefaria.interfaceLang],
  countryCandidates: getViewerCountryCandidates(),
  isLoggedIn: Boolean(Sefaria._uid),
  isSustainer: Boolean(Sefaria.is_sustainer),
  isReturningVisitor: Sefaria.isReturningVisitor(),
  isNewVisitor: Sefaria.isNewVisitor(),
  // Dismissal keys are written as the string "true"; JSON.parse turns absent (null) into null.
  hasDismissed: (storageKey) =>
    Boolean(JSON.parse(localStorage.getItem(storageKey))),
});

export {
  ContentType,
  ShowTo,
  CONTENT_FIELDS,
  isEligible,
  selectContent,
  specificityKey,
  sortBy,
  isPathExcluded,
  buildViewerContext,
};
