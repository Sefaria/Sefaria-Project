/**
 * Jest Unit Tests: newsletterApi — Real API implementation
 *
 * Verifies that each named export calls fetch with the correct
 * method, endpoint, and request body, and handles success/error
 * responses properly.
 */

// Mock js-cookie so CSRF token header is predictable in tests
jest.mock('js-cookie', () => ({ get: () => 'test-csrf-token' }));

// Mock fetch globally
global.fetch = jest.fn();

// Import named exports after mocks are set up
const {
  subscribeNewsletter,
  updatePreferences,
  fetchUserSubscriptions,
  getNewsletterLists,
  updateLearningLevel,
} = require('../newsletterApi');

// ============================================================================
// Helpers
// ============================================================================

const mockFetchOk = (body) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

const mockFetchFail = (error) =>
  Promise.resolve({ ok: false, json: () => Promise.resolve({ error }) });

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// subscribeNewsletter
// ============================================================================

describe('subscribeNewsletter', () => {
  const payload = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', newsletters: { sefaria_news: true } };

  it('calls fetch with POST to /api/newsletter/subscribe', async () => {
    global.fetch.mockReturnValue(mockFetchOk({ success: true }));

    await subscribeNewsletter(payload);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/newsletter/subscribe',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends the full payload as JSON body', async () => {
    global.fetch.mockReturnValue(mockFetchOk({ success: true }));

    await subscribeNewsletter(payload);

    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual(payload);
  });

  it('returns parsed response on success', async () => {
    const body = { success: true, email: 'ada@example.com' };
    global.fetch.mockReturnValue(mockFetchOk(body));

    const result = await subscribeNewsletter(payload);

    expect(result).toEqual(body);
  });

  it('throws server error message on non-ok response', async () => {
    global.fetch.mockReturnValue(mockFetchFail('Email already subscribed'));

    await expect(subscribeNewsletter(payload)).rejects.toThrow('Email already subscribed');
  });

  it('throws fallback message when error field is absent', async () => {
    global.fetch.mockReturnValue(Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));

    await expect(subscribeNewsletter(payload)).rejects.toThrow('Failed to subscribe');
  });
});

// ============================================================================
// updatePreferences
// ============================================================================

describe('updatePreferences', () => {
  it('calls fetch with POST to /api/newsletter/preferences', async () => {
    global.fetch.mockReturnValue(mockFetchOk({ success: true }));

    await updatePreferences('user@example.com', { sefaria_news: true });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/newsletter/preferences',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('includes marketingOptOut=true in request body when passed', async () => {
    global.fetch.mockReturnValue(mockFetchOk({ success: true }));

    await updatePreferences('user@example.com', { sefaria_news: true }, { marketingOptOut: true });

    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body).marketingOptOut).toBe(true);
  });

  it('defaults marketingOptOut to false when options omitted', async () => {
    global.fetch.mockReturnValue(mockFetchOk({ success: true }));

    await updatePreferences('user@example.com', {});

    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body).marketingOptOut).toBe(false);
  });

  it('includes CSRF token in X-CSRFToken header', async () => {
    global.fetch.mockReturnValue(mockFetchOk({ success: true }));

    await updatePreferences('user@example.com', {});

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['X-CSRFToken']).toBe('test-csrf-token');
  });

  it('throws server error message on non-ok response', async () => {
    global.fetch.mockReturnValue(mockFetchFail('Unauthorized'));

    await expect(updatePreferences('user@example.com', {})).rejects.toThrow('Unauthorized');
  });
});

// ============================================================================
// fetchUserSubscriptions
// ============================================================================

describe('fetchUserSubscriptions', () => {
  it('calls fetch with GET to /api/newsletter/subscriptions', async () => {
    global.fetch.mockReturnValue(mockFetchOk({ success: true, subscribedNewsletters: [] }));

    await fetchUserSubscriptions('user@example.com');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/newsletter/subscriptions',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('returns parsed subscription response', async () => {
    const body = { success: true, subscribedNewsletters: ['sefaria_news'], wantsMarketingEmails: true };
    global.fetch.mockReturnValue(mockFetchOk(body));

    const result = await fetchUserSubscriptions('user@example.com');

    expect(result).toEqual(body);
  });

  it('throws on non-ok response', async () => {
    global.fetch.mockReturnValue(mockFetchFail('Unauthorized'));

    await expect(fetchUserSubscriptions('user@example.com')).rejects.toThrow('Unauthorized');
  });
});

// ============================================================================
// getNewsletterLists
// ============================================================================

describe('getNewsletterLists', () => {
  it('calls fetch with GET to /api/newsletter/lists', async () => {
    global.fetch.mockReturnValue(mockFetchOk({ newsletters: [] }));

    await getNewsletterLists();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/newsletter/lists',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('returns parsed newsletters list', async () => {
    const body = { newsletters: [{ stringid: 'sefaria_news', displayName: 'Sefaria News', icon: 'news.svg' }] };
    global.fetch.mockReturnValue(mockFetchOk(body));

    const result = await getNewsletterLists();

    expect(result.newsletters).toHaveLength(1);
    expect(result.newsletters[0].stringid).toBe('sefaria_news');
  });

  it('throws on non-ok response', async () => {
    global.fetch.mockReturnValue(mockFetchFail('Service unavailable'));

    await expect(getNewsletterLists()).rejects.toThrow('Service unavailable');
  });
});

// ============================================================================
// updateLearningLevel
// ============================================================================

describe('updateLearningLevel', () => {
  it('calls fetch with POST to /api/newsletter/learning-level', async () => {
    global.fetch.mockReturnValue(mockFetchOk({ success: true }));

    await updateLearningLevel('user@example.com', 3);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/newsletter/learning-level',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends email and learningLevel in JSON body', async () => {
    global.fetch.mockReturnValue(mockFetchOk({ success: true }));

    await updateLearningLevel('user@example.com', 3);

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.email).toBe('user@example.com');
    expect(body.learningLevel).toBe(3);
  });

  it('throws on non-ok response', async () => {
    global.fetch.mockReturnValue(mockFetchFail('Invalid level'));

    await expect(updateLearningLevel('user@example.com', 0)).rejects.toThrow('Invalid level');
  });
});
