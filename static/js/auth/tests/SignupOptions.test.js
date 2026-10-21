/* Testing done using Jest */
// No React Testing Library in this repo — same ReactDOM+act() harness as the other tests here.
// The real useAuthTracking and useProviderTriggers run; only the analytics calls, the Google/
// Apple SDKs and IntersectionObserver are faked.
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import SignupOptions from '../SignupOptions.jsx';
import {
  fireFlowStarted, fireMethodChosen, fireProcessStarted, fireProcessEnded,
} from '../authAnalytics.js';

// Misc.jsx transitively imports a .css file, which this repo's Jest setup has no transform for.
// Only InterfaceText is reached from this tree, and it just renders text.
jest.mock('../../Misc.jsx', () => ({
  InterfaceText: ({ children }) => children,
}));

jest.mock('../authAnalytics.js', () => ({
  ...jest.requireActual('../authAnalytics.js'),
  persistActiveFlow: jest.fn(),
  clearActiveFlow: jest.fn(),
  clearPendingAttempt: jest.fn(),
  persistPendingAttempt: jest.fn(),
  fireFlowStarted: jest.fn(),
  fireMethodChosen: jest.fn(),
  fireProcessStarted: jest.fn(),
  fireProcessEnded: jest.fn(),
  fireFlowEnded: jest.fn(),
}));

jest.mock('../../sefaria/sefaria', () => ({
  __esModule: true,
  default: {
    googleClientId: 'gid',
    appleClientId: 'aid',
    interfaceLang: 'english',
    _: (s) => s,
    ssoUseRedirect: jest.fn(() => false),
  },
}));

const SOURCE = 'rate_limit_login_button';
let container = null;
let onEmailClick;
let observers;

// IntersectionObserver isn't in jsdom: record each observer so a test can say when the
// Google circle comes into view (the prompt opening).
class FakeIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    observers.push(this);
  }
  observe(el) { this.targets.push(el); }
  unobserve() {}
  disconnect() { this.targets = []; }
}

function setVisible(visible) {
  act(() => {
    observers.forEach((o) => o.callback(o.targets.map((target) => ({ target, isIntersecting: visible }))));
  });
}

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(
      React.createElement(SignupOptions, { source: SOURCE, next: '/texts', onEmailClick }),
      container,
    );
  });
  // Let whenReady see the (already present) SDKs.
  act(() => { jest.runOnlyPendingTimers(); });
}

function unmount() {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  document.body.removeChild(container);
  container = null;
}

const button = (name) => container.querySelector(`button[aria-label="${name}"]`);
const googleCircle = () => container.querySelector('[data-provider="google"]');
const googleClickListener = () => window.google.accounts.id.renderButton.mock.calls[0][1].click_listener;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  observers = [];
  window.IntersectionObserver = FakeIntersectionObserver;
  onEmailClick = jest.fn();
  window.google = { accounts: { id: { initialize: jest.fn(), renderButton: jest.fn() } } };
  window.AppleID = { auth: { init: jest.fn(), signIn: jest.fn(() => Promise.resolve()) } };
});

afterEach(() => {
  if (container) unmount();
  delete window.IntersectionObserver;
  delete window.google;
  delete window.AppleID;
  jest.useRealTimers();
});

describe('SignupOptions', () => {
  it('shows Google, Apple and Email as sign-up options', () => {
    mount();

    expect(googleCircle()).not.toBeNull();
    expect(button('auth.continue_with_apple')).not.toBeNull();
    expect(button('auth.continue_with_email')).not.toBeNull();
  });

  it('reports nothing until an option is clicked', () => {
    mount();
    setVisible(true);
    unmount();

    expect(fireFlowStarted).not.toHaveBeenCalled();
    expect(fireMethodChosen).not.toHaveBeenCalled();
  });

  it('Email hands over to the host, which opens the sign-up form', () => {
    mount();

    act(() => { button('auth.continue_with_email').click(); });

    expect(onEmailClick).toHaveBeenCalledTimes(1);
    // AuthPage reports the email sign-up itself, so the options report nothing.
    expect(fireFlowStarted).not.toHaveBeenCalled();
  });

  it('Apple starts Apple sign-up, reported as a sign-up from this source', () => {
    mount();

    act(() => { button('auth.continue_with_apple').click(); });

    expect(window.AppleID.auth.signIn).toHaveBeenCalled();
    expect(fireFlowStarted).toHaveBeenCalledWith(expect.any(String), SOURCE, 'registration');
    const [flowId] = fireFlowStarted.mock.calls[0];
    expect(fireMethodChosen).toHaveBeenCalledWith(flowId, expect.any(String), 'apple');
    expect(fireProcessStarted).toHaveBeenCalledWith(flowId, expect.any(String));
  });

  it("puts Google's own button over the Google circle once the circle is in view", () => {
    mount();
    expect(window.google.accounts.id.renderButton).not.toHaveBeenCalled();

    setVisible(true);
    act(() => { jest.runOnlyPendingTimers(); });

    expect(window.google.accounts.id.renderButton).toHaveBeenCalled();
    const renderedInto = window.google.accounts.id.renderButton.mock.calls[0][0];
    expect(googleCircle().contains(renderedInto)).toBe(true);
  });

  it("a click on Google's button is reported as a Google sign-up from this source", () => {
    mount();
    setVisible(true);
    act(() => { jest.runOnlyPendingTimers(); });

    act(() => { googleClickListener()(); });

    expect(fireFlowStarted).toHaveBeenCalledWith(expect.any(String), SOURCE, 'registration');
    const [flowId] = fireFlowStarted.mock.calls[0];
    expect(fireMethodChosen).toHaveBeenCalledWith(flowId, expect.any(String), 'google');
  });

  it('a failed sign-in shows an error with the options', () => {
    mount();
    act(() => { button('auth.continue_with_apple').click(); });

    act(() => {
      document.dispatchEvent(new CustomEvent('AppleIDSignInOnFailure', { detail: { error: 'invalid_request' } }));
    });

    expect(fireProcessEnded).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'failure', 'invalid_request', null);
    expect(container.querySelector('[role="alert"]').textContent).toBe('auth.generic_error');
  });
});
