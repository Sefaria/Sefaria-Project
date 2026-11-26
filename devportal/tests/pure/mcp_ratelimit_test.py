"""Fixed-window limits for tools/call (PLAN §2.10 rule 6)."""

import json

import pytest

from devportal.mcp import ratelimit as rl
from devportal.mcp.server import McpServer
from devportal.tests.pure.mcp_fakes import RecordingSessionFactory


class Clock:
    def __init__(self, now=1_000_020.0):
        self.now = now

    def __call__(self):
        return self.now


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def limiter(clock):
    return rl.FixedWindowRateLimiter(rl.InMemoryCache(clock), clock=clock)


def _allowed(limiter, tool, ip, n):
    return [limiter.check_tool_call(tool, ip).allowed for _ in range(n)]


def test_execute_request_per_ip(limiter):
    assert all(_allowed(limiter, "execute-request", "1.1.1.1", rl.EXECUTE_PER_IP))
    decision = limiter.check_tool_call("execute-request", "1.1.1.1")
    assert (decision.allowed, decision.scope) == (False, "ip")
    assert 1 <= decision.retry_after <= 60
    assert limiter.check_tool_call("execute-request", "2.2.2.2").allowed


def test_execute_request_global(limiter):
    for i in range(rl.EXECUTE_GLOBAL // rl.EXECUTE_PER_IP):
        assert all(_allowed(limiter, "execute-request", f"10.0.0.{i}", rl.EXECUTE_PER_IP))
    decision = limiter.check_tool_call("execute-request", "10.0.1.1")
    assert (decision.allowed, decision.scope) == (False, "global")
    # The global cap does not affect the other tools.
    assert limiter.check_tool_call("list-endpoints", "10.0.1.1").allowed


def test_other_tools_per_ip_and_separate_from_execute(limiter):
    assert all(_allowed(limiter, "execute-request", "1.1.1.1", rl.EXECUTE_PER_IP))
    assert all(_allowed(limiter, "search-endpoints", "1.1.1.1", rl.OTHER_PER_IP // 2))
    assert all(_allowed(limiter, "get-endpoint", "1.1.1.1", rl.OTHER_PER_IP // 2))
    assert not limiter.check_tool_call("list-endpoints", "1.1.1.1").allowed
    assert limiter.check_tool_call("list-endpoints", "3.3.3.3").allowed


def test_window_resets(limiter, clock):
    assert all(_allowed(limiter, "execute-request", "1.1.1.1", rl.EXECUTE_PER_IP))
    assert not limiter.check_tool_call("execute-request", "1.1.1.1").allowed
    clock.now += 60
    assert limiter.check_tool_call("execute-request", "1.1.1.1").allowed


def test_retry_after_points_at_the_next_window(limiter, clock):
    clock.now = 600.0 + 45.5
    _allowed(limiter, "execute-request", "1.1.1.1", rl.EXECUTE_PER_IP)
    assert limiter.check_tool_call("execute-request", "1.1.1.1").retry_after == 15


def test_client_keys_are_cache_safe():
    assert rl.client_key("2001:db8::1") == "2001:db8::1"
    assert rl.client_key(None) == "unknown"
    weird = rl.client_key("1.1.1.1 \r\n evil")
    assert len(weird) == 32
    assert weird.isalnum()


def test_in_memory_cache_expires(clock):
    cache = rl.InMemoryCache(clock)
    assert cache.add("k", 0, 10)
    assert not cache.add("k", 5, 10)
    assert cache.incr("k") == 1
    clock.now += 10
    assert cache.get("k") is None
    with pytest.raises(ValueError, match="not found"):
        cache.incr("k")


def test_limiter_recovers_when_key_vanishes_between_add_and_incr(clock):
    class Flaky(rl.InMemoryCache):
        def add(self, key, value, timeout):
            return True  # pretend it was added, but store nothing (as an evicting cache might)

    limiter = rl.FixedWindowRateLimiter(Flaky(clock), clock=clock)
    assert limiter.check_tool_call("execute-request", "1.1.1.1").allowed


def test_server_returns_rate_limit_error_without_sending(clock):
    sessions = RecordingSessionFactory()
    server = McpServer(
        ratelimiter=rl.FixedWindowRateLimiter(rl.InMemoryCache(clock), clock=clock), session_factory=sessions
    )
    msg = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "execute-request",
            "arguments": {"harRequest": {"method": "GET", "url": "https://www.sefaria.org/api/index"}},
        },
    }
    body = json.dumps(msg).encode()
    for _ in range(rl.EXECUTE_PER_IP):
        resp = server.handle_http("POST", {"Content-Type": "application/json"}, body, "9.9.9.9")
        assert json.loads(resp.body)["result"]["isError"] is False
    assert len(sessions.requests) == rl.EXECUTE_PER_IP
    resp = server.handle_http("POST", {"Content-Type": "application/json"}, body, "9.9.9.9")
    result = json.loads(resp.body)["result"]
    assert result["isError"] is True
    assert "Rate limit exceeded" in result["content"][0]["text"]
    assert len(sessions.requests) == rl.EXECUTE_PER_IP
    # tools/list and initialize are not limited.
    listing = server.handle_http(
        "POST", {"Content-Type": "application/json"}, b'{"jsonrpc":"2.0","id":2,"method":"tools/list"}', "9.9.9.9"
    )
    assert "result" in json.loads(listing.body)
