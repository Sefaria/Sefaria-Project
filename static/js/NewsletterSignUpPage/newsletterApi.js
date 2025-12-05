/**
 * Newsletter API Module - Dual Mode (Mock/Real)
 *
 * This module provides a configurable API layer that can switch between:
 * 1. Mocked endpoints (for development/testing without backend)
 * 2. Real API endpoints (production integration with backend)
 *
 * Configuration:
 * - Environment variable: REACT_APP_USE_MOCK_API=true/false
 * - Runtime override: localStorage.setItem('_use_mock_api', 'true/false')
 * - DevTools console: NewsletterAPI.setUseMockAPI(true/false)
 *
 * Real endpoints:
 * - POST /api/newsletter/subscribe - Subscribe new user
 * - POST /api/newsletter/preferences - Update logged-in user preferences
 * - POST /api/newsletter/learning-level - Save learning level
 * - GET /api/newsletter/subscriptions - Fetch user's subscriptions
 * - GET /api/newsletter/lists - Fetch available newsletters
 */

// ============================================================================
// Configuration Management
// ============================================================================

/**
 * Determine if mock API should be used
 * Priority: localStorage > environment > default (false)
 */
const isMockMode = () => {
  // Check localStorage override first (highest priority)
  const localStorageValue = localStorage.getItem('_use_mock_api');
  if (localStorageValue !== null) {
    return localStorageValue === 'true';
  }

  // Fall back to environment variable
  if (typeof process !== 'undefined' && process.env) {
    return process.env.REACT_APP_USE_MOCK_API === 'true';
  }

  // Default to mock API (safe for development)
  return true;
};

/**
 * Simulate network delay for realistic API behavior
 * @param {number} minMs - Minimum delay in milliseconds
 * @param {number} maxMs - Maximum delay in milliseconds
 * @returns {Promise} Resolves after random delay
 */
const simulateNetworkDelay = (minMs = 300, maxMs = 800) => {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
};

// ============================================================================
// Mock API Implementations
// ============================================================================

const MockAPI = {
  /**
   * Mock: Subscribe new (logged-out) user to newsletters
   */
  subscribeNewsletter: async (data) => {
    const { firstName, lastName, email, newsletters } = data;
    await simulateNetworkDelay();

    if (!firstName || !email) {
      throw new Error('First name and email are required.');
    }

    const selectedNewsletterKeys = Object.entries(newsletters)
      .filter(([_, isSelected]) => isSelected)
      .map(([key]) => key);

    if (selectedNewsletterKeys.length === 0) {
      throw new Error('Please select at least one newsletter.');
    }

    console.log('✓ Newsletter subscription (MOCKED):', {
      firstName,
      lastName,
      email,
      newsletters: selectedNewsletterKeys,
    });

    return {
      success: true,
      message: 'Successfully subscribed to newsletters',
      email,
      subscribedNewsletters: selectedNewsletterKeys,
    };
  },

  /**
   * Mock: Update preferences for logged-in user
   */
  updatePreferences: async (email, newsletters) => {
    await simulateNetworkDelay();

    if (!email) {
      throw new Error('Email is required.');
    }

    const selectedNewsletterKeys = Object.entries(newsletters)
      .filter(([_, isSelected]) => isSelected)
      .map(([key]) => key);

    if (selectedNewsletterKeys.length === 0) {
      throw new Error('Please select at least one newsletter.');
    }

    console.log('✓ Newsletter preferences updated (MOCKED):', {
      email,
      newsletters: selectedNewsletterKeys,
    });

    return {
      success: true,
      message: 'Preferences updated successfully',
      email,
      subscribedNewsletters: selectedNewsletterKeys,
    };
  },

  /**
   * Mock: Save user's learning level preference
   */
  updateLearningLevel: async (email, learningLevel) => {
    await simulateNetworkDelay();

    if (!email) {
      throw new Error('Email is required.');
    }

    // Allow null/undefined (optional)
    if (learningLevel !== null && learningLevel !== undefined) {
      if (learningLevel < 1 || learningLevel > 5) {
        throw new Error('Please select a valid learning level (1-5).');
      }
    }

    console.log('✓ Learning level saved (MOCKED):', {
      email,
      learningLevel,
    });

    return {
      success: true,
      message: 'Learning level saved successfully',
      email,
      learningLevel,
    };
  },

  /**
   * Mock: Fetch user's current newsletter subscriptions
   */
  fetchUserSubscriptions: async (email) => {
    await simulateNetworkDelay();

    console.log('✓ Fetching user subscriptions (MOCKED):', email);

    // Mock response
    return {
      success: true,
      email,
      subscribedNewsletters: ['sefaria_news', 'text_updates'],
      learningLevel: null,
    };
  },

  /**
   * Mock: Get available newsletters
   */
  getNewsletterLists: async () => {
    await simulateNetworkDelay();

    console.log('✓ Fetching newsletter lists (MOCKED)');

    return {
      newsletters: [
        {
          id: '1',
          stringid: 'sefaria_news',
          displayName: 'Sefaria News & Resources',
          emoji: '📚',
          language: 'english',
        },
        {
          id: '2',
          stringid: 'text_updates',
          displayName: 'Text Updates',
          emoji: '📖',
          language: 'english',
        },
      ],
    };
  },
};

// ============================================================================
// Real API Implementations
// ============================================================================

const RealAPI = {
  /**
   * Real: Subscribe new (logged-out) user to newsletters
   */
  subscribeNewsletter: async (data) => {
    const response = await fetch('/api/newsletter/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to subscribe');
    }

    return result;
  },

  /**
   * Real: Update preferences for logged-in user
   */
  updatePreferences: async (email, newsletters) => {
    const response = await fetch('/api/newsletter/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newsletters }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to update preferences');
    }

    return result;
  },

  /**
   * Real: Save user's learning level preference
   */
  updateLearningLevel: async (email, learningLevel) => {
    const response = await fetch('/api/newsletter/learning-level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, learningLevel }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to update learning level');
    }

    return result;
  },

  /**
   * Real: Fetch user's current newsletter subscriptions
   */
  fetchUserSubscriptions: async (email) => {
    const response = await fetch('/api/newsletter/subscriptions', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to fetch subscriptions');
    }

    return result;
  },

  /**
   * Real: Get available newsletters
   */
  getNewsletterLists: async () => {
    const response = await fetch('/api/newsletter/lists', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to fetch newsletter lists');
    }

    return result;
  },
};

// ============================================================================
// NewsletterAPI - Main Interface
// ============================================================================

const NewsletterAPI = {
  /**
   * Set whether to use mock API for current session
   * Overrides environment variable and defaults
   * @param {boolean} useMock - True to use mock API, false to use real API
   */
  setUseMockAPI(useMock) {
    if (useMock) {
      localStorage.setItem('_use_mock_api', 'true');
      console.log('✓ Switched to MOCK API mode');
    } else {
      localStorage.setItem('_use_mock_api', 'false');
      console.log('✓ Switched to REAL API mode');
    }
  },

  /**
   * Check current API mode
   * @returns {boolean} True if using mock API, false if using real API
   */
  isMockMode() {
    return isMockMode();
  },

  /**
   * Subscribe new (logged-out) user to newsletters
   */
  async subscribeNewsletter(data) {
    const impl = isMockMode() ? MockAPI : RealAPI;
    return impl.subscribeNewsletter(data);
  },

  /**
   * Update preferences for logged-in user
   */
  async updatePreferences(email, newsletters) {
    const impl = isMockMode() ? MockAPI : RealAPI;
    return impl.updatePreferences(email, newsletters);
  },

  /**
   * Save user's learning level preference
   */
  async updateLearningLevel(email, learningLevel) {
    const impl = isMockMode() ? MockAPI : RealAPI;
    return impl.updateLearningLevel(email, learningLevel);
  },

  /**
   * Fetch user's current newsletter subscriptions
   */
  async fetchUserSubscriptions(email) {
    const impl = isMockMode() ? MockAPI : RealAPI;
    return impl.fetchUserSubscriptions(email);
  },

  /**
   * Get available newsletters
   */
  async getNewsletterLists() {
    const impl = isMockMode() ? MockAPI : RealAPI;
    return impl.getNewsletterLists();
  },
};

// ============================================================================
// Module Exports
// ============================================================================

// Export as object (for component usage)
export default NewsletterAPI;

// Also export individual methods for backward compatibility
export const subscribeNewsletter = (data) =>
  NewsletterAPI.subscribeNewsletter(data);
export const updatePreferences = (email, newsletters) =>
  NewsletterAPI.updatePreferences(email, newsletters);
export const updateLearningLevel = (email, learningLevel) =>
  NewsletterAPI.updateLearningLevel(email, learningLevel);
export const fetchUserSubscriptions = (email) =>
  NewsletterAPI.fetchUserSubscriptions(email);
export const getNewsletterLists = () => NewsletterAPI.getNewsletterLists();
