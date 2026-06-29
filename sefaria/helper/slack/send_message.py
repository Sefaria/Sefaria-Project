import requests
from contextlib import contextmanager
from collections import defaultdict
from sefaria.settings import SLACK_URL
from sefaria.system.exceptions import BAD_RECORD_EXCEPTIONS


def send_message(channel, username, pretext, text, fallback=None, icon_emoji=':robot_face:', color="#a30200", timeout=None):
    post_object = {
            "icon_emoji": icon_emoji,
            "username": username,
            "channel": channel,
            "attachments": [
                {
                    "fallback": fallback or pretext,
                    "color": color,
                    "pretext": pretext,
                    "text": text
                }
            ]
        }

    response = requests.post(SLACK_URL, json=post_object, timeout=timeout)
    return response


ENGINEERING_SIGNAL_CHANNEL = "#engineering-signal"


def notify_engineering_signal(message, level="warning"):
    """
    Post `message` to #engineering-signal.

    No-op when SLACK_URL is unset (local/test environments; it is only configured
    in prod and dev). Never raises: Slack delivery failures must not break the
    cache-rebuild/startup paths that call this.
    """
    if not SLACK_URL:
        return None
    color = "#a30200" if level == "error" else "#daa038"
    icon_emoji = ":rotating_light:" if level == "error" else ":warning:"
    try:
        return send_message(
            ENGINEERING_SIGNAL_CHANNEL,
            "Cache Rebuild Guard",
            level.upper(),
            message,
            icon_emoji=icon_emoji,
            color=color,
            # Bounded so a slow/hung Slack endpoint can't stall the startup
            # path these guards run on.
            timeout=3,
        )
    except Exception:
        # basa. but slack posting failures (timeouts, connection errors, etc.)
        # should not crash startup.
        return None


def log_and_signal(log, level, message):
    """
    Emit `message` to both the given structlog logger (at `level`, e.g. "warning"
    or "error") and to #engineering-signal. Used by the per-record startup guards
    so a skipped corrupt record is both logged and surfaced to engineering in
    prod/dev. The message is built once and reused for both sinks.
    """
    getattr(log, level)(message)
    notify_engineering_signal(message, level=level)


# Per-(pathway, what) tally of records skipped by bad_record_guard. The skip-and-continue
# behavior is otherwise silent degradation; this makes it visible — e.g. log get_skip_counts()
# at the end of boot, or expose it on a health endpoint — so "silently incomplete library"
# stops being invisible. See the BAD_RECORD_EXCEPTIONS decision.
skip_counts = defaultdict(lambda: defaultdict(int))


def get_skip_counts():
    """Return a plain-dict snapshot of skip_counts: {pathway: {what: count}}."""
    return {pathway: dict(whats) for pathway, whats in skip_counts.items()}


def bad_record_guard(log):
    """
    Bind a module's structlog logger once and return a `with`-guard for per-record loops.

    Inside the guard, a caught exception means: tally it in skip_counts, log+signal it (to
    the bound logger and #engineering-signal), and skip the record — instead of letting one
    corrupt record abort the whole build. By default it catches BAD_RECORD_EXCEPTIONS only,
    so systemic failures (AttributeError, Mongo connectivity, ImportError, ...) still
    propagate and abort loudly; pass `exceptions=` to narrow further (e.g. KeyError).

    Usage:
        skip_bad_record = bad_record_guard(logger)   # once, at module top
        for rec in SomeSet():
            with skip_bad_record("init_library_cache", "build_virtual_books", record=rec_id):
                ...build using rec...
    """
    @contextmanager
    def skip_bad_record(pathway, what, record=None, level="warning", exceptions=BAD_RECORD_EXCEPTIONS):
        try:
            yield
        except exceptions as e:
            skip_counts[pathway][what] += 1
            log_and_signal(log, level, "[pathway:{}] {}: skipping {!r}: {}".format(pathway, what, record, e))
    return skip_bad_record
