import os
import re
import subprocess
import sys
import textwrap

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MOCK = {"SEFARIA_MOCK_MONGO": "1", "SEFARIA_TEST_MONGO": "1", "LOCAL_TEST_MONGO_PORT": "27099"}


def _py(code, **env):
    return subprocess.run([sys.executable, "-c", textwrap.dedent(code)], cwd=ROOT, capture_output=True, text=True,
                          env={**os.environ, **env}, timeout=60)


def test_local_mongo_override_clears_replicaset():
    # mock env: a real client would block 60 s in list_database_names
    r = _py("import sefaria.settings as s; s.MONGO_REPLICASET_NAME='rs0'; import sefaria.conftest; "
            "assert s.MONGO_REPLICASET_NAME is None", **MOCK)
    assert r.returncode == 0, r.stderr[-800:]


def test_non_loopback_host_refused():
    r = _py("import sefaria.local_settings_pytest as p; p.MONGO_HOST='10.0.0.5'; import sefaria.conftest",
            SEFARIA_TEST_MONGO="1")
    assert r.returncode != 0 and "loopback" in r.stderr


_PROBE = """
import sys, pytest

class _Probe:
    def pytest_sessionfinish(self, session, exitstatus):
        from sefaria.system import database
        print("PROBE", type(database.client).__module__, database.MONGO_PORT)

sys.exit(pytest.main(["-q", "-p", "no:cacheprovider"] + sys.argv[1:], plugins=[_Probe()]))
"""


def _probe(*args):
    # A real mongod may be listening on the default port of a dev box, so a run that
    # silently connected to it would still pass; read the client type instead.
    r = subprocess.run([sys.executable, "-c", _PROBE, *args], cwd=ROOT, capture_output=True, text=True,
                       env={**os.environ, **MOCK}, timeout=120)
    assert r.returncode == 0, r.stdout[-800:]
    probe = re.findall(r"PROBE (\S+) (\S+)", r.stdout)
    assert probe and probe[-1][0].startswith("mongomock") and probe[-1][1] == "27099", r.stdout[-800:]


def test_reader_alone_never_opens_a_real_connection():
    _probe("reader/tests/static_pages_test.py")


def test_reader_before_sefaria_arg_order():
    _probe("reader/tests/static_pages_test.py",
           "sefaria/tests/mongo_isolation_test.py::test_non_loopback_host_refused")


@pytest.mark.skipif(os.environ.get("SEFARIA_MOCK_MONGO") != "1", reason="only meaningful in the mocked jobs")
def test_mock_session_has_no_real_client():
    from sefaria.system import database
    assert type(database.client).__module__.startswith("mongomock") and database.MONGO_PORT == 27099
