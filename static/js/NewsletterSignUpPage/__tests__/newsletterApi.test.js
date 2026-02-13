/**
 * Jest Unit Tests: newsletterApi - marketingOptOut flag behavior
 *
 * Tests the marketingOptOut intent flag added to the updatePreferences API.
 *
 * Key: The flag is informational, NOT for validation.
 * All scenarios should succeed for logged-in users (updatePreferences).
 */

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock fetch for RealAPI tests
global.fetch = jest.fn();

// Import after mocks are set up
const NewsletterAPI = require('../newsletterApi').default;

describe('MockAPI.updatePreferences with marketingOptOut flag', () => {
  beforeEach(() => {
    // Set mock mode
    localStorage.setItem('_use_mock_api', 'true');
    jest.clearAllMocks();
  });

  afterEach(() => {
    localStorage.removeItem('_use_mock_api');
  });

  it('succeeds with marketingOptOut=true and empty newsletters', async () => {
    const result = await NewsletterAPI.updatePreferences(
      'user@example.com',
      {},
      { marketingOptOut: true }
    );

    expect(result.success).toBe(true);
    expect(result.subscribedNewsletters).toEqual([]);
    expect(result.marketingOptOut).toBe(true);
    expect(result.message).toContain('opted out');
  });

  it('succeeds with marketingOptOut=false and empty newsletters', async () => {
    // User manually unchecked all newsletters (not an explicit opt-out)
    const result = await NewsletterAPI.updatePreferences(
      'user@example.com',
      {},
      { marketingOptOut: false }
    );

    expect(result.success).toBe(true);
    expect(result.subscribedNewsletters).toEqual([]);
    expect(result.marketingOptOut).toBe(false);
  });

  it('succeeds with no options and empty newsletters (defaults to marketingOptOut=false)', async () => {
    const result = await NewsletterAPI.updatePreferences(
      'user@example.com',
      {}
    );

    expect(result.success).toBe(true);
    expect(result.marketingOptOut).toBe(false);
  });

  it('succeeds with newsletters selected and marketingOptOut=true (flag is informational)', async () => {
    const result = await NewsletterAPI.updatePreferences(
      'user@example.com',
      { sefaria_news: true, text_updates: false },
      { marketingOptOut: true }
    );

    expect(result.success).toBe(true);
    expect(result.subscribedNewsletters).toContain('sefaria_news');
    expect(result.subscribedNewsletters).not.toContain('text_updates');
  });

  it('succeeds with newsletters selected and marketingOptOut=false', async () => {
    const result = await NewsletterAPI.updatePreferences(
      'user@example.com',
      { sefaria_news: true },
      { marketingOptOut: false }
    );

    expect(result.success).toBe(true);
    expect(result.subscribedNewsletters).toContain('sefaria_news');
  });

  it('includes marketingOptOut in response', async () => {
    const result = await NewsletterAPI.updatePreferences(
      'user@example.com',
      { sefaria_news: true },
      { marketingOptOut: true }
    );

    expect(result).toHaveProperty('marketingOptOut', true);
  });

  it('throws error when email is missing', async () => {
    await expect(
      NewsletterAPI.updatePreferences('', {}, { marketingOptOut: true })
    ).rejects.toThrow('Email is required');
  });
});

describe('subscribeNewsletter does not accept marketingOptOut', () => {
  beforeEach(() => {
    localStorage.setItem('_use_mock_api', 'true');
  });

  afterEach(() => {
    localStorage.removeItem('_use_mock_api');
  });

  it('requires at least one newsletter for logged-out users', async () => {
    // subscribeNewsletter is for logged-out users only
    // It should still require at least one newsletter
    await expect(
      NewsletterAPI.subscribeNewsletter({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        newsletters: {},
      })
    ).rejects.toThrow('Please select at least one newsletter');
  });

  it('succeeds with at least one newsletter selected', async () => {
    const result = await NewsletterAPI.subscribeNewsletter({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      newsletters: { sefaria_news: true },
    });

    expect(result.success).toBe(true);
    expect(result.subscribedNewsletters).toContain('sefaria_news');
    // No marketingOptOut in response (only for updatePreferences)
    expect(result.marketingOptOut).toBeUndefined();
  });
});

describe('API mode switching', () => {
  it('uses mock API when _use_mock_api is true', () => {
    localStorage.setItem('_use_mock_api', 'true');
    expect(NewsletterAPI.isMockMode()).toBe(true);
  });

  it('uses real API when _use_mock_api is false', () => {
    localStorage.setItem('_use_mock_api', 'false');
    expect(NewsletterAPI.isMockMode()).toBe(false);
  });
});

describe('MockAPI.fetchUserSubscriptions', () => {
  beforeEach(() => {
    localStorage.setItem('_use_mock_api', 'true');
  });

  afterEach(() => {
    localStorage.removeItem('_use_mock_api');
  });

  it('returns wantsMarketingEmails in response', async () => {
    const result = await NewsletterAPI.fetchUserSubscriptions('user@example.com');
    expect(result.success).toBe(true);
    expect(result).toHaveProperty('wantsMarketingEmails', true);
  });

  it('returns subscribedNewsletters array', async () => {
    const result = await NewsletterAPI.fetchUserSubscriptions('user@example.com');
    expect(Array.isArray(result.subscribedNewsletters)).toBe(true);
    expect(result.subscribedNewsletters.length).toBeGreaterThan(0);
  });
});
