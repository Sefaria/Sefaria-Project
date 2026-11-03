"""
Build-degradation tracking for the cache/library build pathways.

Per-record loops in the library build wrap each record in a guard so one corrupt record is
logged-and-skipped rather than aborting the whole build. This module records each skip, posts
one Slack summary per build, and aborts the build when two breakers say the degradation is
systemic rather than data-level.

Every entry point that triggers a guarded build should wrap it in build_pathway(), which
resets the counters on entry and posts the summary on exit. The breakers count within ONE
build; counts leaking across builds make one bad record look like broken code.

Rationale — why the breakers exist, why there are two, why the guard raises
BuildDegradationError instead of re-raising, and the locking rules — lives in the wiki:
wiki/meta/decision-2026-06-25-bad-record-exceptions-startup-guards.md
"""
import itertools
import threading
import structlog
from contextlib import contextmanager
from collections import defaultdict, namedtuple
from sefaria.system.exceptions import BAD_RECORD_EXCEPTIONS, BuildDegradationError
from sefaria.helper.slack.send_message import notify_engineering_signal

logger = structlog.get_logger(__name__)


# One skipped record. error_type/detail are the exception for guard-caught skips;
# error_type is None for log_skip() soft-skips.
SkipRecord = namedtuple("SkipRecord", "pathway operation record level error_type detail")

# Per-build log of records skipped by the guards below.
skip_records = []

# Records stored verbatim per (pathway, operation); further skips are counted but not stored.
MAX_STORED_PER_GROUP = 10

# True if any skip since the last reset was error-level (sets the summary's severity).
_skip_saw_error = False

# Per (pathway, operation): total skips this build, including ones not stored verbatim.
_skip_group_counts = defaultdict(int)

# Per (pathway, operation, error_type, detail): the set of DISTINCT records that produced ONE
# error signature. Distinct records, not occurrences: the breaker's premise is "N different
# records gave the same message, so the message does not depend on the record" — counting
# occurrences would also trip on ONE bad record re-skipped by N successive rebuilds, which is
# bad data, not broken code. Records without an identifier get a unique placeholder, so they
# stay one-per-occurrence as before.
_skip_signature_records = defaultdict(set)
_no_record_seq = itertools.count()

# Breakers that bound skipping. SIGNATURE catches one error message repeating (broken code);
# VOLUME is a blunt backstop on sheer count at one site (mass corruption). Set either to None
# to disable. Signature threshold matches MAX_STORED_PER_GROUP so the summary posted on a trip
# contains every example that caused it.
SIGNATURE_BREAKER_THRESHOLD = 10
VOLUME_BREAKER_THRESHOLD = 500

# Guards all reads/writes of the shared skip state above. NOT reentrant, and deliberately never
# held across the Slack post or across _trip_breaker().
_lock = threading.Lock()

# Per-thread nesting depth of build_pathway(). Only the outermost block resets and summarizes.
_pathway_depth = threading.local()


def get_skip_records():
    """Return a snapshot list of the SkipRecords stored since the last reset."""
    with _lock:
        return list(skip_records)


def get_skip_counts():
    """Return a tally derived from the skip log: {pathway: {operation: count}}."""
    with _lock:
        group_counts = dict(_skip_group_counts)
    counts = defaultdict(lambda: defaultdict(int))
    for (pathway, operation), count in group_counts.items():
        counts[pathway][operation] = count
    return {pathway: dict(operations) for pathway, operations in counts.items()}


def _note_skip(pathway, operation, level, record=None, error_type=None, detail=None,
               count_signature=True):
    """Record one skipped record; return the name of the breaker it tripped, or None.

    It only REPORTS the trip — the caller acts on it, because responding means posting the
    summary and `_lock` is not reentrant. `count_signature=False` counts the skip toward the
    volume backstop only (used by log_skip: a soft skip is a handled condition, not an
    exception symptom, so repeats aren't evidence of broken code).
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
        if count_signature and SIGNATURE_BREAKER_THRESHOLD:
            seen = _skip_signature_records[(pathway, operation, error_type, detail)]
            # Bounded like skip_records above: the breaker fires the moment the set reaches
            # the threshold, so there is never a reason to grow it past that.
            if len(seen) < SIGNATURE_BREAKER_THRESHOLD:
                # repr() so any record type is hashable; a unique placeholder when there is
                # no record, since nothing can be deduplicated then.
                seen.add(repr(record) if record is not None else next(_no_record_seq))
            signature_count = len(seen)

    # Checked outside the lock: the caller must not hold it when it responds.
    if SIGNATURE_BREAKER_THRESHOLD and signature_count >= SIGNATURE_BREAKER_THRESHOLD:
        return "signature"
    if VOLUME_BREAKER_THRESHOLD and group_count >= VOLUME_BREAKER_THRESHOLD:
        return "volume"
    return None


def _trip_breaker(log, breaker, pathway, operation, error_type=None, detail=None):
    """Post the build summary, then log why the build is about to abort.

    Posted here rather than at the end of the pathway because the abort would skip the
    pathway's own signal_and_reset_skip_counts() call and throw away the skip log.
    Must be called with `_lock` released.
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
    """Record one skipped/degraded record and log it locally, for soft-skip sites that aren't
    wrapped in skip_bad_record (e.g. a record missing a required field rather than raising).

    Raises BuildDegradationError if this skip crosses the volume backstop.
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
    """Post one #engineering-signal summary of everything skipped during a build, then clear
    the log. Call once at the end of each monitored pathway (reset_cache, reset_toc, startup).

    No-op (besides the reset) when nothing was skipped. Severity is "error" if any skip was
    error-level, else "warning". Never raises.
    """
    # Snapshot and reset under the lock, then format/log/post with it released: `_lock` is not
    # reentrant (a skip recorded during the Slack post would deadlock), the post is a network
    # call, and resetting first lets skips recorded mid-post land in the next summary.
    with _lock:
        group_counts = dict(_skip_group_counts)
        records = list(skip_records)
        saw_error = _skip_saw_error
        _reset_skip_state()

    if not group_counts:
        return

    total = sum(group_counts.values())
    grouped = defaultdict(list)
    for rec in records:
        grouped[(rec.pathway, rec.operation)].append(rec)

    # Worst-offender first, then alphabetical, for stable & scannable output.
    groups = sorted(group_counts.items(), key=lambda kv: (-kv[1], kv[0]))

    header = "*[{}]* skipped *{}* bad record(s)".format(pathway, total)
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
    # Structured aggregate for the logs; Slack delivery below is best-effort.
    getattr(logger, level)(
        "cache_build_skipped",
        pathway=pathway,
        total=total,
        groups={"{}/{}".format(pw, operation): count for (pw, operation), count in groups},
    )
    notify_engineering_signal(message, level=level)


@contextmanager
def build_pathway(pathway):
    """Mark a block as one monitored build: reset the skip counters on entry, post the summary
    on exit (even if the build raises). The breakers count within ONE build, and the reset on
    ENTRY is what guarantees that.

    Joins rather than restarts: build methods call each other, so these blocks nest routinely
    (`rebuild` -> `rebuild_toc` -> `get_toc_tree`). Only the OUTERMOST block resets and reports
    — an inner one that reset would discard the outer build's log and post a partial summary.
    Depth is per-thread; the counters it guards are shared.

    Goes on the build METHOD, not its callers — a caller can forget. See the wiki page in the
    module docstring for where it goes in each case, and why.

    Usage:
        with build_pathway("rebuild_toc"):
            ...
    """
    depth = getattr(_pathway_depth, "value", 0)
    _pathway_depth.value = depth + 1
    try:
        if depth == 0:
            reset_skip_counts()
        yield
    finally:
        _pathway_depth.value = depth
        if depth == 0:
            signal_and_reset_skip_counts(pathway)


def _format_skip_record(rec):
    """One-line '<record> — <error_type>: <detail>' rendering of a SkipRecord."""
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
    _skip_signature_records.clear()
    _skip_saw_error = False


def reset_skip_counts():
    """Clear the skip log, group counts, and error flag."""
    with _lock:
        _reset_skip_state()


def bad_record_guard(log):
    """Bind a module's structlog logger once and return a `with`-guard for per-record loops.

    Inside the guard, a caught exception is recorded in the skip log, logged locally, and the
    record skipped. Catches BAD_RECORD_EXCEPTIONS by default, so systemic failures (Mongo
    connectivity, ImportError, ...) still propagate; pass `exceptions=` to narrow. If a skip
    crosses a breaker threshold the guard posts the summary and raises BuildDegradationError.

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
            getattr(log, level)("[pathway:{}] {}: skipping {!r}: {}".format(pathway, operation, record, e))
            if tripped:
                _trip_breaker(log, tripped, pathway, operation, error_type, detail)
                # NOT a bare re-raise: the original is in BAD_RECORD_EXCEPTIONS, so an
                # enclosing guard (these nest) would catch it and swallow the trip.
                # BuildDegradationError escapes every nested guard; `from e` keeps the
                # original diagnosis and traceback as __cause__.
                raise BuildDegradationError(
                    "[pathway:{}] {}: aborting build after {} breaker trip".format(
                        pathway, operation, tripped)
                ) from e
    return skip_bad_record
