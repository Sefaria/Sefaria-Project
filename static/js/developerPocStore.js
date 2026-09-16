/*
 * Mock state for the Developer settings proof of concept.
 *
 * Nothing here talks to a server. Every project, key and usage number lives in one
 * localStorage blob so product people can click through the flow; the key values are
 * random strings generated in the browser and authorize nothing. The demo bar on the
 * page resets this store and can override the account's real SSO status.
 *
 * localStorage is read lazily (never at module load) so server-side rendering is safe.
 */

export const DEVELOPER_POC_STORAGE_KEY = "sefariaDeveloperPoc";
export const DEVELOPER_POC_VERSION = 1;
export const MAX_KEYS_PER_PROJECT = 5;

export const POWERED_BY_LISTINGS = [
  {name: "Daf Yomi Portal", url: "dafyomiportal.org"},
  {name: "Daf Yomi Review", url: "dafyomireview.com"},
  {name: "Mishnah Flashcards", url: "mishnahcards.example.org"},
  {name: "Parasha Weekly", url: "parashaweekly.example.com"},
  {name: "Talmud Graph Explorer", url: "talmudgraph.example.net"},
];

export const emptyState = () => ({
  version: DEVELOPER_POC_VERSION,
  developerEnabled: false,
  ssoOverride: null,   // null: use the account's real providers. true/false: pretend.
  failNextKey: false,
  profile: null,
  projects: [],
  expandedProjectId: null,
});

const randomId = () => Math.random().toString(36).slice(2, 10);

const KEY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export const makeKeyValue = () => {
  let value = "";
  for (let i = 0; i < 32; i++) {
    value += KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)];
  }
  return "sfr_" + value;
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
  visibility: "private",
  organization: "",
  websiteUrl: "",
  aiAssisted: false,
  listingRequest: null,
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
      phone: "",
      termsAccepted: true,
      notADeveloper: false,
    },
    projects: [project],
    expandedProjectId: project.id,
  };
};

export const readState = () => {
  if (typeof window === "undefined" || !window.localStorage) { return emptyState(); }
  try {
    const raw = window.localStorage.getItem(DEVELOPER_POC_STORAGE_KEY);
    if (!raw) { return emptyState(); }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== DEVELOPER_POC_VERSION) { return emptyState(); }
    return {...emptyState(), ...parsed};
  } catch (e) {
    return emptyState();
  }
};

export const writeState = (state) => {
  if (typeof window === "undefined" || !window.localStorage) { return state; }
  try {
    window.localStorage.setItem(DEVELOPER_POC_STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* private browsing, quota: the POC keeps working in memory */ }
  return state;
};

export const ssoConnected = (state, realProviders) => (
  state.ssoOverride === null ? (realProviders || []).length > 0 : !!state.ssoOverride
);

/* The account settings page is a Django template with jQuery, not React, and shares this
   store with the developer page. It reaches it through this global. */
if (typeof window !== "undefined") {
  window.sefariaDeveloperPoc = {
    readState, writeState, emptyState, sampleState, ssoConnected,
    STORAGE_KEY: DEVELOPER_POC_STORAGE_KEY,
  };
}

export const websiteHost = (url) => {
  if (!url) { return ""; }
  try {
    return new URL(/^https?:\/\//.test(url) ? url : "https://" + url).host;
  } catch (e) {
    return url;
  }
};
