"""Unit tests for auth-service/dev/local-stack/scenarios/perf_report.py, the gate of the local perf drills.

Run from the repository root:
    python3 -m unittest discover -s e2e-tests/api-keys/tests -t .

Each case feeds a results document and checks that a missing or bad measurement produces a "fail" line, so a drill
can never pass on numbers it did not take.
"""

import contextlib
import copy
import io
import os
import sys
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(TESTS_DIR)))
sys.path.insert(0, os.path.join(REPO, "auth-service", "dev", "local-stack", "scenarios"))

import perf_report as pr  # noqa: E402


def arm(n=100, p50=1.0, p99=2.0):
    return {"n": n, "p50": p50, "p90": p50, "p99": p99, "p999": p99, "max": p99, "checks_rate": 1}


def mode(miss_added=True):
    run = {
        "arms": {
            "arms": {"base": arm(), "anon": arm(p50=1.5), "hit": arm(p50=1.6), "miss": arm(p50=1.4)},
            "added": {"anon": {"p50": 0.5, "p99": 1.0}, "hit": {"p50": 0.6, "p99": 1.1}},
        },
        "envoy_authsvc_rq_ms": {"p50": 0.5, "p90": 1.0, "p99": 1.0, "max": 2.0},
        "authsvc_decision": {"n": 100, "p50_le_ms": 0.01, "p99_le_ms": 0.02},
        "envoy_deltas": {"ext_authz_error": 0, "failure_mode_allowed": 0},
    }
    if miss_added:
        run["arms"]["added"]["miss"] = {"p50": 0.4, "p99": 0.9}
    return run


GOOD_LATENCY = {
    "modes": {"enforce": mode(miss_added=False), "observe": mode()},
    "direct": {"rate": 200, "keys": 1000, "grpc": arm(n=1000), "checks_rate": 1, "dropped": 0},
}


def trial(ms):
    return {"label": "t", "create_to_allow_ms": 55.0, "revoke_to_deny_ms": ms, "deny_code": "api_key_invalid"}


GOOD_REVOKE = {
    "keys_in_registry": 1000,
    "notify": {
        "trials": [trial(55.0), trial(60.0)],
        "create_to_allow": {"n": 2, "p50": 55.0, "p90": 55.0, "max": 55.0},
        "revoke_to_deny": {"n": 2, "p50": 57.5, "p90": 60.0, "max": 60.0},
        "deny_codes": ["api_key_invalid"],
        "errors": [],
        "reload_took": {"n": 2, "p50_ms": 3.0, "max_ms": 4.0, "keys": 1000},
    },
    "fallback": {
        "trials": [trial(60000.0), trial(60010.0), trial(59990.0)],
        "revoke_to_deny": {"n": 3, "p50": 60000.0, "max": 60010.0},
        "errors": [],
        "listener_backends": 0,
    },
}


def lines(fn, doc):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        fn(doc)
    return out.getvalue().splitlines()


def fails(fn, doc):
    return [line for line in lines(fn, doc) if line.startswith("fail ")]


class LatencyReportTest(unittest.TestCase):
    def test_good_run_has_no_failure(self):
        self.assertEqual(fails(pr.latency, GOOD_LATENCY), [])

    def test_missing_mode_fails(self):
        doc = copy.deepcopy(GOOD_LATENCY)
        del doc["modes"]["observe"]
        self.assertTrue(any("observe was not measured" in f for f in fails(pr.latency, doc)))

    def test_arm_without_samples_fails(self):
        doc = copy.deepcopy(GOOD_LATENCY)
        del doc["modes"]["enforce"]["arms"]["arms"]["miss"]
        self.assertTrue(any("no samples: miss" in f for f in fails(pr.latency, doc)))

    def test_fail_open_during_the_run_fails(self):
        doc = copy.deepcopy(GOOD_LATENCY)
        doc["modes"]["enforce"]["envoy_deltas"]["failure_mode_allowed"] = 3
        self.assertTrue(any("failure_mode_allowed" in f for f in fails(pr.latency, doc)))

    def test_direct_run_dropping_over_one_percent_fails(self):
        doc = copy.deepcopy(GOOD_LATENCY)
        doc["direct"]["dropped"] = 50
        self.assertTrue(any("calls dropped" in f for f in fails(pr.latency, doc)))

    def test_direct_p99_over_the_timeout_fails(self):
        doc = copy.deepcopy(GOOD_LATENCY)
        doc["direct"]["grpc"]["p99"] = 250.0
        self.assertTrue(any("ext_authz timeout" in f for f in fails(pr.latency, doc)))


class RevokeReportTest(unittest.TestCase):
    def test_good_run_has_no_failure(self):
        self.assertEqual(fails(pr.revoke, GOOD_REVOKE), [])

    def test_no_notify_run_fails(self):
        doc = copy.deepcopy(GOOD_REVOKE)
        del doc["notify"]
        self.assertTrue(any("no NOTIFY run" in f for f in fails(pr.revoke, doc)))

    def test_one_fast_fallback_trial_fails(self):
        doc = copy.deepcopy(GOOD_REVOKE)
        doc["fallback"]["trials"][0]["revoke_to_deny_ms"] = 2.0
        self.assertTrue(any("fastest revoke-to-deny" in f for f in fails(pr.revoke, doc)))

    def test_fallback_past_the_reload_interval_fails(self):
        doc = copy.deepcopy(GOOD_REVOKE)
        doc["fallback"]["revoke_to_deny"]["max"] = 70000.0
        self.assertTrue(any("periodic reload" in f for f in fails(pr.revoke, doc)))

    def test_wrong_denial_code_fails(self):
        doc = copy.deepcopy(GOOD_REVOKE)
        doc["notify"]["deny_codes"] = ["api_key_required"]
        self.assertTrue(any("denial code" in f for f in fails(pr.revoke, doc)))


class ParsersTest(unittest.TestCase):
    def test_reload_took_reads_microseconds_and_milliseconds(self):
        log = (
            "2026/11/09 12:05:57 INFO notify reload keys=14 took=451.456µs\n"
            "2026/11/09 12:05:58 INFO notify reload keys=15 took=3.5ms\n"
        )
        got = pr.reload_took(log)
        self.assertEqual(got["n"], 2)
        self.assertEqual(got["keys"], 15)
        self.assertAlmostEqual(got["max_ms"], 3.5)

    def test_prom_hist_bucket_bounds(self):
        text = (
            'authsvc_decision_seconds_bucket{le="1e-05"} 50\n'
            'authsvc_decision_seconds_bucket{le="2e-05"} 99\n'
            'authsvc_decision_seconds_bucket{le="5e-05"} 100\n'
            'authsvc_decision_seconds_bucket{le="+Inf"} 100\n'
            "authsvc_decision_seconds_count 100\n"
        )
        got = pr.prom_hist(text, "authsvc_decision_seconds")
        self.assertEqual(got["n"], 100)
        self.assertAlmostEqual(got["p50_le_ms"], 0.01)
        self.assertAlmostEqual(got["p99_le_ms"], 0.02)


if __name__ == "__main__":
    unittest.main()
