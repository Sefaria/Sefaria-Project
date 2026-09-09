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

// eslint-disable-next-line import/first
import ForgotView from '../ForgotView.jsx';

let container = null;

const realSefaria = global.Sefaria;
const realFetch = global.fetch;
beforeAll(() => { global.Sefaria = { _: (key) => key, interfaceLang: 'english' }; });
afterAll(() => { global.Sefaria = realSefaria; global.fetch = realFetch; });

function mount(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(React.createElement(ForgotView, {
      emailValue: 'sso-user@example.com',
      setField: () => () => {},
      csrf: 'csrf',
      onSuccess: () => {},
      onBack: () => {},
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

// Replies to /api/auth/password/reset the way sso/views.py does for an address that
// only ever signed in through a provider.
function mockSsoOnlyReset(providers) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: () => Promise.resolve({
      error: 'auth.sso_only_account',
      _auth: { code: 'sso_only_account', providers },
    }),
  });
}

async function submit() {
  const form = container.querySelector('#forgot-form');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

// The forgot-password banner's "Continue with Google/Apple" links were inert because
// AuthPage rendered ForgotView without the provider props every other view gets: Google's
// portaled button had no element to mount into, and Apple's onClick called an undefined
// trigger. Both links are the only way forward from this screen for an SSO-only account.
describe('ForgotView sso_only_account banner', () => {
  it('registers the banner Google link as the portal target for the real Google button', async () => {
    mockSsoOnlyReset(['google']);
    const registerGoogleTarget = jest.fn();
    mount({ registerGoogleTarget });
    await submit();

    const target = container.querySelector('.sefaria-auth-provider-action--google-target');
    expect(target).not.toBeNull();
    expect(registerGoogleTarget).toHaveBeenCalledWith(target);
  });

  it('fires triggerApple when the banner Apple link is clicked', async () => {
    mockSsoOnlyReset(['apple']);
    const triggerApple = jest.fn();
    mount({ triggerApple });
    await submit();

    const link = container.querySelector('a.sefaria-auth-provider-action');
    expect(link).not.toBeNull();
    act(() => { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(triggerApple).toHaveBeenCalled();
  });

  // An SSO popup can fail after the click that started it, so the failure has to surface
  // in whichever view is mounted — here, this one — rather than back on ChooseView.
  it('registers its own error handler while mounted, and clears it on unmount', () => {
    const setActiveErrorHandler = jest.fn();
    mount({ setActiveErrorHandler });
    expect(setActiveErrorHandler).toHaveBeenCalledWith(expect.any(Function));

    act(() => { ReactDOM.unmountComponentAtNode(container); });
    expect(setActiveErrorHandler).toHaveBeenLastCalledWith(null);
    document.body.removeChild(container);
    container = null;
  });
});
