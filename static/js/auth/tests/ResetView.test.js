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
// Nothing in this test depends on the submit button's markup — the form is submitted directly.
jest.mock('../../common/Button.jsx', () => ({ children, ...rest }) => (
  require('react').createElement('button', { type: 'submit', ...rest }, children)
));

jest.mock('../../sefaria/sefaria', () => ({
  __esModule: true,
  default: { _: (key) => key, interfaceLang: 'english' },
}));

// eslint-disable-next-line import/first
import ResetView from '../ResetView.jsx';

let container = null;

const realFetch = global.fetch;
afterAll(() => { global.fetch = realFetch; });

function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(React.createElement(ResetView, {
      csrf: 'csrf-token',
      onLinkExpired: () => {},
      onSuccess: () => {},
      ...props,
    }), container);
  });
}

afterEach(() => {
  if (container) {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    document.body.removeChild(container);
    container = null;
  }
});

function mockResponse(ok, data = {}) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: () => Promise.resolve(data) });
}

// Controlled <input>s need the native setter for React to see the change.
function fill(name, value) {
  const input = container.querySelector(`input[name="${name}"]`);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit(password1, password2) {
  fill('new_password1', password1);
  fill('new_password2', password2);
  await act(async () => {
    container.querySelector('#reset-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

const errorFor = (name) => container.querySelector(`#${name}-error`)?.textContent;

describe('ResetView client-side validation', () => {
  it('flags mismatched passwords on the confirm field without calling the server', async () => {
    global.fetch = jest.fn();
    mount();
    await submit('Xk7mQ9zLp2!', 'something-else');
    expect(errorFor('new_password2')).toBe('auth.passwords_dont_match');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requires the confirm field', async () => {
    global.fetch = jest.fn();
    mount();
    await submit('Xk7mQ9zLp2!', '');
    expect(errorFor('new_password2')).toBe('auth.required_field');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('ResetView submit', () => {
  it('posts both passwords to the current reset-confirm URL with the CSRF token, then calls onSuccess', async () => {
    mockResponse(true);
    const onSuccess = jest.fn();
    mount({ onSuccess });
    await submit('Xk7mQ9zLp2!', 'Xk7mQ9zLp2!');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(window.location.pathname);
    expect(options.method).toBe('POST');
    expect(options.headers['X-CSRFToken']).toBe('csrf-token');
    expect(JSON.parse(options.body)).toEqual({ new_password1: 'Xk7mQ9zLp2!', new_password2: 'Xk7mQ9zLp2!' });
    expect(onSuccess).toHaveBeenCalled();
  });

  it('calls onLinkExpired when the server says the link is no longer valid', async () => {
    mockResponse(false, { _auth: { code: 'invalid_reset_link' } });
    const onLinkExpired = jest.fn();
    const onSuccess = jest.fn();
    mount({ onLinkExpired, onSuccess });
    await submit('Xk7mQ9zLp2!', 'Xk7mQ9zLp2!');

    expect(onLinkExpired).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows the server password-policy error under the new-password field', async () => {
    mockResponse(false, { new_password1: 'auth.password_too_common' });
    mount();
    await submit('password', 'password');

    expect(errorFor('new_password1')).toBe('auth.password_too_common');
    expect(errorFor('new_password2')).toBeUndefined();
  });

  it('shows any other failure as the error banner and lets the form be submitted again', async () => {
    mockResponse(false, {});
    mount();
    await submit('Xk7mQ9zLp2!', 'Xk7mQ9zLp2!');

    expect(container.querySelector('.sefaria-auth-error[role="alert"]').textContent).toBe('auth.generic_error');
    expect(container.querySelector('#reset-form button').disabled).toBe(false);
  });
});
