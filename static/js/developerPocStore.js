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

export const websiteHost = (url) => {
  if (!url) { return ""; }
  try {
    return new URL(/^https?:\/\//.test(url) ? url : "https://" + url).host;
  } catch (e) {
    return url;
  }
};
