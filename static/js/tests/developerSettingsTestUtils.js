/* global jest, require, global */
/**
 * Shared setup for the settings page tests (settingsPage, developerSettingsHome, developerSettingsRefusals):
 * jest.mock factories, fixtures, an in-memory developer API and Testing Library helpers.
 *
 * SettingsPage.jsx keeps some state at module level (how far setup got this visit, the settings a page restored by
 * Back reuses, and whether the address had ?share or ?continue when the script loaded). loadSettings() gives each
 * test a fresh copy of the page module, so one test's visit doesn't leak into the next.
 */
import { fireEvent, screen, within } from '@testing-library/dom';

/* ---- jest.mock factories (each test file calls jest.mock with these) ---- */

export const sefariaMock = () => {
  const sefaria = {
    interfaceLang: 'english',
    full_name: 'Tova Levi',
    _email: 'tova@example.org',
    profile_pic_url: '',
    _: (k) => k,
    track: { event: () => {}, setInterfaceLanguage: () => {} },
  };
  sefaria._v = (options) => options[sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'];
  return { __esModule: true, default: sefaria };
};

export const jqueryMock = () => ({
  __esModule: true,
  default: { cookie: jest.fn(), post: jest.fn(), get: jest.fn() },
});

export const miscMock = () => {
  const React = require('react');
  const Sefaria = require('../sefaria/sefaria').default;
  return {
    __esModule: true,
    InterfaceText: ({ text, children }) =>
      text ? text[Sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'] : (children ?? null),
    DonateLink: ({ children, classes }) => React.createElement('a', { href: '/donate', className: classes }, children),
  };
};

/* ---- a fresh page module per test ---- */

let current = null;
const mounted = [];

/* search: the address's query when the script loads, e.g. '?share' or '?continue'. */
export const loadSettings = ({ search = '' } = {}) => {
  jest.resetModules();
  window.history.replaceState(null, '', '/settings/developer' + search);
  if (!document.querySelector('meta[name="csrf-token"]')) {
    const meta = document.createElement('meta');
    meta.name = 'csrf-token';
    meta.content = 'test-csrf-token';
    document.head.appendChild(meta);
  }
  const React = require('react');
  const ReactDOM = require('react-dom');
  const { act } = require('react-dom/test-utils');
  const page = require('../SettingsPage.jsx');
  current = {
    React,
    ReactDOM,
    act,
    SettingsPage: page.default,
    EmailConfirmedPage: page.EmailConfirmedPage,
    EmailLinkPage: page.EmailLinkPage,
    Sefaria: require('../sefaria/sefaria').default,
    $: require('../sefaria/sefariaJquery').default,
    api: require('../developerSettingsApi'),
  };
  return current;
};

export const ACCOUNT_SETTINGS = { socialProviders: [], email: 'tova@example.org', emailNotifications: 'daily' };

/* Renders an element into a fresh container; rerender(element) renders again into the same one. */
export const renderElement = (element) => {
  const { act, ReactDOM } = current;
  const container = document.createElement('div');
  document.body.appendChild(container);
  mounted.push({ container, ReactDOM });
  act(() => {
    ReactDOM.render(element, container);
  });
  return {
    container,
    rerender: (next) =>
      act(() => {
        ReactDOM.render(next, container);
      }),
  };
};

/* The settings page on a tab, with the given developer state (null where developer settings are off). */
export const renderSettings = (tab, developer = {}, extra = {}) => {
  const { React, SettingsPage } = current;
  let props = {
    tab,
    projectId: null,
    accountSettings: ACCOUNT_SETTINGS,
    initialDeveloper: developer,
    setTab: jest.fn(),
    setProjectId: jest.fn(),
    ...extra,
  };
  const view = renderElement(React.createElement(SettingsPage, props));
  return {
    ...view,
    props,
    update: (next) => {
      props = { ...props, ...next };
      view.rerender(React.createElement(SettingsPage, props));
    },
  };
};

export const cleanup = () => {
  while (mounted.length) {
    const { container, ReactDOM } = mounted.pop();
    current.act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
  }
};

/* ---- fixtures ---- */

export const PROFILE = {
  developerName: 'Tova Levi',
  description: '',
  additionalEmail: '',
  termsAccepted: true,
  developerNews: false,
  notADeveloper: false,
};

/* An account signed in with Google or Apple, never set up. */
export const SSO_NEW = { developerEnabled: false, ssoConnected: true, emailVerified: true };
/* An email account whose address isn't confirmed yet. */
export const EMAIL_NEW = { developerEnabled: false, ssoConnected: false, emailVerified: false };
/* Set up, with a profile. */
export const READY = { developerEnabled: true, ssoConnected: true, emailVerified: true, profile: PROFILE };

export const key = (n, extra = {}) => ({
  id: 'k' + n,
  label: 'Key ' + n,
  value: 'sfr_' + n + '_secret_value_' + n + 'xyz9',
  created: '2026-11-05T10:00:00Z',
  restrictToWebsite: false,
  ...extra,
});

export const project = (n, extra = {}) => ({
  id: 'p' + n,
  name: 'Project ' + n,
  description: 'What project ' + n + ' does',
  organization: '',
  websiteUrl: '',
  visibility: 'private',
  aiAssisted: false,
  linkedListing: false,
  consentWithdrawnAt: null,
  keys: [],
  ...extra,
});

/* ---- the developer API, in memory ---- */

const clone = (x) => JSON.parse(JSON.stringify(x));

/* Answers fetch like powered_by/developer_views.py: every call returns the whole developer state. server.fail()
   makes the next matching call (or every one, with times: Infinity) fail with the server's error message. */
export const fakeServer = (initial = {}) => {
  const state = clone({
    developerEnabled: false,
    ssoConnected: false,
    emailVerified: false,
    confirmationSentAt: null,
    profile: null,
    projects: [],
    yourListing: null,
    maxKeysPerProject: 5,
    maxProjects: 10,
    mock: null,
    ...initial,
  });
  const requests = [];
  const failures = [];
  let seq = 0;
  const projectById = (id) => state.projects.find((p) => p.id === id);
  const keyById = (id) => state.projects.flatMap((p) => p.keys).find((k) => k.id === id);
  const routes = [
    ['GET', /^state$/, () => null],
    [
      'POST',
      /^enable$/,
      () => {
        state.developerEnabled = true;
      },
    ],
    [
      'POST',
      /^profile$/,
      (body) => {
        state.profile = body.profile;
      },
    ],
    [
      'POST',
      /^confirmation$/,
      () => {
        state.confirmationSentAt = new Date().toISOString();
      },
    ],
    ['POST', /^confirmation\/new-link$/, () => null],
    [
      'POST',
      /^projects$/,
      (body) => {
        seq += 1;
        const created = { ...project(0), ...body.project, id: 'new' + seq, keys: [] };
        delete created.purpose;
        state.projects.unshift(created);
        return { projectId: created.id };
      },
    ],
    [
      'POST',
      /^projects\/([^/]+)$/,
      (body, id) => {
        const p = projectById(id);
        const { purpose, ...fields } = body.project;
        Object.assign(p, fields);
        if (!p.websiteUrl) {
          p.keys.forEach((k) => {
            k.restrictToWebsite = false;
          });
        }
      },
    ],
    [
      'DELETE',
      /^projects\/([^/]+)$/,
      (body, id) => {
        state.projects = state.projects.filter((p) => p.id !== id);
      },
    ],
    [
      'POST',
      /^projects\/([^/]+)\/keys$/,
      (body, id) => {
        seq += 1;
        const created = key(0, { id: 'newkey' + seq, label: body.label, value: 'sfr_new' + seq + '_value_abcd' });
        projectById(id).keys.push(created);
        return { keyId: created.id };
      },
    ],
    [
      'POST',
      /^keys\/([^/]+)$/,
      (body, id) => {
        keyById(id).restrictToWebsite = body.restrictToWebsite;
      },
    ],
    [
      'DELETE',
      /^keys\/([^/]+)$/,
      (body, id) => {
        state.projects.forEach((p) => {
          p.keys = p.keys.filter((k) => k.id !== id);
        });
      },
    ],
    ['POST', /^mock$/, () => null],
  ];
  const answer = (status, body) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(clone(body)) });
  global.fetch = jest.fn((url, options = {}) => {
    const method = options.method || 'GET';
    const path = url.replace('/api/developer/', '');
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ method, path, body });
    const failure = failures.find((f) => f.method === method && f.path.test(path) && f.times > 0);
    if (failure) {
      failure.times -= 1;
      return answer(failure.status, failure.error === undefined ? {} : { error: failure.error });
    }
    for (const [m, pattern, handle] of routes) {
      const match = m === method && path.match(pattern);
      if (match) {
        const extra = handle(body, ...match.slice(1));
        return answer(200, { ...state, ...(extra || {}) });
      }
    }
    return answer(404, { error: 'No such route.' });
  });
  return {
    state,
    requests,
    /* path: a string for the whole path, or a RegExp. */
    fail: (method, path, status, error, { times = 1 } = {}) => {
      failures.push({
        method,
        path: path instanceof RegExp ? path : new RegExp('^' + path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '$'),
        status,
        error,
        times,
      });
    },
    /* The bodies sent to METHOD path, in order. */
    sent: (method, path) => requests.filter((r) => r.method === method && r.path === path).map((r) => r.body),
    count: (method, path) => requests.filter((r) => r.method === method && r.path === path).length,
    calls: () => requests.map((r) => r.method + ' ' + r.path),
  };
};

/* ---- interactions ---- */

export const flush = async () => {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
  }
};

/* Lets pending promises (the fake API's answers) settle inside act. */
export const settle = async () => {
  await current.act(async () => {
    await flush();
  });
};

export const click = async (element) => {
  await current.act(async () => {
    fireEvent.click(element);
    await flush();
  });
};

export const type = (element, value) => {
  current.act(() => {
    fireEvent.change(element, { target: { value } });
  });
};

export const blur = (element) => {
  current.act(() => {
    fireEvent.blur(element);
  });
};

export const focus = (element) => {
  current.act(() => {
    element.focus();
  });
};

export const press = (target, keyName, init = {}) => {
  current.act(() => {
    fireEvent.keyDown(target, { key: keyName, ...init });
  });
};

/* Moves fake timers on, letting the promises they start settle. */
export const advance = async (ms) => {
  await current.act(async () => {
    jest.advanceTimersByTime(ms);
    await flush();
  });
};

/* Picks an option in one of the design system's Select fields, found by its label. */
export const choose = async (label, option) => {
  await click(screen.getByRole('button', { name: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));
  await click(screen.getByRole('option', { name: option }));
};

export const button = (name, root) => (root ? within(root) : screen).getByRole('button', { name });
export const queryButton = (name, root) => (root ? within(root) : screen).queryByRole('button', { name });
export const heading = (name) => screen.getByRole('heading', { name });
export const field = (label) => screen.getByLabelText(label);

/* A project's section on the home page, found by its name. */
export const projectSection = (name) =>
  screen.getAllByRole('region').find((r) => {
    const title = r.getAttribute('aria-labelledby') && document.getElementById(r.getAttribute('aria-labelledby'));
    return title && title.classList.contains('devE-projName') && title.textContent.startsWith(name);
  });

export { screen, within, fireEvent };
