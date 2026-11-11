/**
 * A key's value is not in the page: Reveal and Copy fetch it, it stays in component memory only, and it is dropped
 * on collapse, on pagehide, after the re-mask timeout and after a copy.
 */

jest.mock('../sefaria/sefaria', () => {
  const sefaria = {
    interfaceLang: 'english',
    full_name: 'Tova Levi',
    _email: 'tova@example.org',
    _: (k) => k,
    track: { event: () => {} },
  };
  sefaria._v = (options) => options[sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'];
  return { __esModule: true, default: sefaria };
});

jest.mock('../sefaria/sefariaJquery', () => ({
  __esModule: true,
  default: { cookie: () => {}, post: () => {}, get: () => {} },
}));

jest.mock('../Misc', () => {
  const Sefaria = require('../sefaria/sefaria').default;
  return {
    __esModule: true,
    InterfaceText: ({ text, children }) =>
      text ? text[Sefaria.interfaceLang === 'hebrew' ? 'he' : 'en'] : (children ?? null),
  };
});

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import Sefaria from '../sefaria/sefaria';
import SettingsPage from '../SettingsPage.jsx';

const VALUE = 'sfr_AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const PREFIX = VALUE.slice(0, 10);
const PROFILE = {
  developerName: 'Tova Levi',
  description: '',
  additionalEmail: '',
  termsAccepted: true,
  developerNews: false,
  notADeveloper: false,
};
const PROJECT = {
  id: 'proj01',
  name: 'Daf Tracker',
  description: '',
  visibility: 'public',
  organization: '',
  websiteUrl: 'https://daftracker.org',
  aiAssisted: false,
  linkedListing: false,
  consentWithdrawnAt: null,
  keys: [{ id: 'k1', label: 'Site key', prefix: PREFIX, created: null, restrictToWebsite: false }],
};

let container = null;
let requests;
let writeText;
let projectId;

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
};

const answer = (url, options) => {
  requests.push({ url, method: options.method });
  if (url === '/api/developer/keys/k1/value') {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ value: VALUE }) });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ developerEnabled: true, ssoConnected: true, profile: PROFILE, projects: [PROJECT] }),
  });
};

const render = () =>
  act(() => {
    ReactDOM.render(
      <SettingsPage
        tab="developer"
        projectId={projectId}
        accountSettings={{ socialProviders: [], email: 'tova@example.org' }}
        initialDeveloper={{ developerEnabled: true, ssoConnected: true, profile: PROFILE, projects: [PROJECT] }}
        setTab={() => {}}
        setProjectId={(id) => {
          projectId = id;
        }}
      />,
      container
    );
  });

const button = (name) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === name);
const click = async (element) => {
  await act(async () => {
    element.click();
    await flush();
  });
};
const keyText = () => container.querySelector('.devPocKeyValue code').textContent;
const liveRegion = () => container.querySelector('.devPocCopied');
const revealedRequests = () => requests.filter((r) => r.url.endsWith('/value'));

beforeEach(() => {
  jest.useFakeTimers();
  Sefaria.interfaceLang = 'english';
  window.scrollTo = jest.fn();
  requests = [];
  projectId = 'proj01';
  global.fetch = jest.fn(answer);
  writeText = jest.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  document.head.innerHTML = '<meta name="csrf-token" content="test-token">';
  window.localStorage.clear();
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  render();
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  container = null;
  jest.useRealTimers();
});

describe('the key row before anything is revealed', () => {
  it('shows the display prefix masked, with text-labelled Reveal and Copy buttons, and no value', () => {
    expect(keyText()).toBe(PREFIX + '••••••••••••');
    expect(keyText()).toMatch(/^sfr_[A-Za-z0-9_-]{6}•{12}$/);
    expect(keyText()).not.toContain('…');
    expect(container.innerHTML).not.toContain(VALUE.slice(10));
    expect(button('Reveal')).toBeTruthy();
    expect(button('Copy')).toBeTruthy();
    expect(button('Reveal').getAttribute('aria-pressed')).toBe('false');
    expect(button('Copy').className).not.toMatch(/blue/);
    expect(button('Reveal').className).not.toMatch(/blue/);
    expect(revealedRequests()).toHaveLength(0);
  });

  it('has Hebrew labels in the Hebrew interface', () => {
    Sefaria.interfaceLang = 'hebrew';
    render();
    expect(button('חשיפה')).toBeTruthy();
    expect(button('העתקה')).toBeTruthy();
  });
});

describe('Reveal', () => {
  it('fetches the value with a POST and shows it, the label staying the same and aria-pressed toggling', async () => {
    await click(button('Reveal'));

    expect(revealedRequests()).toEqual([{ url: '/api/developer/keys/k1/value', method: 'POST' }]);
    expect(keyText()).toBe(VALUE);
    expect(button('Reveal').getAttribute('aria-pressed')).toBe('true');

    await click(button('Reveal'));

    expect(keyText()).toBe(PREFIX + '••••••••••••');
    expect(button('Reveal').getAttribute('aria-pressed')).toBe('false');
  });

  it('asks the server again after hiding: the value was dropped, not kept', async () => {
    await click(button('Reveal'));
    await click(button('Reveal'));
    await click(button('Reveal'));

    expect(revealedRequests()).toHaveLength(2);
    expect(keyText()).toBe(VALUE);
  });

  it('re-masks and drops the value after the timeout', async () => {
    await click(button('Reveal'));
    expect(keyText()).toBe(VALUE);

    act(() => {
      jest.advanceTimersByTime(29000);
    });
    expect(keyText()).toBe(VALUE);
    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(keyText()).toBe(PREFIX + '••••••••••••');
    expect(button('Reveal').getAttribute('aria-pressed')).toBe('false');
    expect(container.textContent).not.toContain(VALUE);
  });

  it('drops the value when the row collapses', async () => {
    await click(button('Reveal'));
    expect(container.textContent).toContain(VALUE);

    await click(container.querySelector('.devPocProjectToggle'));

    expect(container.querySelector('.devPocKeyValue')).toBeNull();
    expect(container.textContent).not.toContain(VALUE);
  });

  it('drops the value on pagehide', async () => {
    await click(button('Reveal'));

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(container.textContent).not.toContain(VALUE);
  });

  it('says so when the server refuses, and shows no value', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'Too many requests for key values. Wait a minute and try again.' }),
      })
    );

    await click(button('Reveal'));

    expect(container.querySelector('.devPocKeyError').textContent).toContain('Too many requests');
    expect(keyText()).toBe(PREFIX + '••••••••••••');
    expect(button('Reveal').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Copy', () => {
  it('fetches the value, writes it to the clipboard and announces Copied with a visible check', async () => {
    await click(button('Copy'));

    expect(revealedRequests()).toHaveLength(1);
    expect(writeText).toHaveBeenCalledWith(VALUE);
    const region = liveRegion();
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('Copied');
    expect(region.querySelector('svg')).toBeTruthy();
  });

  it('drops the value after a successful copy, leaving it masked', async () => {
    await click(button('Reveal'));
    expect(keyText()).toBe(VALUE);

    await click(button('Copy'));

    expect(writeText).toHaveBeenCalledWith(VALUE);
    expect(revealedRequests()).toHaveLength(1);
    expect(keyText()).toBe(PREFIX + '••••••••••••');
    expect(container.textContent).not.toContain(VALUE);
  });

  it('clears the confirmation after a moment', async () => {
    await click(button('Copy'));
    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(liveRegion().textContent).toBe('');
  });

  it('shows the key to copy by hand where the clipboard refuses, and announces no success', async () => {
    writeText.mockImplementation(() => Promise.reject(new Error('denied')));

    await click(button('Copy'));

    expect(liveRegion().textContent).toBe('');
    expect(keyText()).toBe(VALUE);
    expect(container.querySelector('.devPocKeyError').textContent).toContain("Couldn't copy");
  });
});

describe('nothing is stored', () => {
  it('writes the value to no storage and keeps it out of the history state, through reveal, copy and expiry', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    window.history.replaceState({ page: 'settings' }, '');

    await click(button('Reveal'));
    await click(button('Copy'));
    await click(button('Reveal'));
    act(() => {
      jest.advanceTimersByTime(31000);
    });

    const written = setItem.mock.calls.map((call) => call.join('='));
    expect(written.join('\n')).not.toContain(VALUE.slice(10));
    expect(JSON.stringify(window.localStorage)).not.toContain(VALUE.slice(10));
    expect(JSON.stringify(window.sessionStorage)).not.toContain(VALUE.slice(10));
    expect(JSON.stringify(window.history.state)).not.toContain(VALUE.slice(10));
    setItem.mockRestore();
  });
});

/* Walks the committed component tree and reports whether any hook state (state, refs, effect deps) still holds
   `needle`. DOM nodes are skipped: their React-internal props are the page, which other tests read as text. */
const heldInState = (needle) => {
  const seen = new Set();
  const holds = (node, depth) => {
    if (typeof node === 'string') {
      return node.includes(needle);
    }
    if (!node || typeof node !== 'object' || node.nodeType || depth > 4 || seen.has(node)) {
      return false;
    }
    seen.add(node);
    return Object.keys(node).some((k) => typeof node[k] !== 'function' && k !== 'next' && holds(node[k], depth + 1));
  };
  const walk = (fiber) => {
    for (let f = fiber; f; f = f.sibling) {
      for (let hook = f.memoizedState; hook && typeof hook === 'object' && 'next' in hook; hook = hook.next) {
        if (holds(hook.memoizedState, 0)) {
          return true;
        }
      }
      if (walk(f.child)) {
        return true;
      }
    }
    return false;
  };
  return walk(container._reactRootContainer._internalRoot.current);
};

const createFirstKey = async () => {
  const created = { ...PROJECT, keys: [] };
  global.fetch = jest.fn((url, options) => {
    requests.push({ url, method: options.method });
    const body = url.endsWith('/keys')
      ? {
          developerEnabled: true,
          ssoConnected: true,
          profile: PROFILE,
          projects: [{ ...created, keys: PROJECT.keys }],
          keyId: 'k1',
          keyValue: VALUE,
        }
      : { developerEnabled: true, ssoConnected: true, profile: PROFILE, projects: [created] };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  });
  ReactDOM.unmountComponentAtNode(container);
  act(() => {
    ReactDOM.render(
      <SettingsPage
        tab="developer"
        projectId="proj01"
        accountSettings={{ socialProviders: [], email: 'tova@example.org' }}
        initialDeveloper={{ developerEnabled: true, ssoConnected: true, profile: PROFILE, projects: [created] }}
        setTab={() => {}}
        setProjectId={() => {}}
      />,
      container
    );
  });

  await click(button('Create your first key'));
  const input = container.querySelector('[id$="devPocKeyLabel"]');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Site key');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(container.querySelector('form.devPocCreateKey button[type="submit"]'));
  await act(async () => {
    jest.advanceTimersByTime(4500);
    await flush();
  });
};

describe('a key just created', () => {
  it('can be copied without a second request, and its value is kept out of the page state', async () => {
    await createFirstKey();

    expect(container.querySelector('.devPocKeyValue')).toBeTruthy();
    expect(container.textContent).not.toContain(VALUE);
    await click(button('Copy'));

    expect(writeText).toHaveBeenCalledWith(VALUE);
    expect(revealedRequests()).toHaveLength(0);
  });

  describe('keeps the value in memory no longer than a revealed one', () => {
    it('holds it right after creation (the checks below can see it)', async () => {
      await createFirstKey();
      expect(heldInState(VALUE)).toBe(true);
    });

    it('drops it on pagehide', async () => {
      await createFirstKey();
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      expect(heldInState(VALUE)).toBe(false);
    });

    it('drops it after the timeout', async () => {
      await createFirstKey();
      act(() => {
        jest.advanceTimersByTime(31000);
      });
      expect(heldInState(VALUE)).toBe(false);
    });

    it('drops it after a successful copy', async () => {
      await createFirstKey();
      await click(button('Copy'));
      expect(writeText).toHaveBeenCalledWith(VALUE);
      expect(heldInState(VALUE)).toBe(false);
    });

    it('drops it when the value is hidden again', async () => {
      await createFirstKey();
      await click(button('Reveal'));
      await click(button('Reveal'));
      expect(heldInState(VALUE)).toBe(false);
    });

    it('drops it when the section collapses', async () => {
      await createFirstKey();
      await click(container.querySelector('.devPocProjectToggle'));
      expect(heldInState(VALUE)).toBe(false);
    });
  });
});
