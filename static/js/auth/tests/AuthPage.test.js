/* Testing done using Jest */
// No React Testing Library in this repo — same ReactDOM+act() harness as the other tests here.
// AuthPage's own view switching and tracking run for real; its card views are stubs that just
// say which one is showing, and the analytics calls are faked.
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import AuthPage from '../AuthPage.jsx';
import { fireFlowStarted, fireMethodChosen, fireProcessStarted } from '../authAnalytics.js';

// Jest only lets mock factories use outer names that start with "mock", and hoists the
// jest.mock calls above this file's code, so this has to be a (hoisted) function declaration.
function mockView(name) {
  return () => require('react').createElement('div', { 'data-view': name });
}
jest.mock('../ChooseView.jsx', () => mockView('choose'));
jest.mock('../RegisterView.jsx', () => mockView('register-email'));
jest.mock('../LoginView.jsx', () => mockView('login-email'));
jest.mock('../ForgotView.jsx', () => mockView('forgot'));
jest.mock('../ResetView.jsx', () => mockView('reset'));
jest.mock(
  '../ResetExpiredView.jsx',
  () =>
    ({ onResendSuccess }) =>
      require('react').createElement('button', { 'data-view': 'reset-expired', onClick: onResendSuccess })
);
jest.mock(
  '../MessageView.jsx',
  () =>
    ({ heading, sub }) =>
      require('react').createElement('div', { 'data-view': 'message', 'data-heading': heading, 'data-sub': sub })
);
jest.mock('../../common/Button.jsx', () => () => null);
jest.mock('../../Misc.jsx', () => ({ InterfaceText: ({ children }) => children }));
jest.mock('../../sefaria/csrf', () => ({ getCsrfToken: () => 'csrf' }));
jest.mock('../useSsoSignIn.jsx', () => ({
  useProviderTriggers: () => ({ overlayNode: null, registerGoogleTarget: () => {}, setActiveErrorHandler: () => {} }),
}));

jest.mock('../authAnalytics.js', () => ({
  ...jest.requireActual('../authAnalytics.js'),
  persistActiveFlow: jest.fn(),
  clearActiveFlow: jest.fn(),
  clearPendingAttempt: jest.fn(),
  fireFlowStarted: jest.fn(),
  fireMethodChosen: jest.fn(),
  fireProcessStarted: jest.fn(),
  fireProcessEnded: jest.fn(),
  fireFlowEnded: jest.fn(),
}));

let container = null;

function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(React.createElement(AuthPage, props), container);
  });
}

const shownView = () => container.querySelector('[data-view]').getAttribute('data-view');

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => {
    ReactDOM.unmountComponentAtNode(container);
  });
  document.body.removeChild(container);
  container = null;
});

describe('AuthPage initialView', () => {
  it('opens on the choose card by default', () => {
    mount({ initialPath: '/register', authSource: 'nav_bar' });

    expect(shownView()).toBe('choose');
    expect(fireMethodChosen).not.toHaveBeenCalled();
  });

  it('"email" on sign-up opens the email form, reported as choosing email on the sign-up card', () => {
    mount({ initialPath: '/register?next=%2Ftexts', authSource: 'rate_limit_login_button', initialView: 'email' });

    expect(shownView()).toBe('register-email');
    expect(fireFlowStarted).toHaveBeenCalledWith(expect.any(String), 'rate_limit_login_button', 'registration');
    const [flowId] = fireFlowStarted.mock.calls[0];
    expect(fireMethodChosen).toHaveBeenCalledWith(flowId, expect.any(String), 'email');
    expect(fireProcessStarted).toHaveBeenCalledWith(flowId, expect.any(String));
    expect(fireFlowStarted.mock.invocationCallOrder[0]).toBeLessThan(fireMethodChosen.mock.invocationCallOrder[0]);
  });
});

describe('AuthPage expired reset link', () => {
  // The server mails a new link only when the link genuinely expired, and answers 200 either way, so the card shown
  // after "Request New Link" must not be the "Reset Link Sent / check your email" card.
  it('after Request New Link, says a link was requested without promising an email', () => {
    mount({ initialPath: '/password/reset/confirm/MTI/abc-123/', resetValid: false });
    expect(shownView()).toBe('reset-expired');

    act(() => {
      container.querySelector('[data-view="reset-expired"]').click();
    });

    const card = container.querySelector('[data-view]');
    expect(card.getAttribute('data-view')).toBe('message');
    expect(card.getAttribute('data-heading')).toBe('auth.new_link_requested_title');
    expect(card.getAttribute('data-sub')).toBe('auth.new_link_requested_sub');
  });
});
