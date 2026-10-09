/**
 * @jest-environment node
 *
 * Node SSR has no `document`. getCsrfToken() is called during render (e.g. by
 * AuthPage) on the server too, so it must return '' silently there instead of
 * logging the "meta tag missing" warning on every server-side render.
 */
import { getCsrfToken } from '../csrf';

describe('getCsrfToken under Node SSR (no document)', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('returns "" without warning', () => {
    expect(typeof document).toBe('undefined');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getCsrfToken()).toBe('');
    expect(warn).not.toHaveBeenCalled();
  });
});
