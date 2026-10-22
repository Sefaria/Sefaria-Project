"""
The developer settings API: verification, profile, projects, keys and Powered by listings.
"""
import json
import re
import threading
import time
from datetime import timedelta
from unittest.mock import patch

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount
from django.core import mail
from django.db import connection, connections
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from powered_by import developer
from powered_by.models import ApiKey, Project, SubmissionSource
from reader.conftest import create_test_user, page_props, purge_test_profiles


PROFILE = {"developerName": "Tova Levi", "description": "Daily study tools.", "termsAccepted": True}
PROJECT = {"name": "Daf Portal", "description": "A daily page companion.", "organization": "",
           "websiteUrl": "https://dafportal.org/app", "visibility": "private", "aiAssisted": True}


def gallery_ids():
    return [p["id"] for p in json.loads(Client().get("/api/powered-by").content)["projects"]]


@override_settings(DEVELOPER_SETTINGS_ENABLED=True)
class DeveloperApiTestCase(TestCase):
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("devapi")
        purge_test_profiles(self.user)
        self.client.force_login(self.user)

    def tearDown(self):
        purge_test_profiles(self.user)

    def call(self, method, url, body=None, client=None):
        client = client or self.client
        data = json.dumps(body) if body is not None else ""
        response = getattr(client, method)("/api/developer/" + url, data, content_type="application/json")
        return response.status_code, json.loads(response.content)

    def verify_email(self):
        EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True, verified=True)

    def set_up_developer(self):
        self.verify_email()
        self.call("post", "enable")
        status, state = self.call("post", "profile", {"profile": PROFILE})
        assert status == 200, state
        return state

    def create_project(self, **fields):
        status, state = self.call("post", "projects", {"project": {**PROJECT, **fields}})
        assert status == 200, state
        return next(p for p in state["projects"] if p["id"] == state["projectId"])

    def create_key(self, project_id, label="Production"):
        status, state = self.call("post", "projects/{}/keys".format(project_id), {"label": label})
        assert status == 200, state
        return state


class VerificationTest(DeveloperApiTestCase):

    def test_a_new_account_is_unverified_and_cannot_turn_developer_settings_on(self):
        status, state = self.call("get", "state")

        self.assertEqual(status, 200)
        self.assertFalse(state["emailVerified"])
        self.assertFalse(state["ssoConnected"])
        self.assertEqual(self.call("post", "enable")[0], 400)

    def test_a_verified_email_turns_developer_settings_on(self):
        self.verify_email()

        status, state = self.call("post", "enable")

        self.assertEqual(status, 200)
        self.assertTrue(state["developerEnabled"])

    def test_the_emailed_link_confirms_the_address_without_a_login_and_turns_developer_settings_on(self):
        status, state = self.call("post", "confirmation")

        self.assertEqual(status, 200)
        self.assertIsNotNone(state["confirmationSentAt"])
        self.assertEqual(len(mail.outbox), 1)
        link = re.search(r"https?://\S+/settings/developer/confirm-email/\S+", mail.outbox[0].body).group(0)

        response = Client().get(link)

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/settings/developer/email-confirmed")
        state = self.call("get", "state")[1]
        self.assertTrue(state["emailVerified"])
        self.assertTrue(state["developerEnabled"])
        self.assertIsNone(state["confirmationSentAt"])

    def test_a_second_email_within_a_minute_is_refused(self):
        self.call("post", "confirmation")

        response = self.client.post("/api/developer/confirmation", "", content_type="application/json")

        self.assertEqual(response.status_code, 429)
        self.assertTrue(0 < int(response["Retry-After"]) <= 60)
        self.assertIn("error", json.loads(response.content))
        self.assertEqual(len(mail.outbox), 1)

    def test_cancelling_does_not_reset_the_cooldown(self):
        self.call("post", "confirmation")
        self.call("delete", "confirmation")

        self.assertEqual(self.call("post", "confirmation")[0], 429)
        self.assertEqual(len(mail.outbox), 1)

    def test_another_email_is_sent_after_the_cooldown(self):
        self.call("post", "confirmation")
        later = timezone.now() + timedelta(seconds=61)

        with patch("powered_by.developer.timezone.now", return_value=later):
            status, _ = self.call("post", "confirmation")

        self.assertEqual(status, 200)
        self.assertEqual(len(mail.outbox), 2)

    def test_a_bad_link_is_not_found(self):
        self.assertEqual(Client().get("/settings/developer/confirm-email/not-a-key").status_code, 404)

    def test_cancelling_stops_waiting_for_the_link(self):
        self.call("post", "confirmation")

        state = self.call("delete", "confirmation")[1]

        self.assertIsNone(state["confirmationSentAt"])

    def test_the_landing_page_needs_no_login(self):
        self.assertEqual(Client().get("/settings/developer/email-confirmed").status_code, 200)

    def test_projects_need_developer_settings_set_up(self):
        self.verify_email()

        self.assertEqual(self.call("post", "projects", {"project": PROJECT})[0], 403)

    def test_the_api_needs_a_login(self):
        self.assertEqual(self.call("get", "state", client=Client())[0], 401)


class SsoVerificationTest(DeveloperApiTestCase):
    """
    A Google or Apple login verifies the account only if the provider marked the account email verified.
    """

    def connect(self, provider, email=None, **claims):
        SocialAccount.objects.create(user=self.user, provider=provider, uid=provider + "-1",
                                     extra_data={"email": email or self.user.email, **claims})

    def test_google_with_a_verified_email_verifies_the_account(self):
        self.connect("google", email_verified=True)

        state = self.call("get", "state")[1]

        self.assertTrue(state["ssoConnected"])
        self.assertEqual(self.call("post", "enable")[0], 200)

    def test_apple_with_a_verified_email_verifies_the_account(self):
        self.connect("apple", email_verified="true")

        self.assertTrue(self.call("get", "state")[1]["ssoConnected"])

    def test_google_with_an_unverified_email_gets_the_link_instead(self):
        self.connect("google", email_verified=False)

        self.assertFalse(self.call("get", "state")[1]["ssoConnected"])
        self.assertEqual(self.call("post", "enable")[0], 400)
        self.assertEqual(self.call("post", "confirmation")[0], 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_apple_with_an_unverified_email_does_not_verify_the_account(self):
        self.connect("apple", email_verified="false")

        self.assertFalse(self.call("get", "state")[1]["ssoConnected"])

    def test_a_provider_verified_email_that_is_not_the_account_email_does_not_count(self):
        self.connect("google", email="someone.else@example.org", email_verified=True)

        self.assertFalse(self.call("get", "state")[1]["ssoConnected"])


class ConfirmationLinkTest(DeveloperApiTestCase):
    """
    Opening an emailed link: expired, already used, or for an address that is no longer the account email.
    """

    def link_key(self, age=timedelta(0)):
        sent = time.time() - age.total_seconds()
        with patch("django.core.signing.time.time", return_value=sent):
            return developer.confirmation_for(self.user).key

    def open_link(self, key):
        response = Client().get("/settings/developer/confirm-email/" + key)
        if response.status_code != 200:
            return response.status_code, None
        return 200, page_props(response.content.decode("utf-8"))["initialDeveloperEmailLink"]

    def new_link(self, key):
        response = Client().post("/api/developer/confirmation/new-link", json.dumps({"key": key}),
                                 content_type="application/json")
        return response.status_code

    def test_an_expired_link_offers_a_new_one_and_confirms_nothing(self):
        key = self.link_key(age=timedelta(days=3, minutes=1))

        status, link = self.open_link(key)

        self.assertEqual(status, 200)
        self.assertEqual(link, {"status": "expired", "key": key})
        self.assertFalse(self.call("get", "state")[1]["emailVerified"])

    def test_a_new_link_for_an_expired_one_is_emailed_without_a_login_and_works(self):
        key = self.link_key(age=timedelta(days=4))

        self.assertEqual(self.new_link(key), 200)

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.user.email])
        link = re.search(r"https?://\S+/settings/developer/confirm-email/\S+", mail.outbox[0].body).group(0)
        self.assertEqual(Client().get(link).status_code, 302)
        self.assertTrue(self.call("get", "state")[1]["emailVerified"])

    def test_new_links_share_the_resend_limits(self):
        key = self.link_key(age=timedelta(days=4))

        self.assertEqual(self.new_link(key), 200)
        self.assertEqual(self.new_link(key), 429)
        self.assertEqual(len(mail.outbox), 1)

    def test_a_used_link_shows_already_confirmed(self):
        key = self.link_key()
        self.assertEqual(self.open_link(key)[0], 302)

        status, link = self.open_link(key)

        self.assertEqual(status, 200)
        self.assertEqual(link["status"], "already-confirmed")
        self.assertEqual(self.new_link(key), 404)

    def test_a_link_for_an_address_that_is_no_longer_the_account_email_is_rejected(self):
        key = self.link_key()
        self.user.email = "tova.new@example.org"
        self.user.save()

        status, link = self.open_link(key)

        self.assertEqual(status, 200)
        self.assertEqual(link["status"], "not-account-email")
        self.assertFalse(EmailAddress.objects.get(user=self.user, email__iexact=link_address(key)).verified)
        self.assertEqual(self.new_link(key), 404)
        self.assertEqual(len(mail.outbox), 0)

    def test_a_link_we_did_not_sign_is_not_found(self):
        self.assertEqual(self.open_link("not-a-key")[0], 404)
        self.assertEqual(self.new_link("not-a-key"), 404)


def link_address(key):
    return developer.address_of_link(key).email


class ResendLimitTest(DeveloperApiTestCase):
    """
    About one confirmation email a minute and five a day.
    """

    def send_at(self, when):
        with patch("powered_by.developer.timezone.now", return_value=when):
            response = self.client.post("/api/developer/confirmation", "", content_type="application/json")
        return response

    def test_a_sixth_email_in_a_day_is_refused_until_the_first_is_a_day_old(self):
        start = timezone.now()
        for i in range(5):
            self.assertEqual(self.send_at(start + timedelta(minutes=2 * i)).status_code, 200)

        refused = self.send_at(start + timedelta(hours=1))

        self.assertEqual(refused.status_code, 429)
        self.assertIn("5 links today", json.loads(refused.content)["error"])
        self.assertEqual(int(refused["Retry-After"]), 23 * 60 * 60 + 1)
        self.assertEqual(self.send_at(start + timedelta(days=1, seconds=1)).status_code, 200)
        self.assertEqual(len(mail.outbox), 6)


class EmailChangeTest(DeveloperApiTestCase):
    """
    Changing the account email resets verification: existing keys keep working and stay manageable,
    but no new project or key until the new address is confirmed.
    """

    def setUp(self):
        super().setUp()
        self.set_up_developer()
        self.project = self.create_project()
        state = self.create_key(self.project["id"])
        self.key_id = state["keyId"]
        self.user.email = "tova.new@example.org"
        self.user.username = self.user.email
        self.user.save()

    def test_the_account_is_no_longer_verified_but_keeps_its_projects_and_keys(self):
        state = self.call("get", "state")[1]

        self.assertFalse(state["emailVerified"])
        self.assertTrue(state["developerEnabled"])
        self.assertEqual([p["id"] for p in state["projects"]], [self.project["id"]])
        self.assertEqual(len(state["projects"][0]["keys"]), 1)
        self.assertIsNone(ApiKey.objects.get(id=self.key_id).revoked_at)

    def test_new_projects_keys_and_claims_are_blocked(self):
        Project.objects.create(submission_source=SubmissionSource.MANUAL, project_name="Listing",
                               creator_email=self.user.email)
        listing = Project.objects.get(project_name="Listing")

        self.assertEqual(self.call("post", "projects", {"project": PROJECT})[0], 403)
        self.assertEqual(self.call("post", "projects/{}/keys".format(self.project["id"]), {"label": "Two"})[0], 403)
        self.assertEqual(self.call("post", "listings/{}/claim".format(listing.id))[0], 403)
        self.assertIsNone(Project.objects.get(id=listing.id).owner)

    def test_existing_projects_and_keys_can_still_be_managed(self):
        self.assertEqual(self.call("post", "projects/" + self.project["id"],
                                   {"project": {**PROJECT, "name": "Renamed"}})[0], 200)
        self.assertEqual(self.call("post", "profile", {"profile": PROFILE})[0], 200)
        self.assertEqual(self.call("delete", "keys/" + self.key_id)[0], 200)
        self.assertIsNotNone(ApiKey.objects.get(id=self.key_id).revoked_at)

    def test_a_link_sent_to_the_old_address_is_not_pending_for_the_new_one(self):
        self.user.email = "tova.old@example.org"
        self.user.save()
        self.call("post", "confirmation")
        self.user.email = "tova.new@example.org"
        self.user.save()

        self.assertIsNone(self.call("get", "state")[1]["confirmationSentAt"])

    def test_confirming_the_new_address_unblocks_new_projects(self):
        status, state = self.call("post", "confirmation")
        self.assertEqual(status, 200)
        self.assertIsNotNone(state["confirmationSentAt"])
        link = re.search(r"https?://\S+/settings/developer/confirm-email/\S+", mail.outbox[0].body).group(0)

        self.assertEqual(Client().get(link).status_code, 302)

        self.assertTrue(self.call("get", "state")[1]["emailVerified"])
        self.create_project(name="Second")


class ProfileTest(DeveloperApiTestCase):

    def test_the_profile_is_saved_with_the_terms_accepted(self):
        state = self.set_up_developer()

        self.assertEqual(state["profile"]["developerName"], "Tova Levi")
        self.assertTrue(state["profile"]["termsAccepted"])

    def test_the_terms_must_be_accepted(self):
        self.verify_email()

        status, _ = self.call("post", "profile", {"profile": {**PROFILE, "termsAccepted": False}})

        self.assertEqual(status, 400)


class ProjectTest(DeveloperApiTestCase):

    def setUp(self):
        super().setUp()
        self.set_up_developer()

    def test_a_project_is_a_powered_by_row_owned_by_the_account(self):
        project = self.create_project()

        row = Project.objects.get(id=int(project["id"]))
        self.assertEqual(row.owner, self.user)
        self.assertEqual(row.submission_source, SubmissionSource.DEVELOPER_SETTINGS)
        self.assertEqual(row.tier, "developer")
        self.assertFalse(row.consent_to_display)
        self.assertEqual(project["visibility"], "private")
        self.assertFalse(project["linkedListing"])

    def test_a_public_project_is_listed_and_a_private_one_is_not(self):
        public = Project.objects.get(id=int(self.create_project(visibility="public")["id"]))
        private = Project.objects.get(id=int(self.create_project(visibility="private")["id"]))

        self.assertTrue(public.consent_to_display)
        self.assertFalse(private.consent_to_display)
        self.assertTrue(public.is_published and private.is_published, "staff haven't unpublished either")
        listed = gallery_ids()
        self.assertIn(public.id, listed)
        self.assertNotIn(private.id, listed)

    def test_a_project_needs_a_name_and_a_visibility_and_a_valid_website(self):
        for fields in ({"name": ""}, {"visibility": None}, {"websiteUrl": "not a site"}):
            status, _ = self.call("post", "projects", {"project": {**PROJECT, **fields}})
            self.assertEqual(status, 400, fields)

    def test_making_a_public_project_private_withdraws_consent_and_unlists_it(self):
        project = self.create_project(visibility="public")

        status, state = self.call("post", "projects/" + project["id"], {"project": {**PROJECT, "visibility": "private"}})

        self.assertEqual(status, 200)
        row = Project.objects.get(id=int(project["id"]))
        self.assertFalse(row.consent_to_display)
        self.assertTrue(row.is_published, "the owner doesn't change the staff publish gate")
        self.assertNotIn(row.id, gallery_ids())
        self.assertIsNotNone(state["projects"][0]["consentWithdrawnAt"])

    def test_deleting_a_project_revokes_its_keys_and_keeps_the_rows(self):
        project = self.create_project()
        self.create_key(project["id"])

        status, state = self.call("delete", "projects/" + project["id"])

        self.assertEqual(status, 200)
        self.assertEqual(state["projects"], [])
        self.assertIsNotNone(Project.objects.get(id=int(project["id"])).deleted_at)
        self.assertTrue(all(k.revoked_at for k in ApiKey.objects.filter(project_id=int(project["id"]))))

    def test_another_account_cannot_see_or_change_the_project(self):
        project = self.create_project()
        other = create_test_user("devapiother")
        client = Client()
        client.force_login(other)
        try:
            self.assertEqual(self.call("get", "state", client=client)[1]["projects"], [])
            EmailAddress.objects.create(user=other, email=other.email, primary=True, verified=True)
            self.call("post", "enable", client=client)
            self.call("post", "profile", {"profile": PROFILE}, client=client)
            self.assertEqual(self.call("delete", "projects/" + project["id"], client=client)[0], 404)
        finally:
            purge_test_profiles(other)


class KeyTest(DeveloperApiTestCase):

    def setUp(self):
        super().setUp()
        self.set_up_developer()
        self.project = self.create_project()

    def test_a_new_key_is_a_random_unrestricted_registry_key(self):
        state = self.create_key(self.project["id"])

        api_key = ApiKey.objects.get(id=state["keyId"])
        self.assertRegex(api_key.key, r"^sfr_[A-Za-z0-9]{32}$")
        self.assertEqual(api_key.allowed_origins, [])
        self.assertEqual(state["projects"][0]["keys"][0]["value"], api_key.key)

    def test_a_project_has_at_most_five_active_keys(self):
        for i in range(5):
            self.create_key(self.project["id"], "Key {}".format(i))

        status, _ = self.call("post", "projects/{}/keys".format(self.project["id"]), {"label": "One more"})

        self.assertEqual(status, 400)

    def test_restricting_a_key_allows_only_the_project_website_origin(self):
        key_id = self.create_key(self.project["id"])["keyId"]

        status, state = self.call("post", "keys/" + key_id, {"restrictToWebsite": True})

        self.assertEqual(status, 200)
        self.assertEqual(ApiKey.objects.get(id=key_id).allowed_origins, ["https://dafportal.org"])
        self.assertTrue(state["projects"][0]["keys"][0]["restrictToWebsite"])

    def test_a_new_website_moves_restricted_keys_and_no_website_frees_them(self):
        restricted = self.create_key(self.project["id"], "Production")["keyId"]
        unrestricted = self.create_key(self.project["id"], "Local")["keyId"]
        self.call("post", "keys/" + restricted, {"restrictToWebsite": True})
        url = "projects/" + self.project["id"]

        self.call("post", url, {"project": {**PROJECT, "websiteUrl": "https://new.example.org"}})
        self.assertEqual(ApiKey.objects.get(id=restricted).allowed_origins, ["https://new.example.org"])
        self.assertEqual(ApiKey.objects.get(id=unrestricted).allowed_origins, [])

        self.call("post", url, {"project": {**PROJECT, "websiteUrl": ""}})
        self.assertEqual(ApiKey.objects.get(id=restricted).allowed_origins, [])

    def test_a_key_cannot_be_restricted_without_a_website(self):
        self.call("post", "projects/" + self.project["id"], {"project": {**PROJECT, "websiteUrl": ""}})
        key_id = self.create_key(self.project["id"])["keyId"]

        self.assertEqual(self.call("post", "keys/" + key_id, {"restrictToWebsite": True})[0], 400)

    def test_deleting_a_key_revokes_it_and_keeps_the_row(self):
        key_id = self.create_key(self.project["id"])["keyId"]

        status, state = self.call("delete", "keys/" + key_id)

        self.assertEqual(status, 200)
        self.assertEqual(state["projects"][0]["keys"], [])
        self.assertIsNotNone(ApiKey.objects.get(id=key_id).revoked_at)


class ListingTest(DeveloperApiTestCase):

    def setUp(self):
        super().setUp()
        self.set_up_developer()
        self.listing = Project.objects.create(
            submission_source=SubmissionSource.FORMSTACK, creator_email=self.user.email.upper(),
            project_name="Tehillim Circle", project_link="https://tehillimcircle.org", consent_to_display=True,
        )

    def test_an_unclaimed_listing_with_the_account_email_is_offered(self):
        state = self.call("get", "state")[1]

        self.assertEqual(state["yourListing"]["id"], str(self.listing.id))
        self.assertEqual(state["yourListing"]["name"], "Tehillim Circle")

    def test_claiming_makes_the_listing_a_project(self):
        status, state = self.call("post", "listings/{}/claim".format(self.listing.id))

        self.assertEqual(status, 200)
        self.assertEqual(Project.objects.get(id=self.listing.id).owner, self.user)
        self.assertIsNone(state["yourListing"])
        project = state["projects"][0]
        self.assertTrue(project["linkedListing"])
        self.assertEqual(project["visibility"], "public")

    def test_claiming_keeps_the_listing_consent_and_publish_flags(self):
        for consent, published in ((True, False), (False, True)):
            Project.objects.filter(id=self.listing.id).update(owner=None, consent_to_display=consent, is_published=published)

            self.assertEqual(self.call("post", "listings/{}/claim".format(self.listing.id))[0], 200)

            row = Project.objects.get(id=self.listing.id)
            self.assertEqual((row.consent_to_display, row.is_published), (consent, published))
            self.assertNotIn(row.id, gallery_ids())

    def test_deleting_the_account_revokes_keys_deletes_projects_and_releases_listings(self):
        self.call("post", "listings/{}/claim".format(self.listing.id))
        own = self.create_project()
        claimed_key = self.create_key(str(self.listing.id))["keyId"]
        own_key = self.create_key(own["id"])["keyId"]

        user_id = self.user.id
        self.user.delete()
        self.user.id = user_id

        self.assertTrue(all(k.revoked_at for k in ApiKey.objects.filter(id__in=[claimed_key, own_key])))
        self.assertIsNone(Project.objects.get(id=self.listing.id).owner)
        self.assertIsNone(Project.objects.get(id=self.listing.id).deleted_at)
        self.assertIsNotNone(Project.objects.get(id=int(own["id"])).deleted_at)

    def test_a_dismissed_listing_is_not_offered_again(self):
        state = self.call("post", "listings/{}/dismiss".format(self.listing.id))[1]

        self.assertIsNone(state["yourListing"])
        self.assertEqual(self.call("post", "listings/{}/claim".format(self.listing.id))[0], 404)

    def test_only_a_listing_submitted_with_the_account_email_can_be_dismissed(self):
        other = Project.objects.create(submission_source=SubmissionSource.FORMSTACK, creator_email="someone@example.org",
                                       project_name="Other", project_link="https://other.example.org")

        self.assertEqual(self.call("post", "listings/{}/dismiss".format(other.id))[0], 404)
        self.assertEqual(self.call("post", "listings/999999999/dismiss")[0], 404)

    def test_a_listing_owned_by_another_account_is_not_offered(self):
        other = create_test_user("devapiowner")
        Project.objects.filter(id=self.listing.id).update(owner=other)

        self.assertIsNone(self.call("get", "state")[1]["yourListing"])


class DeveloperSettingsOffTest(TestCase):
    """
    Without DEVELOPER_SETTINGS_ENABLED the developer routes don't exist.
    """
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("devoff")
        purge_test_profiles(self.user)
        self.client.force_login(self.user)

    def tearDown(self):
        purge_test_profiles(self.user)

    def test_the_developer_api_is_not_found(self):
        for method, url in (("get", "state"), ("post", "enable"), ("post", "confirmation"), ("post", "projects"),
                            ("post", "projects/1/keys"), ("delete", "keys/1"), ("post", "listings/1/claim"),
                            ("post", "mock")):
            response = self.client.generic(method.upper(), "/api/developer/" + url, "{}", content_type="application/json")
            self.assertEqual(response.status_code, 404, url)

    def test_the_confirmation_link_and_its_landing_page_are_not_found(self):
        EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True, verified=False)
        key = developer.confirmation_for(self.user).key

        self.assertEqual(Client().get("/settings/developer/confirm-email/" + key).status_code, 404)
        self.assertEqual(Client().get("/settings/developer/email-confirmed").status_code, 404)
        self.assertFalse(EmailAddress.objects.get(user=self.user).verified)

    def test_the_powered_by_form_is_not_found(self):
        self.assertEqual(Client().get("/powered-by/form").status_code, 404)
        self.assertEqual(Client().get("/api/developer-poc/powered-by-submissions").status_code, 404)


class MockTest(DeveloperApiTestCase):

    def test_the_test_controls_are_off_by_default(self):
        self.assertIsNone(self.call("get", "state")[1]["mock"])
        self.assertEqual(self.client.post("/api/developer/mock", "{}", content_type="application/json").status_code, 404)

    @override_settings(DEVELOPER_SETTINGS_MOCKS=True)
    def test_with_mocks_on_the_confirmation_is_not_emailed_and_its_key_is_in_the_state(self):
        state = self.call("post", "confirmation")[1]

        self.assertEqual(len(mail.outbox), 0)
        key = state["mock"]["confirmationKey"]
        self.assertEqual(Client().get("/settings/developer/confirm-email/" + key).status_code, 302)
        self.assertTrue(self.call("get", "state")[1]["emailVerified"])

    @override_settings(DEVELOPER_SETTINGS_MOCKS=True)
    def test_the_sso_override_verifies_the_account(self):
        state = self.call("post", "mock", {"action": "sso", "ssoOverride": True})[1]

        self.assertTrue(state["ssoConnected"])
        self.assertEqual(self.call("post", "enable")[0], 200)

    @override_settings(DEVELOPER_SETTINGS_MOCKS=True)
    def test_a_mock_listing_is_offered_and_starting_over_releases_it(self):
        self.set_up_developer()
        state = self.call("post", "mock", {"action": "create-listing"})[1]
        listing_id = state["yourListing"]["id"]
        self.call("post", "listings/{}/claim".format(listing_id))
        own = self.create_project()

        state = self.call("post", "mock", {"action": "start-over", "ssoOverride": False, "emailVerified": False})[1]

        self.assertEqual(state["projects"], [])
        self.assertIsNone(state["profile"])
        self.assertFalse(state["emailVerified"])
        self.assertIsNone(Project.objects.get(id=int(listing_id)).owner)
        self.assertIsNotNone(Project.objects.get(id=int(own["id"])).deleted_at)


def test_origin_of_is_the_browser_origin():
    from powered_by.developer import origin_of

    assert origin_of("https://Example.org/app?x=1") == "https://example.org"
    assert origin_of("https://example.org:443/") == "https://example.org"
    assert origin_of("http://localhost:3000/") == "http://localhost:3000"


class ProjectLockTest(DeveloperApiTestCase):

    def setUp(self):
        super().setUp()
        self.set_up_developer()
        self.project = self.create_project()

    def test_creating_a_key_locks_the_project_row(self):
        with CaptureQueriesContext(connection) as queries:
            self.create_key(self.project["id"])

        self.assertTrue(any("FOR UPDATE" in q["sql"] for q in queries))

    def test_deleting_a_project_locks_the_project_row(self):
        with CaptureQueriesContext(connection) as queries:
            self.call("delete", "projects/" + self.project["id"])

        self.assertTrue(any("FOR UPDATE" in q["sql"] for q in queries))


class ConfirmationLockTest(DeveloperApiTestCase):

    def test_reserving_a_confirmation_send_locks_the_account_row(self):
        with CaptureQueriesContext(connection) as queries:
            self.call("post", "confirmation")

        self.assertTrue(any("FOR UPDATE" in q["sql"] and "auth_user" in q["sql"] for q in queries))

    def test_cancelling_a_confirmation_locks_the_account_row(self):
        # A cancel rewrites the whole profile; unlocked, it could erase a concurrent send's timestamp.
        with CaptureQueriesContext(connection) as queries:
            self.call("delete", "confirmation")

        self.assertTrue(any("FOR UPDATE" in q["sql"] and "auth_user" in q["sql"] for q in queries))


@override_settings(DEVELOPER_SETTINGS_ENABLED=True)
class ConfirmationRaceTest(TransactionTestCase):
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("confrace")
        purge_test_profiles(self.user)

    def tearDown(self):
        purge_test_profiles(self.user)

    def test_concurrent_confirmation_requests_send_one_email(self):
        holding = threading.Event()
        release = threading.Event()
        first = []
        statuses = []

        class BlockingClock:
            """Stands in for developer.timezone: the first reservation stalls while holding the lock."""
            @staticmethod
            def now():
                if not first:
                    first.append(True)
                    holding.set()
                    assert release.wait(10)
                return timezone.now()

        def post():
            try:
                client = Client()
                client.force_login(self.user)
                response = client.post("/api/developer/confirmation", "", content_type="application/json")
                statuses.append(response.status_code)
            finally:
                connections.close_all()

        with patch.object(developer, "timezone", BlockingClock):
            one = threading.Thread(target=post)
            two = threading.Thread(target=post)
            one.start()
            self.assertTrue(holding.wait(10))
            two.start()
            two.join(0.5)
            self.assertTrue(two.is_alive(), "the second request must wait for the account lock")
            release.set()
            one.join(10)
            two.join(10)

        self.assertEqual(sorted(statuses), [200, 429])
        self.assertEqual(len(mail.outbox), 1)


@override_settings(DEVELOPER_SETTINGS_ENABLED=True)
class KeyCreationRaceTest(TransactionTestCase):
    databases = "__all__"

    def setUp(self):
        self.user = create_test_user("devrace")
        purge_test_profiles(self.user)
        self.project = Project.objects.create(
            submission_source=SubmissionSource.DEVELOPER_SETTINGS, project_name="Race",
            owner=self.user, is_published=False)

    def tearDown(self):
        ApiKey.objects.filter(project=self.project).delete()
        self.project.delete()
        purge_test_profiles(self.user)

    def test_create_key_waits_for_a_delete_in_progress_and_then_finds_no_project(self):
        deleting = threading.Event()
        release = threading.Event()
        outcome = {}

        class BlockingClock:
            """Stands in for developer.timezone: delete_project reads the clock after taking the lock."""
            @staticmethod
            def now():
                deleting.set()
                assert release.wait(10)
                return timezone.now()

        def delete():
            try:
                with patch.object(developer, "timezone", BlockingClock):
                    developer.delete_project(self.user, self.project.id)
            except BaseException as e:
                outcome["delete"] = e
            finally:
                connections.close_all()

        def create():
            try:
                developer.create_key(self.user, self.project.id, "Late")
            except BaseException as e:
                outcome["create"] = e
            finally:
                connections.close_all()

        deleter = threading.Thread(target=delete)
        creator = threading.Thread(target=create)
        deleter.start()
        self.assertTrue(deleting.wait(10))
        creator.start()
        creator.join(0.5)
        self.assertTrue(creator.is_alive(), "create_key must wait for the project row lock")

        release.set()
        deleter.join(10)
        creator.join(10)

        self.assertNotIn("delete", outcome)
        self.assertIsInstance(outcome.get("create"), LookupError)
        self.assertFalse(ApiKey.objects.filter(project=self.project, revoked_at__isnull=True).exists())
        self.assertFalse(ApiKey.objects.filter(project=self.project).exists())
