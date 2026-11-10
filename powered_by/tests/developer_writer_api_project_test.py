"""
The developer settings writer on API projects: the state shape, the website restriction on update,
a linked legacy listing deleted with its account, the unpublishing of a deleted settings-made
project, and ids that are API project ids rather than profile ids.
"""

from powered_by import developer
from powered_by.models import ApiKey, ApiProject, Project, SubmissionSource
from powered_by.tests.developer_api_test import PROJECT, DeveloperApiTestCase

STATE_KEYS = {
    "developerEnabled",
    "ssoConnected",
    "emailVerified",
    "confirmationSentAt",
    "profile",
    "projects",
    "maxKeysPerProject",
}
PROJECT_KEYS = {
    "id",
    "name",
    "description",
    "organization",
    "websiteUrl",
    "visibility",
    "aiAssisted",
    "linkedListing",
    "consentWithdrawnAt",
    "keys",
    "contactEmail",
}
KEY_KEYS = {"id", "label", "prefix", "created", "restrictToWebsite"}


class StateShapeTest(DeveloperApiTestCase):
    def setUp(self):
        super().setUp()
        self.set_up_developer()

    def test_state_json_shape_unchanged(self):
        project = self.create_project()
        key_id = self.create_key(project["id"])["keyId"]

        state = self.call("get", "state")[1]

        self.assertEqual(set(state), STATE_KEYS)
        self.assertEqual(set(state["projects"][0]), PROJECT_KEYS)
        self.assertEqual(state["projects"][0]["contactEmail"], "")
        self.assertEqual(set(state["projects"][0]["keys"][0]), KEY_KEYS)
        self.assertEqual(state["projects"][0]["keys"][0]["id"], key_id)
        created = self.call("post", "projects", {"project": {**PROJECT, "name": "Second"}})[1]
        self.assertEqual(set(created), STATE_KEYS | {"projectId"})


class WebsiteRestrictionTest(DeveloperApiTestCase):
    def setUp(self):
        super().setUp()
        self.set_up_developer()
        self.project = self.create_project()
        self.url = "projects/" + self.project["id"]

    def test_clear_website_refused_when_restricted(self):
        restricted = self.create_key(self.project["id"], "Production")["keyId"]
        self.call("post", "keys/" + restricted, {"restrictToWebsite": True})

        status, state = self.call("post", self.url, {"project": {**PROJECT, "websiteUrl": ""}})

        self.assertEqual(status, 400)
        self.assertEqual(state["error"], developer.WEBSITE_IN_USE_ERROR)
        self.assertEqual(
            Project.objects.get(api_projects__id=int(self.project["id"])).project_link, PROJECT["websiteUrl"]
        )
        self.assertEqual(ApiKey.objects.get(id=restricted).allowed_origins, ["https://dafportal.org"])

    def test_clear_website_allowed_when_no_key_is_restricted(self):
        self.create_key(self.project["id"], "Local")

        status, state = self.call("post", self.url, {"project": {**PROJECT, "websiteUrl": ""}})

        self.assertEqual(status, 200, state)
        self.assertEqual(state["projects"][0]["websiteUrl"], "")

    def test_website_change_rewrites_only_restricted_keys(self):
        restricted = self.create_key(self.project["id"], "Production")["keyId"]
        unrestricted = self.create_key(self.project["id"], "Local")["keyId"]
        self.call("post", "keys/" + restricted, {"restrictToWebsite": True})

        status, _ = self.call("post", self.url, {"project": {**PROJECT, "websiteUrl": "https://new.example.org"}})

        self.assertEqual(status, 200)
        self.assertEqual(ApiKey.objects.get(id=restricted).allowed_origins, ["https://new.example.org"])
        self.assertEqual(ApiKey.objects.get(id=unrestricted).allowed_origins, [])


class LinkedListingAccountDeletionTest(DeveloperApiTestCase):
    def test_linked_legacy_listing_is_unpublished_with_the_account(self):
        self.set_up_developer()
        listing = Project.objects.create(
            submission_source=SubmissionSource.FORMSTACK,
            creator_email=self.user.email,
            project_name="Tehillim Circle",
            project_link="https://tehillimcircle.org",
            request_not_to_publish=False,
            is_published=True,
        )
        api_id = str(ApiProject.objects.create(profile=listing, owner=self.user).id)
        status, state = self.call(
            "post",
            "projects/" + api_id,
            {
                "project": {
                    **PROJECT,
                    "name": "Tehillim Circle Renamed",
                    "websiteUrl": "https://tehillimcircle.org",
                    "visibility": "public",
                }
            },
        )
        self.assertEqual(status, 200, state)
        key_id = self.create_key(api_id)["keyId"]
        profile_before = Project.objects.filter(id=listing.id).values().get()

        user_id = self.user.id
        self.user.delete()
        self.user.id = user_id

        unpublished = {**profile_before, "request_not_to_publish": True, "is_published": False}
        profile_after = Project.objects.filter(id=listing.id).values().get()
        self.assertEqual({**profile_after, "updated_at": None}, {**unpublished, "updated_at": None})
        api_project = ApiProject.objects.get(id=int(api_id))
        self.assertIsNone(api_project.owner_id)
        self.assertIsNotNone(api_project.deleted_at)
        self.assertIsNotNone(ApiKey.objects.get(id=key_id).revoked_at)


class DeletedSettingsProjectTest(DeveloperApiTestCase):
    def setUp(self):
        super().setUp()
        self.set_up_developer()

    def test_settings_created_project_is_unpublished_on_delete(self):
        project = self.create_project(visibility="public")
        profile = ApiProject.objects.get(id=int(project["id"])).profile
        self.assertFalse(profile.request_not_to_publish)

        status, state = self.call("delete", "projects/" + project["id"])

        self.assertEqual(status, 200)
        self.assertEqual(state["projects"], [])
        profile.refresh_from_db()
        self.assertTrue(profile.request_not_to_publish)
        self.assertFalse(profile.is_published)
        self.assertIsNotNone(ApiProject.objects.get(id=int(project["id"])).deleted_at)


class ApiProjectIdTest(DeveloperApiTestCase):
    def setUp(self):
        super().setUp()
        self.set_up_developer()
        # A profile made first, so the profile ids and the API project ids differ.
        Project.objects.create(submission_source=SubmissionSource.MANUAL, project_name="Filler", is_published=False)

    def test_ids_are_api_project_ids_not_profile_ids(self):
        project = self.create_project()
        api_project = ApiProject.objects.get(id=int(project["id"]))
        if api_project.id == api_project.profile_id:
            # Sequences are not reset between tests, so the two ids can line up by chance. One more filler profile
            # shifts the profile sequence, and the next project is then guaranteed to differ.
            Project.objects.create(
                submission_source=SubmissionSource.MANUAL, project_name="Filler 2", is_published=False
            )
            project = self.create_project()
            api_project = ApiProject.objects.get(id=int(project["id"]))

        self.assertNotEqual(api_project.id, api_project.profile_id)
        self.assertEqual(project["id"], str(api_project.id))
        self.assertEqual(project["name"], PROJECT["name"])

        state = self.create_key(project["id"])
        self.assertEqual(len(next(p for p in state["projects"] if p["id"] == project["id"])["keys"]), 1)
        self.assertEqual(
            self.call("post", "projects/" + project["id"], {"project": {**PROJECT, "name": "Renamed"}})[0], 200
        )
        self.assertEqual(Project.objects.get(id=api_project.profile_id).project_name, "Renamed")
        self.assertEqual(self.call("delete", "projects/" + project["id"])[0], 200)
        self.assertIsNotNone(ApiProject.objects.get(id=api_project.id).deleted_at)


class ContactEmailEditTest(DeveloperApiTestCase):
    def setUp(self):
        super().setUp()
        self.set_up_developer()

    def test_an_edit_without_contact_email_keeps_the_stored_one(self):
        project = self.call("post", "projects", {"project": {**PROJECT, "contactEmail": "dev@example.org"}})[1]
        project_id = project["projectId"]
        self.assertEqual(ApiProject.objects.get(id=int(project_id)).contact_email, "dev@example.org")

        status, state = self.call("post", "projects/" + project_id, {"project": {**PROJECT, "name": "Renamed"}})

        self.assertEqual(status, 200, state)
        self.assertEqual(ApiProject.objects.get(id=int(project_id)).contact_email, "dev@example.org")
        self.assertEqual(state["projects"][0]["contactEmail"], "dev@example.org")

    def test_an_edit_with_an_empty_contact_email_clears_it(self):
        project_id = self.call("post", "projects", {"project": {**PROJECT, "contactEmail": "dev@example.org"}})[1][
            "projectId"
        ]

        self.call("post", "projects/" + project_id, {"project": {**PROJECT, "contactEmail": ""}})

        self.assertEqual(ApiProject.objects.get(id=int(project_id)).contact_email, "")


def email_of_length(length):
    """A valid address of exactly `length` characters (local part 64, domain labels of at most 63)."""
    local = "a" * 64
    domain_length = length - len(local) - 1
    labels, remaining = [], domain_length
    while remaining > 0:
        take = min(63, remaining - (0 if remaining <= 63 else 2))
        labels.append("b" * take)
        remaining -= take + 1
    address = local + "@" + ".".join(labels)
    assert len(address) == length and all(0 < len(l) <= 63 for l in labels), (length, [len(l) for l in labels])
    return address


class ContactEmailLengthTest(DeveloperApiTestCase):
    def setUp(self):
        super().setUp()
        self.set_up_developer()

    def test_contact_email_of_254_characters_is_stored_and_255_is_refused(self):
        longest = email_of_length(254)
        status, state = self.call("post", "projects", {"project": {**PROJECT, "contactEmail": longest}})
        self.assertEqual(status, 200, state)
        self.assertEqual(ApiProject.objects.get(id=int(state["projectId"])).contact_email, longest)

        before = ApiProject.objects.count()
        status, state = self.call(
            "post", "projects", {"project": {**PROJECT, "name": "Too long", "contactEmail": email_of_length(255)}}
        )

        self.assertEqual(status, 400, state)
        self.assertIn("254", state["error"])
        self.assertEqual(ApiProject.objects.count(), before)

    def test_an_edit_with_a_255_character_contact_email_is_refused_and_keeps_the_stored_one(self):
        project_id = self.call("post", "projects", {"project": {**PROJECT, "contactEmail": "dev@example.org"}})[1][
            "projectId"
        ]

        status, state = self.call(
            "post", "projects/" + project_id, {"project": {**PROJECT, "contactEmail": email_of_length(255)}}
        )

        self.assertEqual(status, 400, state)
        self.assertEqual(ApiProject.objects.get(id=int(project_id)).contact_email, "dev@example.org")
