# `devportal/mcp`: the developers-portal MCP server

The MCP server at `https://developers.sefaria.org/mcp` (PLAN §2.10). It is written by hand, without the
official SDK, because the site runs on WSGI and the SDK's server needs ASGI. The core imports no Django;
`django_view.py` is the only Django glue and imports Django lazily.

## Owner

To be named by the team (`H-10`, PLAN Appendix C). Until then, changes go through the developer-portal
reviewers.

## Maintenance

- **Protocol versions.** `SUPPORTED_PROTOCOL_VERSIONS` in `server.py` is the one place to update when the
  MCP specification changes. The first entry is offered to a client that asks for a version the server
  does not know.
- **Detecting a specification change.** `devportal/tests/mcp_conformance_test.py` drives this server with
  the official `mcp` Python SDK's client (a pinned test-only dependency). Bumping that dependency is how a
  specification change is detected: the test fails if the SDK's newest protocol version is not supported
  here, or if the SDK can no longer complete `initialize`, `tools/list` and a call of each tool.
- **In sync with the API spec by construction.** The tools read `docs/openAPI.json` at process start
  (`provider.py`), so a spec change reaches the server with the deploy that ships it. A test
  (`devportal/tests/pure/mcp_endpoints_test.py`) checks that every operation in the spec is listed by
  `list-endpoints`. When `devportal.spec` lands, swap `OpenAPIFileProvider` for a provider built on its
  operation index and the published overlay; the rest of this package does not change.
- **The tool surface.** Names, titles and input schemas in `tools.py` are byte-identical to live's
  capture (`docs/dev-portal/research/site/machine/mcp-tools-list.json`), checked by
  `mcp_tools_list_test.py`. Only `execute-request`'s description (one sentence) and its annotations differ
  (I-9).

## Layout

| File             | What it does                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `server.py`      | JSON-RPC 2.0 over streamable HTTP (one POST, one JSON answer; 202 for notifications), GET/OPTIONS |
| `tools.py`       | The four tools and their definitions                                                              |
| `provider.py`    | The provider interface and the default `docs/openAPI.json` provider                               |
| `execute.py`     | `execute-request`'s lock: every rule is checked before any network call                           |
| `ratelimit.py`   | Fixed-window limits on an injected cache (Django's cache in production)                           |
| `django_view.py` | The thin Django view (`csrf_exempt`; never reads the user, the session or cookies)                |

## `execute-request` rules (S-6)

1. `https` only; host exactly that of `DEVPORTAL_API_ORIGIN` (`https://www.sefaria.org`); no user info, no
   port other than 443, no backslash, whitespace or control character. The outgoing URL is rebuilt from
   the validated parts.
2. The path, percent-decoded once, must match a path template in the spec, with no `.`, `..` or empty
   segment; the method must be one the spec defines for that path.
3. Only `Accept` is forwarded (plus our `Content-Type` for a JSON body and our `User-Agent`); `Cookie`,
   `Authorization`, `Host` and `X-Forwarded-*` never are. A header with CR, LF or another control character
   rejects the request.
4. A body only for the POST operations, only `application/json`, at most 100 KB; form `params` are rejected.
5. `requests` with `allow_redirects=False`, a 3 s connect and 10 s read timeout, a fresh session that keeps
   no cookies and ignores environment proxies and `.netrc`; at most 1 MB of the response is read and the
   result is marked `truncated` beyond that.
6. Rate limits: 30 `execute-request` calls per minute per IP and 600 overall; 120 per minute per IP for
   the other tools.
