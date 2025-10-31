/**
 * Newsletter API Module - Mocked API layer
 *
 * This module provides mocked API endpoints for newsletter operations.
 * In production, these will be replaced with actual backend API calls.
 *
 * Mocked endpoints:
 * - subscribeNewsletter: Subscribe new user to newsletters
 * - updatePreferences: Update existing user's newsletter preferences
 * - updateLearningLevel: Save user's learning level preference
 *
 * All endpoints include realistic network delay simulation and error handling.
 */

/**
 * Simulates network delay for realistic API behavior
 * @param {number} minMs - Minimum delay in milliseconds
 * @param {number} maxMs - Maximum delay in milliseconds
 * @returns {Promise} Resolves after random delay
 */
const simulateNetworkDelay = (minMs = 300, maxMs = 800) => {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
};

/**
 * Subscribe new (logged-out) user to newsletters
 *
 * @param {Object} data - Subscription data
 * @param {string} data.firstName - User's first name
 * @param {string} data.lastName - User's last name
 * @param {string} data.email - User's email address
 * @param {Object} data.newsletters - Selected newsletters object {key: boolean, ...}
 * @returns {Promise<Object>} Success response with subscription details
 * @throws {Error} If subscription fails
 */
export const subscribeNewsletter = async (data) => {
  const { firstName, lastName, email, newsletters } = data;

  // Simulate network delay
  await simulateNetworkDelay();

  // Validate inputs (in real API, backend would validate)
  if (!firstName || !email) {
    throw new Error('First name and email are required.');
  }

  const selectedNewsletterKeys = Object.entries(newsletters)
    .filter(([_, isSelected]) => isSelected)
    .map(([key]) => key);

  if (selectedNewsletterKeys.length === 0) {
    throw new Error('Please select at least one newsletter.');
  }

  // Simulate occasional errors for testing (remove in production)
  // const shouldError = Math.random() < 0.05; // 5% error rate
  // if (shouldError) {
  //   throw new Error('Failed to subscribe. Please try again.');
  // }

  // Mock successful response
  console.log('✓ Newsletter subscription mocked:', {
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
};

/**
 * Update preferences for logged-in user
 *
 * @param {string} email - User's email address
 * @param {Object} newsletters - Selected newsletters object {key: boolean, ...}
 * @returns {Promise<Object>} Success response with updated preferences
 * @throws {Error} If update fails
 */
export const updatePreferences = async (email, newsletters) => {
  // Simulate network delay
  await simulateNetworkDelay();

  // Validate inputs
  if (!email) {
    throw new Error('Email is required.');
  }

  const selectedNewsletterKeys = Object.entries(newsletters)
    .filter(([_, isSelected]) => isSelected)
    .map(([key]) => key);

  if (selectedNewsletterKeys.length === 0) {
    throw new Error('Please select at least one newsletter.');
  }

  // Mock successful response
  console.log('✓ Newsletter preferences updated (mocked):', {
    email,
    newsletters: selectedNewsletterKeys,
  });

  return {
    success: true,
    message: 'Preferences updated successfully',
    email,
    subscribedNewsletters: selectedNewsletterKeys,
  };
};

/**
 * Save user's learning level preference
 *
 * @param {string} email - User's email address
 * @param {number} learningLevel - Learning level (1-5)
 * @returns {Promise<Object>} Success response with learning level saved
 * @throws {Error} If save fails
 */
export const updateLearningLevel = async (email, learningLevel) => {
  // Simulate network delay
  await simulateNetworkDelay();

  // Validate inputs
  if (!email) {
    throw new Error('Email is required.');
  }

  if (!learningLevel || learningLevel < 1 || learningLevel > 5) {
    throw new Error('Please select a valid learning level.');
  }

  // Mock successful response
  console.log('✓ Learning level saved (mocked):', {
    email,
    learningLevel,
  });

  return {
    success: true,
    message: 'Learning level saved successfully',
    email,
    learningLevel,
  };
};

/**
 * Future: Fetch user's current newsletter subscriptions
 * This would be called to pre-populate preferences for logged-in users
 *
 * @param {string} email - User's email address
 * @returns {Promise<Object>} User's current subscriptions
 */
export const fetchUserSubscriptions = async (email) => {
  await simulateNetworkDelay();

  // Mock response - in future, would fetch actual user data
  console.log('✓ Fetching user subscriptions (mocked):', email);

  return {
    success: true,
    email,
    subscribedNewsletters: ['sefaria_news', 'text_updates'],
    learningLevel: null,
  };
};
