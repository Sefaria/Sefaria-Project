"""
Build-degradation tracking for the cache/library build pathways.

The per-record loops that build the library cache at startup (and on reset_cache /
reset_toc) wrap each record in a guard so that one corrupt/malformed DB record is
logged-and-skipped rather than aborting the whole build (see the BAD_RECORD_EXCEPTIONS
decision in sefaria.system.exceptions). That skip-and-continue behavior is otherwise
silent degradation — a "silently incomplete library."

This module makes the degradation visible without spamming #engineering-signal once per
bad record: each skip is recorded here (with as much context as was available at the site),
and each monitored build pathway calls signal_and_reset_skip_counts() at the end to post a
single Slack summary of everything it skipped, then clears the log.

It also decides when degradation has gone too far to tolerate. Because BAD_RECORD_EXCEPTIONS
includes AttributeError and TypeError — whose dominant cause is a code bug, not bad data —
skipping cannot be unbounded, or a single renamed attribute would be logged once per record
and quietly produce an incomplete library. Two breakers bound it: a SIGNATURE breaker that
aborts when one error message repeats (broken code), and a VOLUME backstop that aborts on
sheer skip count at one site (mass corruption of any cause). See the threshold constants
below for why both are needed.

Slack is the only outbound dependency (notify_engineering_signal); this module knows nothing
about how the message is delivered.
"""
import threading
import structlog
from contextlib import contextmanager
from collections import defaultdict, namedtuple
from sefaria.system.exceptions import BAD_RECORD_EXCEPTIONS, BuildDegradationError
from sefaria.helper.slack.send_message import notify_engineering_signal

logger = structlog.get_logger(__name__)


# One skipped record, with as much context as was available at the skip site:
#   pathway     — the build trigger(s) that reach this site (e.g. "reset_toc,startup")
#   operation   — the loop/site that skipped (e.g. "TocTree index")
#   record      — identifier of the skipped record (title / _id / slug / path), or None
#   level       — "warning" or "error"
#   error_type  — exception class name for guard-caught skips; None for log_skip soft-skips
#   detail      — str(e) for guard-caught skips; the detail message for log_skip soft-skips
SkipRecord = namedtuple("SkipRecord", "pathway operation record level error_type detail")

# Per-build log of records skipped by the guards below.
skip_records = []

# At most this many records are stored verbatim per (pathway, operation) group; further skips in
# the same group are still counted (and surfaced as "… N more" in the summary) but not stored,
# so a pathologically corrupt DB can't blow up memory or the Slack payload.
MAX_STORED_PER_GROUP = 10

# True if any skip recorded since the last reset was error-level. Decides whether the
# end-of-build summary posts as "error" vs "warning".
_skip_saw_error = False

# Per (pathway, operation): total skips seen this build (including ones not stored verbatim).
_skip_group_counts = defaultdict(int)

# Per (pathway, operation, error_type, detail): how many times ONE error signature repeated.
# Only guard-caught skips are counted here — see the breaker notes below.
_skip_signature_counts = defaultdict(int)

# --- Breakers -------------------------------------------------------------------------
#
# BAD_RECORD_EXCEPTIONS includes AttributeError and TypeError, whose dominant cause is an
# ordinary code bug rather than bad data. Catching them without a stopping rule is exactly
# the failure mode the narrow tuple was protecting against: a renamed attribute would log a
# warning per record and silently build an incomplete library. These two thresholds are
# that stopping rule, and widening the tuple is only safe while they exist.
#
# The insight is that bad data and a broken refactor raise the SAME exception class and
# differ only in volume, so counting is the discriminator that the exception type never was.
# Two counters, because "systemic" arrives in two shapes:
#
# SIGNATURE — the same error message repeating. Python builds AttributeError/TypeError
#   messages from the type and attribute name, never from the record ("'Topic' object has
#   no attribute 'slug'"), so a rename produces one byte-identical string on every record
#   while genuine corruption produces varied ones. Deliberately NOT normalized: messages
#   that embed record identity (InputError's "…for Index record: Berakhot") simply never
#   repeat, so this breaker self-selects for the record-independent messages that indicate
#   broken code. Threshold is scale-free — 10 identical failures means the same thing in a
#   1,258-document loop and a 108,252-document one — which is why this, not the volume
#   count, is the primary detector.
#
# VOLUME — sheer count at one site, regardless of cause. Catches mass corruption too varied
#   to repeat (a half-finished migration damaging records in many different ways), which the
#   signature breaker is structurally blind to. Deliberately blunt and set high: it is a
#   "this library is too damaged to serve" backstop, not a detector.
#
# Set either to None to disable it.
SIGNATURE_BREAKER_THRESHOLD = 10   # matches MAX_STORED_PER_GROUP, so the summary posted on
                                   # a trip contains every example that caused it.
VOLUME_BREAKER_THRESHOLD = 500

# Guards all reads/writes of the shared skip state above. Builds are normally serialized
# (startup runs before the process serves requests), but reset_cache/reset_toc are
# staff-triggered views and gunicorn can run multiple threads per worker, so two builds —
# or a build and its summary — can overlap in one process.
#
# Not reentrant, and deliberately never held across the Slack post — see the comment in
# signal_and_reset_skip_counts().
_lock = threading.Lock()


def get_skip_records():
    """Return a snapshot list of the SkipRecords stored since the last reset."""
    with _lock:
        return list(skip_records)


def get_skip_counts():
    """Return a plain-dict tally derived from the skip log: {pathway: {operation: count}}.

    Counts reflect every skip seen this build, including records dropped past
    MAX_STORED_PER_GROUP.
    """
    with _lock:
        group_counts = dict(_skip_group_counts)
    counts = defaultdict(lambda: defaultdict(int))
    for (pathway, operation), count in group_counts.items():
        counts[pathway][operation] = count
    return {pathway: dict(operations) for pathway, operations in counts.items()}


def _note_skip(pathway, operation, level, record=None, error_type=None, detail=None,
               count_signature=True):
    """Record one skipped record and report whether a breaker just tripped.

    Stores the record's context (bounded per group), keeps the running group count, keeps
    the per-signature count, and remembers if the skip was error-level.

    Returns None normally, or the name of the breaker whose threshold this skip crossed
    ("signature" / "volume"). It only REPORTS the trip; the caller acts on it, because
    responding means posting the build summary, and `_lock` is not reentrant — see
    _trip_breaker().

    `count_signature=False` records the skip against the volume count only. Used by
    log_skip(): a soft skip is a known, handled condition rather than an exception
    symptom, so a repeated one is not evidence of broken code the way a repeated
    exception message is. Mass soft-skipping is still degradation, so it still counts
    toward the volume backstop.
    """
    global _skip_saw_error
    key = (pathway, operation)
    with _lock:
        _skip_group_counts[key] += 1
        group_count = _skip_group_counts[key]
        if group_count <= MAX_STORED_PER_GROUP:
            skip_records.append(SkipRecord(pathway, operation, record, level, error_type, detail))
        if level == "error":
            _skip_saw_error = True

        signature_count = 0
        if count_signature:
            signature_key = (pathway, operation, error_type, detail)
            _skip_signature_counts[signature_key] += 1
            signature_count = _skip_signature_counts[signature_key]

    # Checked outside the lock: plain int comparisons against local copies, and the caller
    # must not be holding the lock when it responds.
    if SIGNATURE_BREAKER_THRESHOLD and signature_count >= SIGNATURE_BREAKER_THRESHOLD:
        return "signature"
    if VOLUME_BREAKER_THRESHOLD and group_count >= VOLUME_BREAKER_THRESHOLD:
        return "volume"
    return None


def _trip_breaker(log, breaker, pathway, operation, error_type=None, detail=None):
    """Post the build summary, then log why the build is about to abort.

    The summary is posted HERE rather than left to the end of the pathway because a tripped
    breaker aborts the build, and the pathway's own signal_and_reset_skip_counts() call sits
    after the work it is summarizing — an abort would skip it and throw away the skip log.
    That log is the whole diagnosis for a volume trip, where the exception that happens to
    surface says nothing about the other 499 records.

    Must be called with `_lock` released: signal_and_reset_skip_counts() acquires it, and
    `_lock` is a plain, non-reentrant threading.Lock.
    """
    reason = {
        "signature": ("one error signature repeated {} times, which indicates broken code "
                      "rather than {} individually corrupt records"
                      .format(SIGNATURE_BREAKER_THRESHOLD, SIGNATURE_BREAKER_THRESHOLD)),
        "volume": ("{} records skipped at a single site, too many to serve a usable library"
                   .format(VOLUME_BREAKER_THRESHOLD)),
    }[breaker]
    signal_and_reset_skip_counts(pathway)
    log.error("[pathway:{}] {}: ABORTING BUILD — {}{}".format(
        pathway, operation, reason,
        ": {}: {}".format(error_type, detail) if error_type else ""))


def log_skip(log, pathway, operation, detail, level="warning", record=None):
    """
    Record one skipped/degraded record: store it in the skip log and log it locally
    (via the bound logger, at `level`). Does NOT post to Slack per-record — the
    accumulated log is surfaced once per build by signal_and_reset_skip_counts().

    For soft-skip sites that aren't wrapped in skip_bad_record (e.g. a record missing a
    required field rather than raising an exception).

    Raises BuildDegradationError if this skip crosses the volume backstop — at that point
    the build is producing a library too incomplete to serve, and there is no original
    exception to re-raise. Soft skips do not feed the signature breaker (see _note_skip).
    """
    tripped = _note_skip(pathway, operation, level, record=record, detail=detail,
                         count_signature=False)
    getattr(log, level)("[pathway:{}] {}: {}".format(pathway, operation, detail))
    if tripped:
        _trip_breaker(log, tripped, pathway, operation, detail=detail)
        raise BuildDegradationError(
            "[pathway:{}] {}: aborting build after {} skipped records".format(
                pathway, operation, VOLUME_BREAKER_THRESHOLD))


def signal_and_reset_skip_counts(pathway):
    """
    Post a single #engineering-signal summary of everything skipped during a build, then
    clear the log so the next build starts clean. Call once at the end of each monitored
    build pathway (reset_cache, reset_toc, startup); `pathway` is the summary
    header naming the triggering pathway.

    The summary groups skips by (pathway, operation) and, under each group, lists a bounded
    sample of the actual records skipped and why (record id + error type/detail) so the
    failures are diagnosable from Slack, not just countable.

    No-op (besides the reset) when nothing was skipped. Severity is "error" if any skip
    during the build was error-level, else "warning". Never raises — notify_engineering_signal
    swallows its own failures.
    """
    # Snapshot and reset atomically, then format/log/post from the snapshot with the lock
    # released. The split looks like it could be collapsed into one `with _lock:` block
    # covering the whole function; it can't:
    #
    #   1. `_lock` is a plain threading.Lock, which is NOT reentrant. Anything reached from
    #      notify_engineering_signal() that records a skip would call _note_skip() and block
    #      on a lock this same thread already holds — a permanent hang, on the startup path.
    #   2. It would hold the lock across a network call (up to the 3s Slack timeout),
    #      stalling every other thread trying to record a skip.
    #   3. Resetting after the post rather than before it would wipe skips recorded while
    #      the summary was in flight; snapshotting first lets them land in the next summary.
    with _lock:
        group_counts = dict(_skip_group_counts)
        records = list(skip_records)
        saw_error = _skip_saw_error
        _reset_skip_state()

    if not group_counts:
        return

    total = sum(group_counts.values())
    # Group the stored records by (pathway, operation), preserving their (bounded) detail.
    grouped = defaultdict(list)
    for rec in records:
        grouped[(rec.pathway, rec.operation)].append(rec)

    # Groups, worst-offender first then alphabetical, for stable & scannable output.
    groups = sorted(group_counts.items(), key=lambda kv: (-kv[1], kv[0]))

    header = "*[{}]* skipped *{}* bad record(s)".format(pathway, total)

    # Detail (B): a bold group header, bulleted records, with the site's own pathway
    # noted only when it differs from the build pathway in the header.
    lines = [header]
    for (pw, operation), count in groups:
        lines.append("\n*{}* — {}".format(operation, count))
        stored = grouped.get((pw, operation), [])
        for rec in stored:
            lines.append("  • {}".format(_format_skip_record(rec)))
        if count > len(stored):
            lines.append("  _… {} more_".format(count - len(stored)))

    message = "\n".join(lines)
    level = "error" if saw_error else "warning"
    # Durable, queryable record of the aggregate (per-record lines were already logged at
    # their skip sites). Structured fields, not the Slack-mrkdwn blob — logs shouldn't carry
    # presentation. Logged unconditionally; Slack delivery below is best-effort.
    getattr(logger, level)(
        "cache_build_skipped",
        pathway=pathway,
        total=total,
        groups={"{}/{}".format(pw, operation): count for (pw, operation), count in groups},
    )
    notify_engineering_signal(message, level=level)


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


def _reset_skip_state():
    """Clear the skip log, group counts, and error flag. Caller must hold _lock."""
    global _skip_saw_error
    skip_records.clear()
    _skip_group_counts.clear()
    _skip_signature_counts.clear()
    _skip_saw_error = False


def reset_skip_counts():
    """Clear the skip log, group counts, and error flag."""
    with _lock:
        _reset_skip_state()


def bad_record_guard(log):
    """
    Bind a module's structlog logger once and return a `with`-guard for per-record loops.

    Inside the guard, a caught exception means: record it in the skip log, log it locally (via
    the bound logger), and skip the record — instead of letting one corrupt record abort the
    whole build. Slack is not posted per-record; signal_and_reset_skip_counts() posts one
    summary per build. By default it catches BAD_RECORD_EXCEPTIONS only, so systemic failures
    (Mongo connectivity, ImportError, NameError, ...) still propagate and abort loudly; pass
    `exceptions=` to narrow further (e.g. KeyError).

    Skipping is bounded, not unlimited. If a skip crosses a breaker threshold the guard posts
    the build summary and re-raises the original exception, aborting the build — so a code bug
    that breaks every record still fails loudly, just with the offending records named first.

    Usage:
        skip_bad_record = bad_record_guard(logger)   # once, at module top
        for rec in SomeSet():
            with skip_bad_record("startup", "build_virtual_books", record=rec_id):
                ...build using rec...
    """
    @contextmanager
    def skip_bad_record(pathway, operation, record=None, level="warning", exceptions=BAD_RECORD_EXCEPTIONS):
        try:
            yield
        except exceptions as e:
            error_type, detail = type(e).__name__, str(e)
            tripped = _note_skip(pathway, operation, level, record=record,
                                 error_type=error_type, detail=detail)
            # Local log only; the per-build summary is posted by signal_and_reset_skip_counts().
            getattr(log, level)("[pathway:{}] {}: skipping {!r}: {}".format(pathway, operation, record, e))
            if tripped:
                _trip_breaker(log, tripped, pathway, operation, error_type, detail)
                # Bare re-raise: the original exception and its traceback are the diagnosis
                # for a signature trip ("'Topic' object has no attribute 'slug'" names the
                # broken code directly), which a wrapper exception would bury.
                raise
    return skip_bad_record
