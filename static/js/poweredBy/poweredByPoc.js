/*
 * Mock submission of the public Powered by Sefaria form. Submissions are kept in the session
 * through api/developer-poc/powered-by-submissions; nothing reaches Salesforce or the
 * powered_by table.
 */

import { getCsrfToken } from '../sefaria/csrf';

/* Stand-ins for Powered by Sefaria listings. Name, link and description are public; the
   submitter email and owner are private and never shown, only compared. */
export const POWERED_BY_LISTINGS = [
  {id: "pb01", name: "Daf Yomi Companion", url: "dafyomicompanion.org",
    description: "Today's daf with Steinsaltz, Rashi and a daily review quiz.",
    submitterEmail: "editor@dafyomicompanion.org", ownedByAnotherAccount: false},
  {id: "pb02", name: "Parsha Sheets for Educators", url: "parshasheets.org",
    description: "Printable weekly source sheets for day-school classrooms.",
    submitterEmail: "", ownedByAnotherAccount: false},
  {id: "pb03", name: "Mishnah Yomit Tracker", url: "mishnahtracker.app",
    description: "Track your daily two mishnayot and share progress with a study group.",
    submitterEmail: "hello@mishnahtracker.app", ownedByAnotherAccount: false},
  {id: "pb04", name: "Tehillim Circle", url: "tehillimcircle.org",
    description: "Split the book of Psalms among a group, with the text in Hebrew and English.",
    submitterEmail: "", ownedByAnotherAccount: false},
  {id: "pb05", name: "Chavruta Match", url: "chavrutamatch.com",
    description: "Find a study partner and a text to learn together.",
    submitterEmail: "team@chavrutamatch.com", ownedByAnotherAccount: true},
  {id: "pb06", name: "Siddur Builder", url: "siddurbuilder.net",
    description: "Assemble a custom prayer booklet for a simcha or a minyan.",
    submitterEmail: "", ownedByAnotherAccount: false},
  {id: "pb07", name: "Rambam Daily Audio", url: "rambamdaily.fm",
    description: "A daily Mishneh Torah podcast with the day's text alongside.",
    submitterEmail: "shiur@rambamdaily.fm", ownedByAnotherAccount: false},
  {id: "pb08", name: "Talmud Map", url: "talmudmap.org",
    description: "An interactive map of the places named in the Talmud.",
    submitterEmail: "maps@talmudmap.org", ownedByAnotherAccount: true},
  {id: "pb09", name: "Midrash Explorer", url: "midrashexplorer.org",
    description: "Browse midrashim by verse, theme and character.",
    submitterEmail: "", ownedByAnotherAccount: false},
  {id: "pb10", name: "My Bar Mitzvah Parsha", url: "mybarmitzvahparsha.com",
    description: "Find your Torah portion by birth date and read it with trope.",
    submitterEmail: "", ownedByAnotherAccount: false},
  {id: "pb11", name: "Shnayim Mikra Reader", url: "shnayimmikra.app",
    description: "The weekly portion twice in Hebrew and once in Onkelos, verse by verse.",
    submitterEmail: "dev@shnayimmikra.app", ownedByAnotherAccount: false},
  {id: "pb12", name: "Halacha Quiz for Kids", url: "halachaquiz.org",
    description: "Short daily questions on everyday Jewish law for children.",
    submitterEmail: "", ownedByAnotherAccount: false},
  {id: "pb13", name: "Luach Widgets", url: "luachwidgets.dev",
    description: "Embeddable Hebrew calendar and daily learning widgets for synagogue websites.",
    submitterEmail: "widgets@luachwidgets.dev", ownedByAnotherAccount: false},
  {id: "pb14", name: "Jewish Text Graph", url: "jewishtextgraph.io",
    description: "A visual network of how texts cite one another.",
    submitterEmail: "", ownedByAnotherAccount: false},
];

export const POWERED_BY_SUBMISSIONS_URL = "/api/developer-poc/powered-by-submissions";

/* Listings staff have not published, besides any POWERED_BY_LISTINGS entry marked
   published: false. The form accepts a match quietly and never shows that these exist. */
export const UNPUBLISHED_POWERED_BY_LISTINGS = [
  {name: "Gematria Playground", url: "https://gematriaplayground.dev"},
  {name: "Yiddish Reader", url: "https://www.yiddishreader.org/"},
];

/* A link as stored: trimmed, with https:// added when no scheme was typed. */
export const normalizeLink = (link) => {
  const trimmed = String(link || "").trim();
  if (!trimmed) { return ""; }
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed.replace(/^\/+/, "");
};

/* The form of a link used to compare two links: no scheme, no www., no trailing slash,
   lower-case host. */
export const linkKey = (link) => {
  const stripped = String(link || "").trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^www\./i, "");
  const slash = stripped.indexOf("/");
  const host = (slash === -1 ? stripped : stripped.slice(0, slash)).toLowerCase();
  const path = slash === -1 ? "" : stripped.slice(slash);
  return (host + path).replace(/\/+$/, "");
};

/* {status: "published" | "unpublished" | "none", listing} for a submitted link. */
export const findListingMatch = (link, {
  listings = POWERED_BY_LISTINGS, unpublished = UNPUBLISHED_POWERED_BY_LISTINGS,
} = {}) => {
  const key = linkKey(link);
  if (!key) { return {status: "none", listing: null}; }
  const matches = (l) => linkKey(l.url) === key;
  const publishedMatch = listings.find(l => l.published !== false && matches(l));
  if (publishedMatch) { return {status: "published", listing: publishedMatch}; }
  const unpublishedMatch = listings.find(l => l.published === false && matches(l)) || unpublished.find(matches);
  if (unpublishedMatch) { return {status: "unpublished", listing: unpublishedMatch}; }
  return {status: "none", listing: null};
};

/* The record saved for one submission. `kind` is "new" or "update" (an update request for a
   published listing). `likelyDuplicateOf` is for staff only. */
export const buildSubmission = (answers, {kind = "new", match = {status: "none"}} = {}) => ({
  id: Math.random().toString(36).slice(2, 10),
  submittedAt: new Date().toISOString(),
  kind,
  updateFor: kind === "update" && match.listing ? {name: match.listing.name, url: match.listing.url} : null,
  likelyDuplicateOf: match.status === "unpublished" ? match.listing.url : null,
  answers: {
    ...answers,
    projectLink: normalizeLink(answers.projectLink),
    sourceCodeLink: normalizeLink(answers.sourceCodeLink),
  },
});

export const saveSubmission = (submission) => {
  if (typeof window === "undefined") { return Promise.resolve(submission); }
  return fetch(POWERED_BY_SUBMISSIONS_URL, {
    method: "POST",
    mode: "same-origin",
    credentials: "same-origin",
    headers: {"Content-Type": "application/json", "X-CSRFToken": getCsrfToken()},
    body: JSON.stringify(submission),
  }).then(response => {
    if (!response.ok) { throw new Error("Could not save the submission"); }
    return submission;
  });
};
