// Helpers for calling the Library Assistant's server (ai-chatbot) from a Sefaria page.

const isIntegerString = (value) => /^-?\d+$/.test(String(value).trim());

// The ?chatbot_version of the page URL, or null (also outside a browser).
const urlParam = () => {
  try {
    return new URLSearchParams(window.location.search).get('chatbot_version');
  } catch (e) {
    return null;
  }
};

// The API base the page's widget and settings panel use: a ?chatbot_version=N preview deployment when
// one is set (on the page URL itself, else in the props), else the configured base, else null.
// Integers only, like the server; `?chatbot_version=clear` in the URL means no preview.
export const chatbotApiBaseUrl = ({ chatbot_version, chatbot_api_base_url } = {}) => {
  const param = (urlParam() || '').trim();
  let version = null;
  if (param === 'clear') {
    version = null;
  } else if (isIntegerString(param)) {
    version = param;
  } else if (chatbot_version && isIntegerString(chatbot_version)) {
    version = String(chatbot_version).trim();
  }
  return version ? `https://${version}.ai-server.coolifydev.sefaria.org/api` : chatbot_api_base_url || null;
};

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
