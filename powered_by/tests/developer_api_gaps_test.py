"""
Developer settings API edges: other accounts' objects, malformed requests, website origins,
key slots, claiming and consent, and confirmation links for an address another account holds.
"""
import json

from allauth.account.models import EmailAddress
from django.test import Client, override_settings

from powered_by import developer
from powered_by.models import ApiKey, Project, SubmissionSource
from powered_by.tests.developer_api_test import PROFILE, PROJECT, DeveloperApiTestCase, gallery_ids
from reader.conftest import create_test_user, page_props, purge_test_profiles
from sefaria.model.user_profile import UserProfile


def snapshot(*querysets):
    return [list(qs.order_by("pk").values()) for qs in querysets]


class OtherAccountTest(DeveloperApiTestCase):
    """C5: account B gets a 404 for every action on account A's objects, and nothing changes."""

    def setUp(self):
        super().setUp()
        self.set_up_developer()
        self.project = self.create_project()
        self.key_id = self.create_key(self.project["id"])["keyId"]
        self.other = create_test_user("devgapsother")
        purge_test_profiles(self.other)
        EmailAddress.objects.create(user=self.other, email=self.other.email, primary=True, verified=True)
        self.other_client = Client()
        self.other_client.force_login(self.other)
        self.call("post", "enable", client=self.other_client)
        assert self.call("post", "profile", {"profile": PROFILE}, client=self.other_client)[0] == 200
        self.listing = Project.objects.create(
            submission_source=SubmissionSource.FORMSTACK, creator_email=self.other.email, owner=self.user,
            project_name="Owned by A, submitted with B's email", project_link="https://listing.example.org",
            consent_to_display=True,
        )

    def tearDown(self):
        purge_test_profiles(self.other)
        super().tearDown()

    def test_C5_every_action_on_another_accounts_objects_is_not_found_and_changes_nothing(self):
        before = snapshot(Project.objects.filter(id__in=[int(self.project["id"]), self.listing.id]),
                          ApiKey.objects.filter(project_id=int(self.project["id"])))
        actions = (
            ("post", "projects/" + self.project["id"], {"project": {**PROJECT, "name": "Hijacked", "visibility": "public"}}),
            ("post", "projects/{}/keys".format(self.project["id"]), {"label": "Stolen"}),
            ("post", "keys/" + self.key_id, {"restrictToWebsite": True}),
            ("delete", "keys/" + self.key_id, None),
            ("delete", "projects/" + self.project["id"], None),
            ("post", "listings/{}/claim".format(self.listing.id), None),
            ("post", "listings/{}/dismiss".format(self.listing.id), None),
        )
        for method, url, body in actions:
            status, _ = self.call(method, url, body, client=self.other_client)
            self.assertEqual(status, 404, url)

        after = snapshot(Project.objects.filter(id__in=[int(self.project["id"]), self.listing.id]),
                         ApiKey.objects.filter(project_id=int(self.project["id"])))
        self.assertEqual(after, before)
        self.assertEqual(self.call("get", "state", client=self.other_client)[1]["projects"], [])


class MalformedRequestTest(DeveloperApiTestCase):
    """C6: oversized, non-JSON and non-object bodies are 400; a POST without a CSRF token is 403."""

    def setUp(self):
        super().setUp()
        self.set_up_developer()
        self.project = self.create_project()

    def post_raw(self, url, body, client=None):
        return (client or self.client).post("/api/developer/" + url, body, content_type="application/json")

    def test_C6_a_body_over_16_kb_is_refused(self):
        body = json.dumps({"project": {**PROJECT, "description": "x" * (16 * 1024)}})

        response = self.post_raw("projects", body)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(json.loads(response.content)["error"], "Request is too large.")
        self.assertEqual(Project.objects.filter(owner=self.user).count(), 1)

    def test_C6_a_body_that_is_not_json_is_refused(self):
        for url in ("projects", "projects/{}/keys".format(self.project["id"]), "profile"):
            response = self.post_raw(url, "{not json")
            self.assertEqual(response.status_code, 400, url)
            self.assertEqual(json.loads(response.content)["error"], "Could not parse JSON.", url)

    def test_C6_a_json_array_is_refused(self):
        for url in ("projects", "projects/{}/keys".format(self.project["id"]), "profile"):
            response = self.post_raw(url, json.dumps([{"label": "x"}]))
            self.assertEqual(response.status_code, 400, url)
            self.assertEqual(json.loads(response.content)["error"], "Request must be a JSON object.", url)

    def test_C6_a_logged_in_post_without_a_csrf_token_is_forbidden(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        keys_before = ApiKey.objects.filter(project_id=int(self.project["id"])).count()

        for url, body in (("projects", {"project": PROJECT}),
                          ("projects/{}/keys".format(self.project["id"]), {"label": "No token"}),
                          ("enable", {})):
            response = self.post_raw(url, json.dumps(body), client=client)
            self.assertEqual(response.status_code, 403, url)

        self.assertEqual(Project.objects.filter(owner=self.user).count(), 1)
        self.assertEqual(ApiKey.objects.filter(project_id=int(self.project["id"])).count(), keys_before)

    def test_C6_a_logged_out_new_link_request_without_a_csrf_token_is_forbidden(self):
        response = self.post_raw("confirmation/new-link", json.dumps({"key": "anything"}),
                                 client=Client(enforce_csrf_checks=True))

        self.assertEqual(response.status_code, 403)


class WebsiteOriginTest(DeveloperApiTestCase):
    """
    C7: a website whose host a browser writes differently in its Origin header is either refused
    when saved, or stored the way the browser sends it, so a restricted key matches.
    """

    def setUp(self):
        super().setUp()
        self.set_up_developer()

    def assert_refused_or_stored_as_browsers_send_it(self, website, browser_origin):
        status, state = self.call("post", "projects", {"project": {**PROJECT, "websiteUrl": website}})
        if status == 400:
            self.assertTrue(state["error"])
            return
        self.assertEqual(status, 200, state)
        key_id = self.create_key(state["projectId"])["keyId"]

        status, _ = self.call("post", "keys/" + key_id, {"restrictToWebsite": True})

        if status == 400:
            return
        self.assertEqual(status, 200)
        self.assertEqual(ApiKey.objects.get(id=key_id).allowed_origins, [browser_origin])

    def test_C7_an_internationalised_host_is_refused_or_stored_as_punycode(self):
        self.assert_refused_or_stored_as_browsers_send_it("https://bücher.example/app", "https://xn--bcher-kva.example")

    def test_C7_an_ipv6_host_is_refused_or_stored_with_brackets(self):
        self.assert_refused_or_stored_as_browsers_send_it("http://[::1]:8080/", "http://[::1]:8080")

    def test_C7_a_trailing_dot_host_is_refused_or_stored_with_the_dot(self):
        self.assert_refused_or_stored_as_browsers_send_it("https://example.org./", "https://example.org.")


class KeySlotTest(DeveloperApiTestCase):
    """N-C4: the key limit counts active keys only."""

    def setUp(self):
        super().setUp()
        self.set_up_developer()
        self.project = self.create_project()

    def test_N_C4_revoking_a_key_frees_a_slot(self):
        key_ids = [self.create_key(self.project["id"], "Key {}".format(n))["keyId"]
                   for n in range(developer.MAX_KEYS_PER_PROJECT)]
        url = "projects/{}/keys".format(self.project["id"])
        self.assertEqual(self.call("post", url, {"label": "One too many"})[0], 400)

        self.assertEqual(self.call("delete", "keys/" + key_ids[0])[0], 200)
        status, state = self.call("post", url, {"label": "In the freed slot"})

        self.assertEqual(status, 200, state)
        active = ApiKey.objects.filter(project_id=int(self.project["id"]), revoked_at__isnull=True)
        self.assertEqual(active.count(), developer.MAX_KEYS_PER_PROJECT)


class ClaimConsentTest(DeveloperApiTestCase):
    """
    N-C15: claiming keeps the listing's consent (N-D8): a listing whose submitter said "No"
    stays unpublished until the owner picks Public, and a staff unpublish holds.
    """

    def setUp(self):
        super().setUp()
        self.set_up_developer()
        self.listing = Project.objects.create(
            submission_source=SubmissionSource.FORMSTACK, creator_email=self.user.email,
            project_name="Said no", project_link="https://saidno.example.org",
            consent_to_display=False, is_published=False,
        )

    def edit(self, visibility):
        fields = {**PROJECT, "name": "Said no", "websiteUrl": "https://saidno.example.org", "visibility": visibility}
        status, state = self.call("post", "projects/{}".format(self.listing.id), {"project": fields})
        self.assertEqual(status, 200, state)
        return Project.objects.get(id=self.listing.id)

    def test_N_C15_claiming_a_listing_whose_submitter_said_no_keeps_it_unpublished(self):
        status, state = self.call("post", "listings/{}/claim".format(self.listing.id))

        self.assertEqual(status, 200, state)
        row = Project.objects.get(id=self.listing.id)
        self.assertEqual(row.owner, self.user)
        self.assertFalse(row.consent_to_display)
        self.assertFalse(row.is_published)
        self.assertEqual(state["projects"][0]["visibility"], "private")

    def test_N_C15_the_owner_picking_public_lists_a_claimed_listing_staff_left_published(self):
        Project.objects.filter(id=self.listing.id).update(is_published=True)
        self.call("post", "listings/{}/claim".format(self.listing.id))
        self.assertNotIn(self.listing.id, gallery_ids())

        row = self.edit("public")

        self.assertTrue(row.consent_to_display)
        self.assertIn(self.listing.id, gallery_ids())

    def test_N_C15_the_owner_picking_public_does_not_publish_an_unpublished_listing(self):
        self.call("post", "listings/{}/claim".format(self.listing.id))

        row = self.edit("public")

        self.assertTrue(row.consent_to_display)
        self.assertFalse(row.is_published)
        self.assertNotIn(self.listing.id, gallery_ids())

    def test_N_C15_a_staff_unpublish_holds_when_the_owner_toggles_private_and_public(self):
        self.call("post", "listings/{}/claim".format(self.listing.id))
        self.edit("public")
        Project.objects.filter(id=self.listing.id).update(is_published=False)

        self.edit("private")
        row = self.edit("public")

        self.assertTrue(row.consent_to_display)
        self.assertFalse(row.is_published)


class AddressTakenTest(DeveloperApiTestCase):
    """N-C16: a link for an address another account has already verified explains itself."""

    def setUp(self):
        super().setUp()
        self.holder = create_test_user("devgapsholder")
        purge_test_profiles(self.holder)
        EmailAddress.objects.create(user=self.holder, email=self.user.email, primary=True, verified=True)

    def tearDown(self):
        purge_test_profiles(self.holder)
        super().tearDown()

    def test_N_C16_a_link_for_an_address_verified_by_another_account_shows_a_page(self):
        key = developer.confirmation_for(self.user).key

        response = Client().get("/settings/developer/confirm-email/" + key)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(page_props(response.content.decode("utf-8"))["initialDeveloperEmailLink"],
                         {"status": "address-in-use", "key": key})
        self.assertFalse(EmailAddress.objects.get(user=self.user).verified)
        self.assertFalse(UserProfile(id=self.user.id).settings.get(developer.ENABLED_SETTING))
