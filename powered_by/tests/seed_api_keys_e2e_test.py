"""
The API keys e2e seed script: every account lands in its state, and teardown leaves nothing behind.

These tests seed into a separate id band, so a local stack's real fixtures, whose Mongo profiles
share the developer's Mongo, are never touched.
"""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from allauth.account.models import EmailAddress
from django.contrib.auth.models import User
from django.contrib.sessions.backends.db import SessionStore
from django.test import RequestFactory, TestCase, override_settings

from powered_by import developer, developer_mocks
from powered_by.models import ApiKey, Project
from sefaria.system.database import db


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "dev" / "seed_api_keys_e2e.py"
_spec = importlib.util.spec_from_file_location("seed_api_keys_e2e", SCRIPT)
seed = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seed)

BASE = 2_097_000_000
PASSWORD = "e2e-seed-test-password"


def uid(n):
    return BASE + n


@override_settings(DEVELOPER_SETTINGS_ENABLED=True)
class SeedApiKeysE2eTest(TestCase):
    databases = "__all__"

    def setUp(self):
        seed.teardown(include_sentinel=True, base=BASE)
        self.run_id = seed.reset("local", PASSWORD, run_id="test-local", base=BASE)

    def tearDown(self):
        seed.teardown(include_sentinel=True, base=BASE)

    def state_of(self, n):
        request = RequestFactory().get("/")
        request.user = User.objects.get(id=uid(n))
        request.session = SessionStore()
        return developer.developer_state(request)

    def assert_nothing_left(self):
        self.assertEqual(seed.leftovers(include_sentinel=True, base=BASE),
                         {"users": 0, "projects": 0, "keys": 0, "profiles": 0, "legacyKeys": 0})
        self.assertEqual(Project.objects.filter(notes__startswith="E2E api-keys").count(), 0)

    def test_reset_then_teardown_leaves_no_rows(self):
        seed.add_legacy_key("callers.legacy", base=BASE)
        self.assertEqual(User.objects.filter(id__gte=uid(1), id__lte=uid(999)).count(), len(seed.ACCOUNTS))
        self.assertTrue(ApiKey.objects.filter(project__notes=seed.marker_for("test-local")).exists())

        seed.teardown(base=BASE)

        self.assert_nothing_left()
        self.assertEqual(db.apikeys.count_documents({"uid": {"$gte": uid(1), "$lte": uid(999)}}), 0)

    def test_every_account_is_in_the_state_the_contract_names(self):
        self.assertFalse(self.state_of(101)["emailVerified"])
        self.assertIsNotNone(self.state_of(103)["confirmationSentAt"])
        self.assertTrue(self.state_of(104)["ssoConnected"])
        self.assertFalse(self.state_of(105)["ssoConnected"])
        set_up = self.state_of(201)
        self.assertTrue(set_up["developerEnabled"] and set_up["profile"] and set_up["emailVerified"])
        self.assertEqual(set_up["projects"], [])
        self.assertIsNotNone(self.state_of(202)["yourListing"])
        self.assertEqual(len(self.state_of(5)["projects"][0]["keys"]), 5)
        self.assertEqual(self.state_of(4)["projects"], [])

    def test_gateway_keys_have_their_restrictions_and_revocations(self):
        keys = {k["name"]: k for k in seed.build_manifest("local", base=BASE)["keys"]}

        self.assertEqual(keys["open"]["allowedOrigins"], [])
        self.assertEqual(keys["restricted"]["allowedOrigins"], ["https://site-a.example.com"])
        self.assertTrue(keys["revoked"]["revoked"])
        self.assertTrue(keys["deletedProject"]["revoked"])
        self.assertFalse(keys["open"]["revoked"])
        for project in Project.objects.filter(notes=seed.marker_for("test-local")):
            self.assertFalse(project.is_published)
            self.assertFalse(project.consent_to_display)

    def test_the_expired_link_is_expired_but_renewable(self):
        key = seed.expired_link_path(User.objects.get(id=uid(103))).rsplit("/", 1)[1]

        self.assertTrue(developer.link_expired(key))
        self.assertEqual(developer.user_for_new_link(key).id, uid(103))

    def test_teardown_also_removes_what_the_tests_created_and_nothing_else(self):
        owner = User.objects.get(id=uid(201))
        made = developer.create_project(owner, {"name": "Made in the UI", "description": "", "organization": "",
                                                "websiteUrl": "", "visibility": "public", "aiAssisted": False})
        developer.create_key(owner, made.id, "ui key")
        listing_owner = User.objects.get(id=uid(202))
        developer.claim_listing(listing_owner, Project.objects.get(owner__isnull=True,
                                                                   creator_email=listing_owner.email).id)
        developer_mocks.create_listing(User.objects.get(id=uid(601)))
        stranger = User.objects.create_user(id=BASE + 1000, username="seed-test-stranger",
                                            email="seed-test-stranger@example.com", password="x")
        kept = Project.objects.create(submission_source="manual", project_name="Kept", owner=stranger,
                                      notes="E2E api-keys not a marker")
        ApiKey.objects.create(project=kept, label="kept")

        seed.teardown(base=BASE)

        self.assert_nothing_left_but(kept)

    def assert_nothing_left_but(self, kept):
        self.assertEqual(seed.leftovers(base=BASE)["projects"], 0)
        self.assertEqual(seed.leftovers(base=BASE)["users"], 0)
        self.assertEqual(list(Project.objects.values_list("id", flat=True)), [kept.id])
        self.assertEqual(ApiKey.objects.count(), 1)

    def test_the_sentinel_survives_a_plain_teardown(self):
        self.assertTrue(seed.ensure_sentinel(PASSWORD, base=BASE))
        self.assertFalse(seed.ensure_sentinel(PASSWORD, base=BASE))

        seed.teardown(base=BASE)

        self.assertTrue(ApiKey.objects.filter(project__notes=seed.SENTINEL_NOTE, revoked_at__isnull=True).exists())
        seed.teardown(include_sentinel=True, base=BASE)
        self.assert_nothing_left()

    def test_reset_send_limits_clears_the_send_history(self):
        user = User.objects.get(id=uid(102))
        developer.mark_confirmation_sent(user, True)
        with self.assertRaises(developer.CooldownError):
            developer.check_confirmation_limits(user)

        seed.reset_send_limits("onboarding.unverifiedResend", base=BASE)

        developer.check_confirmation_limits(user)

    def test_accounts_log_in_with_the_shared_password(self):
        self.assertTrue(self.client.login(email=seed.account_email("gateway", "open"), password=PASSWORD))
        self.assertTrue(EmailAddress.objects.filter(user_id=uid(1), verified=True).exists())


class SeedGuardTest(TestCase):

    def guard(self, target, mocks=True, **db):
        fake = SimpleNamespace(DATABASES={"default": {"ENGINE": "django.db.backends.postgresql",
                                                      "NAME": "sefaria_auth", **db}},
                               DEVELOPER_SETTINGS_MOCKS=mocks, DOMAIN_MODULES={})
        with patch("django.conf.settings", fake):
            seed.guard_target(target)

    def test_ids_outside_the_band_are_refused(self):
        for bad in (seed.ID_BASE, seed.ID_BASE + 1000, 2_099_000_001, 42):
            with self.assertRaises(AssertionError):
                seed.check_ids([bad])

    def test_local_needs_the_stack_postgres(self):
        self.guard("local", HOST="127.0.0.1", PORT="55432")
        for db in ({"HOST": "10.0.0.5", "PORT": "5432"}, {"HOST": "127.0.0.1", "PORT": "5432"},
                   {"HOST": "127.0.0.1", "PORT": "55432", "NAME": "sefaria"},
                   {"HOST": "127.0.0.1", "PORT": "55432", "ENGINE": "django.db.backends.sqlite3"}):
            with self.assertRaises(SystemExit, msg=db):
                self.guard("local", **db)

    def test_cauldron_needs_mocks_and_a_remote_database(self):
        self.guard("cauldron", HOST="postgres-18", PORT="5432")
        with self.assertRaises(SystemExit):
            self.guard("cauldron", HOST="127.0.0.1", PORT="55432")
        with self.assertRaises(SystemExit):
            self.guard("cauldron", mocks=False, HOST="postgres-18", PORT="5432")
