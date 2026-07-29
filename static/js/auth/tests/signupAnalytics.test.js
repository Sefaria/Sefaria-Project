/* Testing done using Jest */
import {
  SIGNUP_EVENT, SIGNUP_METHOD, SSO_REFERRER_ORIGIN,
  fireFlowStarted,
  persistPendingAttempt, persistActiveFlow, clearActiveFlow,
  resumePendingSignUpAttempt,
} from '../signupAnalytics.js';

// Private sessionStorage keys (not exported) — mirrored here as documented,
// stable constants, same as csrf.test.js does for the meta-tag name.
const PENDING_ATTEMPT_KEY = 'sefaria_pending_sso_attempt';
const ACTIVE_FLOW_KEY = 'sefaria_active_signup_flow';

jest.mock('../utils.js', () => ({
  ...jest.requireActual('../utils.js'),
  makeUuid: () => 'generated-uuid',
}));

function setReferrer(value) {
  Object.defineProperty(document, 'referrer', { value, configurable: true });
}

beforeEach(() => {
  sessionStorage.clear();
  window.gtag = jest.fn();
  setReferrer('');
});

afterEach(() => {
  delete window.gtag;
  jest.clearAllMocks();
});

describe('sendEvent (via fireFlowStarted)', () => {
  it('merges the shared defaults (project/feature_name/transport_type) with the call-specific params', () => {
    fireFlowStarted('flow-1', 'nav_bar');
    expect(window.gtag).toHaveBeenCalledWith('event', SIGNUP_EVENT.FLOW_STARTED, {
      project: 'site_registration',
      feature_name: 'site_registration_form',
      transport_type: 'beacon',
      flow_id: 'flow-1',
      source: 'nav_bar',
    });
  });

  it('is a no-op when window.gtag is not a function (e.g. blocked by an ad blocker)', () => {
    delete window.gtag;
    expect(() => fireFlowStarted('flow-1', 'nav_bar')).not.toThrow();
  });
});

describe('persistPendingAttempt / persistActiveFlow', () => {
  it('persistPendingAttempt stores flowId/attemptId/method under the pending-attempt key', () => {
    persistPendingAttempt({ flowId: 'flow-1', attemptId: 'attempt-1', method: SIGNUP_METHOD.APPLE });
    const stored = JSON.parse(sessionStorage.getItem(PENDING_ATTEMPT_KEY));
    expect(stored).toMatchObject({ flowId: 'flow-1', attemptId: 'attempt-1', method: SIGNUP_METHOD.APPLE });
    expect(typeof stored.ts).toBe('number');
  });

  it('persistActiveFlow stores flowId under the active-flow key; clearActiveFlow removes it', () => {
    persistActiveFlow({ flowId: 'flow-2' });
    expect(JSON.parse(sessionStorage.getItem(ACTIVE_FLOW_KEY))).toMatchObject({ flowId: 'flow-2' });

    clearActiveFlow();
    expect(sessionStorage.getItem(ACTIVE_FLOW_KEY)).toBeNull();
  });
});

describe('resumePendingSignUpAttempt', () => {
  it('a pending Apple attempt returning from appleid.apple.com resolves as success and clears both keys', () => {
    persistPendingAttempt({ flowId: 'flow-1', attemptId: 'attempt-1', method: SIGNUP_METHOD.APPLE });
    persistActiveFlow({ flowId: 'flow-1' }); // written by startFlow alongside the pending attempt
    setReferrer(`${SSO_REFERRER_ORIGIN.APPLE}/auth/authorize`);

    resumePendingSignUpAttempt();

    expect(window.gtag).toHaveBeenCalledWith('event', SIGNUP_EVENT.PROCESS_ENDED, expect.objectContaining({
      flow_id: 'flow-1', attempt_id: 'attempt-1', status: 'success', error: null,
    }));
    expect(window.gtag).toHaveBeenCalledWith('event', SIGNUP_EVENT.FLOW_ENDED, expect.objectContaining({
      flow_id: 'flow-1', status: 'success', error: null,
    }));
    expect(sessionStorage.getItem(PENDING_ATTEMPT_KEY)).toBeNull();
    expect(sessionStorage.getItem(ACTIVE_FLOW_KEY)).toBeNull();
  });

  it('a pending attempt returning from a non-provider referrer resolves as failure', () => {
    persistPendingAttempt({ flowId: 'flow-1', attemptId: 'attempt-1', method: SIGNUP_METHOD.APPLE });
    setReferrer('https://www.sefaria.org/some/other/page');

    resumePendingSignUpAttempt();

    expect(window.gtag).toHaveBeenCalledWith('event', SIGNUP_EVENT.FLOW_ENDED, expect.objectContaining({
      status: 'failure', error: 'unexpected_return_without_provider_referrer',
    }));
  });

  it('an expired pending attempt (older than the 10-minute window) is ignored', () => {
    const stale = { flowId: 'flow-1', attemptId: 'attempt-1', method: SIGNUP_METHOD.APPLE, ts: Date.now() - 11 * 60 * 1000 };
    sessionStorage.setItem(PENDING_ATTEMPT_KEY, JSON.stringify(stale));
    setReferrer(SSO_REFERRER_ORIGIN.APPLE);

    resumePendingSignUpAttempt();

    expect(window.gtag).not.toHaveBeenCalled();
  });

  it('no pending attempt but an active flow returning from accounts.google.com synthesizes the full burst', () => {
    persistActiveFlow({ flowId: 'flow-2' });
    setReferrer(`${SSO_REFERRER_ORIGIN.GOOGLE}/o/oauth2/...`);

    resumePendingSignUpAttempt();

    expect(window.gtag).toHaveBeenCalledWith('event', SIGNUP_EVENT.METHOD_CHOSEN, expect.objectContaining({
      flow_id: 'flow-2', attempt_id: 'generated-uuid', method: SIGNUP_METHOD.GOOGLE,
    }));
    expect(window.gtag).toHaveBeenCalledWith('event', SIGNUP_EVENT.PROCESS_STARTED, expect.objectContaining({
      flow_id: 'flow-2', attempt_id: 'generated-uuid',
    }));
    expect(window.gtag).toHaveBeenCalledWith('event', SIGNUP_EVENT.PROCESS_ENDED, expect.objectContaining({
      flow_id: 'flow-2', attempt_id: 'generated-uuid', status: 'success', error: null,
    }));
    expect(window.gtag).toHaveBeenCalledWith('event', SIGNUP_EVENT.FLOW_ENDED, expect.objectContaining({
      flow_id: 'flow-2', status: 'success', error: null,
    }));
    expect(sessionStorage.getItem(ACTIVE_FLOW_KEY)).toBeNull();
  });

  it('an active flow with no provider referrer is left alone (not yet resolved)', () => {
    persistActiveFlow({ flowId: 'flow-2' });
    setReferrer('https://www.sefaria.org/register');

    resumePendingSignUpAttempt();

    expect(window.gtag).not.toHaveBeenCalled();
    // Left in place for its own max-age expiry, not cleared prematurely.
    expect(sessionStorage.getItem(ACTIVE_FLOW_KEY)).not.toBeNull();
  });

  it('does nothing when neither a pending attempt nor an active flow is present', () => {
    resumePendingSignUpAttempt();
    expect(window.gtag).not.toHaveBeenCalled();
  });
});
