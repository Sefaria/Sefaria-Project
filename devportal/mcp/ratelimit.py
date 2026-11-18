"""Fixed-window rate limits for ``tools/call`` (PLAN §2.10 rule 6).

The counter lives in an injected cache with Django's cache API (``add``, ``incr``, ``set``): Django's
cache in production, ``InMemoryCache`` in tests. Limits per minute:

- ``execute-request``: 30 per client IP, and 600 for all clients together;
- every other tool: 120 per client IP.

No Django import here.
"""

from __future__ import annotations

import hashlib
import re
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

WINDOW_SECONDS = 60
EXECUTE_TOOL = "execute-request"
EXECUTE_PER_IP = 30
EXECUTE_GLOBAL = 600
OTHER_PER_IP = 120

_SAFE_IP = re.compile(r"^[0-9A-Fa-f:.]{1,45}$")


@dataclass(frozen=True)
class Decision:
    allowed: bool
    retry_after: int = 0
    scope: str = ""


class InMemoryCache:
    """The subset of Django's cache API the limiter uses, with expiry on an injectable clock."""

    def __init__(self, clock: Callable[[], float] = time.time):
        self._clock = clock
        self._data: dict[str, tuple[int, float]] = {}
        self._lock = threading.Lock()

    def _live(self, key):
        item = self._data.get(key)
        if item is not None and item[1] <= self._clock():
            del self._data[key]
            return None
        return item

    def add(self, key, value, timeout):
        with self._lock:
            if self._live(key) is not None:
                return False
            self._data[key] = (value, self._clock() + timeout)
            return True

    def set(self, key, value, timeout):
        with self._lock:
            self._data[key] = (value, self._clock() + timeout)

    def get(self, key, default=None):
        with self._lock:
            item = self._live(key)
            return default if item is None else item[0]

    def incr(self, key, delta=1):
        with self._lock:
            item = self._live(key)
            if item is None:
                msg = f"Key {key!r} not found"
                raise ValueError(msg)
            self._data[key] = (item[0] + delta, item[1])
            return item[0] + delta


def client_key(client_ip: str | None) -> str:
    if not client_ip:
        return "unknown"
    if _SAFE_IP.match(client_ip):
        return client_ip
    return hashlib.sha256(client_ip.encode("utf-8", "replace")).hexdigest()[:32]


class FixedWindowRateLimiter:
    def __init__(
        self,
        cache,
        *,
        window: int = WINDOW_SECONDS,
        clock: Callable[[], float] = time.time,
        prefix: str = "devportal:mcp:rl",
    ):
        self.cache = cache
        self.window = window
        self.clock = clock
        self.prefix = prefix

    def _hit(self, name: str, limit: int) -> tuple[bool, int]:
        now = self.clock()
        bucket = int(now // self.window)
        key = f"{self.prefix}:{name}:{bucket}"
        self.cache.add(key, 0, self.window * 2)
        try:
            count = self.cache.incr(key)
        except ValueError:  # expired between add and incr
            self.cache.set(key, 1, self.window * 2)
            count = 1
        retry_after = max(1, int((bucket + 1) * self.window - now + 0.999))
        return count <= limit, retry_after

    def check_tool_call(self, tool_name: str, client_ip: str | None) -> Decision:
        ip = client_key(client_ip)
        if tool_name == EXECUTE_TOOL:
            ok, retry = self._hit(f"exec:ip:{ip}", EXECUTE_PER_IP)
            if not ok:
                return Decision(False, retry, "ip")
            ok, retry = self._hit("exec:all", EXECUTE_GLOBAL)
            if not ok:
                return Decision(False, retry, "global")
            return Decision(True)
        ok, retry = self._hit(f"tools:ip:{ip}", OTHER_PER_IP)
        return Decision(True) if ok else Decision(False, retry, "ip")
