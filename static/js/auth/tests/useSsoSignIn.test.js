/* Testing done using Jest */
// No React Testing Library in this repo — same hand-rolled ReactDOM+act() harness pattern
// as useSignUpTracking.test.js. `tracking` is a hand-built fake (not the real hook) since
// this file tests useSsoSignIn.jsx's own click/abandonment-detection logic in isolation.
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { useProviderTriggers } from '../useSsoSignIn.jsx';
import { persistPendingAttempt, SIGNUP_METHOD } from '../signupAnalytics.js';

jest.mock('../signupAnalytics.js', () => ({
  ...jest.requireActual('../signupAnalytics.js'),
  persistPendingAttempt: jest.fn(),
}));

let container = null;
let hookApi;
let tracking;

// Renders overlayNode too (not just calling the hook) — googleBtnRef only gets a real DOM
// node, which whenReady's check requires, if the ref actually mounts. overlayNode is now a
// portal into whatever's registered via registerGoogleTarget (see useSsoSignIn.jsx), so a
// target div is needed here too, standing in for the real "Continue with Google" element
// (ProviderButton.jsx's shell / ErrorBanner.jsx's span) — without it renderButton never fires.
// The target div and overlayNode are rendered as siblings, mirroring how AuthPage.jsx actually
// uses this hook (ProviderButton.jsx's shell and useSsoSignIn.jsx's overlayNode are separate
// JSX nodes) — nesting them here would make the DOM-placement assertions below pass trivially
// regardless of whether the portal targeting actually works.
function Harness(props) {
  const api = useProviderTriggers(props);
  hookApi = api;
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('div', { 'data-testid': 'google-target', ref: api.registerGoogleTarget }),
    api.overlayNode,
  );
}

function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { ReactDOM.render(React.createElement(Harness, { next: '/', tracking, ...props }), container); });
}

function unmount() {
  act(() => { ReactDOM.unmountComponentAtNode(container); });
  document.body.removeChild(container);
  container = null;
}

function getClickListener() {
  return window.google.accounts.id.renderButton.mock.calls[0][1].click_listener;
}

function getInitConfig() {
  return window.google.accounts.id.initialize.mock.calls[0][0];
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  global.Sefaria = {
    googleClientId: 'gid',
    appleClientId: null, // Apple's own effect no-ops; out of scope for these tests
    interfaceLang: 'english',
    _: (s) => s,
    ssoUseRedirect: jest.fn(() => false),
  };
  window.google = { accounts: { id: { initialize: jest.fn(), renderButton: jest.fn() } } };
  tracking = {
    chooseMethod: jest.fn(() => 'attempt-1'),
    startProcess: jest.fn(),
    endProcess: jest.fn(),
    getIds: jest.fn(() => ({ flowId: 'flow-1' })),
    suppressFlowEndRef: { current: false },
  };
});

afterEach(() => {
  if (container) unmount();
  delete global.fetch;
  jest.useRealTimers();
});

describe('click_listener wiring', () => {
  it('fires chooseMethod/startProcess synchronously on click, popup mode', () => {
    mount();
    const clickListener = getClickListener();

    act(() => { clickListener(); });

    expect(tracking.chooseMethod).toHaveBeenCalledWith(SIGNUP_METHOD.GOOGLE);
    expect(tracking.startProcess).toHaveBeenCalled();
    expect(persistPendingAttempt).not.toHaveBeenCalled();
    expect(tracking.suppressFlowEndRef.current).toBe(false);
  });

  it('persists a pending attempt and suppresses flow-end in redirect mode', () => {
    Sefaria.ssoUseRedirect.mockReturnValue(true);
    mount();
    const clickListener = getClickListener();

    act(() => { clickListener(); });

    expect(persistPendingAttempt).toHaveBeenCalledWith({
      flowId: 'flow-1', attemptId: 'attempt-1', method: SIGNUP_METHOD.GOOGLE,
    });
    expect(tracking.suppressFlowEndRef.current).toBe(true);
  });

  it('onGoogleResult does not re-fire chooseMethod/startProcess (the click already did)', async () => {
    mount();
    const clickListener = getClickListener();
    const config = getInitConfig();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    act(() => { clickListener(); });
    await act(async () => { await config.callback({ credential: 'tok' }); });

    expect(tracking.chooseMethod).toHaveBeenCalledTimes(1);
    expect(tracking.endProcess).toHaveBeenCalledWith('success', null);
  });
});

describe('popup abandonment detection', () => {
  it('reports popup_closed_by_user once focus returns and nothing ever resolved', () => {
    mount();
    const clickListener = getClickListener();

    act(() => { clickListener(); });
    act(() => { window.dispatchEvent(new Event('focus')); });
    act(() => { jest.advanceTimersByTime(1200); });

    expect(tracking.endProcess).toHaveBeenCalledWith('failure', 'popup_closed_by_user');
  });

  it('does not report failure while our own backend request is still genuinely in flight', () => {
    mount();
    const clickListener = getClickListener();
    const config = getInitConfig();
    global.fetch = jest.fn(() => new Promise(() => {})); // never resolves within this test

    act(() => { clickListener(); });
    act(() => { config.callback({ credential: 'tok' }); }); // flips state to 'processing'
    act(() => { window.dispatchEvent(new Event('focus')); });
    act(() => { jest.advanceTimersByTime(1200); });

    expect(tracking.endProcess).not.toHaveBeenCalled();
  });

  it('does not report a second failure once the attempt already resolved', async () => {
    mount();
    const clickListener = getClickListener();
    const config = getInitConfig();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    act(() => { clickListener(); });
    await act(async () => { await config.callback({ credential: 'tok' }); });
    tracking.endProcess.mockClear();

    act(() => { window.dispatchEvent(new Event('focus')); });
    act(() => { jest.advanceTimersByTime(1200); });

    expect(tracking.endProcess).not.toHaveBeenCalled();
  });

  it('a second click replaces the prior watch instead of stacking listeners', () => {
    mount();
    const clickListener = getClickListener();

    act(() => { clickListener(); });
    act(() => { clickListener(); }); // re-click before any focus event fires
    act(() => { window.dispatchEvent(new Event('focus')); });
    act(() => { jest.advanceTimersByTime(1200); });

    expect(tracking.endProcess).toHaveBeenCalledWith('failure', 'popup_closed_by_user');
    expect(tracking.endProcess).toHaveBeenCalledTimes(1);
  });

  it('unmounting clears the pending watch (no late fire after unmount)', () => {
    mount();
    const clickListener = getClickListener();

    act(() => { clickListener(); });
    unmount();
    act(() => { window.dispatchEvent(new Event('focus')); });
    act(() => { jest.advanceTimersByTime(1200); });

    expect(tracking.endProcess).not.toHaveBeenCalled();
  });
});

// WCAG 2.4.3 regression coverage: the real Google button must live in the DOM exactly where
// registerGoogleTarget currently points, not at some fixed page location — otherwise tab order
// stops matching what's visually on screen (see useSsoSignIn.jsx's module doc for why).
describe('Google button DOM placement', () => {
  it('portals the real button inside the currently registered target', () => {
    mount();
    const target = container.querySelector('[data-testid="google-target"]');
    const overlay = container.querySelector('.sefaria-provider-sdk-overlay');

    expect(overlay).not.toBeNull();
    expect(target.contains(overlay)).toBe(true);
  });

  it('moves the button when the registered target changes', () => {
    mount();
    const otherTarget = document.createElement('div');
    container.appendChild(otherTarget);

    act(() => { hookApi.registerGoogleTarget(otherTarget); });

    const overlay = container.querySelector('.sefaria-provider-sdk-overlay');
    expect(overlay).not.toBeNull();
    expect(otherTarget.contains(overlay)).toBe(true);
  });

  it('renders nothing left dangling in the DOM when no target is registered', () => {
    mount();
    act(() => { hookApi.registerGoogleTarget(null); });

    expect(container.querySelector('.sefaria-provider-sdk-overlay')).toBeNull();
  });
});
