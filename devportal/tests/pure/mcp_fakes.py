"""Test doubles shared by the MCP tests: a recording ``requests`` session and a fake response."""

from __future__ import annotations

import json


class FakeResponse:
    def __init__(self, status=200, headers=None, body=b"", reason="OK", chunk=65536):
        self.status_code = status
        self.headers = dict(headers or {"content-type": "application/json"})
        self._body = body
        self.reason = reason
        self.encoding = "utf-8"
        self._chunk = chunk
        self.closed = False
        self.read_bytes = 0

    @property
    def is_redirect(self):
        return "location" in self.headers and self.status_code in (301, 302, 303, 307, 308)

    def iter_content(self, chunk_size=1):
        size = min(chunk_size, self._chunk)
        for i in range(0, len(self._body), size):
            piece = self._body[i : i + size]
            self.read_bytes += len(piece)
            yield piece

    def close(self):
        self.closed = True


class RecordingSessionFactory:
    """Stands in for ``default_session_factory``; records every session made and every request sent."""

    def __init__(self, response=None):
        self.response = response or FakeResponse(body=json.dumps({"ok": True}).encode())
        self.sessions = []
        self.requests = []

    def __call__(self):
        factory = self

        class _Session:
            closed = False

            def request(self, method, url, **kwargs):
                factory.requests.append({"method": method, "url": url, **kwargs})
                return factory.response

            def close(self):
                self.closed = True

        session = _Session()
        self.sessions.append(session)
        return session

    @property
    def called(self):
        return bool(self.sessions or self.requests)
