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

// TODO: Use Sefaria.apiRequestWithBody in the future by adjusting it
const parseJsonResponse = async (response) => {
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    // Empty message so callers fall through to their BILINGUAL_TEXT.GENERIC_ERROR.
    // code property preserves the HTTP status for debugging.
    throw Object.assign(new Error(), { code: `server_error_${response.status}` });
  }
  return response.json();
};

/**
 * Internal helper: performs a same-origin JSON request and returns the parsed body.
 *
 * Each caller must declare `csrf: true | false` explicitly — there is no default.
 * That keeps the security posture visible at every call site instead of implicit
 * in a heuristic, and accommodates edge cases (a GET that needs CSRF, or a
 * @csrf_exempt POST that doesn't) without having to change the helper.
 *
 * On non-OK responses, throws an Error whose message is the server-supplied
 * `error` field if present, otherwise `fallbackError`. On non-JSON responses,
 * parseJsonResponse throws a code-tagged Error with an empty message so callers
 * fall through to a generic user-facing message.
 */
const apiRequest = async (url, { method = "POST", body, csrf, fallbackError } = {}) => {
  const headers = { "Content-Type": "application/json" };
  if (csrf) {
    headers["X-CSRFToken"] = Cookies.get("csrftoken");
  }
  const response = await fetch(url, {
    method,
    mode: "same-origin",
    credentials: "same-origin",
    headers,
    body: body && JSON.stringify(body),
  });
  const result = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(result.error || fallbackError);
  }
  return result;
};

// CSRF requirements below are verified against api/newsletter_views.py:
// the three @csrf_protect-decorated views need a token; the two GETs do not.

export const subscribeNewsletter = (data) =>
  apiRequest("/api/newsletter/subscribe", {
    body: data,
    csrf: true,
    fallbackError: "Failed to subscribe",
  });

export const updatePreferences = (newsletters, { marketingOptOut = false } = {}) =>
  apiRequest("/api/newsletter/preferences", {
    body: { newsletters, marketingOptOut },
    csrf: true,
    fallbackError: "Failed to update preferences",
  });

export const updateLearningLevel = (email, learningLevel) =>
  apiRequest("/api/newsletter/learning-level", {
    body: { email, learningLevel },
    csrf: true,
    fallbackError: "Failed to update learning level",
  });

export const fetchUserSubscriptions = () =>
  apiRequest("/api/newsletter/subscriptions", {
    method: "GET",
    csrf: false,
    fallbackError: "Failed to fetch subscriptions",
  });

export const getNewsletterLists = () =>
  apiRequest("/api/newsletter/lists", {
    method: "GET",
    csrf: false,
    fallbackError: "Failed to fetch newsletter lists",
  });
