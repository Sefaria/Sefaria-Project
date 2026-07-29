/* Testing done using Jest */
// No React Testing Library in this repo — react-dom/test-utils ships with the
// react-dom dependency already installed, so a tiny harness component is
// enough to invoke the hook without adding a new dependency.
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { useSignUpTracking } from '../useSignUpTracking.js';
import {
  persistActiveFlow, clearActiveFlow,
  fireFlowStarted, fireMethodChosen, fireProcessStarted, fireProcessEnded, fireFlowEnded,
} from '../signupAnalytics.js';
import { makeUuid } from '../utils.js';

jest.mock('../signupAnalytics.js', () => ({
  persistActiveFlow: jest.fn(),
  clearActiveFlow: jest.fn(),
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
  hookApi = useSignUpTracking(props);
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
  it('mounting with flow="register" persists and fires flow_started', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    expect(persistActiveFlow).toHaveBeenCalledWith({ flowId: 'id-1' });
    expect(fireFlowStarted).toHaveBeenCalledWith('id-1', 'nav_bar');
    expect(hookApi.getIds()).toEqual({ flowId: 'id-1' });
  });

  it('mounting with a non-register flow starts nothing', () => {
    mount({ flow: 'login', source: 'nav_bar' });
    expect(fireFlowStarted).not.toHaveBeenCalled();
    expect(persistActiveFlow).not.toHaveBeenCalled();
  });
});

describe('chooseMethod / startProcess / endProcess', () => {
  it('threads the same flowId and attemptId through every event', () => {
    mount({ flow: 'register', source: 'nav_bar' });

    const attemptId = hookApi.chooseMethod('email');
    expect(fireMethodChosen).toHaveBeenCalledWith('id-1', attemptId, 'email');

    hookApi.startProcess();
    expect(fireProcessStarted).toHaveBeenCalledWith('id-1', attemptId);

    hookApi.endProcess('success', null);
    expect(fireProcessEnded).toHaveBeenCalledWith('id-1', attemptId, 'success', null);
  });

  it('choosing a new method while a previous attempt is still open ends the old one as abandoned_for_new_attempt', () => {
    mount({ flow: 'register', source: 'nav_bar' });

    const firstAttemptId = hookApi.chooseMethod('email');
    hookApi.startProcess();
    fireProcessEnded.mockClear();

    const secondAttemptId = hookApi.chooseMethod('google');

    expect(fireProcessEnded).toHaveBeenCalledWith('id-1', firstAttemptId, 'failure', 'abandoned_for_new_attempt');
    expect(fireMethodChosen).toHaveBeenLastCalledWith('id-1', secondAttemptId, 'google');
    expect(secondAttemptId).not.toBe(firstAttemptId);
  });

  it('endProcess is a no-op once an attempt is already ended (does not fire twice)', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    hookApi.chooseMethod('email');
    hookApi.endProcess('success', null);
    fireProcessEnded.mockClear();

    hookApi.endProcess('failure', 'network_error');

    expect(fireProcessEnded).not.toHaveBeenCalled();
  });
});

describe('endFlow status/error derivation', () => {
  it('leaving with no method ever chosen reports failure / no_attempt', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    rerender({ flow: 'login', source: 'nav_bar' }); // flow-transition effect calls endFlow
    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'no_attempt');
    expect(clearActiveFlow).toHaveBeenCalled();
  });

  it('an attempt started but never ended is reported as failure / left_page', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    const attemptId = hookApi.chooseMethod('email');
    hookApi.startProcess();

    unmount(); // no beforeunload/popstate fired — only the unmount-cleanup effect

    expect(fireProcessEnded).toHaveBeenCalledWith('id-1', attemptId, 'failure', 'left_page');
    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'left_page');
  });

  it('an attempt explicitly ended as success is reported as-is, not overwritten', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    hookApi.chooseMethod('email');
    hookApi.startProcess();
    hookApi.endProcess('success', null);

    rerender({ flow: 'login', source: 'nav_bar' });

    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'success', null);
  });

  it('is idempotent: leaving the flow then unmounting does not fire flow_ended twice', () => {
    mount({ flow: 'register', source: 'nav_bar' });
    rerender({ flow: 'login', source: 'nav_bar' });
    expect(fireFlowEnded).toHaveBeenCalledTimes(1);

    unmount();

    expect(fireFlowEnded).toHaveBeenCalledTimes(1);
  });
});

describe('popstate', () => {
  it('concludes the flow while on the register flow (never suppressed, unlike beforeunload)', () => {
    mount({ flow: 'register', source: 'nav_bar' });

    act(() => { window.dispatchEvent(new Event('popstate')); });

    expect(fireFlowEnded).toHaveBeenCalledWith('id-1', 'failure', 'no_attempt');
  });

  it('does nothing outside the register flow (no listener attached)', () => {
    mount({ flow: 'login', source: 'nav_bar' });

    act(() => { window.dispatchEvent(new Event('popstate')); });

    expect(fireFlowEnded).not.toHaveBeenCalled();
  });
});
