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

function notification({
  displayed = false, dismissed = false, dismissedReason, skipped = false, skippedReason,
  notDisplayed = false, notDisplayedReason,
}) {
  return {
    isDisplayed: () => displayed,
    isDismissedMoment: () => dismissed,
    getDismissedReason: () => dismissedReason,
    isSkippedMoment: () => skipped,
    getSkippedReason: () => skippedReason,
    isNotDisplayed: () => notDisplayed,
    getNotDisplayedReason: () => notDisplayedReason,
  };
}

describe('moment notifications', () => {
  it('a displayed moment fires the started/chosen/started burst', () => {
    mount();
    flushInitialDelay();
    const notify = window.google.accounts.id.prompt.mock.calls[0][0];

    act(() => { notify(notification({ displayed: true })); });

    expect(fireFlowStarted).toHaveBeenCalledWith('id-1', 'one_tap');
    expect(fireMethodChosen).toHaveBeenCalledWith('id-1', 'id-2', SIGNUP_METHOD.GOOGLE_ONE_TAP);
    expect(fireProcessStarted).toHaveBeenCalledWith('id-1', 'id-2');
  });

  it('a dismissal reason of credential_returned fires nothing (the credential path handles it)', () => {
    mount();
    flushInitialDelay();
    const notify = window.google.accounts.id.prompt.mock.calls[0][0];

    act(() => { notify(notification({ dismissed: true, dismissedReason: 'credential_returned' })); });

    expect(fireFlowEnded).not.toHaveBeenCalled();
  });

  it('a real user-cancel dismissal still fires failure', () => {
    mount();
    flushInitialDelay();
    const notify = window.google.accounts.id.prompt.mock.calls[0][0];

    act(() => { notify(notification({ dismissed: true, dismissedReason: 'user_cancel' })); });

    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'user_cancel');
  });

  it('a skipped moment uses getSkippedReason, not getDismissedReason', () => {
    mount();
    flushInitialDelay();
    const notify = window.google.accounts.id.prompt.mock.calls[0][0];

    act(() => {
      notify(notification({
        skipped: true, skippedReason: 'user_cancel', dismissedReason: 'should_not_be_used',
      }));
    });

    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'user_cancel');
  });

  it('the concluded guard still prevents a stray cancel notification from double-firing after a credential success already concluded it', async () => {
    mount();
    flushInitialDelay();
    const { callback } = window.google.accounts.id.initialize.mock.calls[0][0];
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => null });

    await act(async () => { await callback({ credential: 'tok' }); });
    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'success', null);
    fireFlowEnded.mockClear();

    const notify = window.google.accounts.id.prompt.mock.calls[0][0];
    act(() => { notify(notification({ dismissed: true, dismissedReason: 'user_cancel' })); });

    expect(fireFlowEnded).not.toHaveBeenCalled();
  });
});
