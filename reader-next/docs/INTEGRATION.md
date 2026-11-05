# Integration: what other apps on the page can ask of the reader

TARGET_ARCHITECTURE §6.12. The reader team owns this interface and its tests; the AI team owns the Library Assistant's side.

## Events the reader receives (`src/lib/integration/legacy-events.ts`)

Installed once per page by the shell (`src/routes/__root.tsx`), as sefaria.org's `ReaderApp` receives them.

| Event (on `document`) | `detail` | What the reader does |
|---|---|---|
| `sefaria:bootstrap-url` | a URL, or `{url, replaceHistory?}` | A page of this client (a text, the library, search): a navigation in the app, replacing the history entry when `replaceHistory` is set. The address is the whole workspace, so a ref closes all panels, as on sefaria.org. A page Django serves (`src/lib/routing/django-paths.ts`: topics, sheets, profiles…) or another Sefaria site: a full page load. Any other site, or a non-http(s) URL: ignored. |
| `sefaria:settings-updated` | the changed settings | What was read about the reader (account, settings) is read again. |

## The Library Assistant (`<lc-chatbot>`)

`src/features/assistant/LibraryAssistant.tsx`, mounted by the shell. It is shown to a signed-in reader who has the assistant on, on a
screen wider than 842px, unless remote config hides it (`feature.client.remote_config_json` → `chatbot.hide: 1`). The script loads
only for those readers, in the browser, once per page. Nothing is rendered on the server.

**What it sends** (from its build, `lc-chatbot.umd.cjs`):

| Event | Payload | Handled by |
|---|---|---|
| `sefaria:bootstrap-url` | `{url: path+query+hash, replaceHistory: true}` (a source in an answer) | navigation in the app, replacing the entry |
| `sefaria:bootstrap-url` | `{url}` (a full Sefaria URL) | navigation in the app, or a page load for Django's pages and other Sefaria sites |
| `sefaria:bootstrap-url` | `{url: "/topics/<slug>"}` (a topic suggestion) | a page load (topics are Django's) |
| `appetizer_click` | `{topicSlug, sessionId}`, on the element (bubbles, composed) | not the page's: the assistant's own analytics. sefaria.org has no listener; the topic navigation it goes with is the `sefaria:bootstrap-url` above. |

Links to other sites the assistant opens in a new tab itself.

**Its attributes** (`src/lib/assistant/config.ts` `assistantAttributes`, as sefaria.org's ReaderApp sets them):

| Attribute | From |
|---|---|
| `user-id` | the encrypted token from `GET /api/library-assistant` (Django: `library_assistant.is_enabled`, `build_chatbot_user_token`) |
| `api-base-url` | the build (below) |
| `origin` | `sefaria-<SENTRY_ENVIRONMENT>` |
| `is-moderator` | staff readers |
| `placement`, `default-open`, `mode` | `right`, `true`, `floating` |
| `max-input-chars`, `max-prompts` | remote config `feature.chatbot.max_input_chars` / `max_prompts` (10000 / 100) |
| `interface-lang` | `en` / `he` |

**Which build** (first match wins), the same rules as Django's context processor:

1. `?chatbot_version=<n>` on any page: preview build `n` (`https://<n>.ai-server.coolifydev.sefaria.org`), remembered for the browser
   session in the `chatbot_version` cookie. `?chatbot_version=clear` forgets it. Anything but a number is ignored.
2. `CHATBOT_VERSION` (server env): the same, for a whole deployment.
3. `CHATBOT_USE_LOCAL_SCRIPT=1` (server env): the assistant's Vite dev server, `http://localhost:5173/src/main.js` as an ES module.
4. `CHATBOT_API_BASE_URL` (server env, Django's variable; the helm chart passes the same secret key to the reader pod): its static build
   at `<base without /api>/static/js/lc-chatbot.umd.cjs`. Default `https://chat-dev.sefaria.org/api`, as Django's.

Tests: `src/lib/assistant/*.test.ts`, `src/features/assistant/LibraryAssistant.test.tsx`, `src/lib/integration/legacy-events.test.ts`,
`e2e/library-assistant.spec.ts` (the three payloads on a real page). Django: `reader/tests/library_assistant_api_test.py`.
