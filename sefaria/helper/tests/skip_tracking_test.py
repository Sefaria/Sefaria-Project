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

import pytest
from unittest.mock import MagicMock, patch

from sefaria.system.exceptions import InputError
from sefaria.helper import skip_tracking
from sefaria.helper.skip_tracking import (
    bad_record_guard,
    log_skip,
    get_skip_records,
    get_skip_counts,
    signal_and_reset_skip_counts,
    reset_skip_counts,
    MAX_STORED_PER_GROUP,
)


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

    def test_systemic_exception_propagates(self):
        """AttributeError is not in BAD_RECORD_EXCEPTIONS — a code bug must abort the
        build loudly, not degrade into a silently incomplete library."""
        skip_bad_record = bad_record_guard(MagicMock())
        with pytest.raises(AttributeError):
            with skip_bad_record("startup", "test operation", record="rec"):
                raise AttributeError("renamed method")
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
        for i in range(n_skips):
            with skip_bad_record("startup", "flood op", record="rec{}".format(i)):
                raise InputError("corrupt")

        assert len(get_skip_records()) == MAX_STORED_PER_GROUP
        assert get_skip_counts() == {"startup": {"flood op": n_skips}}

        signal_and_reset_skip_counts("startup")
        message = mock_notify.call_args[0][0]
        assert "skipped *{}* bad record(s)".format(n_skips) in message
        assert "_… 5 more_" in message


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
