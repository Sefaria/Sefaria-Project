import requests
from contextlib import contextmanager
from collections import defaultdict, namedtuple
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


# One skipped record, with as much context as was available at the skip site:
#   pathway     — the build trigger(s) that reach this site (e.g. "rebuild_toc,init_library_cache")
#   what        — the loop/site that skipped (e.g. "TocTree index")
#   record      — identifier of the skipped record (title / _id / slug / path), or None
#   level       — "warning" or "error"
#   error_type  — exception class name for guard-caught skips; None for log_skip soft-skips
#   detail      — str(e) for guard-caught skips; the detail message for log_skip soft-skips
SkipRecord = namedtuple("SkipRecord", "pathway what record level error_type detail")

# Per-build log of records skipped by the guards below. The skip-and-continue behavior is
# otherwise silent degradation; this makes it visible. Each monitored build pathway calls
# signal_and_reset_skip_counts() at the end to post one Slack summary of everything it
# skipped, then clears the log — so "silently incomplete library" stops being invisible
# without spamming #engineering-signal once per bad record. See the BAD_RECORD_EXCEPTIONS
# decision.
skip_records = []

# At most this many records are stored verbatim per (pathway, what) group; further skips in
# the same group are still counted (and surfaced as "… N more" in the summary) but not stored,
# so a pathologically corrupt DB can't blow up memory or the Slack payload.
MAX_STORED_PER_GROUP = 10

# True if any skip recorded since the last reset was error-level. Decides whether the
# end-of-build summary posts as "error" vs "warning".
_skip_saw_error = False

# Per (pathway, what): total skips seen this build (including ones not stored verbatim).
_skip_group_counts = defaultdict(int)


def get_skip_records():
    """Return a snapshot list of the SkipRecords stored since the last reset."""
    return list(skip_records)


def get_skip_counts():
    """Return a plain-dict tally derived from the skip log: {pathway: {what: count}}.

    Counts reflect every skip seen this build, including records dropped past
    MAX_STORED_PER_GROUP.
    """
    counts = defaultdict(lambda: defaultdict(int))
    for (pathway, what), count in _skip_group_counts.items():
        counts[pathway][what] = count
    return {pathway: dict(whats) for pathway, whats in counts.items()}


def _note_skip(pathway, what, level, record=None, error_type=None, detail=None):
    """Record one skipped record: store its context (bounded per group), keep the running
    group count, and remember if it was error-level."""
    global _skip_saw_error
    key = (pathway, what)
    _skip_group_counts[key] += 1
    if _skip_group_counts[key] <= MAX_STORED_PER_GROUP:
        skip_records.append(SkipRecord(pathway, what, record, level, error_type, detail))
    if level == "error":
        _skip_saw_error = True


def log_skip(log, pathway, what, detail, level="warning", record=None):
    """
    Record one skipped/degraded record: store it in the skip log and log it locally
    (via the bound logger, at `level`). Does NOT post to Slack per-record — the
    accumulated log is surfaced once per build by signal_and_reset_skip_counts().

    For soft-skip sites that aren't wrapped in skip_bad_record (e.g. a record missing a
    required field rather than raising an exception).
    """
    _note_skip(pathway, what, level, record=record, detail=detail)
    getattr(log, level)("[pathway:{}] {}: {}".format(pathway, what, detail))


def signal_and_reset_skip_counts(pathway):
    """
    Post a single #engineering-signal summary of everything skipped during a build, then
    clear the log so the next build starts clean. Call once at the end of each monitored
    build pathway (reset_cache, rebuild_toc, init_library_cache); `pathway` is the summary
    header naming the triggering pathway.

    The summary groups skips by (pathway, what) and, under each group, lists a bounded
    sample of the actual records skipped and why (record id + error type/detail) so the
    failures are diagnosable from Slack, not just countable.

    No-op (besides the reset) when nothing was skipped. Severity is "error" if any skip
    during the build was error-level, else "warning". Never raises — notify_engineering_signal
    swallows its own failures.
    """
    if _skip_group_counts:
        total = sum(_skip_group_counts.values())
        # Group the stored records by (pathway, what), preserving their (bounded) detail.
        grouped = defaultdict(list)
        for rec in skip_records:
            grouped[(rec.pathway, rec.what)].append(rec)

        lines = []
        for (pw, what), count in _skip_group_counts.items():
            lines.append("  [{}] {}: {}".format(pw, what, count))
            stored = grouped.get((pw, what), [])
            for rec in stored:
                lines.append("    - {}".format(_format_skip_record(rec)))
            if count > len(stored):
                lines.append("    … {} more".format(count - len(stored)))

        message = "[pathway:{}] cache build skipped {} bad record(s):\n{}".format(
            pathway, total, "\n".join(lines))
        notify_engineering_signal(message, level="error" if _skip_saw_error else "warning")
    reset_skip_counts()


def _format_skip_record(rec):
    """One-line '<record> — <error_type>: <detail>' rendering of a SkipRecord for the summary."""
    record = "{!r}".format(rec.record) if rec.record is not None else "<unknown>"
    if rec.error_type and rec.detail:
        return "{} — {}: {}".format(record, rec.error_type, rec.detail)
    if rec.detail:
        return "{} — {}".format(record, rec.detail)
    if rec.error_type:
        return "{} — {}".format(record, rec.error_type)
    return record


def reset_skip_counts():
    """Clear the skip log, group counts, and error flag. Called after each build's summary is posted."""
    global _skip_saw_error
    skip_records.clear()
    _skip_group_counts.clear()
    _skip_saw_error = False


def bad_record_guard(log):
    """
    Bind a module's structlog logger once and return a `with`-guard for per-record loops.

    Inside the guard, a caught exception means: record it in the skip log, log it locally (via
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
            _note_skip(pathway, what, level, record=record, error_type=type(e).__name__, detail=str(e))
            # Local log only; the per-build summary is posted by signal_and_reset_skip_counts().
            getattr(log, level)("[pathway:{}] {}: skipping {!r}: {}".format(pathway, what, record, e))
    return skip_bad_record
