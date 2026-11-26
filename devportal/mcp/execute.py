"""The ``execute-request`` lock (PLAN §2.10, S-6).

Every rule is checked in ``prepare()``, before anything touches the network. ``send()`` only ever
receives a ``PreparedRequest`` whose URL was rebuilt here from validated parts; the caller's URL string
is never passed on. The rate limit (rule 6) is applied by the server before this module is called.

No Django import here.
"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from http.cookiejar import DefaultCookiePolicy
from typing import Any
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit

DEFAULT_API_ORIGIN = "https://www.sefaria.org"
USER_AGENT = "SefariaDevelopersMCP/1.0 (+https://developers.sefaria.org/mcp)"

MAX_URL_LENGTH = 8192
MAX_BODY_BYTES = 100 * 1024
MAX_RESPONSE_BYTES = 1024 * 1024
MAX_HEADERS = 50
MAX_HEADER_VALUE_LENGTH = 1024
MAX_QUERY_PARAMS = 100
CONNECT_TIMEOUT_SECONDS = 3
READ_TIMEOUT_SECONDS = 10
TOTAL_DEADLINE_SECONDS = 20

# Only these request headers are ever forwarded (rule 3). Content-Type is set by us when there is a body.
FORWARDED_HEADERS = {"accept": "Accept"}
# Response headers worth showing the agent. Set-Cookie and the rest are dropped.
RESPONSE_HEADERS = ("content-type", "content-length", "location", "retry-after", "cache-control")

_METHODS = frozenset({"GET", "PUT", "POST", "DELETE", "OPTIONS", "HEAD", "PATCH", "TRACE"})
_URL_FORBIDDEN = re.compile(r"[\x00-\x20\x7f\\]")  # control characters, whitespace, backslash
_DECODED_FORBIDDEN = re.compile(r"[\x00-\x1f\x7f\\%]")  # after one decode: no control, backslash or second encoding
_TEXT_FORBIDDEN = re.compile(r"[\x00-\x08\x0a-\x1f\x7f]")  # header and query values: no CR, LF or other controls
_TOKEN = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
_SEGMENT_SAFE = "!$&'()*+,;=:@"


class RequestRejected(ValueError):
    """The request breaks a rule of the lock. Nothing was sent."""


class UpstreamError(RuntimeError):
    """The request was allowed but the API could not be reached."""


@dataclass(frozen=True)
class PreparedRequest:
    method: str
    url: str
    headers: Mapping[str, str]
    body: bytes | None
    operation_id: str
    path_template: str


def _reject(message: str):
    raise RequestRejected(message)


# --- path templates ---------------------------------------------------------------------------------


def _template_segments(template: str) -> list[str]:
    return template.strip("/").split("/")


def _is_param(seg: str) -> bool:
    return seg.startswith("{") and seg.endswith("}")


def _template_matches(template: str, segments: Sequence[str]) -> bool:
    tsegs = _template_segments(template)
    for i, tseg in enumerate(tsegs):
        if i >= len(segments):
            return False
        last = i == len(tsegs) - 1
        if _is_param(tseg):
            # A trailing ``{..._path}`` parameter (e.g. ``/api/category/{category_path}``) spans segments.
            if last and tseg[1:-1].endswith("_path"):
                return True
            continue
        if tseg != segments[i]:
            return False
    return len(segments) == len(tsegs)


def match_operations(operations: Iterable[Any], segments: Sequence[str]) -> list[Any]:
    """Operations whose path template matches ``segments``, most specific template first."""
    found = [op for op in operations if _template_matches(op.path, segments)]
    return sorted(found, key=lambda op: -sum(not _is_param(s) for s in _template_segments(op.path)))


def split_path(decoded_path: str) -> list[str]:
    """Split a once-decoded path into segments, rejecting dot, empty and odd segments."""
    if not decoded_path.startswith("/"):
        _reject("The URL path must start with '/'.")
    if _DECODED_FORBIDDEN.search(decoded_path):
        _reject("The URL path contains a control character, a backslash or a double percent-encoding.")
    segments = decoded_path[1:].split("/")
    for seg in segments:
        if seg == "":
            _reject("The URL path must not contain an empty segment or a trailing slash.")
        if seg in (".", ".."):
            _reject("The URL path must not contain '.' or '..' segments.")
    return segments


# --- validation ---------------------------------------------------------------------------------------


def _origin_host(api_origin: str) -> str:
    parts = urlsplit(api_origin)
    if parts.scheme != "https" or not parts.hostname or parts.port not in (None, 443):
        msg = "DEVPORTAL_API_ORIGIN must be an https origin on port 443."
        raise ValueError(msg)
    return parts.hostname.lower()


def _check_text(value: Any, what: str, max_len: int = MAX_HEADER_VALUE_LENGTH) -> str:
    if not isinstance(value, str):
        _reject(f"{what} must be a string.")
    if len(value) > max_len:
        _reject(f"{what} is too long.")
    if _TEXT_FORBIDDEN.search(value):
        _reject(f"{what} contains a control character (CR, LF or similar).")
    return value


def _pairs(items: Any, what: str) -> list[tuple[str, str]]:
    if items is None:
        return []
    if not isinstance(items, list):
        _reject(f"{what} must be an array of {{name, value}} objects.")
    out = []
    for item in items:
        if not isinstance(item, Mapping) or "name" not in item:
            _reject(f"Every entry of {what} needs a name and a value.")
        out.append((_check_text(item["name"], f"A {what} name"), _check_text(item.get("value", ""), f"A {what} value")))
    return out


def prepare(har: Any, operations: Sequence[Any], *, api_origin: str = DEFAULT_API_ORIGIN) -> PreparedRequest:
    """Validate a HAR request against every rule of the lock and rebuild it. Raises ``RequestRejected``."""
    host = _origin_host(api_origin)
    if not isinstance(har, Mapping):
        _reject("harRequest must be an object.")

    # Rule 1: the URL.
    url = har.get("url")
    if not isinstance(url, str) or not url:
        _reject("harRequest.url must be a non-empty string.")
    if len(url) > MAX_URL_LENGTH:
        _reject("harRequest.url is too long.")
    if not url.isascii():
        _reject("harRequest.url must be ASCII; percent-encode other characters.")
    if _URL_FORBIDDEN.search(url):
        _reject("harRequest.url must not contain whitespace, control characters or backslashes.")
    if "#" in url:
        _reject("harRequest.url must not contain a fragment.")
    try:
        parts = urlsplit(url)
    except ValueError:
        _reject("harRequest.url is not a valid URL.")
    if parts.scheme.lower() != "https":
        _reject(f"Only https requests to {api_origin} are allowed.")
    if parts.netloc.lower() not in (host, f"{host}:443"):
        _reject(f"Only requests to {api_origin} are allowed (no other host, port or user info).")

    # Rule 2: the path, decoded once, must match a spec template, and the method must be defined for it.
    try:
        decoded = unquote(parts.path or "/", errors="strict")
    except UnicodeDecodeError:
        _reject("The URL path is not valid percent-encoded UTF-8.")
    segments = split_path(decoded)
    candidates = match_operations(operations, segments)
    if not candidates:
        _reject("The URL path does not match any operation of the Sefaria API. Use list-endpoints to find one.")
    method = har.get("method")
    if not isinstance(method, str) or method.upper() not in _METHODS:
        _reject("harRequest.method must be an HTTP method.")
    method = method.upper()
    allowed = [op for op in candidates if op.method == method]
    if not allowed:
        methods = ", ".join(sorted({op.method for op in candidates}))
        _reject(f"{method} is not defined for this path. Allowed: {methods}.")
    operation = allowed[0]

    # Query: the URL's own pairs plus harRequest.queryString (pairs already in the URL are not repeated).
    try:
        url_pairs = parse_qsl(parts.query, keep_blank_values=True, errors="strict")
    except (UnicodeDecodeError, ValueError):
        _reject("The query string is not valid percent-encoded UTF-8.")
    for name, value in url_pairs:
        _check_text(name, "A query name", MAX_URL_LENGTH)
        _check_text(value, "A query value", MAX_URL_LENGTH)
    extra = [p for p in _pairs(har.get("queryString"), "queryString") if p not in url_pairs]
    query = url_pairs + extra
    if len(query) > MAX_QUERY_PARAMS:
        _reject("Too many query parameters.")

    # Rule 3: headers. Every header is checked for injection; only Accept is forwarded.
    raw_headers = _pairs(har.get("headers"), "headers")
    if len(raw_headers) > MAX_HEADERS:
        _reject("Too many headers.")
    headers = {"User-Agent": USER_AGENT}
    for name, value in raw_headers:
        if not _TOKEN.match(name):
            _reject("A header name is not a valid HTTP token.")
        if name.lower() in FORWARDED_HEADERS:
            headers[FORWARDED_HEADERS[name.lower()]] = value

    # Rule 4: body, only for operations with a request body, only JSON, at most 100 KB.
    body = None
    post_data = har.get("postData")
    if post_data is not None:
        if operation.request_body is None or method != "POST":
            _reject("This operation takes no request body.")
        if not isinstance(post_data, Mapping):
            _reject("harRequest.postData must be an object.")
        if "params" in post_data:
            _reject("Form parameters are not supported; send an application/json body in postData.text.")
        mime = post_data.get("mimeType")
        if not isinstance(mime, str) or mime.split(";")[0].strip().lower() != "application/json":
            _reject("Only application/json request bodies are allowed.")
        text = post_data.get("text")
        if not isinstance(text, str):
            _reject("postData.text must be a string.")
        body = text.encode("utf-8")
        if len(body) > MAX_BODY_BYTES:
            _reject(f"The request body is larger than {MAX_BODY_BYTES // 1024} KB.")
        try:
            json.loads(text)
        except ValueError:
            _reject("postData.text is not valid JSON.")
        headers["Content-Type"] = "application/json"

    # Rebuild the URL from validated parts only.
    path = "/" + "/".join(quote(seg, safe=_SEGMENT_SAFE) for seg in segments)
    rebuilt = f"https://{host}{path}"
    if query:
        rebuilt += "?" + urlencode(query, quote_via=quote)
    if urlsplit(rebuilt).netloc != host:  # defense in depth; cannot happen with the checks above
        _reject("Internal URL check failed.")
    return PreparedRequest(method, rebuilt, headers, body, operation.operation_id, operation.path)


# --- sending ------------------------------------------------------------------------------------------


def default_session_factory():
    """A fresh ``requests`` session: no environment proxies or .netrc credentials, and a jar that keeps nothing."""
    import requests  # noqa: PLC0415 - keep import cost out of module import

    session = requests.Session()
    session.trust_env = False
    session.cookies.set_policy(DefaultCookiePolicy(allowed_domains=[]))
    session.headers.clear()
    return session


def send(prepared: PreparedRequest, session_factory: Callable[[], Any] = default_session_factory) -> dict:
    """Send an already-validated request. No redirects, bounded time, bounded size."""
    import requests  # noqa: PLC0415

    session = session_factory()
    try:
        try:
            resp = session.request(
                prepared.method,
                prepared.url,
                headers=dict(prepared.headers),
                data=prepared.body,
                allow_redirects=False,
                timeout=(CONNECT_TIMEOUT_SECONDS, READ_TIMEOUT_SECONDS),
                stream=True,
            )
        except requests.RequestException as e:
            msg = f"The request to the API failed: {type(e).__name__}."
            raise UpstreamError(msg) from e
        try:
            buf = bytearray()
            truncated = False
            deadline = time.monotonic() + TOTAL_DEADLINE_SECONDS
            try:
                for chunk in resp.iter_content(chunk_size=65536):
                    buf += chunk
                    if len(buf) > MAX_RESPONSE_BYTES:
                        del buf[MAX_RESPONSE_BYTES:]
                        truncated = True
                        break
                    if time.monotonic() > deadline:
                        truncated = True
                        break
            except requests.RequestException:
                truncated = True
            encoding = resp.encoding or "utf-8"
            try:
                text = bytes(buf).decode(encoding, errors="replace")
            except LookupError:
                text = bytes(buf).decode("utf-8", errors="replace")
            headers = {k: resp.headers[k] for k in RESPONSE_HEADERS if k in resp.headers}
            result = {
                "request": {"method": prepared.method, "url": prepared.url},
                "status": resp.status_code,
                "statusText": resp.reason or "",
                "headers": headers,
                "body": text,
                "truncated": truncated,
            }
            if resp.is_redirect or 300 <= resp.status_code < 400:
                result["redirectNotFollowed"] = True
            return result
        finally:
            resp.close()
    finally:
        session.close()


def execute(
    har: Any,
    operations: Sequence[Any],
    *,
    api_origin: str = DEFAULT_API_ORIGIN,
    session_factory: Callable[[], Any] = default_session_factory,
) -> dict:
    return send(prepare(har, operations, api_origin=api_origin), session_factory)
