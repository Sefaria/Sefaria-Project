"""Varnish purge and ban calls must be bounded in time.

A stalled Varnish admin or front-end socket must not block the calling request
or job indefinitely. Both helpers swallow failures through graceful_exception,
so a timeout is logged and returns None instead of raising.
"""
import socket
import subprocess
from unittest import mock

from sefaria.system.varnish import common


def test_purge_url_connection_has_finite_timeout():
    with mock.patch.object(common, "HTTPConnection") as conn_cls:
        conn_cls.return_value.getresponse.return_value.status = 200
        common.purge_url("https://www.sefaria.org/api/texts/Genesis")

    _, kwargs = conn_cls.call_args
    assert kwargs.get("timeout") == common.VARNISH_HTTP_TIMEOUT_SECONDS
    assert 0 < common.VARNISH_HTTP_TIMEOUT_SECONDS <= 10


def test_ban_url_subprocess_has_finite_timeout():
    with mock.patch.object(common.subprocess, "run") as run:
        common.ban_url("/api/texts/Genesis")

    _, kwargs = run.call_args
    assert kwargs.get("timeout") == common.VARNISH_BAN_TIMEOUT_SECONDS
    assert 0 < common.VARNISH_BAN_TIMEOUT_SECONDS <= 30


def test_purge_url_timeout_is_swallowed():
    with mock.patch.object(common, "HTTPConnection") as conn_cls:
        conn_cls.return_value.request.side_effect = socket.timeout("timed out")
        result = common.purge_url("https://www.sefaria.org/api/texts/Genesis")

    assert result is None


def test_ban_url_timeout_is_swallowed():
    with mock.patch.object(common.subprocess, "run",
                           side_effect=subprocess.TimeoutExpired(cmd="varnishadm", timeout=5)):
        result = common.ban_url("/api/texts/Genesis")

    assert result is None
