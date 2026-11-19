# C10: security invariants

Contract C10 of the developer portal (PLAN.md §4.3). The values are in [`security.json`](security.json), which tests read; this file explains them. Sources: PLAN.md §2.3.5 (editor permissions), §2.6 (sanitizer, HTMLBlock frame), §2.10 (`execute-request`), §2.12 (CSP, Try It, API keys). Change only through the Integrator.

## 1. Content Security Policy

`devportal/security/csp.py` builds the policy for every portal response with a fresh nonce:

```
default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self';
script-src 'self' 'nonce-{nonce}' https://www.googletagmanager.com;
style-src 'self';
img-src 'self' data: https://storage.googleapis.com https://www.google-analytics.com https://www.googletagmanager.com;
font-src 'self';
connect-src 'self' {api_origin} https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com;
frame-src 'self' https://sefaria.formstack.com https://www.youtube-nocookie.com;
manifest-src 'self'
```

`{api_origin}` is `DEVPORTAL_API_ORIGIN`. The header is one line; directives are joined with `; `.

- Never `'unsafe-inline'` or `'unsafe-eval'` for scripts. Every `<script>` carries the nonce, including the `dp-data` JSON island.
- No inline `<style>` and no `style` attribute on public templates. If a pinned library needs inline style attributes, add `style-src-attr 'unsafe-inline'` only, with a comment in `csp.py` naming the library. Editor responses carry that allowance because ProseMirror sets inline styles. `style-src` is never widened.
- `DEVPORTAL_ALLOW_README_IMAGES` (default true) appends `https://files.readme.io` to `img-src` until the images are mirrored. Cutover requires it off.
- Local development only: when `DEBUG` is on and `DEVPORTAL_VITE_DEV_SERVER` is set, the dev server's origin (and its websocket origin) is allowed, and `style-src` gets `'unsafe-inline'` for Vite's injected styles. Never in a deployed environment.

Also on every portal response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, `Content-Language: en`. Page responses also carry the agent `Link` headers.

Public pages set no cookie. Views never touch `request.session`. The CSRF cookie is set only by `GET /_portal/csrf`, on the first use of the feedback widget or the editor.

## 2. HTMLBlock frames

Each `<HTMLBlock>` renders as `<iframe sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" src="/_portal/htmlblock/<revision>/<n>">`. That endpoint answers with its own policy, replacing the page policy:

```
sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox; default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' https://storage.googleapis.com data:; font-src 'self'
```

No `allow-scripts`, ever: `allow-same-origin` without it is safe and lets the parent read the frame's height.

## 3. Try It

`devportal-ui/src/reference/tryit/send.ts` is the only module that calls the API:

```ts
fetch(url, {
  method,
  headers,
  body,
  credentials: 'omit',
  mode: 'cors',
  cache: 'no-store',
  referrerPolicy: 'no-referrer',
});
```

- `credentials: 'omit'` because the session cookie is shared with the library host.
- The origin is the payload's `apiOrigin` constant; no input exists for it. Every path parameter is encoded with `encodeURIComponent`, and for every operation and adversarial values the URL starts with `apiOrigin + "/api/"`.
- Response bodies enter the DOM as text nodes only.
- Recent Requests: `localStorage["dp:recent-requests:v1"]`, at most 50 entries of time, status, method, path and `operationId`. Never a body, a query value or a key.
- No server-side proxy exists.
- API keys: while `DEVPORTAL_DEMO_API_KEY` is empty, nothing sends or shows a key. When set, Try It sends `X-API-Key` and samples include it. A visitor's own key lives in `sessionStorage` only and never reaches the developers host, a URL, Recent Requests or analytics.

## 4. MCP `execute-request`

`devportal/mcp/execute.py` checks everything before any network call:

1. URL: scheme `https`; host equal to the host of `DEVPORTAL_API_ORIGIN` (after lowercasing; no look-alikes, IP literals or trailing dot); no user info; port absent or 443; no backslash, whitespace or control character. The outgoing URL is rebuilt from the validated parts.
2. Path: percent-decoded once; must match a path template in `docs/openAPI.json`; no `.`, `..` or empty segment; the method must be one the spec defines for that path.
3. Headers: forward only `Accept` and `Content-Type`; set our own `User-Agent`; never forward `Cookie`, `Authorization`, `Host` or `X-Forwarded-*`.
4. Body: only for the spec's POST operations, only `application/json`, at most 100 KB (102,400 bytes). Form `params` are rejected.
5. Transport: `requests`, `allow_redirects=False`, 3 s connect and 10 s read timeouts, a fresh session with no cookie jar, at most 1 MB of response read, beyond that truncated and marked.
6. Rate limits (fixed windows on Django's cache, by client IP): 30 `execute-request` calls per minute per IP, 600 per minute overall, 120 per minute per IP for the other tools.

Annotations: `readOnlyHint: true`, `destructiveHint: false` (I-9). `POST /mcp` is the app's only `csrf_exempt` view and never reads `request.user` or the session.

## 5. Editor API

Every view under `/_portal/editor/` is wrapped by `devportal.security.permissions.staff_api`: 401 JSON for anonymous users, 403 for non-staff, 403 without a CSRF token. Uploads: PNG, JPEG, GIF and WebP only, verified by decoding with Pillow, at most 5 MB. HTML sent by a client is never stored; rendered HTML always comes from the server's Markdown renderer and sanitizer.

## 6. Sanitizer allow-list

After rendering, `nh3` filters the HTML (the full list is `sanitizer` in `security.json`):

- Tags: the tags the renderer emits (fixed in C4, `DIALECT.md`) and the raw tags the corpus uses (`br`, `div`, `span`, `a`, `p`, `b`, `hr`, `code`, `iframe`). A tag C4 emits that `security.json` lacks is added there by the Integrator, never allowed ad hoc in code.
- `class` only with tokens that start with `dp-`. `id` (heading anchors) except the reserved `dp-data` and `dp-root`. `dir` (`auto`, `ltr`, `rtl`).
- `href` and `src` only with `http`, `https`, `mailto` or a relative URL (not protocol-relative). Links get `rel="noopener noreferrer"`.
- `iframe` only when `src` starts with `https://sefaria.formstack.com/`, `https://www.youtube-nocookie.com/`, or `/_portal/htmlblock/` (the renderer's own HTMLBlock frames, which must carry the sandbox value of §2).
- Never: `style` attributes, event-handler attributes, `srcdoc`, `script`, `style`, `object`, `embed`, `form` and form controls, `link`, `meta`, `base`, `svg`, `math`, comments. The contact page's inline iframe style is replaced by CSS.
