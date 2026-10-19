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

// eslint-disable-next-line import/first
import ResetExpiredView from '../ResetExpiredView.jsx';

let container = null;

const realFetch = global.fetch;
afterAll(() => { global.fetch = realFetch; });

function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(React.createElement(ResetExpiredView, {
      csrf: 'csrf-token',
      onResendSuccess: () => {},
      onRequestNewLink: () => {},
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

const resendButton = () => container.querySelector('.sefaria-auth-stack button');

async function clickResend() {
  await act(async () => {
    resendButton().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

describe('ResetExpiredView', () => {
  it('shows the expired heading and a single Request New Link action', () => {
    mount();
    expect(container.querySelector('.sefaria-auth-card-heading').textContent).toBe('auth.reset_link_expired_title');
    expect(resendButton().textContent).toBe('auth.request_new_link');
  });

  it('posts a resend action to the current reset-confirm URL with the CSRF token, then calls onResendSuccess', async () => {
    mockResponse(true);
    const onResendSuccess = jest.fn();
    mount({ onResendSuccess });
    await clickResend();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(window.location.pathname);
    expect(options.method).toBe('POST');
    expect(options.headers['X-CSRFToken']).toBe('csrf-token');
    expect(JSON.parse(options.body)).toEqual({ action: 'resend' });
    expect(onResendSuccess).toHaveBeenCalled();
  });

  // The link's uid resolves to no account, so a resend cannot work: the view swaps the
  // button for a banner whose link hands off to the manual-email flow.
  it('replaces the button with the no-account banner, whose link calls onRequestNewLink', async () => {
    mockResponse(false, { _auth: { code: 'no_account_for_link' } });
    const onRequestNewLink = jest.fn();
    const onResendSuccess = jest.fn();
    mount({ onRequestNewLink, onResendSuccess });
    await clickResend();

    expect(container.querySelector('.sefaria-auth-stack')).toBeNull();
    const banner = container.querySelector('.sefaria-auth-error[role="alert"]');
    expect(banner.textContent).toContain('auth.reset_link_no_account_sub');
    expect(onResendSuccess).not.toHaveBeenCalled();

    const link = banner.querySelector('a');
    expect(link.textContent).toBe('auth.request_new_link');
    act(() => { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onRequestNewLink).toHaveBeenCalled();
  });

  it('shows any other failure as the error banner and re-enables the button', async () => {
    mockResponse(false, {});
    const onResendSuccess = jest.fn();
    mount({ onResendSuccess });
    await clickResend();

    expect(container.querySelector('.sefaria-auth-error[role="alert"]').textContent).toBe('auth.generic_error');
    expect(resendButton().disabled).toBe(false);
    expect(onResendSuccess).not.toHaveBeenCalled();
  });

  it('shows the error banner when the request itself fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    mount();
    await clickResend();

    expect(container.querySelector('.sefaria-auth-error[role="alert"]').textContent).toBe('auth.generic_error');
    expect(resendButton().disabled).toBe(false);
  });
});
