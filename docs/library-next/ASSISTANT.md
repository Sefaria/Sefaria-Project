# Library Next — Assistant dock

The dock embeds the Library Assistant (`<lc-chatbot>` from the ai-chatbot repo) with the visitor's
persona. Code: `static/js/library-next/AssistantDock.jsx` (button, panel, event listener, header
action) and `static/js/library-next/assistant/` (body, strings, widget bridge, event bus, CSS).
Widget side: ai-chatbot branch `mf3`, documented in that repo's `docs/library-next-embed.md`.

## What the panel shows

- Persona greeting (`assistant.greeting.<persona>`, EN/HE) and three starter prompts
  (`assistant.starter.<persona>.{1,2,3}`, same text as the widget's own empty state). Clicking a
  prompt sends it into the chat; the buttons carry `data-feature-name="starter_prompt"`.
- `<lc-chatbot mode="panel" persona=… interface-lang=… origin="library-next" user-id=…
  api-base-url=…>` filling the rest of the panel. `persona` follows `usePersona()` live (React
  re-sets the attribute; the widget observes it).
- Without `chatbot_user_token` (anonymous visitor, or the assistant disabled for the user): the
  prompts stay, plus a "Sign in to chat" notice linking to `/login?next=<here>`. A prompt chosen
  before signing in is shown in the notice.
- Button: floating bottom-end on narrow screens, header action ("Assistant") from 768px.
  Panel: `inset-inline-end`, RTL-aware; Escape closes.

## Asking the assistant from another feature

```js
window.dispatchEvent(new CustomEvent('library-next:assistant', { detail: { prompt: 'Quiz me on Genesis 1' } }));
// or
import { requestAssistant } from '../assistant/events';
requestAssistant('Quiz me on Genesis 1');
```

The dock opens and sends the prompt as soon as the widget is ready (queued until then). Without
`detail.prompt` the event only opens the dock. With no signed-in user the prompt is shown next
to the sign-in notice instead.

## Widget versions

| Widget build | `mode="panel"` | `initial-prompt` | Dock behaviour |
|---|---|---|---|
| ai-chatbot `mf3` (commit `78bbd12` or later) | yes: inline, fills the panel | yes | panel shows greeting, prompts and the inline chat |
| chat-dev / production (`main` / `production`) | no: floats in the page corner | no | panel shows greeting + prompts and a "simulated" badge ("opens in the corner"); prompts are sent by driving the widget's shadow-DOM input (`assistant/widget.js::sendPrompt`) |

Detection is `'initial-prompt' in customElements.get('lc-chatbot').prototype`. There is no PR for
ai-chatbot `mf3` yet, so the cauldron (`mf3.cauldron.sefaria.org`) serves the chat-dev widget and
gets the second row; `?chatbot_version=<PR#>` would switch it once a PR exists (see
`sefaria/system/context_processors.py`). The chat-dev backend ignores `context.persona`.

## Where the script and props come from

- Django: `templates/library_next/app.html` emits the chatbot `<script>` through the existing
  context processor (only for users with the assistant enabled) and `library_next_props` adds
  `chatbot_user_token`, `chatbot_api_base_url`, `chatbot_origin`.
- Dev harness: no script tag; `assistant/widget.js::ensureWidget` injects
  `<api host>/static/js/lc-chatbot.umd.cjs` when a token is present. Set `CHATBOT_USER_TOKEN`
  (an encrypted token for the target backend) to test the chat locally; without it the
  sign-in fallback renders. A failed script load shows "could not be loaded" with no console error.

## Tests

`static/js/library-next/tests/AssistantDock.test.jsx`: open/close, header action, Hebrew render,
sign-in fallback with queued prompt, `library-next:assistant`, widget attributes + persona change
+ programmatic send (registry stub), bridge helpers.
