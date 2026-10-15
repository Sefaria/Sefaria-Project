/*
 * The developer settings API, mocked in the browser for the proof of concept.
 *
 * It answers the routes of /api/developer/ with the same response shapes and error codes as
 * powered_by/developer_views.py, by applying the same rules to one blob of mock data. The blob
 * is kept in the session through api/developer-poc/state, so the page renders server-side and an
 * emailed confirmation link opened in any browser is noticed. Nothing here creates real projects
 * or keys: key values are made up in the browser and authorize nothing.
 */

import { getCsrfToken } from './sefaria/csrf';

export const DEVELOPER_POC_STATE_URL = "/api/developer-poc/state";
export const MOCK_VERSION = 2;
export const MAX_KEYS_PER_PROJECT = 5;
const MAX_DESCRIPTION_LENGTH = 150;
const MAX_PROFILE_DESCRIPTION_LENGTH = 300;
const MAX_KEY_LABEL_LENGTH = 100;
export const CONFIRMATION_COOLDOWN_MS = 60 * 1000;
export const CONFIRMATION_DAILY_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/* The address a simulated email change moves away from. */
export const PREVIOUS_ACCOUNT_EMAIL = "previous-address@example.org";

/* Listings the test controls add, submitted with the account email, in turn. */
const MOCK_LISTINGS = [
  ["Daf Yomi Companion", "https://dafyomicompanion.org", "Today's daf with Steinsaltz, Rashi and a daily review quiz."],
  ["Mishnah Yomit Tracker", "https://mishnahtracker.app", "Track your daily two mishnayot and share progress with a study group."],
  ["Tehillim Circle", "https://tehillimcircle.org", "Split the book of Psalms among a group, with the text in Hebrew and English."],
  ["Luach Widgets", "https://luachwidgets.dev", "Embeddable Hebrew calendar and daily learning widgets for synagogue websites."],
];

/* Key values are obviously fake, so nobody mistakes one for a credential. */
const TEST_KEY_SUFFIXES = [
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

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const randomString = (length) => {
  let s = "";
  while (s.length < length) { s += Math.random().toString(36).slice(2); }
  return s.slice(0, length);
};
const makeKeyValue = () => "sfr_test_" + pick(TEST_KEY_SUFFIXES);
const makeKeyId = () => [8, 4, 4, 4, 12].map(randomString).join("-");
const nowIso = () => new Date().toISOString();
const lower = (email) => (email || "").trim().toLowerCase();

export const emptyBlob = () => ({
  version: MOCK_VERSION,
  developerEnabled: false,
  ssoOverride: null,          // null: the account's real Google or Apple status. true/false: pretend.
  verifiedEmail: null,        // the address confirmed by link; it counts while it is the account email
  emailVerified: false,       // set by the server when the emailed link is opened
  confirmationSentAt: null,
  confirmationSentTo: null,
  confirmationToken: null,    // the token in the emailed link
  confirmationSends: [],      // send times in the last day, for the limits
  profile: null,
  projects: [],
  listings: [],               // Powered by rows submitted with the account email
  dismissedListingIds: [],
  nextId: 1,
  failNext: null,             // "key": the next key creation fails; "any": the next change fails
});

/* A blob from an older version of the mock starts over. */
export const migrate = (blob) => (
  blob && typeof blob === "object" && blob.version === MOCK_VERSION ? {...emptyBlob(), ...blob} : emptyBlob()
);

/* The server marks the blob when the emailed link is opened; it confirms the address the link
   was sent to, if that is still the account email, and turns developer settings on. */
export const normalize = (blob, email) => {
  const b = migrate(blob);
  if (!b.emailVerified) { return b; }
  const sentTo = b.confirmationSentTo;
  return {
    ...b,
    verifiedEmail: email && (!sentTo || sentTo === lower(email)) ? lower(email) : b.verifiedEmail,
    developerEnabled: true,
    emailVerified: false,
    confirmationSentAt: null,
    confirmationSentTo: null,
    confirmationToken: null,
  };
};

const ssoConnected = (b, ctx) => (
  b.ssoOverride === null || b.ssoOverride === undefined ? (ctx.realProviders || []).length > 0 : !!b.ssoOverride
);
const emailVerified = (b, ctx) => !!ctx.email && b.verifiedEmail === lower(ctx.email);
const accountVerified = (b, ctx) => ssoConnected(b, ctx) || emailVerified(b, ctx);

const unclaimedListings = (b, ctx) => b.listings
  .filter(l => !l.deleted && !l.projectId && l.submitterEmail === lower(ctx.email) && !b.dismissedListingIds.includes(l.id))
  .sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || ""));

const serializeProject = (p) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  organization: p.organization,
  websiteUrl: p.websiteUrl,
  visibility: p.visibility,
  aiAssisted: p.aiAssisted,
  linkedListing: !!p.listingId,
  consentWithdrawnAt: p.consentWithdrawnAt,
  keys: p.keys.map(k => ({id: k.id, label: k.label, value: k.value, created: k.created, restrictToWebsite: !!k.restrictToWebsite})),
});

/* What GET api/developer/state answers, as powered_by.developer.developer_state builds it. */
export const developerState = (blob, ctx) => {
  const b = normalize(blob, ctx.email);
  const email = lower(ctx.email);
  const verified = accountVerified(b, ctx);
  const sentAt = !verified && email && b.confirmationSentTo === email ? b.confirmationSentAt : null;
  const listing = verified && email ? unclaimedListings(b, ctx)[0] : null;
  return {
    developerEnabled: !!b.developerEnabled,
    ssoConnected: ssoConnected(b, ctx),
    emailVerified: emailVerified(b, ctx),
    confirmationSentAt: sentAt,
    profile: b.profile,
    projects: [...b.projects].sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || "")).map(serializeProject),
    yourListing: listing ? {id: listing.id, name: listing.name, url: listing.url, description: listing.description} : null,
    maxKeysPerProject: MAX_KEYS_PER_PROJECT,
    mock: {
      ssoOverride: b.ssoOverride === undefined ? null : b.ssoOverride,
      realSsoProviders: ctx.realProviders || [],
      confirmationKey: sentAt ? b.confirmationToken : null,
      failNext: b.failNext,
      confirmationSendsToday: recentSends(b, Date.now()).length,
    },
  };
};


/* --- Errors, as developer_views.developer_api maps them ----------------------- */

export class MockHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const inputError = (message) => new MockHttpError(400, message);
const permissionError = (message) => new MockHttpError(403, message);
const lookupError = (message) => new MockHttpError(404, message);
const cooldownError = (message) => new MockHttpError(429, message);


/* --- Rules --------------------------------------------------------------------- */

const FIELD_LABELS = {
  developerName: "The name",
  description: "The description",
  additionalEmail: "The additional email",
  name: "The project name",
  organization: "The organization",
  websiteUrl: "The website",
};

const text = (data, field, maxLength = 255) => {
  const label = FIELD_LABELS[field] || field;
  const value = data[field] === undefined || data[field] === null ? "" : data[field];
  if (typeof value !== "string") { throw inputError(label + " must be text."); }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) { throw inputError(label + " can be at most " + maxLength + " characters."); }
  return trimmed;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_PATTERN = /^https?:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i;

const cleanProfile = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) { throw inputError("The profile must be a JSON object."); }
  const profile = {
    developerName: text(data, "developerName"),
    description: text(data, "description", MAX_PROFILE_DESCRIPTION_LENGTH),
    additionalEmail: text(data, "additionalEmail"),
    termsAccepted: !!data.termsAccepted,
    developerNews: !!data.developerNews,
    notADeveloper: !!data.notADeveloper,
  };
  if (!profile.termsAccepted) { throw inputError("Accept the API terms to continue."); }
  if (profile.additionalEmail && !EMAIL.test(profile.additionalEmail)) {
    throw inputError("The additional email is not a valid address.");
  }
  return profile;
};

const cleanProjectFields = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) { throw inputError("The project must be a JSON object."); }
  const fields = {
    name: text(data, "name"),
    description: text(data, "description", MAX_DESCRIPTION_LENGTH),
    organization: text(data, "organization"),
    websiteUrl: text(data, "websiteUrl", 200),
    visibility: data.visibility,
    aiAssisted: !!data.aiAssisted,
  };
  if (!fields.name) { throw inputError("Give the project a name."); }
  if (fields.visibility !== "public" && fields.visibility !== "private") {
    throw inputError("Choose whether the project is public or private.");
  }
  if (fields.websiteUrl && !URL_PATTERN.test(fields.websiteUrl)) { throw inputError("The website is not a valid web address."); }
  return fields;
};

const requireDeveloper = (b) => {
  if (!(b.developerEnabled && b.profile)) { throw permissionError("Developer settings are not set up for this account."); }
};

const requireVerifiedDeveloper = (b, ctx) => {
  requireDeveloper(b);
  if (!accountVerified(b, ctx)) { throw permissionError("Confirm your email address to create projects and keys."); }
};

const recentSends = (b, now) => (b.confirmationSends || [])
  .map(s => Date.parse(s))
  .filter(t => !isNaN(t) && now - t < DAY_MS)
  .sort((x, y) => x - y);

/* Records a confirmation email to the account email, within the limits: one a minute, and
   CONFIRMATION_DAILY_LIMIT a day. A link already sent to this address keeps working. */
const sendConfirmation = (b, ctx) => {
  const now = Date.now();
  const sends = recentSends(b, now);
  if (sends.length && now - sends[sends.length - 1] < CONFIRMATION_COOLDOWN_MS) {
    throw cooldownError("Wait a minute before asking for another email.");
  }
  if (sends.length >= CONFIRMATION_DAILY_LIMIT) {
    throw cooldownError("You've asked for " + CONFIRMATION_DAILY_LIMIT + " links today. Try again tomorrow, or contact hello@sefaria.org.");
  }
  const email = lower(ctx.email);
  const token = b.confirmationToken && b.confirmationSentTo === email ? b.confirmationToken : randomString(16);
  return {
    ...b,
    confirmationSentAt: new Date(now).toISOString(),
    confirmationSentTo: email,
    confirmationToken: token,
    confirmationSends: sends.map(t => new Date(t).toISOString()).concat(new Date(now).toISOString()),
  };
};

const clearConfirmation = (b) => ({...b, confirmationSentAt: null, confirmationSentTo: null, confirmationToken: null});

const nextId = (b) => [String(b.nextId), {...b, nextId: b.nextId + 1}];

const findProject = (b, projectId) => {
  const project = b.projects.find(p => p.id === String(projectId));
  if (!project) { throw lookupError("No such project."); }
  return project;
};

const findKey = (b, keyId) => {
  for (const project of b.projects) {
    const key = project.keys.find(k => k.id === String(keyId));
    if (key) { return [project, key]; }
  }
  throw lookupError("No such key.");
};

const replaceProject = (b, project) => ({...b, projects: b.projects.map(p => (p.id === project.id ? project : p))});

/* Public projects are listed on Powered by Sefaria; making one private withdraws consent. */
const withVisibility = (project, visibility) => {
  if (visibility === "public") { return {...project, visibility, consentWithdrawnAt: null}; }
  if (project.visibility === "public") { return {...project, visibility, consentWithdrawnAt: nowIso()}; }
  return {...project, visibility};
};

const newProject = (id, fields, extra = {}) => ({
  id,
  name: fields.name,
  description: fields.description,
  organization: fields.organization || "",
  websiteUrl: fields.websiteUrl || "",
  visibility: fields.visibility,
  aiAssisted: !!fields.aiAssisted,
  consentWithdrawnAt: null,
  listingId: null,
  createdAt: nowIso(),
  keys: [],
  ...extra,
});

const newKey = (label, extra = {}) => ({
  id: makeKeyId(), label, value: makeKeyValue(), created: nowIso(), restrictToWebsite: false, ...extra,
});

const claimInto = (b, listing) => {
  const [id, b2] = nextId(b);
  const project = newProject(id, {
    name: listing.name, description: listing.description, websiteUrl: listing.url, visibility: "public",
  }, {listingId: listing.id});
  return [project, {
    ...b2,
    projects: [project, ...b2.projects],
    listings: b2.listings.map(l => (l.id === listing.id ? {...l, projectId: id} : l)),
  }];
};

const addListing = (b, ctx) => {
  if (!ctx.email) { throw inputError("Your account has no email address."); }
  const [name, url, description] = MOCK_LISTINGS[b.listings.length % MOCK_LISTINGS.length];
  const [id, b2] = nextId(b);
  const listing = {id, name, url, description, submitterEmail: lower(ctx.email), projectId: null, deleted: false, createdAt: nowIso()};
  return [listing, {...b2, listings: [...b2.listings, listing]}];
};


/* --- Test scenarios -------------------------------------------------------------- */

/* Clears developer settings: projects are deleted and claimed listings released, and the
   account's verification is set as asked. Send times stay, so the limits still apply. */
const startOver = (b, ctx, ssoOverride, verified) => ({
  ...emptyBlob(),
  confirmationSends: b.confirmationSends,
  listings: b.listings.map(l => ({...l, projectId: null})),
  nextId: b.nextId,
  ssoOverride: ssoOverride === undefined ? null : ssoOverride,
  verifiedEmail: verified && ctx.email ? lower(ctx.email) : null,
});

const SAMPLE_PROFILE = {
  developerName: "Tova Levi",
  description: "Small learning tools for daily study.",
  additionalEmail: "",
  termsAccepted: true,
  developerNews: false,
  notADeveloper: false,
};

const daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString();

const sampleProject = (b) => {
  const [id, b2] = nextId(b);
  const project = newProject(id, {
    name: "Daf Yomi Portal",
    description: "A daily page companion with commentary links.",
    organization: "Daf Yomi Portal",
    websiteUrl: "https://dafyomiportal.org",
    visibility: "private",
    aiAssisted: true,
  }, {
    createdAt: daysAgo(40),
    keys: [
      newKey("Production", {created: daysAgo(40), restrictToWebsite: true}),
      newKey("Local development", {created: daysAgo(12)}),
    ],
  });
  return [project, {...b2, projects: [project, ...b2.projects]}];
};

const KEY_LABELS = ["Production", "Staging", "Local development", "Mobile app", "Nightly job", "Analytics"];

const SCENARIOS = {
  "start-over": (b, ctx, body) => [startOver(b, ctx, body.ssoOverride, !!body.emailVerified)],
  "sso": (b, ctx, body) => [{...b, ssoOverride: body.ssoOverride === undefined ? null : body.ssoOverride}],
  "email-verified": (b, ctx, body) => [clearConfirmation({
    ...b, verifiedEmail: body.emailVerified && ctx.email ? lower(ctx.email) : null,
  })],
  "create-listing": (b, ctx) => [addListing(b, ctx)[1]],

  /* A Google account with one project and two keys. */
  "sample": (b, ctx) => {
    const [project, b2] = sampleProject({...startOver(b, ctx, true, false), developerEnabled: true, profile: SAMPLE_PROFILE});
    return [b2, {projectId: project.id}];
  },
  /* An email account that asked for a confirmation link and is waiting for it. */
  "link-sent": (b, ctx) => {
    if (!ctx.email) { throw inputError("Your account has no email address."); }
    const b2 = startOver(b, ctx, false, false);
    return [{
      ...b2,
      confirmationSentAt: nowIso(), confirmationSentTo: lower(ctx.email), confirmationToken: randomString(16),
    }];
  },
  /* The account email changed after it was confirmed: what was set up stays, new projects and
     keys wait for the new address. Without a project, the sample one is added. */
  "email-changed": (b, ctx) => {
    let b2 = clearConfirmation({
      ...b, developerEnabled: true, profile: b.profile || SAMPLE_PROFILE, ssoOverride: false,
      verifiedEmail: PREVIOUS_ACCOUNT_EMAIL,
    });
    let projectId = b2.projects.length ? b2.projects[0].id : null;
    if (!projectId) {
      const [project, b3] = sampleProject(b2);
      b2 = b3;
      projectId = project.id;
    }
    return [b2, {projectId}];
  },
  /* A fresh email account that answered staff outreach about a listing submitted with its
     email: the reply confirmed the address, and staff linked the listing to it as a project. */
  "outreach": (b, ctx) => {
    const [listing, b2] = addListing({...startOver(b, ctx, false, false), developerEnabled: true}, ctx);
    const [project, b3] = claimInto({...b2, verifiedEmail: lower(ctx.email)}, listing);
    return [b3, {projectId: project.id}];
  },
  /* Fills a project up to the key limit; the project is created if there is none. */
  "fill-keys": (b, ctx, body) => {
    let b2 = {...b, developerEnabled: true, profile: b.profile || SAMPLE_PROFILE};
    let project = b2.projects.find(p => p.id === String(body.projectId)) || b2.projects[0];
    if (!project) { [project, b2] = sampleProject(b2); }
    const keys = [...project.keys];
    while (keys.length < MAX_KEYS_PER_PROJECT) {
      const used = keys.map(k => k.label);
      keys.push(newKey(KEY_LABELS.find(l => !used.includes(l)) || "Key " + (keys.length + 1)));
    }
    return [replaceProject(b2, {...project, keys}), {projectId: project.id}];
  },
  "fail-next": (b, ctx, body) => [{...b, failNext: body.failNext === "key" || body.failNext === "any" ? body.failNext : null}],
  /* Today's confirmation emails: all used up, or none sent. */
  "send-limit": (b, ctx, body) => {
    const minutes = (n) => new Date(Date.now() - n * 60 * 1000).toISOString();
    return [{...b, confirmationSends: body.reached ? [10, 9, 8, 7, 6].map(n => minutes(n * 10)) : []}];
  },
};


/* --- Routes ------------------------------------------------------------------- */

const ROUTES = [
  ["GET", /^state$/, (b) => [b]],
  ["POST", /^enable$/, (b, ctx) => {
    if (!accountVerified(b, ctx)) { throw inputError("Confirm your email before turning on developer settings."); }
    return [{...b, developerEnabled: true}];
  }],
  ["POST", /^profile$/, (b, ctx, body) => {
    if (!(accountVerified(b, ctx) || b.developerEnabled)) {
      throw permissionError("Confirm your email before setting up developer settings.");
    }
    return [{...b, profile: cleanProfile(body.profile)}];
  }],
  ["POST", /^confirmation$/, (b, ctx) => {
    if (accountVerified(b, ctx)) { throw inputError("Your email is already confirmed."); }
    if (!ctx.email) { throw inputError("Your account has no email address."); }
    return [sendConfirmation(b, ctx)];
  }],
  ["DELETE", /^confirmation$/, (b) => [clearConfirmation(b)]],
  ["POST", /^confirmation\/new-link$/, (b, ctx) => {
    if (!ctx.email || accountVerified(b, ctx)) { throw lookupError("This link can't be renewed."); }
    return [sendConfirmation(b, ctx), {sent: true}, true];
  }],
  ["POST", /^projects$/, (b, ctx, body) => {
    requireVerifiedDeveloper(b, ctx);
    const fields = cleanProjectFields(body.project);
    const [id, b2] = nextId(b);
    return [{...b2, projects: [newProject(id, fields), ...b2.projects]}, {projectId: id}];
  }],
  ["POST", /^projects\/([^/]+)$/, (b, ctx, body, [projectId]) => {
    requireDeveloper(b);
    const project = findProject(b, projectId);
    const fields = cleanProjectFields(body.project);
    const updated = withVisibility({
      ...project,
      name: fields.name, description: fields.description, organization: fields.organization,
      websiteUrl: fields.websiteUrl, aiAssisted: fields.aiAssisted,
    }, fields.visibility);
    /* A restricted key follows the website, and works anywhere again once there is none. */
    if (updated.websiteUrl !== project.websiteUrl) {
      updated.keys = updated.keys.map(k => (k.restrictToWebsite ? {...k, restrictToWebsite: !!updated.websiteUrl} : k));
    }
    return [replaceProject(b, updated)];
  }],
  ["DELETE", /^projects\/([^/]+)$/, (b, ctx, body, [projectId]) => {
    requireDeveloper(b);
    const project = findProject(b, projectId);
    return [{
      ...b,
      projects: b.projects.filter(p => p.id !== project.id),
      listings: b.listings.map(l => (l.id === project.listingId ? {...l, deleted: true} : l)),
    }];
  }],
  ["POST", /^projects\/([^/]+)\/keys$/, (b, ctx, body, [projectId]) => {
    requireVerifiedDeveloper(b, ctx);
    const project = findProject(b, projectId);
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) { throw inputError("Give the key a name."); }
    if (label.length > MAX_KEY_LABEL_LENGTH) { throw inputError("The key name can be at most " + MAX_KEY_LABEL_LENGTH + " characters."); }
    if (project.keys.length >= MAX_KEYS_PER_PROJECT) {
      throw inputError("A project can have at most " + MAX_KEYS_PER_PROJECT + " keys.");
    }
    const key = newKey(label);
    return [replaceProject(b, {...project, keys: [...project.keys, key]}), {keyId: key.id}];
  }],
  ["POST", /^keys\/([^/]+)$/, (b, ctx, body, [keyId]) => {
    requireDeveloper(b);
    const [project, key] = findKey(b, keyId);
    const restrict = !!body.restrictToWebsite;
    if (restrict && !project.websiteUrl) { throw inputError("Add the project's website before restricting a key to it."); }
    return [replaceProject(b, {...project, keys: project.keys.map(k => (k.id === key.id ? {...k, restrictToWebsite: restrict} : k))})];
  }],
  ["DELETE", /^keys\/([^/]+)$/, (b, ctx, body, [keyId]) => {
    requireDeveloper(b);
    const [project, key] = findKey(b, keyId);
    return [replaceProject(b, {...project, keys: project.keys.filter(k => k.id !== key.id)})];
  }],
  ["POST", /^listings\/(\d+)\/claim$/, (b, ctx, body, [listingId]) => {
    requireVerifiedDeveloper(b, ctx);
    const listing = unclaimedListings(b, ctx).find(l => l.id === listingId);
    if (!listing) { throw lookupError("No such listing."); }
    const [project, b2] = claimInto(b, listing);
    return [b2, {projectId: project.id}];
  }],
  ["POST", /^listings\/(\d+)\/dismiss$/, (b, ctx, body, [listingId]) => {
    requireDeveloper(b);
    const listing = b.listings.find(l => l.id === listingId && !l.deleted && l.submitterEmail === lower(ctx.email));
    if (!listing) { throw lookupError("No such listing."); }
    return [b.dismissedListingIds.includes(listingId) ? b : {...b, dismissedListingIds: [...b.dismissedListingIds, listingId]}];
  }],
  ["POST", /^mock$/, (b, ctx, body) => {
    const scenario = SCENARIOS[body.action];
    if (!scenario) { throw inputError("Unknown test action."); }
    return scenario(b, ctx, body);
  }],
];

/* Answers one request: [status, response body, blob to keep]. A failure the test controls
   asked for answers 500 and is used up, so the request after it works. */
export const handle = (blob, ctx, method, path, body = {}) => {
  const b = normalize(blob, ctx.email);
  for (const [routeMethod, pattern, action] of ROUTES) {
    const match = path.match(pattern);
    if (!match || routeMethod !== method) { continue; }
    if (method !== "GET" && path !== "mock" && b.failNext &&
        (b.failNext === "any" || (b.failNext === "key" && /^projects\/[^/]+\/keys$/.test(path)))) {
      return [500, {error: ""}, {...b, failNext: null}];
    }
    try {
      const [next, extra, bare] = action(b, ctx, body || {}, match.slice(1));
      return [200, bare ? extra : {...developerState(next, ctx), ...(extra || {})}, next];
    } catch (e) {
      if (e instanceof MockHttpError) { return [e.status, {error: e.message}, b]; }
      throw e;
    }
  }
  const known = ROUTES.some(([, pattern]) => pattern.test(path));
  return [known ? 405 : 404, {error: known ? "Method not allowed." : "Not found."}, b];
};


/* --- Persistence ---------------------------------------------------------------- */

let cachedBlob = null;

/* The latest blob this page has seen, or null before its first request. */
export const cachedMockBlob = () => cachedBlob;

const remember = (blob) => {
  if (typeof window !== "undefined") { cachedBlob = blob; }
  return blob;
};

export const loadBlob = () => fetch(DEVELOPER_POC_STATE_URL, {mode: "same-origin", credentials: "same-origin"})
  .then(response => {
    if (!response.ok) { throw new Error(""); }
    return response.json();
  })
  .then(remember);

export const saveBlob = (blob) => fetch(DEVELOPER_POC_STATE_URL, {
  method: "POST",
  mode: "same-origin",
  credentials: "same-origin",
  headers: {"Content-Type": "application/json", "X-CSRFToken": getCsrfToken()},
  body: JSON.stringify(blob),
}).then(response => {
  if (!response.ok) { throw new Error(""); }
  return remember(blob);
});

export const MOCK_CHANGED_EVENT = "sefaria:developer-poc-mock-changed";

/* A request against the session's blob, saved back when it changed anything. */
export const request = (ctx, method, path, body) => loadBlob().then(stored => {
  const [status, data, next] = handle(stored, ctx, method, path, body);
  const changed = JSON.stringify(next) !== JSON.stringify(stored);
  return (changed ? saveBlob(next) : Promise.resolve()).then(() => {
    if (typeof window !== "undefined") { window.dispatchEvent(new CustomEvent(MOCK_CHANGED_EVENT)); }
    return [status, data];
  });
});
