import Cookies from "js-cookie";

/**
 * Newsletter API — Real endpoints
 *
 * - POST /api/newsletter/subscribe       Subscribe new user
 * - POST /api/newsletter/preferences     Update logged-in user preferences
 * - POST /api/newsletter/learning-level  Save learning level
 * - GET  /api/newsletter/subscriptions   Fetch user's subscriptions
 * - GET  /api/newsletter/lists           Fetch available newsletters
 */

const parseJsonResponse = async (response) => {
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    // Empty message so callers fall through to their BILINGUAL_TEXT.GENERIC_ERROR.
    // code property preserves the HTTP status for debugging.
    throw Object.assign(new Error(), { code: `server_error_${response.status}` });
  }
  return response.json();
};

export const subscribeNewsletter = async (data) => {
  const response = await fetch("/api/newsletter/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(result.error || "Failed to subscribe");
  }
  return result;
};

export const updatePreferences = async (email, newsletters, options = {}) => {
  const { marketingOptOut = false } = options;
  const response = await fetch("/api/newsletter/preferences", {
    method: "POST",
    mode: "same-origin",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": Cookies.get("csrftoken"),
    },
    body: JSON.stringify({ newsletters, marketingOptOut }),
  });
  const result = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(result.error || "Failed to update preferences");
  }
  return result;
};

export const updateLearningLevel = async (email, learningLevel) => {
  const response = await fetch("/api/newsletter/learning-level", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, learningLevel }),
  });
  const result = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(result.error || "Failed to update learning level");
  }
  return result;
};

export const fetchUserSubscriptions = async (email) => {
  const response = await fetch("/api/newsletter/subscriptions", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const result = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(result.error || "Failed to fetch subscriptions");
  }
  return result;
};

export const getNewsletterLists = async () => {
  const response = await fetch("/api/newsletter/lists", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const result = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(result.error || "Failed to fetch newsletter lists");
  }
  return result;
};
