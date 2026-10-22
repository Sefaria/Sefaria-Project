"""demo.sh must never hand PG_TEST_DSN to the Go tests unless asked: they truncate and rebuild their schema."""
import os
import stat
import subprocess
import tempfile
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(os.path.dirname(TESTS_DIR)))
DEMO = os.path.join(REPO, "auth-service", "scripts", "demo.sh")


class DemoPgTestDsnTest(unittest.TestCase):

    def run_demo(self, *args):
        """Runs demo.sh with a stub `go` that records the PG_TEST_DSN it sees; returns the recorded values."""
        with tempfile.TemporaryDirectory() as tmp:
            record = os.path.join(tmp, "dsn.log")
            stub = os.path.join(tmp, "go")
            with open(stub, "w") as handle:
                handle.write('#!/usr/bin/env bash\necho "dsn=[${PG_TEST_DSN-unset}]" >> "%s"\nexit 0\n' % record)
            os.chmod(stub, os.stat(stub).st_mode | stat.S_IEXEC)
            env = dict(os.environ, PATH=tmp + os.pathsep + os.environ["PATH"], PG_TEST_DSN="postgres://x:y@127.0.0.1:1/never")
            subprocess.run(["bash", DEMO, "--offline", *args], cwd=REPO, env=env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600)
            if not os.path.exists(record):
                return []
            with open(record) as handle:
                return handle.read().split()

    def test_offline_does_not_pass_pg_test_dsn_to_the_go_tests(self):
        seen = self.run_demo()
        self.assertTrue(seen, "the stub go was never called")
        self.assertEqual(set(seen), {"dsn=[unset]"})

    def test_the_explicit_flag_passes_it_through(self):
        seen = self.run_demo("--pg-integration")
        self.assertTrue(seen, "the stub go was never called")
        self.assertEqual(set(seen), {"dsn=[postgres://x:y@127.0.0.1:1/never]"})


if __name__ == "__main__":
    unittest.main()
