/* Testing done using Jest */
// No React Testing Library in this repo — react-dom directly, same pattern as the
// other hook/component tests in this directory.
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import GoogleOneTap from '../GoogleOneTap.jsx';
import {
  fireFlowStarted, fireMethodChosen, fireProcessStarted, fireProcessEnded, fireFlowEnded,
  SIGNUP_METHOD,
} from '../signupAnalytics';
import { makeUuid } from '../utils';

jest.mock('../signupAnalytics', () => ({
  ...jest.requireActual('../signupAnalytics'),
  fireFlowStarted: jest.fn(),
  fireMethodChosen: jest.fn(),
  fireProcessStarted: jest.fn(),
  fireProcessEnded: jest.fn(),
  fireFlowEnded: jest.fn(),
}));

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  makeUuid: jest.fn(),
}));

let container = null;

function mount(props = { googleClientId: 'gid' }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { ReactDOM.render(React.createElement(GoogleOneTap, props), container); });
}

function unmount() {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  document.body.removeChild(container);
  container = null;
}

// Fires the 1200ms internal delay before GoogleOneTap.jsx calls initialize()/prompt() at all.
function flushInitialDelay() {
  act(() => { jest.advanceTimersByTime(1200); });
}

function getCredentialCallback() {
  return window.google.accounts.id.initialize.mock.calls[0][0].callback;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  sessionStorage.clear();
  let uuidCounter = 0;
  makeUuid.mockImplementation(() => `id-${++uuidCounter}`);
  window.google = { accounts: { id: { initialize: jest.fn(), prompt: jest.fn() } } };
});

afterEach(() => {
  if (container) unmount();
  delete global.fetch;
  jest.useRealTimers();
});

describe('handleCredential (fires on click — the credential callback — not on display)', () => {
  it('fires the flow_started/method_chosen/process_started burst synchronously, before the backend fetch resolves', () => {
    mount();
    flushInitialDelay();
    global.fetch = jest.fn(() => new Promise(() => {})); // never resolves within this test
    const credentialCallback = getCredentialCallback();

    act(() => { credentialCallback({ credential: 'tok' }); });

    expect(fireFlowStarted).toHaveBeenCalledWith('id-1', 'one_tap');
    expect(fireMethodChosen).toHaveBeenCalledWith('id-1', 'id-2', SIGNUP_METHOD.GOOGLE_ONE_TAP);
    expect(fireProcessStarted).toHaveBeenCalledWith('id-1', 'id-2');
    expect(fireProcessEnded).not.toHaveBeenCalled();
  });

  it('reports success once our backend confirms the token', async () => {
    mount();
    flushInitialDelay();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => null });
    const credentialCallback = getCredentialCallback();

    await act(async () => { await credentialCallback({ credential: 'tok' }); });

    expect(fireProcessEnded).toHaveBeenCalledWith('id-1', 'id-2', 'success', null);
    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'success', null);
  });

  it('reports failure with the backend-provided error when the backend rejects the token', async () => {
    mount();
    flushInitialDelay();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_token' }) });
    const credentialCallback = getCredentialCallback();

    await act(async () => { await credentialCallback({ credential: 'tok' }); });

    expect(fireProcessEnded).toHaveBeenCalledWith('id-1', 'id-2', 'failure', 'invalid_token');
    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'invalid_token');
  });

  it('reports a network_error failure when the fetch itself rejects', async () => {
    mount();
    flushInitialDelay();
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    const credentialCallback = getCredentialCallback();

    await act(async () => { await credentialCallback({ credential: 'tok' }); });

    expect(fireProcessEnded).toHaveBeenCalledWith('id-1', 'id-2', 'failure', 'network_error');
    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'network_error');
  });
});

describe('no engagement', () => {
  it('fires nothing at all if the credential callback is never invoked (dismissed, timed out, tapped outside, or never displayed)', () => {
    mount();
    flushInitialDelay();

    expect(fireFlowStarted).not.toHaveBeenCalled();
    expect(fireMethodChosen).not.toHaveBeenCalled();
    expect(fireProcessStarted).not.toHaveBeenCalled();
    expect(fireProcessEnded).not.toHaveBeenCalled();
    expect(fireFlowEnded).not.toHaveBeenCalled();
  });
});
