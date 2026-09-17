/*
 * Mock state for the Developer settings proof of concept.
 *
 * Nothing here talks to a server. Every project, key and usage number lives in one
 * localStorage blob so product people can click through the flow; the key values are
 * random strings generated in the browser and authorize nothing. The floating POC test
 * controls reset this store and can override the account's real SSO status.
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
      termsAccepted: true,
      notADeveloper: false,
    },
    projects: [project],
    expandedProjectId: project.id,
  };
};

/* The settings nav has to render on the server, which cannot read localStorage, so the
   two values it depends on are mirrored into cookies on every read and write. */
export const DEVELOPER_POC_ON_COOKIE = "sefariaDeveloperPocOn";
export const DEVELOPER_POC_SSO_COOKIE = "sefariaDeveloperPocSso";

const mirrorStateToCookies = (state) => {
  if (typeof document === "undefined") { return state; }
  const ssoOverride = state.ssoOverride === null || state.ssoOverride === undefined
    ? "" : (state.ssoOverride ? "1" : "0");
  document.cookie = DEVELOPER_POC_ON_COOKIE + "=" + (state.developerEnabled ? "1" : "0") + "; path=/; SameSite=Lax";
  document.cookie = DEVELOPER_POC_SSO_COOKIE + "=" + ssoOverride + "; path=/; SameSite=Lax";
  return state;
};

export const readState = () => {
  if (typeof window === "undefined" || !window.localStorage) { return emptyState(); }
  try {
    const raw = window.localStorage.getItem(DEVELOPER_POC_STORAGE_KEY);
    if (!raw) { return mirrorStateToCookies(emptyState()); }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== DEVELOPER_POC_VERSION) { return mirrorStateToCookies(emptyState()); }
    return mirrorStateToCookies({...emptyState(), ...parsed});
  } catch (e) {
    return emptyState();
  }
};

export const writeState = (state) => {
  if (typeof window === "undefined" || !window.localStorage) { return state; }
  try {
    window.localStorage.setItem(DEVELOPER_POC_STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* private browsing, quota: the POC keeps working in memory */ }
  mirrorStateToCookies(state);
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
