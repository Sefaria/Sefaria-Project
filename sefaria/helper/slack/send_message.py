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


# Per-(pathway, what) tally of records skipped by the guards below. The skip-and-continue
# behavior is otherwise silent degradation; this makes it visible. Each monitored build
# pathway calls signal_and_reset_skip_counts() at the end to post one Slack summary of
# everything it skipped, then clears the tally — so "silently incomplete library" stops
# being invisible without spamming #engineering-signal once per bad record. See the
# BAD_RECORD_EXCEPTIONS decision.
skip_counts = defaultdict(lambda: defaultdict(int))

# True if any skip recorded since the last reset was error-level. Decides whether the
# end-of-build summary posts as "error" vs "warning".
_skip_saw_error = False


def get_skip_counts():
    """Return a plain-dict snapshot of skip_counts: {pathway: {what: count}}."""
    return {pathway: dict(whats) for pathway, whats in skip_counts.items()}


def _note_skip(pathway, what, level):
    """Tally one skipped record and remember if it was error-level."""
    global _skip_saw_error
    skip_counts[pathway][what] += 1
    if level == "error":
        _skip_saw_error = True


def log_skip(log, pathway, what, detail, level="warning"):
    """
    Record one skipped/degraded record: tally it in skip_counts and log it locally
    (via the bound logger, at `level`). Does NOT post to Slack per-record — the
    accumulated tally is surfaced once per build by signal_and_reset_skip_counts().

    For soft-skip sites that aren't wrapped in skip_bad_record (e.g. a record missing a
    required field rather than raising an exception).
    """
    _note_skip(pathway, what, level)
    getattr(log, level)("[pathway:{}] {}: {}".format(pathway, what, detail))


def signal_and_reset_skip_counts(pathway):
    """
    Post a single #engineering-signal summary of everything skipped during a build, then
    clear the tally so the next build starts clean. Call once at the end of each monitored
    build pathway (reset_cache, rebuild_toc, init_library_cache); `pathway` is the summary
    header naming the triggering pathway.

    No-op (besides the reset) when nothing was skipped. Severity is "error" if any skip
    during the build was error-level, else "warning". Never raises — notify_engineering_signal
    swallows its own failures.
    """
    snapshot = get_skip_counts()
    if snapshot:
        total = sum(count for whats in snapshot.values() for count in whats.values())
        lines = [
            "  [{}] {}: {}".format(pw, what, count)
            for pw, whats in snapshot.items()
            for what, count in whats.items()
        ]
        message = "[pathway:{}] cache build skipped {} bad record(s):\n{}".format(
            pathway, total, "\n".join(lines))
        notify_engineering_signal(message, level="error" if _skip_saw_error else "warning")
    reset_skip_counts()


def reset_skip_counts():
    """Clear the skip tally and error flag. Called after each build's summary is posted."""
    global _skip_saw_error
    skip_counts.clear()
    _skip_saw_error = False


def bad_record_guard(log):
    """
    Bind a module's structlog logger once and return a `with`-guard for per-record loops.

    Inside the guard, a caught exception means: tally it in skip_counts, log it locally (via
    the bound logger), and skip the record — instead of letting one corrupt record abort the
    whole build. Slack is not posted per-record; signal_and_reset_skip_counts() posts one
    summary per build. By default it catches BAD_RECORD_EXCEPTIONS only,
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
            _note_skip(pathway, what, level)
            # Local log only; the per-build summary is posted by signal_and_reset_skip_counts().
            getattr(log, level)("[pathway:{}] {}: skipping {!r}: {}".format(pathway, what, record, e))
    return skip_bad_record
