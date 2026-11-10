"""
Tests for the target guard and the manifest permissions of scripts/dev/seed_api_keys_e2e.py.

Stdlib only, no Django and no database: the guard is a pure function of the effective settings, so every case
passes the settings in. Run: python3 e2e-tests/api-keys/checks/test_seed_guards.py
(or ``bash e2e-tests/api-keys/checks/run-checks.sh seedguards``, which `all` also runs).
"""

import importlib.util
import os
import stat
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

SEED = Path(
    os.environ.get("SEED_SCRIPT") or Path(__file__).resolve().parents[3] / "scripts" / "dev" / "seed_api_keys_e2e.py"
)
spec = importlib.util.spec_from_file_location("seed_api_keys_e2e", SEED)
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)

CAULDRON_DOMAINS = {
    "www.apisplit.cauldron.sefaria.org",
    "voices.apisplit.cauldron.sefaria.org",
}


def local(**over):
    args = {
        "engine": "django.db.backends.postgresql",
        "pg_name": "sefaria_auth",
        "pg_host": "127.0.0.1",
        "pg_port": "55432",
        "mongo_host": "localhost",
        "mongo_port": 27017,
        "mongo_db": "sefaria",
        "environ": {},
    }
    args.update(over)
    return seed.check_target("local", **args)


def cauldron(**over):
    args = {
        "engine": "django.db.backends.postgresql",
        "pg_name": "sefaria_auth",
        "pg_host": "postgres-18",
        "pg_port": "5432",
        "mongo_host": "mongo",
        "mongo_port": 27017,
        "mongo_db": "sefaria",
        "domain_hosts": CAULDRON_DOMAINS,
        "cauldron": "apisplit",
        "environ": {},
    }
    args.update(over)
    return seed.check_target("cauldron", **args)


class LocalTarget(unittest.TestCase):
    def test_valid_local_passes(self):
        self.assertIn("this machine", local())

    def test_non_loopback_mongo_refused(self):
        with self.assertRaisesRegex(SystemExit, "mongo.example.com"):
            local(mongo_host="mongo.example.com")

    def test_one_non_loopback_member_of_a_mongo_list_refused(self):
        with self.assertRaisesRegex(SystemExit, "prod-mongo"):
            local(mongo_host=["localhost:27017", "prod-mongo:27017"])

    def test_non_loopback_postgres_refused(self):
        with self.assertRaises(SystemExit):
            local(pg_host="db.example.com")

    def test_wrong_local_port_refused(self):
        with self.assertRaises(SystemExit):
            local(pg_port="5432")


class CauldronTarget(unittest.TestCase):
    def test_valid_service_names_pass(self):
        self.assertIn("apisplit cauldron", cauldron())

    def test_valid_fqdn_forms_pass(self):
        cauldron(pg_host="postgres-18.default.svc.cluster.local", mongo_host="mongo.default.svc")
        cauldron(mongo_host="mongo-0.mongo.default.svc.cluster.local:27017,mongo-1.mongo.default.svc.cluster.local")
        cauldron(mongo_host=["mongo-0", "mongo-1"])

    def test_external_postgres_host_refused(self):
        with self.assertRaisesRegex(SystemExit, "production.example.com"):
            cauldron(pg_host="production.example.com")

    def test_public_ip_and_cloud_sql_refused(self):
        for host in ("34.12.7.9", "10.0.0.5", "project:region:instance", "db.abc.us-east1.rds.example.net"):
            with self.assertRaises(SystemExit, msg=host):
                cauldron(pg_host=host)

    def test_external_mongo_host_refused_with_in_cluster_postgres(self):
        with self.assertRaisesRegex(SystemExit, "mongo.production.example.com"):
            cauldron(mongo_host="mongo.production.example.com")

    def test_external_member_of_a_replica_set_refused(self):
        with self.assertRaisesRegex(SystemExit, "evil.example.com"):
            cauldron(mongo_host="mongo-0:27017,evil.example.com:27017")

    def test_production_domain_refused_even_with_in_cluster_hosts(self):
        with self.assertRaisesRegex(SystemExit, "production host www.sefaria.org"):
            cauldron(domain_hosts={"www.sefaria.org"})
        with self.assertRaisesRegex(SystemExit, "production host"):
            cauldron(domain_hosts=CAULDRON_DOMAINS | {"www.sefaria.org.il"})

    def test_other_cauldron_or_missing_domain_refused(self):
        with self.assertRaises(SystemExit):
            cauldron(domain_hosts={"www.other.cauldron.sefaria.org"})
        with self.assertRaises(SystemExit):
            cauldron(domain_hosts=set())

    def test_lookalike_domain_refused(self):
        with self.assertRaises(SystemExit):
            cauldron(domain_hosts={"www.apisplit.cauldron.sefaria.org.evil.example.com"})

    def test_loopback_refused(self):
        with self.assertRaises(SystemExit):
            cauldron(pg_host="127.0.0.1")
        with self.assertRaises(SystemExit):
            cauldron(mongo_host="localhost")

    def test_empty_mongo_name_refused_and_name_is_printed(self):
        with self.assertRaises(SystemExit):
            cauldron(mongo_db="")
        self.assertIn("'sefaria-shared'", cauldron(mongo_db="sefaria-shared"))

    def test_registry_name_still_required(self):
        with self.assertRaises(SystemExit):
            cauldron(pg_name="sefaria")

    def test_override_adds_a_host_but_never_bypasses_the_domain_check(self):
        env = {"APIKEYS_UNSAFE_ALLOW_HOSTS": "pg.internal.example.com"}
        cauldron(pg_host="pg.internal.example.com", environ=env)
        with self.assertRaises(SystemExit):
            cauldron(pg_host="pg.other.example.com", environ=env)
        with self.assertRaises(SystemExit):
            cauldron(pg_host="pg.internal.example.com", domain_hosts={"www.sefaria.org"}, environ=env)

    def test_target_mismatch_refused(self):
        with self.assertRaises(SystemExit):
            cauldron(environ={"APIKEYS_TARGET": "local"})


class DomainHosts(unittest.TestCase):
    def test_keys_are_not_hosts(self):
        value = {
            "en": {"library": "https://www.a.cauldron.sefaria.org", "voices": "https://voices.a.cauldron.sefaria.org/"}
        }
        self.assertEqual(seed._domain_hosts(value), {"www.a.cauldron.sefaria.org", "voices.a.cauldron.sefaria.org"})


class ResetSendLimits(unittest.TestCase):
    """--reset-send-limits must clear every place the confirmation limits live, and only for a fixture account."""

    def setUp(self):
        self.profiles = {}
        self.throttle_deletes = []
        test = self

        class Profile:
            def __init__(self, id):
                self.id = id
                self.settings = test.profiles.setdefault(id, {})

            def save(self):
                test.saved = True

        class Collection:
            def delete_many(self, query):
                test.throttle_deletes.append(query)

        developer = types.SimpleNamespace(
            CONFIRMATION_SENT_SETTING="developer_confirmation_sent_at",
            CONFIRMATION_SENT_TO_SETTING="developer_confirmation_sent_to",
            CONFIRMATION_SENDS_SETTING="developer_confirmation_sends",
            THROTTLE_COLLECTION="developer_confirmation_throttle",
        )
        powered_by = types.ModuleType("powered_by")
        powered_by.developer = developer
        user_profile = types.ModuleType("sefaria.model.user_profile")
        user_profile.UserProfile = Profile
        patcher = mock.patch.dict(
            sys.modules,
            {
                "powered_by": powered_by,
                "powered_by.developer": developer,
                "sefaria": types.ModuleType("sefaria"),
                "sefaria.model": types.ModuleType("sefaria.model"),
                "sefaria.model.user_profile": user_profile,
            },
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.developer = developer
        mock_db = {developer.THROTTLE_COLLECTION: Collection()}
        patch_db = mock.patch.object(seed, "_legacy_db", return_value=mock_db)
        patch_db.start()
        self.addCleanup(patch_db.stop)
        self.role = "onboarding.unverified"
        self.uid = seed.account_id(seed.spec_for(self.role)[0])

    def test_clears_sends_pending_confirmation_and_the_throttle_document(self):
        d = self.developer
        self.profiles[self.uid] = {
            d.CONFIRMATION_SENT_SETTING: "2026-01-01T00:00:00Z",
            d.CONFIRMATION_SENT_TO_SETTING: "a@example.com",
            d.CONFIRMATION_SENDS_SETTING: ["2026-01-01T00:00:00Z"],
            "interface_language": "english",
        }
        seed.reset_send_limits(self.role)
        self.assertEqual(self.profiles[self.uid], {"interface_language": "english"})
        self.assertEqual(self.throttle_deletes, [{"uid": self.uid}])

    def test_a_uid_outside_the_fixture_band_is_refused_and_nothing_is_deleted(self):
        with self.assertRaises(AssertionError):
            seed.reset_send_limits(self.role, base=1)
        self.assertEqual(self.throttle_deletes, [])


class ManifestMode(unittest.TestCase):
    def test_rewritten_file_ends_0600(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "m.json"
            path.write_text("old")
            path.chmod(0o644)
            seed.write_private(path, "new")
            self.assertEqual(path.read_text(), "new")
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    def test_new_file_is_0600_even_under_a_loose_umask(self):
        old = os.umask(0)
        try:
            with tempfile.TemporaryDirectory() as d:
                path = Path(d) / "m.json"
                seed.write_private(path, "x")
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        finally:
            os.umask(old)

    def test_redirected_stdout_file_is_made_private(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "m.json"
            path.write_text("old")
            path.chmod(0o644)
            with open(path, "w") as handle:  # what `> file` does: truncates, keeps the old mode
                seed.enforce_private_stdout(handle)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

    def test_pipe_stdout_is_left_alone(self):
        read_end, write_end = os.pipe()
        try:
            with os.fdopen(write_end, "w", closefd=False) as handle:
                seed.enforce_private_stdout(handle)
        finally:
            os.close(read_end)
            os.close(write_end)


class ManifestValidatedBeforeMutation(unittest.TestCase):
    """--target cauldron without --manifest-stdout must be refused before reset() or add_legacy_key() change anything."""

    def call(self, argv):
        names = (
            "setup_django",
            "guard_target",
            "require_mutation_consent",
            "read_password",
            "reset",
            "add_legacy_key",
            "report",
            "print_leftovers",
        )
        with (
            mock.patch.multiple(seed, **dict.fromkeys(names, mock.DEFAULT)) as mocks,
            mock.patch.object(seed, "emit_manifest", return_value="stdout") as emit_mock,
        ):
            mocks["reset"].return_value = "run-1"
            try:
                seed.main(argv, "pw")
                error = None
            except SystemExit as exc:
                error = exc
            return mocks, emit_mock, error

    def test_reset_on_the_cauldron_without_manifest_stdout_changes_nothing(self):
        mocks, emit_mock, error = self.call(["--target", "cauldron", "--reset"])
        self.assertIsNotNone(error)
        self.assertIn("--manifest-stdout", str(error))
        mocks["reset"].assert_not_called()
        mocks["add_legacy_key"].assert_not_called()
        emit_mock.assert_not_called()

    def test_legacy_key_on_the_cauldron_without_manifest_stdout_changes_nothing(self):
        mocks, _, error = self.call(["--target", "cauldron", "--legacy-key", "a.b"])
        self.assertIn("--manifest-stdout", str(error))
        mocks["add_legacy_key"].assert_not_called()
        mocks["reset"].assert_not_called()

    def test_the_refusal_comes_before_the_consent_prompt_and_the_password_read(self):
        mocks, _, _ = self.call(["--target", "cauldron", "--reset"])
        mocks["require_mutation_consent"].assert_not_called()
        mocks["read_password"].assert_not_called()

    def test_reset_on_the_cauldron_with_manifest_stdout_runs(self):
        mocks, emit_mock, error = self.call(["--target", "cauldron", "--reset", "--manifest-stdout"])
        self.assertIsNone(error)
        mocks["reset"].assert_called_once()
        emit_mock.assert_called_once()

    def test_an_unwritable_local_manifest_directory_changes_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            blocker = Path(d) / "file"
            blocker.write_text("x")  # a file where the manifest's directory should be
            with mock.patch.dict(os.environ, {"APIKEYS_MANIFEST": str(blocker / "sub" / "m.json")}):
                mocks, _, error = self.call(["--target", "local", "--reset"])
        self.assertIsNotNone(error)
        mocks["reset"].assert_not_called()

    def test_a_read_only_mode_needs_no_manifest_destination(self):
        mocks, _, error = self.call(["--target", "cauldron", "--report"])
        self.assertIsNone(error)
        mocks["reset"].assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
