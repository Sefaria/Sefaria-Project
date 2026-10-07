/**
 * Bridge to the `<lc-chatbot>` web component (ai-chatbot). The script tag normally comes from the
 * Django template; the dev harness has none, so `ensureWidget()` injects it from the API host.
 * `sendPrompt()` prefers the `initial-prompt` attribute (ai-chatbot `mf3`) and falls back to
 * driving the shadow-DOM input on older bundles (chat-dev), which also float in the page corner.
 */
export const WIDGET_TAG = 'lc-chatbot';
export const WIDGET_SCRIPT_PATH = '/static/js/lc-chatbot.umd.cjs';

const registry = () => (typeof customElements !== 'undefined' ? customElements : null);

export function widgetScriptUrl(apiBaseUrl) {
  const base = String(apiBaseUrl || 'https://chat-dev.sefaria.org/api').replace(/\/api\/?$/, '');
  return `${base}${WIDGET_SCRIPT_PATH}`;
}

export function widgetClass() {
  const reg = registry();
  return reg ? reg.get(WIDGET_TAG) : undefined;
}

/** True when the defined widget understands `initial-prompt` (and therefore `mode="panel"`). */
export function widgetSupportsPanel(Cls = widgetClass()) {
  return !!Cls && 'initial-prompt' in Cls.prototype;
}

let loading = null;

/**
 * Resolve to 'ready' once `lc-chatbot` is defined, injecting the script when nothing on the page
 * has (dev harness). Resolves 'unavailable' when the script cannot load; never throws or logs.
 */
export function ensureWidget(apiBaseUrl, { timeoutMs = 15000 } = {}) {
  const reg = registry();
  if (!reg) { return Promise.resolve('unavailable'); }
  if (reg.get(WIDGET_TAG)) { return Promise.resolve('ready'); }
  if (loading) { return loading; }
  loading = new Promise((resolve) => {
    const done = (state) => { loading = null; resolve(state); };
    const timer = setTimeout(() => done('unavailable'), timeoutMs);
    reg.whenDefined(WIDGET_TAG).then(() => { clearTimeout(timer); done('ready'); });
    const url = widgetScriptUrl(apiBaseUrl);
    if (!document.querySelector(`script[src="${url}"]`) && !document.querySelector(`script[src*="${WIDGET_SCRIPT_PATH}"]`)) {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onerror = () => { clearTimeout(timer); done('unavailable'); };
      document.head.appendChild(script);
    }
  });
  return loading;
}

/**
 * Send `text` into a mounted widget. Returns 'attribute' (mf3 widget), 'shadow' (older widget,
 * driven through its shadow DOM) or null when nothing could be done.
 */
export function sendPrompt(el, text) {
  const prompt = String(text || '').trim();
  if (!el || !prompt) { return null; }
  if ('initial-prompt' in el) {
    el.setAttribute('initial-prompt', prompt);
    setTimeout(() => el.removeAttribute('initial-prompt'), 0);
    return 'attribute';
  }
  const root = el.shadowRoot;
  if (!root) { return null; }
  const trigger = root.querySelector('.lc-chatbot-trigger');
  if (trigger) { trigger.click(); }
  const drive = () => {
    const input = root.querySelector('textarea');
    if (!input) { return; }
    input.value = prompt;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const send = root.querySelector('.send-btn');
    if (send) { setTimeout(() => send.click(), 0); }
  };
  if (trigger) { setTimeout(drive, 150); } else { drive(); }
  return 'shadow';
}
