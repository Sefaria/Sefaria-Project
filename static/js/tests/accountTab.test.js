/**
 * The Account tab of SettingsPage: saving, email change and Google Drive disconnect.
 * Expectations follow the behaviour of the Django account settings template it replaced.
 */

jest.mock('../sefaria/sefaria', () => {
  const sefaria = {
    interfaceLang: 'english',
    full_name: 'Tova Levi',
    _email: 'tova@example.org',
    _: (k) => k,
    track: { event: jest.fn(), setInterfaceLanguage: jest.fn() },
  };
  sefaria._v = (options) => options[sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'];
  return { __esModule: true, default: sefaria };
});

jest.mock('../sefaria/sefariaJquery', () => ({
  __esModule: true,
  default: { cookie: jest.fn(), post: jest.fn(), get: jest.fn() },
}));

jest.mock('../Misc', () => {
  const Sefaria = require('../sefaria/sefaria').default;
  return {
    __esModule: true,
    InterfaceText: ({ text, children }) => (text ? text[Sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'] : (children ?? null)),
  };
});

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import $ from '../sefaria/sefariaJquery';
import Sefaria from '../sefaria/sefaria';
import SettingsPage from '../SettingsPage.jsx';

const SETTINGS = {
  emailNotifications: 'daily',
  interfaceLanguage: 'english',
  translationLanguagePreference: 'en',
  translationLanguages: [{ code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' }],
  readingHistory: true,
  textualCustom: 'ashkenazi',
  libraryAssistantEnabled: true,
  email: 'tova@example.org',
  socialProviders: [],
  sheetsExport: { gauthEmail: null },
  torahSpecific: true,
  diaspora: true,
};

let container = null;
let settingsUpdated = null;
let originalLocation = null;

function mount(settings = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(
      <SettingsPage
        tab="account"
        projectId={null}
        accountSettings={{ ...SETTINGS, ...settings }}
        initialDeveloper={null}
        setTab={() => {}}
        setProjectId={() => {}}
      />,
      container,
    );
  });
}

const option = (sectionId, value) => container.querySelector(`#${sectionId} .toggleOption[data-value="${value}"]`);
const choose = (sectionId, value) => act(() => { option(sectionId, value).click(); });
const saveButton = () => container.querySelector('.saveAccountSettingsBtn');

/* $.post and $.get are captured; answer() runs the success callback of the latest call. */
const lastPost = () => {
  const [url, data, callback] = $.post.mock.calls[$.post.mock.calls.length - 1];
  return { url, payload: JSON.parse(data.json), callback };
};
const save = (response = { status: 'ok' }) => {
  act(() => { saveButton().click(); });
  const post = lastPost();
  act(() => { post.callback(response); });
  return post;
};

const typeInto = (input, value) => {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  Sefaria.interfaceLang = 'english';
  $.cookie.mockClear();
  $.post.mockClear();
  $.get.mockClear();
  Sefaria.track.event.mockClear();
  Sefaria.track.setInterfaceLanguage.mockClear();
  window.alert = jest.fn();
  originalLocation = window.location;
  delete window.location;
  window.location = { reload: jest.fn(), href: 'http://localhost/settings/account' };
  settingsUpdated = jest.fn();
  document.addEventListener('sefaria:settings-updated', settingsUpdated);
});

afterEach(() => {
  document.removeEventListener('sefaria:settings-updated', settingsUpdated);
  window.location = originalLocation;
  if (!container) { return; }
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  container = null;
});

describe('Account tab save', () => {
  it('posts the profile settings form-encoded to /api/profile, as the old template did', () => {
    mount();
    choose('emailNotifications', 'weekly');
    act(() => { saveButton().click(); });
    const { url, payload } = lastPost();
    expect(url).toBe('/api/profile');
    expect(payload).toEqual({
      settings: {
        email_notifications: 'weekly',
        interface_language: 'english',
        textual_custom: 'ashkenazi',
        reading_history: true,
        translation_language_preference: 'en',
        translation_language_preference_suggested: true,
      },
    });
  });

  it('leaves library_assistant out when the toggle was not changed', () => {
    mount();
    const { payload } = save();
    expect(payload.settings).not.toHaveProperty('library_assistant');
  });

  it('leaves library_assistant out when the toggle was changed and changed back', () => {
    mount();
    choose('libraryAssistantSetting', 'false');
    choose('libraryAssistantSetting', 'true');
    const { payload } = save();
    expect(payload.settings).not.toHaveProperty('library_assistant');
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('sends library_assistant as a boolean when it was changed, then reloads', () => {
    mount();
    choose('libraryAssistantSetting', 'false');
    const { payload } = save();
    expect(payload.settings.library_assistant).toBe(false);
    expect(window.alert).toHaveBeenCalledWith('Settings Saved');
    expect(window.location.reload).toHaveBeenCalledTimes(1);
    expect(settingsUpdated).not.toHaveBeenCalled();
  });

  it('turns the Library Assistant on for a user who had it off', () => {
    mount({ libraryAssistantEnabled: false });
    choose('libraryAssistantSetting', 'true');
    const { payload } = save();
    expect(payload.settings.library_assistant).toBe(true);
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('sets the translation preference cookies before posting', () => {
    mount();
    choose('translationLanguagePreference', 'es');
    act(() => { saveButton().click(); });
    expect($.cookie).toHaveBeenCalledWith('translation_language_preference', 'es', { path: '/' });
    expect($.cookie).toHaveBeenCalledWith('translation_language_preference_suggested', '1', { path: '/' });
    const cookieOrder = $.cookie.mock.invocationCallOrder[0];
    expect(cookieOrder).toBeLessThan($.post.mock.invocationCallOrder[0]);
  });

  it('tracks and reloads on an interface language change, without the settings event', () => {
    mount();
    choose('siteLanguage', 'hebrew');
    const { payload } = save();
    expect(payload.settings.interface_language).toBe('hebrew');
    expect(Sefaria.track.setInterfaceLanguage).toHaveBeenCalledWith('interface language account settings', 'hebrew');
    expect(window.location.reload).toHaveBeenCalledTimes(1);
    expect(settingsUpdated).not.toHaveBeenCalled();
  });

  it('confirms, tracks and announces a save that needs no reload', () => {
    mount();
    choose('emailNotifications', 'weekly');
    save();
    expect(window.alert).toHaveBeenCalledWith('Settings Saved');
    expect(Sefaria.track.event).toHaveBeenCalledWith('Settings', 'Settings Save', 'weekly');
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(settingsUpdated).toHaveBeenCalledTimes(1);
    expect(settingsUpdated.mock.calls[0][0].detail).toEqual({ translationLanguagePreference: 'en', readingHistory: true });
  });

  it('tracks a changed translation preference and passes it in the settings event', () => {
    mount();
    choose('translationLanguagePreference', 'es');
    save();
    expect(Sefaria.track.event).toHaveBeenCalledWith('Reader', 'Set Translation Language Preference', 'es');
    expect(settingsUpdated.mock.calls[0][0].detail.translationLanguagePreference).toBe('es');
  });

  it('adds the textual custom and diaspora to the settings event only when the custom changed', () => {
    mount();
    choose('textualCustom', 'sephardi');
    save();
    expect(settingsUpdated.mock.calls[0][0].detail).toMatchObject({ textualCustom: 'sephardi', diaspora: '1' });
    save();
    expect(settingsUpdated.mock.calls[1][0].detail).not.toHaveProperty('textualCustom');
  });

  it('sends diaspora "0" for an Israel user', () => {
    mount({ diaspora: false });
    choose('textualCustom', 'sephardi');
    save();
    expect(settingsUpdated.mock.calls[0][0].detail.diaspora).toBe('0');
  });

  it('turning reading history off warns and posts false', () => {
    mount();
    choose('readingHistory', 'false');
    const warning = container.querySelector('#reading-history-warning');
    expect(warning.classList.contains('on')).toBe(true);
    expect(warning.textContent).toContain('permanently delete your reading history');
    const { payload } = save();
    expect(payload.settings.reading_history).toBe(false);
    expect(settingsUpdated.mock.calls[0][0].detail.readingHistory).toBe(false);
  });

  it('shows the server error and does nothing else when the save is refused', () => {
    mount();
    choose('libraryAssistantSetting', 'false');
    save({ error: 'Something broke' });
    expect(window.alert).toHaveBeenCalledWith('Something broke');
    expect(window.alert).not.toHaveBeenCalledWith('Settings Saved');
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(settingsUpdated).not.toHaveBeenCalled();
  });

  it('has a Save button at the top and the bottom, both saving', () => {
    mount();
    const buttons = container.querySelectorAll('.saveAccountSettingsBtn');
    expect(buttons.length).toBe(2);
    act(() => { buttons[1].click(); });
    expect($.post).toHaveBeenCalledTimes(1);
  });

  it('omits the Torah-specific settings where the site is not Torah-specific', () => {
    mount({ torahSpecific: false });
    expect(container.querySelector('#siteLanguage')).toBeNull();
    expect(container.querySelector('#readingHistory')).toBeNull();
    expect(container.querySelector('#textualCustom')).toBeNull();
    expect(container.querySelector('#translationLanguagePreference')).toBeNull();
    const { payload } = save();
    expect(payload.settings).not.toHaveProperty('interface_language');
    expect(payload.settings).not.toHaveProperty('textual_custom');
    expect(payload.settings).not.toHaveProperty('translation_language_preference');
  });
});

describe('Account tab toggles', () => {
  it('render as radio groups with one checked, tabbable option', () => {
    mount();
    const group = container.querySelector('#emailNotifications [role="radiogroup"]');
    const radios = Array.from(group.querySelectorAll('[role="radio"]'));
    expect(radios.map(r => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(radios.map(r => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it('move to and pick the next or previous option with the arrow keys', () => {
    mount();
    const keyUp = (el, keyCode) => act(() => { el.dispatchEvent(new KeyboardEvent('keyup', { keyCode, bubbles: true })); });
    keyUp(option('emailNotifications', 'daily'), 39);
    expect(option('emailNotifications', 'weekly').getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(option('emailNotifications', 'weekly'));
    keyUp(option('emailNotifications', 'weekly'), 37);
    expect(option('emailNotifications', 'daily').getAttribute('aria-checked')).toBe('true');
  });
});

describe('Account tab email change', () => {
  const openEmailEdit = () => {
    mount();
    act(() => { container.querySelector('#change-email').click(); });
    typeInto(container.querySelector('#username-change-edit #email'), 'new@example.org');
    typeInto(container.querySelector('#username-change-edit #confirmEmail'), 'new@example.org');
    typeInto(container.querySelector('#username-change-edit #confirmPassword'), 'secret');
  };
  const update = (response) => {
    act(() => { container.querySelector('#update-email').click(); });
    const post = lastPost();
    act(() => { post.callback(response); });
    return post;
  };

  it('opens the edit form in place of the display', () => {
    mount();
    expect(container.querySelector('#username-change-edit').style.display).toBe('none');
    act(() => { container.querySelector('#change-email').click(); });
    expect(container.querySelector('#username-change-display').style.display).toBe('none');
    expect(container.querySelector('#username-change-edit').style.display).toBe('');
  });

  it('posts the three fields to /settings/account/user', () => {
    openEmailEdit();
    const { url, payload } = update({ status: 'ok' });
    expect(url).toBe('/settings/account/user');
    expect(payload).toEqual({ email: 'new@example.org', confirmEmail: 'new@example.org', confirmPassword: 'secret' });
  });

  it('shows the server error and keeps the form open', () => {
    openEmailEdit();
    update({ error: 'Incorrect account password for this account' });
    expect(container.querySelector('#email-edit-errors').textContent).toBe('Incorrect account password for this account');
    expect(container.querySelector('#username-change-edit').style.display).toBe('');
    expect(container.querySelector('#email-display').value).toBe('tova@example.org');
  });

  it('shows the new address and a success message after a change', () => {
    openEmailEdit();
    update({ status: 'ok' });
    expect(container.querySelector('#email-display').value).toBe('new@example.org');
    const ok = container.querySelector('#email-edit-ok');
    expect(ok.style.display).toBe('');
    expect(ok.textContent).toBe('Email was successfully changed!');
    expect(container.querySelector('#username-change-edit').style.display).toBe('none');
    expect(container.querySelector('#username-change-display').style.display).toBe('');
  });

  it('shows the sign-in provider instead of Change Email for a social account', () => {
    mount({ socialProviders: ['google'] });
    expect(container.querySelector('#change-email')).toBeNull();
    expect(container.querySelector('#username-change').textContent).toContain('Google Sign-In with');
    expect(container.querySelector('#username-change').textContent).toContain('tova@example.org');
  });
});

describe('Account tab Google Drive disconnect', () => {
  const disconnect = (response) => {
    act(() => { container.querySelector('#disconnect-gauth-email').click(); });
    const [url, callback] = $.get.mock.calls[$.get.mock.calls.length - 1];
    act(() => { callback(response); });
    return url;
  };

  it('shows the connected account only when there is one', () => {
    mount();
    expect(container.querySelector('#gauth-email-change').style.display).toBe('none');
    expect(container.querySelector('#gauth-email-disconnected').style.display).toBe('');
  });

  it('disconnects and then shows that nothing is connected', () => {
    mount({ sheetsExport: { gauthEmail: 'tova@gmail.com' } });
    expect(container.querySelector('#gauth-email-display').value).toBe('tova@gmail.com');
    const url = disconnect({ status: 'ok' });
    expect(url).toBe('/unlink-gauth?redirect=0');
    expect(container.querySelector('#gauth-email-change').style.display).toBe('none');
    expect(container.querySelector('#gauth-email-disconnected').style.display).toBe('');
  });

  it('keeps the connection on show with the server error when disconnecting fails', () => {
    mount({ sheetsExport: { gauthEmail: 'tova@gmail.com' } });
    disconnect({ error: 'Could not unlink' });
    expect(container.querySelector('#gauth-disconnect-messages').textContent).toBe('Could not unlink');
    expect(container.querySelector('#gauth-email-change').style.display).toBe('');
  });
});

/* Back and Forward bring the page back from browser history, which holds no settings: the page
   gets no accountSettings or initialDeveloper, as ReaderApp leaves them out of history. */
describe('Account tab after Back', () => {
  const remount = () => {
    ReactDOM.unmountComponentAtNode(container);
    act(() => {
      ReactDOM.render(
        <SettingsPage tab="account" projectId={null} setTab={() => {}} setProjectId={() => {}} />,
        container,
      );
    });
  };

  it('shows the saved settings, not the ones the page first loaded with', () => {
    mount();
    choose('emailNotifications', 'weekly');
    choose('readingHistory', 'false');
    save();
    remount();
    expect(option('emailNotifications', 'weekly').classList).toContain('on');
    expect(option('readingHistory', 'false').classList).toContain('on');
  });

  it('saves the current settings again rather than the old ones', () => {
    mount();
    choose('emailNotifications', 'never');
    save();
    remount();
    const { payload } = save();
    expect(payload.settings.email_notifications).toBe('never');
    expect(payload.settings.reading_history).toBe(true);
  });

  it('shows a changed email and a disconnected Google Drive', () => {
    mount({ sheetsExport: { gauthEmail: 'tova@gmail.com' } });
    act(() => { container.querySelector('#change-email').click(); });
    typeInto(container.querySelector('#username-change-edit #email'), 'new@example.org');
    act(() => { container.querySelector('#update-email').click(); });
    act(() => { lastPost().callback({ status: 'ok' }); });
    act(() => { container.querySelector('#disconnect-gauth-email').click(); });
    const [, callback] = $.get.mock.calls[$.get.mock.calls.length - 1];
    act(() => { callback({ status: 'ok' }); });
    remount();
    expect(container.querySelector('#email-display').value).toBe('new@example.org');
    expect(container.querySelector('#gauth-email-change').style.display).toBe('none');
  });

  it('starts from the server values on a page load', () => {
    mount();
    choose('emailNotifications', 'weekly');
    save();
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    mount({ emailNotifications: 'never' });
    expect(option('emailNotifications', 'never').classList).toContain('on');
  });
});
