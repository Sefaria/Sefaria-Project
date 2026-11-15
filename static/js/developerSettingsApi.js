/*
 * The developer settings API. Every call returns the account's whole developer state, as
 * powered_by.developer.developer_state builds it, so the page renders straight from the response.
 */

import { getCsrfToken } from './sefaria/csrf';

export const DEVELOPER_API_URL = '/api/developer/';
export const MAX_DESCRIPTION_LENGTH = 150;

export const emptyState = () => ({
  developerEnabled: false,
  ssoConnected: false,
  emailVerified: false,
  confirmationSentAt: null,
  profile: null,
  projects: [],
  maxKeysPerProject: 5,
});

/* Rejects with the server's error message as sent (English), or an empty one; the error carries the response status.
   The page never shows it as is: SettingsPage maps the few a person can run into to its own copy, in either language,
   and shows a general message for the rest (Penina, 2026-11-15). */
const call = (method, path, body) =>
  fetch(DEVELOPER_API_URL + path, {
    method,
    mode: 'same-origin',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((response) =>
    response
      .json()
      .catch(() => ({}))
      .then((data) => {
        if (!response.ok) {
          const error = new Error(data.error || '');
          error.status = response.status;
          throw error;
        }
        return data;
      })
  );

export const readState = () => call('GET', 'state');
export const enableDeveloper = () => call('POST', 'enable');
export const saveProfile = (profile) => call('POST', 'profile', { profile });
export const sendConfirmation = () => call('POST', 'confirmation');
export const requestNewLink = (key) => call('POST', 'confirmation/new-link', { key });
export const createProject = (project) => call('POST', 'projects', { project });
export const updateProject = (projectId, project) => call('POST', 'projects/' + projectId, { project });
export const deleteProject = (projectId) => call('DELETE', 'projects/' + projectId);
export const createKey = (projectId, label) => call('POST', 'projects/' + projectId + '/keys', { label });
export const setKeyRestriction = (keyId, restrictToWebsite) => call('POST', 'keys/' + keyId, { restrictToWebsite });
/* The one request that returns a key's value: when its owner clicks Reveal or Copy. Resolves to the value. */
export const revealKey = (keyId) => call('POST', 'keys/' + keyId + '/value').then((data) => data.value);
export const deleteKey = (keyId) => call('DELETE', 'keys/' + keyId);

/* Developer settings need a verified email: Google or Apple sign-in verifies it, and so does
   the emailed confirmation link. */
export const accountVerified = (state) => !!state.ssoConnected || !!state.emailVerified;

/* The confirmation page sets this, so a settings tab in the same browser checks at once
   rather than at its next poll. */
export const CONFIRMATION_SIGNAL_KEY = 'sefariaDeveloperEmailConfirmed';

export const websiteHost = (url) => {
  if (!url) {
    return '';
  }
  try {
    return new URL(/^https?:\/\//.test(url) ? url : 'https://' + url).host;
  } catch (e) {
    return url;
  }
};

/* The Origin header a browser sends from the website, which a restricted key must match. */
export const websiteOrigin = (url) => {
  if (!url) {
    return '';
  }
  try {
    return new URL(/^https?:\/\//.test(url) ? url : 'https://' + url).origin;
  } catch (e) {
    return 'https://' + websiteHost(url);
  }
};

const WEBSITE_HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i;

/* A project website as typed: a bare domain gets https://, and anything that isn't an
   http(s) address on a dotted host name is invalid. Empty is valid: the field is optional. */
export const parseWebsite = (input) => {
  const raw = (input || '').trim();
  if (!raw) {
    return { valid: true, url: '' };
  }
  if (/\s/.test(raw)) {
    return { valid: false, url: raw };
  }
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw;
  try {
    const parsed = new URL(url);
    const valid = /^https?:$/.test(parsed.protocol) && WEBSITE_HOST.test(parsed.hostname);
    return { valid, url: valid ? url : raw };
  } catch (e) {
    return { valid: false, url: raw };
  }
};
