# -*- coding: utf-8 -*-
"""
Unit tests for sefaria.helper.skip_tracking.

These are pure unit tests: skip_tracking's only outbound dependencies are the logger
passed to its entry points and notify_engineering_signal, so the whole
record → summarize → Slack → reset lifecycle is testable without touching Mongo or
building the library. The startup/reset_cache/reset_toc pathways each just call
signal_and_reset_skip_counts() at the end of a build; the guarded loops themselves are
exercised against the test DB by the existing TOC-rebuild tests.
"""
import sys
import threading
from contextlib import contextmanager

import pytest
from unittest.mock import MagicMock, patch

from sefaria.system.exceptions import InputError, BuildDegradationError
from sefaria.helper import skip_tracking
from sefaria.helper.skip_tracking import (
    bad_record_guard,
    log_skip,
    get_skip_records,
    get_skip_counts,
    signal_and_reset_skip_counts,
    reset_skip_counts,
    build_pathway,
    MAX_STORED_PER_GROUP,
)


@contextmanager
def thresholds(signature=None, volume=None):
    """Set the breaker thresholds for one test; None disables that breaker.

    Most tests in this file predate the breakers and exercise unbounded skipping, so they
    run with both disabled rather than being rewritten around them.
    """
    with patch.object(skip_tracking, "SIGNATURE_BREAKER_THRESHOLD", signature), \
         patch.object(skip_tracking, "VOLUME_BREAKER_THRESHOLD", volume):
        yield


@pytest.fixture(autouse=True)
def clean_skip_state():
    """The skip log is module-global; isolate each test from the rest of the suite
    (TOC-rebuild tests can legitimately record skips against the test DB)."""
    reset_skip_counts()
    yield
    reset_skip_counts()


@pytest.fixture
def mock_notify():
    with patch("sefaria.helper.skip_tracking.notify_engineering_signal") as m:
        yield m


class TestBadRecordGuard:

    def test_bad_record_is_caught_recorded_and_logged(self):
        log = MagicMock()
        skip_bad_record = bad_record_guard(log)
        processed = []
        for rec_id in ["good1", "bad", "good2"]:
            with skip_bad_record("startup", "test operation", record=rec_id):
                if rec_id == "bad":
                    raise InputError("corrupt record")
                processed.append(rec_id)

        # The loop survived the bad record and finished the rest.
        assert processed == ["good1", "good2"]
        records = get_skip_records()
        assert len(records) == 1
        rec = records[0]
        assert rec.pathway == "startup"
        assert rec.operation == "test operation"
        assert rec.record == "bad"
        assert rec.level == "warning"
        assert rec.error_type == "InputError"
        assert "corrupt record" in rec.detail
        log.warning.assert_called_once()

    def test_error_level_logs_at_error(self):
        log = MagicMock()
        skip_bad_record = bad_record_guard(log)
        with skip_bad_record("startup", "test operation", record="bad", level="error"):
            raise KeyError("missing field")
        assert get_skip_records()[0].level == "error"
        log.error.assert_called_once()
        log.warning.assert_not_called()

    def test_attribute_error_is_now_a_bad_record(self):
        """AttributeError IS in BAD_RECORD_EXCEPTIONS: a Mongo document missing a field
        surfaces as AttributeError on the Python object, which is the most common real
        corruption shape. A code bug that raises it on every record is stopped by the
        signature breaker instead of by the exception tuple — see TestBreakers."""
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds():
            with skip_bad_record("startup", "test operation", record="rec"):
                raise AttributeError("'Topic' object has no attribute 'slug'")
        assert get_skip_records()[0].error_type == "AttributeError"

    def test_truly_systemic_exception_still_propagates(self):
        """Exceptions outside the tuple are untouched by any of this — they abort loudly."""
        skip_bad_record = bad_record_guard(MagicMock())
        with pytest.raises(ImportError):
            with skip_bad_record("startup", "test operation", record="rec"):
                raise ImportError("bad deploy")
        assert get_skip_records() == []

    def test_narrowed_exceptions_only_catch_what_was_asked(self):
        skip_bad_record = bad_record_guard(MagicMock())
        with skip_bad_record("startup", "test operation", exceptions=KeyError):
            raise KeyError("caught")
        with pytest.raises(ValueError):
            with skip_bad_record("startup", "test operation", exceptions=KeyError):
                raise ValueError("not caught")
        assert len(get_skip_records()) == 1

    def test_no_exception_records_nothing(self):
        log = MagicMock()
        skip_bad_record = bad_record_guard(log)
        with skip_bad_record("startup", "test operation", record="fine"):
            pass
        assert get_skip_records() == []
        assert get_skip_counts() == {}
        log.warning.assert_not_called()
        log.error.assert_not_called()


class TestLogSkip:

    def test_soft_skip_is_recorded_and_logged(self):
        log = MagicMock()
        log_skip(log, "reset_toc,startup", "topic toc", "node has no slug", record="some-node")
        records = get_skip_records()
        assert len(records) == 1
        rec = records[0]
        assert rec.record == "some-node"
        assert rec.error_type is None
        assert rec.detail == "node has no slug"
        log.warning.assert_called_once()


class TestSignalAndReset:

    def test_no_skips_posts_nothing(self, mock_notify):
        signal_and_reset_skip_counts("startup")
        mock_notify.assert_not_called()

    def test_skips_post_one_summary_then_reset(self, mock_notify):
        skip_bad_record = bad_record_guard(MagicMock())
        for rec_id in ["bad1", "bad2"]:
            with skip_bad_record("startup", "TocTree index", record=rec_id):
                raise InputError("corrupt")
        log_skip(MagicMock(), "startup", "topic toc", "no slug", record="slugless")

        signal_and_reset_skip_counts("startup")

        mock_notify.assert_called_once()
        message = mock_notify.call_args[0][0]
        assert mock_notify.call_args[1]["level"] == "warning"
        assert "*[startup]* skipped *3* bad record(s)" in message
        assert "*TocTree index* — 2" in message
        assert "*topic toc* — 1" in message
        assert "'bad1' — InputError: corrupt" in message
        assert "'slugless' — no slug" in message

        # State was reset: a second build with no skips posts nothing.
        assert get_skip_records() == []
        assert get_skip_counts() == {}
        signal_and_reset_skip_counts("startup")
        mock_notify.assert_called_once()

    def test_any_error_level_skip_escalates_summary_to_error(self, mock_notify):
        skip_bad_record = bad_record_guard(MagicMock())
        with skip_bad_record("startup", "op", record="a"):
            raise InputError("warn-level")
        with skip_bad_record("startup", "op", record="b", level="error"):
            raise InputError("error-level")
        signal_and_reset_skip_counts("startup")
        assert mock_notify.call_args[1]["level"] == "error"

    def test_summary_logged_even_when_slack_disabled(self, mock_notify):
        """The aggregate is logged unconditionally; Slack is best-effort on top."""
        with patch("sefaria.helper.skip_tracking.logger") as mock_logger:
            log_skip(MagicMock(), "reset_toc", "op", "detail")
            signal_and_reset_skip_counts("reset_toc")
            mock_logger.warning.assert_called_once()
            assert mock_logger.warning.call_args[1]["total"] == 1

    def test_stored_records_bounded_but_counts_complete(self, mock_notify):
        skip_bad_record = bad_record_guard(MagicMock())
        n_skips = MAX_STORED_PER_GROUP + 5
        # Breakers off: this test is about the storage bound, and n_skips identical errors
        # would otherwise trip the signature breaker before the flood finishes.
        with thresholds():
            for i in range(n_skips):
                with skip_bad_record("startup", "flood op", record="rec{}".format(i)):
                    raise InputError("corrupt")

        assert len(get_skip_records()) == MAX_STORED_PER_GROUP
        assert get_skip_counts() == {"startup": {"flood op": n_skips}}

        signal_and_reset_skip_counts("startup")
        message = mock_notify.call_args[0][0]
        assert "skipped *{}* bad record(s)".format(n_skips) in message
        assert "_… 5 more_" in message


class TestBreakers:
    """The stopping rule that makes widening BAD_RECORD_EXCEPTIONS safe.

    AttributeError/TypeError are in the tuple because a missing Mongo field surfaces as
    AttributeError, but their dominant cause is still a code bug. Bad data and a broken
    refactor raise the SAME exception class and differ only in volume, so these breakers
    discriminate on volume rather than on type.
    """

    def test_repeated_signature_aborts_with_build_degradation_error(self, mock_notify):
        """A rename raises one byte-identical message per record. That must abort the build,
        and abort with BuildDegradationError — which is outside BAD_RECORD_EXCEPTIONS and so
        cannot be caught by an enclosing guard. The original exception, whose message names
        the broken code, is chained as __cause__ rather than discarded."""
        log = MagicMock()
        skip_bad_record = bad_record_guard(log)
        seen = 0
        with thresholds(signature=3):
            with pytest.raises(BuildDegradationError, match="signature breaker trip") as exc_info:
                for i in range(50):
                    with skip_bad_record("startup", "topic mapping", record="topic{}".format(i)):
                        seen += 1
                        raise AttributeError("'Topic' object has no attribute 'slug'")

        # Aborted ON the 3rd record, not after draining all 50.
        assert seen == 3
        # The diagnosis survives the wrapper.
        cause = exc_info.value.__cause__
        assert isinstance(cause, AttributeError)
        assert "no attribute 'slug'" in str(cause)
        log.error.assert_called_once()
        assert "ABORTING BUILD" in log.error.call_args[0][0]

    def test_a_trip_escapes_an_enclosing_guard(self, mock_notify):
        """The guards nest: TocNode.serialize() and get_topic_toc_json_recursive() each wrap
        a call that re-enters the same guard. If a trip re-raised the ORIGINAL exception, the
        enclosing guard would catch it (it is in BAD_RECORD_EXCEPTIONS), log it as one more
        ordinary skip, and carry on — and since _trip_breaker() also zeroes the counters, the
        climb to the threshold would restart, so a rename would post to Slack every N records
        and still serve a half-built library. Raising BuildDegradationError is what stops it."""
        log = MagicMock()
        skip_bad_record = bad_record_guard(log)
        inner_calls = 0
        with thresholds(signature=3):
            with pytest.raises(BuildDegradationError):
                # Outer guard, standing in for the parent node in a recursive walk.
                with skip_bad_record("startup", "TocTree.serialize node", record="parent"):
                    for i in range(50):
                        # Inner guard, standing in for the children of that node.
                        with skip_bad_record("startup", "TocTree.serialize node",
                                             record="child{}".format(i)):
                            inner_calls += 1
                            raise AttributeError("'Topic' object has no attribute 'slug'")

        # Stopped at the threshold instead of grinding through all 50 children.
        assert inner_calls == 3
        # And the outer guard did NOT swallow the trip into a fresh skip: the log was reset
        # by the trip and nothing was recorded after it.
        assert get_skip_counts() == {}

    def test_varied_messages_do_not_trip_the_signature_breaker(self, mock_notify):
        """Genuine corruption produces varied messages; each signature stays at 1. This is
        what keeps the breaker from firing on the bad data the guards exist to survive."""
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(signature=3, volume=500):
            for i in range(50):
                with skip_bad_record("startup", "TocTree index", record="idx{}".format(i)):
                    raise InputError("Please provide category for Index record: book{}".format(i))
        assert get_skip_counts() == {"startup": {"TocTree index": 50}}

    def test_volume_backstop_catches_corruption_too_varied_to_repeat(self, mock_notify):
        """The case the signature breaker is structurally blind to: many records broken in
        many different ways, e.g. a half-finished migration."""
        skip_bad_record = bad_record_guard(MagicMock())
        seen = 0
        with thresholds(signature=3, volume=10):
            with pytest.raises(BuildDegradationError, match="volume breaker trip") as exc_info:
                for i in range(50):
                    with skip_bad_record("startup", "TocTree index", record="idx{}".format(i)):
                        seen += 1
                        raise InputError("record {} is broken in its own way".format(i))
        assert seen == 10
        assert isinstance(exc_info.value.__cause__, InputError)

    def test_breakers_count_per_site_not_globally(self, mock_notify):
        """Both counters are keyed by site, so unrelated degradation across many sites does
        not add up into a spurious abort."""
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(signature=3, volume=5):
            for site in range(4):
                for i in range(4):
                    with skip_bad_record("startup", "site{}".format(site), record=i):
                        raise InputError("distinct {} {}".format(site, i))
        assert sum(get_skip_counts()["startup"].values()) == 16

    def test_summary_posts_before_the_build_aborts(self, mock_notify):
        """The reason _trip_breaker posts the summary itself: the pathway's own
        signal_and_reset_skip_counts() call sits AFTER the work, so an abort would skip it
        and discard the skip log — which for a volume trip IS the diagnosis, since the
        exception that happens to surface says nothing about the other records."""
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(volume=3):
            with pytest.raises(BuildDegradationError):
                for i in range(10):
                    with skip_bad_record("startup", "TocTree index", record="idx{}".format(i)):
                        raise InputError("broken {}".format(i))

        mock_notify.assert_called_once()
        message = mock_notify.call_args[0][0]
        assert "skipped *3* bad record(s)" in message
        assert "'idx0' — InputError: broken 0" in message

    def test_pathway_finally_does_not_double_post_after_a_trip(self, mock_notify):
        """_trip_breaker posts AND resets, so the try/finally at the pathway call sites
        (reader/startup.py, sefaria/views.py) finds an empty log and posts nothing more."""
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(volume=3):
            try:
                for i in range(10):
                    with skip_bad_record("startup", "op", record=i):
                        raise InputError("broken {}".format(i))
            except BuildDegradationError:
                pass
            finally:
                signal_and_reset_skip_counts("startup")
        mock_notify.assert_called_once()

    def test_soft_skips_feed_volume_but_not_signature(self, mock_notify):
        """A soft skip is a known, handled condition, not an exception symptom — repeating
        one is not evidence of broken code. Mass soft-skipping is still degradation, so the
        volume backstop still applies, and raises since there is no original exception."""
        log = MagicMock()
        with thresholds(signature=3, volume=6):
            # 5 identical soft skips: past the signature threshold, and nothing happens.
            for i in range(5):
                log_skip(log, "reset_toc", "topic toc", "node has no slug", record=i)
            assert get_skip_counts() == {"reset_toc": {"topic toc": 5}}

            with pytest.raises(BuildDegradationError, match="aborting build"):
                log_skip(log, "reset_toc", "topic toc", "node has no slug", record=99)

    def test_breakers_can_be_disabled(self, mock_notify):
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(signature=None, volume=None):
            for i in range(200):
                with skip_bad_record("startup", "op", record=i):
                    raise AttributeError("'Topic' object has no attribute 'slug'")
        assert get_skip_counts() == {"startup": {"op": 200}}


class TestSignatureBreakerCountsDistinctRecords:
    """The signature breaker's premise is "N DIFFERENT records produced the same message, so
    the message cannot depend on the record — the code is broken." Counting occurrences only
    approximates that, and the approximation fails whenever the same record is skipped more
    than once: one bad record re-skipped by ten successive rebuilds is bad data, not broken
    code, and must not abort anything."""

    def test_one_record_skipped_repeatedly_never_trips(self, mock_notify):
        """The topic-admin case: one corrupt topic, re-walked by every rebuild. Fifty skips of
        the SAME record with a byte-identical message, and the breaker stays silent."""
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(signature=3, volume=500):
            for _ in range(50):
                with skip_bad_record("topic_admin", "topic TOC child", record="the-bad-topic"):
                    raise AttributeError("'Topic' object has no attribute 'slug'")
        assert get_skip_counts() == {"topic_admin": {"topic TOC child": 50}}

    def test_distinct_records_still_trip(self, mock_notify):
        """The rename case is unchanged: different records, same message, abort at N."""
        skip_bad_record = bad_record_guard(MagicMock())
        seen = 0
        with thresholds(signature=3, volume=500):
            with pytest.raises(BuildDegradationError, match="signature breaker trip"):
                for i in range(50):
                    with skip_bad_record("startup", "topic mapping", record="topic{}".format(i)):
                        seen += 1
                        raise AttributeError("'Topic' object has no attribute 'slug'")
        assert seen == 3

    def test_repeats_of_one_record_do_not_help_distinct_ones_trip(self, mock_notify):
        """Mixed: two distinct records against a threshold of 3, each skipped many times.
        Occurrence counting would abort; distinct-record counting correctly does not."""
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(signature=3, volume=500):
            for _ in range(20):
                for record in ("topic-a", "topic-b"):
                    with skip_bad_record("startup", "topic mapping", record=record):
                        raise AttributeError("'Topic' object has no attribute 'slug'")
        assert get_skip_counts() == {"startup": {"topic mapping": 40}}

    def test_skips_with_no_record_still_count_per_occurrence(self, mock_notify):
        """Nothing can be deduplicated without an identifier, so a guard that passes no
        record keeps the old occurrence-counting behavior rather than silently never tripping."""
        skip_bad_record = bad_record_guard(MagicMock())
        seen = 0
        with thresholds(signature=3, volume=500):
            with pytest.raises(BuildDegradationError, match="signature breaker trip"):
                for _ in range(50):
                    with skip_bad_record("startup", "topic mapping"):
                        seen += 1
                        raise AttributeError("'Topic' object has no attribute 'slug'")
        assert seen == 3

    def test_volume_backstop_still_counts_every_skip(self, mock_notify):
        """Distinct-record counting is the signature breaker only. Mass re-skipping of one
        record is still degradation, so the volume backstop still sees all of it."""
        skip_bad_record = bad_record_guard(MagicMock())
        seen = 0
        with thresholds(signature=3, volume=10):
            with pytest.raises(BuildDegradationError, match="volume breaker trip"):
                for _ in range(50):
                    with skip_bad_record("startup", "topic mapping", record="the-bad-topic"):
                        seen += 1
                        raise AttributeError("'Topic' object has no attribute 'slug'")
        assert seen == 10


class TestBuildPathway:
    """build_pathway() is what keeps the breakers counting within ONE build. Every rebuild
    entry point wraps its work in it; the reset on ENTRY is what stops skips from an
    unmonitored rebuild accumulating into the next build's counters."""

    def test_resets_on_entry_so_earlier_skips_do_not_count(self, mock_notify):
        """A build must not inherit counts from whatever ran before it in the process."""
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(signature=None, volume=None):
            with skip_bad_record("stray", "op", record="r1"):
                raise InputError("left over from an earlier rebuild")
        assert get_skip_counts() == {"stray": {"op": 1}}

        with build_pathway("reset_toc"):
            assert get_skip_counts() == {}

    def test_posts_the_summary_on_exit(self, mock_notify):
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(signature=None, volume=None):
            with build_pathway("reset_toc"):
                with skip_bad_record("reset_toc", "TocTree index", record="Berakhot"):
                    raise InputError("bad index")
        assert mock_notify.call_count == 1
        assert "[reset_toc]" in mock_notify.call_args[0][0]
        assert get_skip_counts() == {}

    def test_posts_the_summary_even_when_the_build_raises(self, mock_notify):
        """An aborted rebuild still has to say what it skipped — that log is the diagnosis."""
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(signature=None, volume=None):
            with pytest.raises(RuntimeError):
                with build_pathway("reset_toc"):
                    with skip_bad_record("reset_toc", "TocTree index", record="Berakhot"):
                        raise InputError("bad index")
                    raise RuntimeError("build blew up")
        assert mock_notify.call_count == 1
        assert "TocTree index" in mock_notify.call_args[0][0]

    def test_nesting_lets_the_outermost_block_own_the_summary(self, mock_notify):
        """rebuild_toc() wraps itself and is also reached from the reset_toc view, so blocks
        nest routinely. An inner block must not reset the outer log or post a partial summary."""
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(signature=None, volume=None):
            with build_pathway("reset_cache"):
                with skip_bad_record("reset_cache", "outer op", record="r1"):
                    raise InputError("outer")
                with build_pathway("rebuild_toc"):
                    with skip_bad_record("reset_cache", "inner op", record="r2"):
                        raise InputError("inner")
                # The inner block neither posted nor reset.
                assert mock_notify.call_count == 0
                assert get_skip_counts() == {"reset_cache": {"outer op": 1, "inner op": 1}}

        assert mock_notify.call_count == 1
        message = mock_notify.call_args[0][0]
        assert "[reset_cache]" in message
        assert "outer op" in message and "inner op" in message

    def test_nesting_depth_is_restored_when_an_inner_block_raises(self, mock_notify):
        """A raising inner block must not leave the depth counter stuck above zero — that
        would silence the outer summary, and every later build in the process with it."""
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(signature=None, volume=None):
            with build_pathway("outer"):
                with pytest.raises(RuntimeError):
                    with build_pathway("inner"):
                        raise RuntimeError("boom")
                with skip_bad_record("outer", "op", record="r1"):
                    raise InputError("recorded after the inner block blew up")
                assert mock_notify.call_count == 0
        assert mock_notify.call_count == 1
        assert "[outer]" in mock_notify.call_args[0][0]

    def test_a_breaker_trip_inside_a_block_posts_exactly_one_summary(self, mock_notify):
        """_trip_breaker() posts the summary itself, then build_pathway's exit runs against
        the already-reset log — so the abort produces one message, not two."""
        skip_bad_record = bad_record_guard(MagicMock())
        with thresholds(signature=3, volume=500):
            with pytest.raises(BuildDegradationError):
                with build_pathway("reset_toc"):
                    for i in range(50):
                        with skip_bad_record("reset_toc", "topic mapping",
                                             record="topic{}".format(i)):
                            raise AttributeError("'Topic' object has no attribute 'slug'")
        assert mock_notify.call_count == 1


class TestThreadSafety:

    @pytest.fixture(autouse=True)
    def tight_switch_interval(self):
        """Force the GIL to hand off aggressively for the duration of each race test.

        At CPython's default 5ms switch interval these races essentially never win — a
        thread runs its whole log_skip (or signal_and_reset's snapshot-format-post-reset
        window) inside one time slice, so the tests below pass identically with and
        without `_lock` and would not catch its removal. At 1e-6 they fail reliably
        against unlocked code and pass cleanly against the locked code.

        setswitchinterval is process-global, so always restore it — leaving it at 1e-6
        would slow every subsequent test in the suite.
        """
        original = sys.getswitchinterval()
        sys.setswitchinterval(1e-6)
        try:
            yield
        finally:
            sys.setswitchinterval(original)

    def test_concurrent_skips_and_summaries_lose_nothing(self, mock_notify):
        """Skip-recording threads racing signal_and_reset_skip_counts(): no iteration/race
        error, and every skip lands in exactly one summary (none reset away unreported)."""
        n_threads, per_thread = 8, 200
        errors = []

        def record(i):
            log = MagicMock()
            try:
                for j in range(per_thread):
                    log_skip(log, "reset_toc", "op{}".format(i), "detail", record="r{}".format(j))
            except Exception as e:
                errors.append(e)

        with patch("sefaria.helper.skip_tracking.logger") as mock_logger:
            threads = [threading.Thread(target=record, args=(i,)) for i in range(n_threads)]
            for t in threads:
                t.start()
            while any(t.is_alive() for t in threads):
                signal_and_reset_skip_counts("reset_toc")
            for t in threads:
                t.join()
            signal_and_reset_skip_counts("reset_toc")

        assert errors == []
        summarized = sum(c.kwargs["total"] for c in mock_logger.warning.call_args_list)
        assert summarized == n_threads * per_thread
        assert get_skip_counts() == {}

    def test_lock_is_not_held_while_posting_to_slack(self, mock_notify):
        """signal_and_reset_skip_counts() snapshots-and-resets under the lock, then formats
        and posts from the snapshot. Widening the `with _lock:` block to cover delivery
        would deadlock startup on any re-entrant path (threading.Lock is not reentrant) and
        would also reset away skips recorded mid-delivery. Assert both halves of that
        promise from inside the notify call itself. See the comment on the `with _lock:`
        block in skip_tracking.signal_and_reset_skip_counts() for why the split exists.
        """
        observed = {}

        def during_delivery(message, level=None):
            # Non-blocking so a regression fails the assertion below instead of hanging
            # the suite on a deadlock.
            acquired = skip_tracking._lock.acquire(blocking=False)
            observed["lock_free"] = acquired
            if acquired:
                skip_tracking._lock.release()
                # A skip recorded while the summary is in flight must survive into the
                # NEXT summary rather than being reset away unreported.
                log_skip(MagicMock(), "reset_toc", "during-delivery", "recorded mid-post")

        mock_notify.side_effect = during_delivery
        log_skip(MagicMock(), "reset_toc", "op", "detail")
        signal_and_reset_skip_counts("reset_toc")

        assert observed["lock_free"] is True
        assert get_skip_counts() == {"reset_toc": {"during-delivery": 1}}

    # Deliberately NOT tested here: racing readers (get_skip_counts/get_skip_records)
    # against writers, and racing the MAX_STORED_PER_GROUP check-then-append. Both were
    # written and measured against a no-op-lock build of this module and neither could be
    # made to fail — even at a 1e-6 switch interval with 8 threads x 20,000 mutations.
    # The reads are `dict(...)`/`list(...)` copies, which CPython performs on a C fast
    # path that no thread switch can interleave, and on 3.12 a bare `x += 1` across 8
    # threads x 20,000 does not lose an update either. So `_lock` is genuinely load-bearing
    # only for the WIDE window in signal_and_reset_skip_counts (covered above); around the
    # narrow mutations it is defensive and forward-compatible (e.g. free-threaded builds),
    # not something a test on CPython can pin. Adding those tests would have re-created the
    # exact problem this class had before: green assertions that pass with the lock deleted.
    # The storage bound itself is covered single-threaded by
    # TestSignalAndReset::test_stored_records_bounded_but_counts_complete.
