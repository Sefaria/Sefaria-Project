/*
 * The developer settings API. Every call returns the account's whole developer state, as
 * powered_by.developer.developer_state builds it, so the page renders straight from the response.
 */

import { getCsrfToken } from './sefaria/csrf';
import Sefaria from './sefaria/sefaria';

export const DEVELOPER_API_URL = "/api/developer/";
export const MAX_DESCRIPTION_LENGTH = 150;

export const emptyState = () => ({
  developerEnabled: false,
  ssoConnected: false,
  emailVerified: false,
  confirmationSentAt: null,
  profile: null,
  projects: [],
  yourListing: null,
  maxKeysPerProject: 5,
  mock: null,
});

/* Hebrew for the errors powered_by/developer.py and developer_views.py send, which are English. */
const SERVER_ERRORS_HE = {
  "Log in to use developer settings.": "יש להתחבר כדי להשתמש בהגדרות המפתחים.",
  "Request is too large.": "הבקשה גדולה מדי.",
  "Could not parse JSON.": "לא הצלחנו לקרוא את הבקשה.",
  "Request must be a JSON object.": "לא הצלחנו לקרוא את הבקשה.",
  "The profile must be a JSON object.": "לא הצלחנו לקרוא את הבקשה.",
  "The project must be a JSON object.": "לא הצלחנו לקרוא את הבקשה.",
  "Wait a minute before asking for another email.": "נא להמתין דקה לפני שמבקשים הודעה נוספת.",
  "This link can't be renewed.": "אי אפשר לחדש את הקישור הזה.",
  "Accept the API terms to continue.": "כדי להמשיך יש לאשר את תנאי השימוש ב־API.",
  "The additional email is not a valid address.": "כתובת הדוא״ל הנוספת אינה תקינה.",
  "Confirm your email before turning on developer settings.": "אשרו את כתובת הדוא״ל לפני הפעלת הגדרות המפתחים.",
  "Confirm your email before setting up developer settings.": "אשרו את כתובת הדוא״ל לפני הגדרת הגדרות המפתחים.",
  "Developer settings are not set up for this account.": "הגדרות המפתחים לא הוגדרו בחשבון הזה.",
  "Confirm your email address to create projects and keys.": "אשרו את כתובת הדוא״ל כדי ליצור פרויקטים ומפתחות.",
  "Your email is already confirmed.": "כתובת הדוא״ל שלך כבר אושרה.",
  "Your account has no email address.": "לחשבון שלך אין כתובת דוא״ל.",
  "Give the project a name.": "נא לתת לפרויקט שם.",
  "Choose whether the project is public or private.": "נא לבחור אם הפרויקט ציבורי או פרטי.",
  "The website is not a valid web address.": "כתובת האתר אינה תקינה.",
  "A key is restricted to this website. Turn off the restriction on every key before removing the website.":
    "יש מפתח שמוגבל לאתר הזה. כבו את ההגבלה בכל המפתחות לפני הסרת האתר.",
  "No such project.": "הפרויקט לא נמצא.",
  "No such listing.": "הרישום לא נמצא.",
  "No such key.": "המפתח לא נמצא.",
  "Give the key a name.": "נא לתת למפתח שם.",
  "The key name can be at most 100 characters.": "שם המפתח יכול להכיל עד 100 תווים.",
  "Add the project's website before restricting a key to it.": "הוסיפו את אתר הפרויקט לפני שמגבילים אליו מפתח.",
};

/* "In the <field>", which reads the same whatever the field's gender. */
const IN_FIELD_HE = {
  "The name": "בשם",
  "The description": "בתיאור",
  "The additional email": "בכתובת הדוא״ל הנוספת",
  "The project name": "בשם הפרויקט",
  "The organization": "בשם הארגון",
  "The website": "בכתובת האתר",
};

const SERVER_ERROR_PATTERNS_HE = [
  [/^An account can have at most (\d+) projects\. To add more, contact (\S+)\.$/,
    (limit, email) => "בחשבון אפשר ליצור עד " + limit + " פרויקטים. כדי להוסיף עוד, כתבו אל " + email + "."],
  [/^A project can have at most (\d+) keys\.$/, (limit) => "לפרויקט יכולים להיות עד " + limit + " מפתחות."],
  [/^You've asked for (\d+) links today\. Try again tomorrow, or contact (\S+)\.$/,
    (count, email) => "ביקשת היום " + count + " קישורים. נסו שוב מחר, או כתבו אל " + email + "."],
  [/^(.+) can be at most (\d+) characters\.$/,
    (field, max) => IN_FIELD_HE[field] && IN_FIELD_HE[field] + " אפשר להזין עד " + max + " תווים."],
  [/^(.+) must be text\.$/, (field) => IN_FIELD_HE[field] && "יש להזין טקסט " + IN_FIELD_HE[field] + "."],
];

/* A server error in the interface language. One without a translation stays in English. */
export const serverErrorText = (message) => {
  if (!message || Sefaria.interfaceLang !== "hebrew") { return message; }
  if (SERVER_ERRORS_HE[message]) { return SERVER_ERRORS_HE[message]; }
  for (const [pattern, translate] of SERVER_ERROR_PATTERNS_HE) {
    const match = message.match(pattern);
    const translated = match && translate(...match.slice(1));
    if (translated) { return translated; }
  }
  return message;
};

/* Rejects with the server's error message in the interface language, or an empty one, for the
   caller to show; the error carries the response status. */
const call = (method, path, body) => fetch(DEVELOPER_API_URL + path, {
  method,
  mode: "same-origin",
  credentials: "same-origin",
  headers: {"Content-Type": "application/json", "X-CSRFToken": getCsrfToken()},
  body: body === undefined ? undefined : JSON.stringify(body),
}).then(response => response.json().catch(() => ({})).then(data => {
  if (!response.ok) {
    const error = new Error(serverErrorText(data.error || ""));
    error.status = response.status;
    throw error;
  }
  return data;
}));

export const readState = () => call("GET", "state");
export const enableDeveloper = () => call("POST", "enable");
export const saveProfile = (profile) => call("POST", "profile", {profile});
export const sendConfirmation = () => call("POST", "confirmation");
export const cancelConfirmation = () => call("DELETE", "confirmation");
export const requestNewLink = (key) => call("POST", "confirmation/new-link", {key});
export const createProject = (project) => call("POST", "projects", {project});
export const updateProject = (projectId, project) => call("POST", "projects/" + projectId, {project});
export const deleteProject = (projectId) => call("DELETE", "projects/" + projectId);
export const createKey = (projectId, label) => call("POST", "projects/" + projectId + "/keys", {label});
export const setKeyRestriction = (keyId, restrictToWebsite) => call("POST", "keys/" + keyId, {restrictToWebsite});
export const deleteKey = (keyId) => call("DELETE", "keys/" + keyId);
export const claimListing = (listingId) => call("POST", "listings/" + listingId + "/claim");
export const dismissListing = (listingId) => call("POST", "listings/" + listingId + "/dismiss");
export const mockAction = (action, fields) => call("POST", "mock", {action, ...fields});

/* Developer settings need a verified email: Google or Apple sign-in verifies it, and so does
   the emailed confirmation link. */
export const accountVerified = (state) => !!state.ssoConnected || !!state.emailVerified;

export const confirmationLink = (key) => "/settings/developer/confirm-email/" + key;

/* The confirmation page sets this, so a settings tab in the same browser checks at once
   rather than at its next poll. */
export const CONFIRMATION_SIGNAL_KEY = "sefariaDeveloperEmailConfirmed";

export const websiteHost = (url) => {
  if (!url) { return ""; }
  try {
    return new URL(/^https?:\/\//.test(url) ? url : "https://" + url).host;
  } catch (e) {
    return url;
  }
};

/* The Origin header a browser sends from the website, which a restricted key must match. */
export const websiteOrigin = (url) => {
  if (!url) { return ""; }
  try {
    return new URL(/^https?:\/\//.test(url) ? url : "https://" + url).origin;
  } catch (e) {
    return "https://" + websiteHost(url);
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
