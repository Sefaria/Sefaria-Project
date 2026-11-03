/* Testing done using Jest */
// No React Testing Library in this repo — react-dom directly, same pattern as the
// other hook/component tests in this directory.
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';

// Misc.jsx transitively imports a .css file, which this repo's Jest setup has no
// transform for. Only InterfaceText is reached from this tree, and it just renders text.
jest.mock('../../Misc.jsx', () => ({
  InterfaceText: ({ children }) => children,
}));

// Button.jsx imports sefaria/util, which boots the whole Sefaria singleton on import.
jest.mock('../../common/Button.jsx', () => ({ children, ...rest }) => (
  require('react').createElement('button', { type: 'submit', ...rest }, children)
));

jest.mock('../../sefaria/sefaria', () => ({
  __esModule: true,
  default: { _: (key) => key, interfaceLang: 'english' },
}));

// SSO and analytics have their own suites; AuthPage only needs their return shapes.
jest.mock('../useSsoSignIn.jsx', () => ({
  useProviderTriggers: () => ({
    googleReady: false,
    appleReady: false,
    ssoLoading: false,
    overlayNode: null,
    registerGoogleTarget: () => {},
    setActiveErrorHandler: () => {},
    triggerApple: () => {},
  }),
}));
jest.mock('../useAuthTracking.js', () => ({
  useAuthTracking: () => ({ chooseMethod: () => {}, startProcess: () => {}, endProcess: () => {} }),
}));
jest.mock('../../sefaria/csrf', () => ({ getCsrfToken: () => 'csrf' }));

// eslint-disable-next-line import/first
import AuthPage from '../AuthPage.jsx';

const RESET_PATH = '/password/reset/confirm/bogus-uid/bogus-token/';

let container = null;

const realFetch = global.fetch;
afterAll(() => { global.fetch = realFetch; });

// ReaderApp owns the auth path: AuthPage only asks to navigate, and the new path comes back
// down as `initialPath`. Mirror that, or the card would still think it is in the reset flow.
function Host({ initialPath, onNavigate, ...props }) {
  const [path, setPath] = React.useState(initialPath);
  return React.createElement(AuthPage, {
    ...props,
    initialPath: path,
    onNavigate: (...args) => { setPath(args[0]); onNavigate?.(...args); },
  });
}

function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(React.createElement(Host, { initialPath: '/login', ...props }), container);
  });
}

afterEach(() => {
  if (container) {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    document.body.removeChild(container);
    container = null;
  }
});

const heading = () => container.querySelector('.sefaria-auth-card-heading')?.textContent;

function findByText(selector, text) {
  return Array.from(container.querySelectorAll(selector)).find((el) => el.textContent === text);
}

function click(el) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}

async function submit(formId) {
  const form = container.querySelector(formId);
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

function mockResponse(ok, data = {}) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: () => Promise.resolve(data) });
}

// Controlled <input>s need the native setter for React to see the change.
function fillPassword(name, value) {
  const input = container.querySelector(`input[name="${name}"]`);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submitNewPassword() {
  fillPassword('new_password1', 'Xk7mQ9zLp2!');
  fillPassword('new_password2', 'Xk7mQ9zLp2!');
  await submit('#reset-form');
}

describe('AuthPage forgot-password flow', () => {
  it('lands on ChooseView at /login', () => {
    mount();
    expect(heading()).toBe('header.log_in');
    expect(findByText('button', 'auth.continue_with_email')).toBeDefined();
  });

  // "Reset Link Sent" was a dead end: a message with no action, so the only way out was the
  // browser's back button. It now offers the same Log In button the reset-success card has.
  it('offers a way back to sign in on Reset Link Sent, reached from the login flow', async () => {
    mockResponse(true);
    const onNavigate = jest.fn();
    mount({ onNavigate });
    click(findByText('button', 'auth.continue_with_email'));
    click(findByText('a.sefaria-input-trailingLink', 'auth.forgot_password'));
    expect(heading()).toBe('auth.forgot_password');

    await submit('#forgot-form');
    expect(heading()).toBe('auth.reset_link_sent');
    const logIn = findByText('button', 'auth.log_in_link');
    expect(logIn).toBeDefined();

    click(logIn);
    expect(heading()).toBe('header.log_in');
    expect(findByText('button', 'auth.continue_with_email')).toBeDefined();
    expect(onNavigate).toHaveBeenCalledWith('/login', undefined);
  });
});

describe('AuthPage reset-confirm flow', () => {
  it('shows the expired-link view when the server reports the link invalid', () => {
    mount({ initialPath: RESET_PATH, resetValid: false });
    expect(heading()).toBe('auth.reset_link_expired_title');
    expect(findByText('button', 'auth.request_new_link')).toBeDefined();
  });

  it('shows the new-password form for a valid link', () => {
    mount({ initialPath: RESET_PATH, resetValid: true });
    expect(heading()).toBe('auth.reset_password');
    expect(container.querySelector('#reset-form')).not.toBeNull();
  });

  it('shows the success state after a reset, and its Log In button returns to sign in', async () => {
    mockResponse(true);
    const onNavigate = jest.fn();
    mount({ initialPath: RESET_PATH, resetValid: true, onNavigate });
    await submitNewPassword();
    expect(heading()).toBe('auth.password_reset_success_title');

    click(findByText('button', 'auth.log_in_link'));
    expect(heading()).toBe('header.log_in');
    expect(onNavigate).toHaveBeenCalledWith('/login', undefined);
  });

  it('switches to the expired-link view when the link turns out invalid on submit', async () => {
    mockResponse(false, { _auth: { code: 'invalid_reset_link' } });
    mount({ initialPath: RESET_PATH, resetValid: true });
    await submitNewPassword();
    expect(heading()).toBe('auth.reset_link_expired_title');
  });

  // Reached from the reset flow rather than the login flow: the URL is still the
  // reset-confirm one, so leaving has to go through onNavigate to /login.
  it('offers a way back to sign in on Reset Link Sent, reached by resending an expired link', async () => {
    mockResponse(true);
    const onNavigate = jest.fn();
    mount({ initialPath: RESET_PATH, resetValid: false, onNavigate });
    await act(async () => { click(findByText('button', 'auth.request_new_link')); });
    expect(heading()).toBe('auth.reset_link_sent');

    click(findByText('button', 'auth.log_in_link'));
    expect(heading()).toBe('header.log_in');
    expect(onNavigate).toHaveBeenCalledWith('/login', undefined);
  });

  it('shows the no-account banner, whose link asks to leave the reset-confirm URL for /login', async () => {
    mockResponse(false, { _auth: { code: 'no_account_for_link' } });
    const onNavigate = jest.fn();
    mount({ initialPath: RESET_PATH, resetValid: false, onNavigate });
    await act(async () => { click(findByText('button', 'auth.request_new_link')); });
    expect(container.querySelector('.sefaria-auth-error').textContent).toContain('auth.reset_link_no_account_sub');

    click(container.querySelector('.sefaria-auth-error a'));
    expect(onNavigate).toHaveBeenCalledWith('/login');
  });

  // requestNewLink moves from the reset-confirm URL to /login. That reset -> login flow change
  // re-runs AuthPage's flow effect, which must not override the ForgotView the banner asked for.
  it('lands on the manual forgot-password form after the no-account banner link', async () => {
    mockResponse(false, { _auth: { code: 'no_account_for_link' } });
    mount({ initialPath: RESET_PATH, resetValid: false });
    await act(async () => { click(findByText('button', 'auth.request_new_link')); });

    click(container.querySelector('.sefaria-auth-error a'));
    expect(heading()).toBe('auth.forgot_password');
    expect(container.querySelector('#forgot-form')).not.toBeNull();
  });
});
