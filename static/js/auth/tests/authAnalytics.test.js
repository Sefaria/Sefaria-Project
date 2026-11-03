/* Testing done using Jest */
import {
  AUTH_EVENT, AUTH_METHOD, SSO_REFERRER_ORIGIN,
  fireFlowStarted,
  persistPendingAttempt, persistActiveFlow, clearActiveFlow, clearPendingAttempt,
  resumePendingAuthAttempt,
} from '../authAnalytics.js';

// Private sessionStorage keys (not exported) — mirrored here as documented,
// stable constants, same as csrf.test.js does for the meta-tag name.
const PENDING_ATTEMPT_KEY = 'sefaria_pending_sso_attempt';
const ACTIVE_FLOW_KEY = 'sefaria_active_auth_flow';
// Private cookie name (not exported), set server-side by
// sefaria.system.middleware.ClearSsoNextCookieMiddleware for redirect-mode SSO outcomes.
const OUTCOME_COOKIE = 'sefaria_sso_outcome';

jest.mock('../utils.js', () => ({
  ...jest.requireActual('../utils.js'),
  makeUuid: () => 'generated-uuid',
}));

function setReferrer(value) {
  Object.defineProperty(document, 'referrer', { value, configurable: true });
}

// Real document.cookie enforces the Secure attribute (requires https), which jsdom's test
// origin (http://localhost) never satisfies — a real Secure write silently no-ops. The
// production code always sets Secure (matching the existing sefaria_sso_next cookie
// convention), so a plain in-memory jar stands in here, ignoring attribute semantics
// entirely and just modeling "a cookie with this name/value is present or isn't."
function mockCookieJar() {
  let store = {};
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => Object.entries(store).map(([k, v]) => `${k}=${v}`).join('; '),
    set: (str) => {
      const [pair] = str.split(';');
      const eq = pair.indexOf('=');
      const key = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1);
      if (value === '') delete store[key];
      else store[key] = value;
    },
  });
}

beforeEach(() => {
  sessionStorage.clear();
  window.gtag = jest.fn();
  setReferrer('');
  mockCookieJar();
});

afterEach(() => {
  delete window.gtag;
  jest.clearAllMocks();
});

describe('sendEvent (via fireFlowStarted)', () => {
  it('merges the shared defaults (project/feature_name/transport_type) with the call-specific params', () => {
    fireFlowStarted('flow-1', 'nav_bar', 'registration');
    expect(window.gtag).toHaveBeenCalledWith('event', AUTH_EVENT.FLOW_STARTED, {
      project: 'site_registration',
      feature_name: 'site_registration_form',
      transport_type: 'beacon',
      flow_id: 'flow-1',
      source: 'nav_bar',
      flow_intent: 'registration',
    });
  });

  it('is a no-op when window.gtag is not a function (e.g. blocked by an ad blocker)', () => {
    delete window.gtag;
    expect(() => fireFlowStarted('flow-1', 'nav_bar', 'registration')).not.toThrow();
  });
});

describe('persistPendingAttempt / persistActiveFlow', () => {
  it('persistPendingAttempt stores flowId/attemptId/method under the pending-attempt key', () => {
    persistPendingAttempt({ flowId: 'flow-1', attemptId: 'attempt-1', method: AUTH_METHOD.APPLE });
    const stored = JSON.parse(sessionStorage.getItem(PENDING_ATTEMPT_KEY));
    expect(stored).toMatchObject({ flowId: 'flow-1', attemptId: 'attempt-1', method: AUTH_METHOD.APPLE });
    expect(typeof stored.ts).toBe('number');
  });

  it('persistActiveFlow stores flowId under the active-flow key; clearActiveFlow removes it', () => {
    persistActiveFlow({ flowId: 'flow-2' });
    expect(JSON.parse(sessionStorage.getItem(ACTIVE_FLOW_KEY))).toMatchObject({ flowId: 'flow-2' });

    clearActiveFlow();
    expect(sessionStorage.getItem(ACTIVE_FLOW_KEY)).toBeNull();
  });
});

describe('clearPendingAttempt', () => {
  it('removes a stored pending attempt', () => {
    persistPendingAttempt({ flowId: 'flow-1', attemptId: 'attempt-1', method: AUTH_METHOD.GOOGLE });
    expect(sessionStorage.getItem(PENDING_ATTEMPT_KEY)).not.toBeNull();

    clearPendingAttempt();

    expect(sessionStorage.getItem(PENDING_ATTEMPT_KEY)).toBeNull();
  });

  it('is a safe no-op when nothing is stored', () => {
    expect(() => clearPendingAttempt()).not.toThrow();
    expect(sessionStorage.getItem(PENDING_ATTEMPT_KEY)).toBeNull();
  });
});

describe('resumePendingAuthAttempt', () => {
  it('a pending Apple attempt returning from appleid.apple.com resolves as success and clears both keys', () => {
    persistPendingAttempt({ flowId: 'flow-1', attemptId: 'attempt-1', method: AUTH_METHOD.APPLE });
    persistActiveFlow({ flowId: 'flow-1' }); // written by startFlow alongside the pending attempt
    setReferrer(`${SSO_REFERRER_ORIGIN.APPLE}/auth/authorize`);

    resumePendingAuthAttempt();

    expect(window.gtag).toHaveBeenCalledWith('event', AUTH_EVENT.PROCESS_ENDED, expect.objectContaining({
      flow_id: 'flow-1', attempt_id: 'attempt-1', status: 'success', error: null, outcome: null,
    }));
    expect(window.gtag).toHaveBeenCalledWith('event', AUTH_EVENT.FLOW_ENDED, expect.objectContaining({
      flow_id: 'flow-1', status: 'success', error: null, outcome: null,
    }));
    expect(sessionStorage.getItem(PENDING_ATTEMPT_KEY)).toBeNull();
    expect(sessionStorage.getItem(ACTIVE_FLOW_KEY)).toBeNull();
  });

  it('a pending attempt returning from a provider with an outcome cookie present threads it through and clears the cookie', () => {
    persistPendingAttempt({ flowId: 'flow-1', attemptId: 'attempt-1', method: AUTH_METHOD.APPLE });
    setReferrer(`${SSO_REFERRER_ORIGIN.APPLE}/auth/authorize`);
    document.cookie = `${OUTCOME_COOKIE}=created_new_account`;

    resumePendingAuthAttempt();

    expect(window.gtag).toHaveBeenCalledWith('event', AUTH_EVENT.PROCESS_ENDED, expect.objectContaining({
      outcome: 'created_new_account',
    }));
    expect(window.gtag).toHaveBeenCalledWith('event', AUTH_EVENT.FLOW_ENDED, expect.objectContaining({
      outcome: 'created_new_account',
    }));
    expect(document.cookie).not.toContain(OUTCOME_COOKIE);
  });

  it('a pending attempt returning from a non-provider referrer resolves as failure', () => {
    persistPendingAttempt({ flowId: 'flow-1', attemptId: 'attempt-1', method: AUTH_METHOD.APPLE });
    setReferrer('https://www.sefaria.org/some/other/page');

    resumePendingAuthAttempt();

    expect(window.gtag).toHaveBeenCalledWith('event', AUTH_EVENT.FLOW_ENDED, expect.objectContaining({
      status: 'failure', error: 'unexpected_return_without_provider_referrer', outcome: null,
    }));
  });

  it('an expired pending attempt (older than the 10-minute window) is ignored', () => {
    const stale = { flowId: 'flow-1', attemptId: 'attempt-1', method: AUTH_METHOD.APPLE, ts: Date.now() - 11 * 60 * 1000 };
    sessionStorage.setItem(PENDING_ATTEMPT_KEY, JSON.stringify(stale));
    setReferrer(SSO_REFERRER_ORIGIN.APPLE);

    resumePendingAuthAttempt();

    expect(window.gtag).not.toHaveBeenCalled();
  });

  it('no pending attempt but an active flow returning from accounts.google.com synthesizes the full burst', () => {
    persistActiveFlow({ flowId: 'flow-2' });
    setReferrer(`${SSO_REFERRER_ORIGIN.GOOGLE}/o/oauth2/...`);
    document.cookie = `${OUTCOME_COOKIE}=existing_user_login`;

    resumePendingAuthAttempt();

    expect(window.gtag).toHaveBeenCalledWith('event', AUTH_EVENT.METHOD_CHOSEN, expect.objectContaining({
      flow_id: 'flow-2', attempt_id: 'generated-uuid', method: AUTH_METHOD.GOOGLE,
    }));
    expect(window.gtag).toHaveBeenCalledWith('event', AUTH_EVENT.PROCESS_STARTED, expect.objectContaining({
      flow_id: 'flow-2', attempt_id: 'generated-uuid',
    }));
    expect(window.gtag).toHaveBeenCalledWith('event', AUTH_EVENT.PROCESS_ENDED, expect.objectContaining({
      flow_id: 'flow-2', attempt_id: 'generated-uuid', status: 'success', error: null, outcome: 'existing_user_login',
    }));
    expect(window.gtag).toHaveBeenCalledWith('event', AUTH_EVENT.FLOW_ENDED, expect.objectContaining({
      flow_id: 'flow-2', status: 'success', error: null, outcome: 'existing_user_login',
    }));
    expect(sessionStorage.getItem(ACTIVE_FLOW_KEY)).toBeNull();
    expect(document.cookie).not.toContain(OUTCOME_COOKIE);
  });

  it('an active flow with no provider referrer is left alone (not yet resolved)', () => {
    persistActiveFlow({ flowId: 'flow-2' });
    setReferrer('https://www.sefaria.org/register');

    resumePendingAuthAttempt();

    expect(window.gtag).not.toHaveBeenCalled();
    // Left in place for its own max-age expiry, not cleared prematurely.
    expect(sessionStorage.getItem(ACTIVE_FLOW_KEY)).not.toBeNull();
  });

  it('does nothing when neither a pending attempt nor an active flow is present', () => {
    resumePendingAuthAttempt();
    expect(window.gtag).not.toHaveBeenCalled();
  });
});
