/* Testing done using Jest */
import { getCsrfToken } from '../csrf';
import Cookies from 'js-cookie';

const META_SELECTOR = 'meta[name="csrf-token"]';

function setMetaToken(value) {
  let meta = document.querySelector(META_SELECTOR);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'csrf-token');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', value);
}

function removeMetaToken() {
  const meta = document.querySelector(META_SELECTOR);
  if (meta) { meta.remove(); }
}

describe('getCsrfToken', () => {
  afterEach(() => {
    removeMetaToken();
    Cookies.remove('csrftoken');
  });

  it('returns the meta-tag token when present', () => {
    setMetaToken('META_TOKEN');
    expect(getCsrfToken()).toBe('META_TOKEN');
  });

  it('prefers the meta-tag token over a conflicting cookie (the dual-cookie fix)', () => {
    // This is the core guarantee: when production's .sefaria.org csrftoken and a
    // cauldron's host-scoped csrftoken both reach the browser, we must NOT trust
    // the cookie. The meta tag (rendered from Django's {{ csrf_token }}) wins.
    setMetaToken('META_TOKEN');
    Cookies.set('csrftoken', 'COOKIE_TOKEN');
    expect(getCsrfToken()).toBe('META_TOKEN');
  });

  it('falls back to the cookie when no meta tag is present', () => {
    Cookies.set('csrftoken', 'COOKIE_TOKEN');
    expect(getCsrfToken()).toBe('COOKIE_TOKEN');
  });

  it('falls back to the cookie when the meta tag is empty', () => {
    setMetaToken('');
    Cookies.set('csrftoken', 'COOKIE_TOKEN');
    expect(getCsrfToken()).toBe('COOKIE_TOKEN');
  });
});
