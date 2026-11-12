// Helpers for calling the Library Assistant's server (ai-chatbot) from a Sefaria page.

// The API base the page's widget uses: a ?chatbot_version=N preview deployment when one is set,
// else the configured base, else null.
export const chatbotApiBaseUrl = ({ chatbot_version, chatbot_api_base_url } = {}) =>
  chatbot_version ? `https://${chatbot_version}.ai-server.coolifydev.sefaria.org/api` : chatbot_api_base_url || null;

// One call to the personalization settings endpoint. The signed user token goes in the JSON body
// as `userId`, exactly as the widget sends it; no custom header (the server's CORS list refuses one).
// Resolves to the parsed JSON; rejects with {status, body} on an error status, or {status: 0} when
// the server cannot be reached.
export const laSettings = async (base, token, action, body = {}) => {
  let response;
  try {
    response = await fetch(`${base}/v2/personalization/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: token, action, ...body }),
    });
  } catch (e) {
    throw { status: 0, body: null };
  }
  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }
  if (!response.ok) {
    throw { status: response.status, body: data };
  }
  return data;
};
