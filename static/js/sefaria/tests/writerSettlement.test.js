/**
 * Writers that call the API must settle: resolve on success, reject on failure or on
 * a response they cannot use. A promise left pending hangs the caller's UI state
 * (a spinner that never clears, a save that never reports back).
 *
 * $.post and $.ajax are replaced with jQuery Deferreds so each test decides how the
 * request settles. Callbacks that throw are reported the way a browser reports them
 * (the exception escapes the XHR handler and the outer promise is left as it was).
 */
import Sefaria from '../sefaria';
import $ from '../sefariaJquery';

// Resolves to 'resolved', 'rejected', or 'pending' if nothing settled within the window.
const SETTLE_WINDOW_MS = 50;
const outcomeOf = (promise) => Promise.race([
  promise.then(() => 'resolved', () => 'rejected'),
  new Promise(resolve => setTimeout(() => resolve('pending'), SETTLE_WINDOW_MS)),
]);

// Lets queued microtasks and timers run before asserting.
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// Makes $.post settle asynchronously with `ok` (a response body) or, when `ok` is
// undefined, with a failed request. A success callback passed as the third argument is
// honoured, matching jQuery's $.post(url, data, success) form.
const mockPost = (outcome) => jest.spyOn($, 'post').mockImplementation((url, data, success) => {
  const deferred = $.Deferred();
  if (typeof success === 'function') { deferred.done(success); }
  setTimeout(() => {
    try {
      if (outcome.ok !== undefined) {
        deferred.resolve(outcome.ok);
      } else {
        deferred.reject({ status: 500 }, 'error', 'Internal Server Error');
      }
    } catch (e) {
      // A handler threw; jQuery leaves the request's own promise untouched.
    }
  }, 0);
  return deferred.promise();
});

const mockAjaxFailure = () => jest.spyOn($, 'ajax').mockImplementation((options) => {
  setTimeout(() => {
    if (options.error) { options.error({ status: 500 }, 'error', 'Internal Server Error'); }
  }, 0);
  return { abort() {} };
});

afterEach(() => {
  jest.restoreAllMocks();
  Sefaria._uid = null;
});

describe('uploadProfilePhoto', () => {
  test('rejects when the viewer is signed out instead of leaving the promise pending', async () => {
    Sefaria._uid = null;
    const result = await outcomeOf(Sefaria.uploadProfilePhoto(new FormData()));
    expect(result).toBe('rejected');
  });

  test('rejects when the upload request fails', async () => {
    Sefaria._uid = 'uid-1';
    mockAjaxFailure();
    const result = await outcomeOf(Sefaria.uploadProfilePhoto(new FormData()));
    expect(result).toBe('rejected');
  });
});

describe('editProfileAPI', () => {
  test('rejects when the profile update request fails', async () => {
    mockPost({});
    const result = await outcomeOf(Sefaria.editProfileAPI({ bio: 'x' }));
    expect(result).toBe('rejected');
  });

  test('resolves with the response when the update succeeds', async () => {
    const body = { slug: 'someone' };
    mockPost({ ok: body });
    await expect(Sefaria.editProfileAPI({ bio: 'x' })).resolves.toEqual(body);
  });
});

describe('toggleSavedItem', () => {
  const item = { ref: 'Genesis 1:1', versions: {}, sheet_owner: null, sheet_title: null };

  test('rejects when applying a successful sync response throws', async () => {
    Sefaria._uid = 'uid-1';
    jest.spyOn(Sefaria, 'removeSavedItem').mockImplementation(() => { throw new Error('store unavailable'); });
    mockPost({ ok: {} });
    const result = await outcomeOf(Sefaria.toggleSavedItem(item));
    expect(result).toBe('rejected');
  });

  test('rejects when the sync request fails', async () => {
    Sefaria._uid = 'uid-1';
    mockPost({});
    const result = await outcomeOf(Sefaria.toggleSavedItem(item));
    expect(result).toBe('rejected');
  });
});

describe('saveUserHistory for a signed-out viewer', () => {
  test('reports a failed reference lookup instead of stalling silently', async () => {
    Sefaria._uid = null;
    Sefaria.is_history_enabled = true;
    jest.spyOn(Sefaria, 'getRef').mockImplementation(() => Promise.reject(new Error('lookup failed')));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    Sefaria.saveUserHistory({ ref: 'Genesis 1:1', book: 'Genesis', versions: {} });
    await flush();

    expect(consoleError).toHaveBeenCalled();
  });
});
