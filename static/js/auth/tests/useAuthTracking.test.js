/* Testing done using Jest */
// No React Testing Library in this repo — react-dom/test-utils ships with the
// react-dom dependency already installed, so a tiny harness component is
// enough to invoke the hook without adding a new dependency.
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { useAuthTracking } from '../useAuthTracking.js';
import {
  persistActiveFlow, clearActiveFlow, clearPendingAttempt,
  fireFlowStarted, fireMethodChosen, fireProcessStarted, fireProcessEnded, fireFlowEnded,
} from '../authAnalytics.js';
import { makeUuid } from '../utils.js';

jest.mock('../authAnalytics.js', () => ({
  persistActiveFlow: jest.fn(),
  clearActiveFlow: jest.fn(),
  clearPendingAttempt: jest.fn(),
  fireFlowStarted: jest.fn(),
  fireMethodChosen: jest.fn(),
  fireProcessStarted: jest.fn(),
  fireProcessEnded: jest.fn(),
  fireFlowEnded: jest.fn(),
}));

jest.mock('../utils.js', () => ({ makeUuid: jest.fn() }));

let container = null;
let hookApi;

function Harness(props) {
  hookApi = useAuthTracking(props);
  return null;
}

function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { ReactDOM.render(React.createElement(Harness, props), container); });
}

function rerender(props) {
  act(() => { ReactDOM.render(React.createElement(Harness, props), container); });
}

function unmount() {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  document.body.removeChild(container);
  container = null;
}

beforeEach(() => {
  jest.clearAllMocks();
  let uuidCounter = 0;
  makeUuid.mockImplementation(() => `id-${++uuidCounter}`);
});

afterEach(() => {
  if (container) unmount();
});

describe('flow start/no-start', () => {
  it('mounting with flow="register" persists and fires flow_started with flow_intent registration', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    expect(persistActiveFlow).toHaveBeenCalledWith({ flowId: 'id-1' });
    expect(fireFlowStarted).toHaveBeenCalledWith('id-1', 'nav_bar', 'registration');
    expect(hookApi.getIds()).toEqual({ flowId: 'id-1' });
  });

  it('mounting with flow="login" persists and fires flow_started with flow_intent login', () => {
    mount({ flow: 'login', source: 'nav_bar' });
    expect(persistActiveFlow).toHaveBeenCalledWith({ flowId: 'id-1' });
    expect(fireFlowStarted).toHaveBeenCalledWith('id-1', 'nav_bar', 'login');
    expect(hookApi.getIds()).toEqual({ flowId: 'id-1' });
  });

  it('mounting with flow="reset" starts nothing', () => {
    mount({ flow: 'reset', source: 'nav_bar' });
    expect(fireFlowStarted).not.toHaveBeenCalled();
    expect(persistActiveFlow).not.toHaveBeenCalled();
  });
});

describe('direct register<->login transitions', () => {
  it('a direct transition from register to login ends the old flow and starts a brand new one', () => {
    mount({ flow: 'register', source: 'nav_bar' });

    rerender({ flow: 'login', source: 'nav_bar' });

    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'no_attempt', null);
    expect(fireFlowStarted).toHaveBeenCalledWith('id-2', 'nav_bar', 'login');
    expect(hookApi.getIds()).toEqual({ flowId: 'id-2' });
  });

  it('a direct transition from login to register ends the old flow and starts a brand new one', () => {
    mount({ flow: 'login', source: 'nav_bar' });

    rerender({ flow: 'register', source: 'nav_bar' });

    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'no_attempt', null);
    expect(fireFlowStarted).toHaveBeenCalledWith('id-2', 'nav_bar', 'registration');
    expect(hookApi.getIds()).toEqual({ flowId: 'id-2' });
  });
});

describe('chooseMethod / startProcess / endProcess', () => {
  it('threads the same flowId and attemptId, plus outcome, through every event', () => {
    mount({ flow: 'register', source: 'nav_bar' });

    const attemptId = hookApi.chooseMethod('email');
    expect(fireMethodChosen).toHaveBeenCalledWith('id-1', attemptId, 'email');

    hookApi.startProcess();
    expect(fireProcessStarted).toHaveBeenCalledWith('id-1', attemptId);

    hookApi.endProcess('success', null, 'created_new_account');
    expect(fireProcessEnded).toHaveBeenCalledWith('id-1', attemptId, 'success', null, 'created_new_account');
  });

  it('choosing a new method while a previous attempt is still open ends the old one as abandoned_for_new_attempt', () => {
    mount({ flow: 'register', source: 'nav_bar' });

    const firstAttemptId = hookApi.chooseMethod('email');
    hookApi.startProcess();
    fireProcessEnded.mockClear();

    const secondAttemptId = hookApi.chooseMethod('google');

    expect(fireProcessEnded).toHaveBeenCalledWith('id-1', firstAttemptId, 'failure', 'abandoned_for_new_attempt', null);
    expect(fireMethodChosen).toHaveBeenLastCalledWith('id-1', secondAttemptId, 'google');
    expect(secondAttemptId).not.toBe(firstAttemptId);
  });

  it('endProcess is a no-op once an attempt is already ended (does not fire twice)', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    hookApi.chooseMethod('email');
    hookApi.endProcess('success', null, 'created_new_account');
    fireProcessEnded.mockClear();

    hookApi.endProcess('failure', 'network_error');

    expect(fireProcessEnded).not.toHaveBeenCalled();
  });
});

describe('endFlow status/error/outcome derivation', () => {
  it('leaving the tracked scope entirely with no method ever chosen reports failure / no_attempt / null outcome', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    rerender({ flow: 'reset', source: 'nav_bar' }); // flow-transition effect calls endFlow, reset stays untracked
    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'no_attempt', null);
    expect(clearActiveFlow).toHaveBeenCalled();
    // any dangling redirect marker for this flow is moot once it's concluded by any means —
    // left in place, a later unrelated page load could pick it up and double-report it
    expect(clearPendingAttempt).toHaveBeenCalled();
  });

  it('an attempt started but never ended is reported as failure / left_page / null outcome', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    const attemptId = hookApi.chooseMethod('email');
    hookApi.startProcess();

    unmount(); // no beforeunload/popstate fired — only the unmount-cleanup effect

    expect(fireProcessEnded).toHaveBeenCalledWith('id-1', attemptId, 'failure', 'left_page', null);
    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'left_page', null);
  });

  it('an attempt explicitly ended as success carries its outcome through, not overwritten', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    hookApi.chooseMethod('email');
    hookApi.startProcess();
    hookApi.endProcess('success', null, 'created_new_account');

    rerender({ flow: 'reset', source: 'nav_bar' });

    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'success', null, 'created_new_account');
  });

  it('is idempotent: leaving the tracked scope then unmounting does not fire flow_ended twice', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    rerender({ flow: 'reset', source: 'nav_bar' });
    expect(fireFlowEnded).toHaveBeenCalledTimes(1);

    unmount();

    expect(fireFlowEnded).toHaveBeenCalledTimes(1);
  });
});

describe('popstate', () => {
  it('concludes the flow while on the register flow (never suppressed, unlike beforeunload)', () => {
    mount({ flow: 'register', source: 'nav_bar' });

    act(() => { window.dispatchEvent(new Event('popstate')); });

    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'no_attempt', null);
  });

  it('concludes the flow while on the login flow too', () => {
    mount({ flow: 'login', source: 'nav_bar' });

    act(() => { window.dispatchEvent(new Event('popstate')); });

    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'no_attempt', null);
  });

  it('does nothing outside a tracked flow (reset)', () => {
    mount({ flow: 'reset', source: 'nav_bar' });

    act(() => { window.dispatchEvent(new Event('popstate')); });

    expect(fireFlowEnded).not.toHaveBeenCalled();
  });
});

function pageShowEvent(persisted) {
  const evt = new Event('pageshow');
  Object.defineProperty(evt, 'persisted', { value: persisted });
  return evt;
}

describe('pageshow (bfcache restore)', () => {
  it('persisted:false is a no-op', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    hookApi.chooseMethod('google');
    hookApi.startProcess();

    act(() => { window.dispatchEvent(pageShowEvent(false)); });

    expect(fireProcessEnded).not.toHaveBeenCalled();
    expect(fireFlowEnded).not.toHaveBeenCalled();
  });

  it('persisted:true ends an in-flight attempt as back_navigation, then re-arms a fresh flow', () => {
    mount({ flow: 'register', source: 'nav_bar' }); // startFlow consumes 'id-1' as the flowId
    const attemptId = hookApi.chooseMethod('google'); // chooseMethod consumes 'id-2' as the attemptId
    hookApi.startProcess();

    act(() => { window.dispatchEvent(pageShowEvent(true)); });

    expect(fireProcessEnded).toHaveBeenCalledWith('id-1', attemptId, 'failure', 'back_navigation', null);
    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'back_navigation', null);
    // still on /register — a fresh flow is re-armed under a new id ('id-3': the re-arm's
    // startFlow is the third makeUuid() call overall, after the initial flowId and the attemptId)
    expect(fireFlowStarted).toHaveBeenCalledWith('id-3', 'nav_bar', 'registration');
    expect(hookApi.getIds()).toEqual({ flowId: 'id-3' });
  });

  it('persisted:true with no attempt in progress still concludes and restarts cleanly', () => {
    mount({ flow: 'register', source: 'nav_bar' });

    act(() => { window.dispatchEvent(pageShowEvent(true)); });

    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'no_attempt', null);
    expect(fireFlowStarted).toHaveBeenCalledWith('id-2', 'nav_bar', 'registration');
  });

  it('re-arms a fresh flow on the login flow too', () => {
    mount({ flow: 'login', source: 'nav_bar' });

    act(() => { window.dispatchEvent(pageShowEvent(true)); });

    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'no_attempt', null);
    expect(fireFlowStarted).toHaveBeenCalledWith('id-2', 'nav_bar', 'login');
  });

  it('bypasses suppressFlowEndRef (unlike beforeunload)', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    hookApi.suppressFlowEndRef.current = true; // simulates a redirect in flight

    act(() => { window.dispatchEvent(pageShowEvent(true)); });

    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'no_attempt', null);
  });

  it('does nothing outside a tracked flow (reset)', () => {
    mount({ flow: 'reset', source: 'nav_bar' });

    act(() => { window.dispatchEvent(pageShowEvent(true)); });

    expect(fireFlowEnded).not.toHaveBeenCalled();
  });
});

describe('suppressFlowEndRef reset', () => {
  it('a fresh startFlow (re-entering register) resets a stale suppression back to false', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    hookApi.suppressFlowEndRef.current = true;

    rerender({ flow: 'reset', source: 'nav_bar' });
    rerender({ flow: 'register', source: 'nav_bar' }); // re-triggers startFlow

    expect(hookApi.suppressFlowEndRef.current).toBe(false);
  });
});
