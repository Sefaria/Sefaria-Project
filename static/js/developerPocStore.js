/*
 * Mock state for the Developer settings proof of concept.
 *
 * Nothing here talks to the real API. Every project, key and usage number lives in one
 * blob saved per user through api/developer-poc/state, so product people can click
 * through the flow; the key values are random strings generated in the browser and
 * authorize nothing. The floating POC test controls reset this store and can override
 * the account's real SSO status.
 */

import { getCsrfToken } from './sefaria/csrf';

export const DEVELOPER_POC_STATE_URL = "/api/developer-poc/state";
export const DEVELOPER_POC_VERSION = 1;
export const MAX_KEYS_PER_PROJECT = 5;

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

export const MAX_DESCRIPTION_LENGTH = 150;

export const emptyState = () => ({
  version: DEVELOPER_POC_VERSION,
  developerEnabled: false,
  ssoOverride: null,   // null: use the account's real providers. true/false: pretend.
  emailVerified: false,       // confirmed through the emailed link
  confirmationSentAt: null,   // when a confirmation link was last "sent"
  confirmationToken: null,    // the token in that link
  failNextKey: false,
  submitterEmailListingId: null,   // the listing whose submitter email is the account email
  dismissedListingIds: [],         // listings the developer said aren't theirs
  profile: null,
  projects: [],
  expandedProjectId: null,
});

const randomId = () => Math.random().toString(36).slice(2, 10);

/* Key values in this POC are obviously fake, so nobody mistakes one for a credential.
   The prefix marks them as test values; the suffix is a joke from the beit midrash. */
export const TEST_KEY_SUFFIXES = [
  "daf_yomi_or_bust", "teiku_unresolved", "eilu_veilu_both_valid", "gematria_613",
  "hava_amina_only", "kal_vachomer", "gezeirah_shavah", "lo_bashamayim_hi",
  "rashi_says_see_here", "tosafot_disagrees", "mah_nishtana_this_key", "bava_kamma_79b",
  "shnayim_mikra_echad_key", "ein_mukdam_umeuchar", "bli_neder", "amud_bet_cliffhanger",
  "hadran_alach", "siyum_in_2711_daf", "chad_gadya_chad_key", "dayenu_enough_requests",
  "maaser_10_percent", "shmita_every_7th_call", "tikkun_leil_deploy", "lamed_vav_hidden",
  "pilpul_not_included", "shma_koleinu_200_ok", "yored_lesof_daati", "mesorah_v2",
  "mi_shebeirach_my_uptime", "sugya_still_loading", "machloket_leshem_shamayim",
  "omer_day_33",
];

export const makeKeyValue = () => (
  "sfr_test_" + TEST_KEY_SUFFIXES[Math.floor(Math.random() * TEST_KEY_SUFFIXES.length)]
);

const hashSeed = (seed) => {
  let h = 2166136261;
  const text = String(seed);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
};

/* A stable per-key daily series, so the usage chart looks the same on every render. */
export const usageSeries = (seed, total, days = 30) => {
  let h = hashSeed(seed);
  const weights = [];
  let sum = 0;
  for (let i = 0; i < days; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const weight = 0.25 + (h % 1000) / 1000;
    weights.push(weight);
    sum += weight;
  }
  return weights.map(w => Math.round((total || 0) * w / sum));
};

export const makeKey = (label) => ({
  id: randomId(),
  label,
  value: makeKeyValue(),
  created: new Date().toISOString(),
  lastUsed: null,
  requests30: 0,
  restrictToWebsite: false,
});

export const makeProject = (fields) => ({
  id: randomId(),
  name: "",
  description: "",
  visibility: null,
  organization: "",
  websiteUrl: "",
  aiAssisted: false,
  linkedListingId: null,       // the Powered by listing this project is
  consentWithdrawnAt: null,    // when a public project was made private
  usage: {requests30: 0, lastUsed: null},
  keys: [],
  ...fields,
});

export const sampleState = () => {
  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
  const project = makeProject({
    id: "sample01",
    name: "Daf Yomi Portal",
    description: "A daily page companion with commentary links.",
    visibility: "private",
    organization: "Daf Yomi Portal",
    websiteUrl: "https://dafyomiportal.org",
    aiAssisted: true,
    usage: {requests30: 18412, lastUsed: daysAgo(0)},
    keys: [
      {id: "key01", label: "Production", value: makeKeyValue(), created: daysAgo(40),
        lastUsed: daysAgo(0), requests30: 17980, restrictToWebsite: true},
      {id: "key02", label: "Local development", value: makeKeyValue(), created: daysAgo(12),
        lastUsed: daysAgo(1), requests30: 432, restrictToWebsite: false},
    ],
  });
  return {
    ...emptyState(),
    developerEnabled: true,
    ssoOverride: true,   // the sample scenario is an account that connected Google or Apple
    profile: {
      developerName: "Tova Levi",
      description: "Small learning tools for daily study.",
      additionalEmail: "",
      termsAccepted: true,
      developerNews: false,
      notADeveloper: false,
    },
    projects: [project],
    expandedProjectId: project.id,
  };
};

/* The emailed link. Opening it needs no login and works in any browser: the server records
   the token, and the settings page notices on its next read of the state. */
export const makeConfirmationToken = () => {
  let token = "";
  while (token.length < 16) { token += Math.random().toString(36).slice(2); }
  return token.slice(0, 16);
};
export const confirmationLink = (token) => "/settings/developer/confirm-email/" + token;

/* The confirmation page sets this, so a settings tab in the same browser checks at once
   rather than at its next poll. */
export const CONFIRMATION_SIGNAL_KEY = "sefariaDeveloperPocEmailConfirmed";

export const readState = () => fetch(DEVELOPER_POC_STATE_URL, {
  mode: "same-origin",
  credentials: "same-origin",
}).then(response => {
  if (!response.ok) { throw new Error("Could not read the POC state"); }
  return response.json();
});

/* The UI updates optimistically and the write is fire and forget; the returned promise
   rejects so the caller can show a notice. */
export const writeState = (state) => {
  if (typeof window === "undefined") { return Promise.resolve(state); }
  return fetch(DEVELOPER_POC_STATE_URL, {
    method: "POST",
    mode: "same-origin",
    credentials: "same-origin",
    headers: {"Content-Type": "application/json", "X-CSRFToken": getCsrfToken()},
    body: JSON.stringify(state),
  }).then(response => {
    if (!response.ok) { throw new Error("Could not save the POC state"); }
    return state;
  });
};

export const ssoConnected = (state, realProviders) => (
  state.ssoOverride === null ? (realProviders || []).length > 0 : !!state.ssoOverride
);

/* Developer settings need a verified email: Google or Apple sign-in verifies it, and so does
   the emailed confirmation link. */
export const accountVerified = (state, realProviders) => (
  ssoConnected(state, realProviders) || !!state.emailVerified
);

export const websiteHost = (url) => {
  if (!url) { return ""; }
  try {
    return new URL(/^https?:\/\//.test(url) ? url : "https://" + url).host;
  } catch (e) {
    return url;
  }
};

const WEBSITE_HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i;

/* A project website as typed: a bare domain gets https://, and anything that isn't an
   http(s) address on a dotted host name is invalid. Empty is valid: the field is optional. */
export const parseWebsite = (input) => {
  const raw = (input || "").trim();
  if (!raw) { return {valid: true, url: ""}; }
  if (/\s/.test(raw)) { return {valid: false, url: raw}; }
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw;
  try {
    const parsed = new URL(url);
    const valid = /^https?:$/.test(parsed.protocol) && WEBSITE_HOST.test(parsed.hostname);
    return {valid, url: valid ? url : raw};
  } catch (e) {
    return {valid: false, url: raw};
  }
};

/* The mock listings as this account sees them: the test panel can give one of them the
   account email as its submitter email, and a listing linked to one of this account's
   projects belongs to this account. */
export const poweredByListings = (state, email) => POWERED_BY_LISTINGS.map(listing => ({
  ...listing,
  submitterEmail: listing.id === state.submitterEmailListingId && email ? email : listing.submitterEmail,
  linkedProjectId: ((state.projects || []).find(p => p.linkedListingId === listing.id) || {}).id || null,
}));

const sameEmail = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/* An unowned listing submitted with the verified account email can be linked without staff. */
export const emailMatchedListing = (listings, email, verified) => (
  verified ? listings.find(l => !l.ownedByAnotherAccount && !l.linkedProjectId && sameEmail(l.submitterEmail, email)) || null : null
);

/* Only these listing fields are public, so only these can be compared on screen. */
export const publicListing = (listing) => (
  listing ? {id: listing.id, name: listing.name, url: listing.url, description: listing.description} : null
);

/* A public project made from a listing and linked to it, for a developer who said the
   listing is theirs. */
export const projectFromListing = (listing) => makeProject({
  name: listing.name,
  description: listing.description,
  websiteUrl: parseWebsite(listing.url).url,
  visibility: "public",
  linkedListingId: listing.id,
});

/* What a developer finds after answering staff outreach with "yes": the reply confirmed
   the email, and staff created the project from their listing. */
export const outreachState = (state, listingId) => {
  const listing = POWERED_BY_LISTINGS.find(l => l.id === listingId);
  const alreadyLinked = (state.projects || []).some(p => p.linkedListingId === listingId);
  const project = alreadyLinked ? null : projectFromListing(listing);
  return {
    ...state,
    emailVerified: true,
    developerEnabled: true,
    submitterEmailListingId: listingId,
    projects: project ? [project, ...state.projects] : state.projects,
    expandedProjectId: project ? project.id : state.expandedProjectId,
  };
};

/* Deleting a project revokes its keys with it: they live only on the project. */
export const removeProject = (state, projectId) => ({
  ...state,
  projects: state.projects.filter(p => p.id !== projectId),
  expandedProjectId: state.expandedProjectId === projectId ? null : state.expandedProjectId,
});

/* Making a public project private withdraws its consent to being listed. */
export const withdrawConsent = (project) => ({
  ...project,
  visibility: "private",
  consentWithdrawnAt: new Date().toISOString(),
});
