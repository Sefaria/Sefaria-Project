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
import { ALL_FIELDS, emptyValues, missingRequiredFields } from './poweredBy/poweredByFormDefinition';

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
  failNextKey: false,
  submitterEmailListingId: null,   // the listing whose submitter email is the account email
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
  listingRequest: null,        // {id, name, url}: a link staff have still to confirm
  linkedListingId: null,       // the Powered by listing this project is
  poweredByAnswers: null,      // the Powered by form's answers, apart from the shared fields
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

/* Listing links compare as host and path, ignoring scheme, "www." and a trailing slash. */
export const normalizeWebsite = (url) => (
  (url || "").trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
);

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

export const listingForWebsite = (listings, url) => {
  const wanted = normalizeWebsite(url);
  return wanted ? listings.find(l => normalizeWebsite(l.url) === wanted) || null : null;
};

export const canLinkByEmail = (listing, email, verified) => (
  !!listing && verified && !listing.ownedByAnotherAccount && !listing.linkedProjectId && sameEmail(listing.submitterEmail, email)
);

/* Only these listing fields are public, so only these can be compared on screen. */
export const publicListing = (listing) => (
  listing ? {id: listing.id, name: listing.name, url: listing.url, description: listing.description} : null
);

/* Project and listing fields that disagree, for the person to settle by hand. */
export const listingConflicts = (fields, listing) => [
  {field: "name", project: (fields.name || "").trim(), listing: listing.name},
  {field: "description", project: (fields.description || "").trim(), listing: listing.description},
  {field: "websiteUrl", project: (fields.websiteUrl || "").trim(), listing: listing.url,
    same: normalizeWebsite(fields.websiteUrl) === normalizeWebsite(listing.url)},
].filter(c => !(c.same !== undefined ? c.same : c.project === c.listing));

/* Choosing Public is consent to a possible listing, so a public project's consent answer
   starts as yes; answering no makes the project private. */
export const CONSENT_YES = "Yes";
export const CONSENT_NO = "No";

/* Name, link and description are one value each, held on the project; the Powered by
   form reads and writes them there. */
export const SHARED_LISTING_FIELDS = {projectName: "name", projectLink: "websiteUrl", description: "description"};

const splitName = (fullName) => {
  const name = (fullName || "").trim();
  const space = name.indexOf(" ");
  return space === -1 ? {firstName: name, lastName: ""} : {firstName: name.slice(0, space), lastName: name.slice(space + 1).trim()};
};

/* The form's values for a project: stored answers when there are any, otherwise a prefill
   from the account and the project. */
export const poweredByValues = (project, account) => {
  const answers = project.poweredByAnswers || {
    ...splitName(account.name),
    email: account.email || "",
    vibeCoded: project.aiAssisted ? "Yes" : "",
  };
  const shared = {};
  Object.entries(SHARED_LISTING_FIELDS).forEach(([field, key]) => { shared[field] = project[key] || ""; });
  const consent = answers.consent || (project.visibility === "public" ? CONSENT_YES : "");
  return {...emptyValues(), ...answers, ...shared, consent};
};

const LISTING_OPTIONS = {hideEndpointSections: true};

export const listingMissingFields = (project, account) => missingRequiredFields(poweredByValues(project, account), LISTING_OPTIONS);

/* A public project's listing is incomplete while a required Powered by field is empty. */
export const listingIncomplete = (project, account) => (
  project.visibility === "public" && listingMissingFields(project, account).length > 0
);

/* The project after the Powered by form changes: shared fields go to the project itself. */
export const applyPoweredByValues = (project, values) => {
  const answers = {...values};
  const changes = {};
  Object.entries(SHARED_LISTING_FIELDS).forEach(([field, key]) => {
    changes[key] = values[field] || "";
    delete answers[field];
  });
  const losingUrl = !!project.websiteUrl && !changes.websiteUrl.trim();
  return {
    ...project,
    ...changes,
    keys: losingUrl ? project.keys.map(k => ({...k, restrictToWebsite: false})) : project.keys,
    poweredByAnswers: answers,
  };
};

/* POC shortcut: fills every empty required answer with a sample value. */
export const fillRequiredAnswers = (values, account) => {
  const filled = {...values};
  missingRequiredFields(values, LISTING_OPTIONS).forEach(name => {
    const field = ALL_FIELDS.find(f => f.name === name);
    if (field.type === "checkbox") { filled[name] = [field.options[0].value]; }
    else if (field.type === "radio" || field.type === "select") { filled[name] = field.options[0].value; }
    else if (field.type === "email") { filled[name] = account.email || "you@example.org"; }
    else if (name === "projectLink") { filled[name] = "https://example.org"; }
    else { filled[name] = "Sample"; }
  });
  return filled;
};

/* Making a public project private withdraws consent; a later Public starts at yes again. */
export const withdrawConsent = (project) => ({
  ...project,
  visibility: "private",
  consentWithdrawnAt: new Date().toISOString(),
  poweredByAnswers: project.poweredByAnswers ? {...project.poweredByAnswers, consent: ""} : null,
});
