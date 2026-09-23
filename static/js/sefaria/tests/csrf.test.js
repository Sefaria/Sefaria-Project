/* Testing done using Jest */
import { getCsrfToken } from '../csrf';

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
    jest.restoreAllMocks();
  });

  it('returns the meta-tag token when present', () => {
    setMetaToken('META_TOKEN');
    expect(getCsrfToken()).toBe('META_TOKEN');
  });

  it('reads only the meta tag, never a conflicting cookie (the dual-cookie fix)', () => {
    // This is the core guarantee: when production's .sefaria.org csrftoken and a
    // cauldron's host-scoped csrftoken both reach the browser, we must NOT trust
    // the cookie. The meta tag (rendered from Django's {{ csrf_token }}) wins.
    document.cookie = 'csrftoken=COOKIE_TOKEN';
    setMetaToken('META_TOKEN');
    expect(getCsrfToken()).toBe('META_TOKEN');
  });

  it('returns "" and warns when no meta tag is present (no cookie fallback)', () => {
    // A cookie fallback would silently reintroduce the dual-cookie 403, so a
    // missing meta tag must fail loudly rather than read the cookie.
    document.cookie = 'csrftoken=COOKIE_TOKEN';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getCsrfToken()).toBe('');
    expect(warn).toHaveBeenCalled();
  });

  it('returns "" and warns when the meta tag is empty', () => {
    setMetaToken('');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getCsrfToken()).toBe('');
    expect(warn).toHaveBeenCalled();
  });
});
