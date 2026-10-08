/*
 * Mock submission of the public Powered by Sefaria form. Submissions are kept in the session
 * through api/developer-poc/powered-by-submissions; nothing reaches Salesforce or the
 * powered_by table.
 */

import { getCsrfToken } from '../sefaria/csrf';
import { POWERED_BY_LISTINGS } from '../developerPocStore';

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
