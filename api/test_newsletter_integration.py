"""
Newsletter Service Integration Tests

These tests run the **real** newsletter service code end-to-end and only mock
at the system boundaries: the ActiveCampaign API (`_client.make_request`) and
MongoDB (`UserProfile`, `_update_wants_marketing_emails`).

Why this layer matters:
    Pure unit tests in test_newsletter.py mock individual collaborators, which
    means they can pass even when the *interaction* between service functions
    is broken. These integration tests catch that class of bug — for example,
    a mistake in the diff/scoping logic between `update_user_preferences_impl`,
    `get_contact_list_memberships`, and `update_list_memberships`.

Two flavors live here:
    1. Pure service flow: call `update_user_preferences_impl` (or another
       *_impl function) directly and assert what got passed to the AC layer.
       Used for opt-out / re-opt-in tests where the HTTP layer is irrelevant.
    2. View-through-service: post to a Django URL with the test Client, then
       assert what got passed to the AC layer. Used when the HTTP layer is
       part of the scenario (e.g. verifying that the `marketingOptOut` flag
       in the JSON body actually drives the unsubscribe-all branch).
"""

import json
import pytest
from unittest import mock
from api import newsletter_service


# Shared fixtures (`client`, `test_user`, `logged_in_client`, etc.) live in
# api/conftest.py so they're available to every test file in this package.


# Two-newsletter list used by the view-through-service tests below.
# Kept intentionally small — these tests are checking diff/scoping logic, not
# data-shape resilience, so a minimal managed-list set keeps the assertions
# easy to follow.
_MANAGED_NEWSLETTERS = [
    {
        "stringid": "sefaria_news",
        "id": "1",
        "displayName": "Sefaria News",
        "icon": "news.svg",
        "language": "english",
    },
    {
        "stringid": "text_updates",
        "id": "3",
        "displayName": "Text Updates",
        "icon": "text.svg",
        "language": "english",
    },
]


# ============================================================================
# AC mock helpers (used by view-through-service tests)
# ============================================================================


def _ac_side_effect(contact_memberships, all_lists=None):
    """
    Build a side_effect for `_client.make_request` that returns realistic
    AC responses based on the endpoint being requested.

    Args:
        contact_memberships: list of {'list': id, 'status': '1'|'2'} dicts
            describing the lists the contact is on (status 1 = active,
            status 2 = unsubscribed).
        all_lists: list of {'id': ..., 'stringid': ..., 'name': ...} dicts.
            Only needed by the opt-out path, which calls
            `get_all_ac_list_ids` to find unmanaged lists too.

    Returns:
        A function that the test passes to `mock.patch.side_effect`. Inspect
        the endpoint, return the right canned payload.
    """

    def side_effect(endpoint, method="GET", data=None):
        if "contacts?filters" in endpoint:
            return {"contacts": [{"id": "100", "email": "testuser@sefaria.org"}]}
        elif "contactLists" in endpoint:
            return {"contactLists": contact_memberships}
        elif endpoint.startswith("lists"):
            return {"lists": all_lists or []}
        return {}

    return side_effect


def _extract_list_mutations(mock_ac_request):
    """
    Replay every recorded call to `_client.make_request` and figure out which
    AC list IDs were added (status=1) or removed (status=2).

    Returns:
        (added, removed): two sets of list ID strings. Useful for asserting
        "list X was added" / "list Y was removed" without depending on call
        ordering or argument layout.
    """
    added = set()
    removed = set()
    for call in mock_ac_request.call_args_list:
        # Calls look like: _client.make_request(endpoint, method='GET', data=None)
        # `data` may be either keyword (call[1]) or positional at index 2 (call[0][2]).
        data = call[1].get("data")
        if data is None and len(call[0]) > 2:
            data = call[0][2]

        if not data:
            continue

        cl = data.get("contactList", {})
        list_id = str(cl.get("list"))
        if not list_id or list_id == "None":
            continue
        if cl.get("status") == 2:
            removed.add(list_id)
        else:
            added.add(list_id)
    return added, removed


# ============================================================================
# Pure service-flow integration tests
#
# These call *_impl functions directly. No Django Client, no HTTP. The point
# is to verify that one service function correctly orchestrates the others.
# ============================================================================


class TestOptOutFlowIntegration:
    """Integration tests for update_user_preferences_impl opt-out and re-opt-in flows"""

    @mock.patch("api.newsletter_service._load_user_profile", return_value=None)
    @mock.patch("api.newsletter_service._update_wants_marketing_emails")
    @mock.patch("api.newsletter_service.update_list_memberships")
    @mock.patch("api.newsletter_service.get_contact_list_memberships")
    @mock.patch("api.newsletter_service.get_all_ac_list_ids")
    @mock.patch("api.newsletter_service.find_or_create_contact")
    def test_opt_out_end_to_end(
        self,
        mock_find,
        mock_get_all_ids,
        mock_get_memberships,
        mock_update,
        mock_update_flag,
        mock_load_profile,
    ):
        """
        Integration: Opt-out flow unsubscribes from all lists (managed + unmanaged)
        and sets wants_marketing_emails=False
        """
        mock_find.return_value = {"id": "100", "email": "user@example.com"}
        mock_get_all_ids.return_value = ["1", "2", "3", "99"]
        mock_get_memberships.return_value = ["1", "3", "99"]
        mock_update.return_value = None

        newsletter_list = [
            {"stringid": "sefaria_news", "id": "1"},
            {"stringid": "text_updates", "id": "3"},
        ]

        result = newsletter_service.update_user_preferences_impl(
            "user@example.com",
            "John",
            "Doe",
            ["sefaria_news"],
            newsletter_list,
            marketing_opt_out=True,
        )

        # All active lists removed
        call_args = mock_update.call_args
        removed = set(call_args[0][2])
        assert removed == {"1", "3", "99"}

        # Result is empty subscriptions
        assert result["subscribed_newsletters"] == []

        # wants_marketing_emails set to False
        mock_update_flag.assert_called_once_with(None, False)

    @mock.patch("api.newsletter_service._load_user_profile", return_value=None)
    @mock.patch("api.newsletter_service._update_wants_marketing_emails")
    @mock.patch("api.newsletter_service.update_list_memberships")
    @mock.patch("api.newsletter_service.get_contact_list_memberships")
    @mock.patch("api.newsletter_service.find_or_create_contact")
    def test_re_opt_in_after_opt_out(
        self,
        mock_find,
        mock_get_memberships,
        mock_update,
        mock_update_flag,
        mock_load_profile,
    ):
        """
        Integration: Re-opting in after opt-out subscribes to selected managed lists
        and sets wants_marketing_emails=True
        """
        mock_find.return_value = {"id": "100", "email": "user@example.com"}
        # User has no active subscriptions (opted out previously)
        mock_get_memberships.return_value = []
        mock_update.return_value = None

        newsletter_list = [
            {"stringid": "sefaria_news", "id": "1"},
            {"stringid": "text_updates", "id": "3"},
        ]

        result = newsletter_service.update_user_preferences_impl(
            "user@example.com",
            "John",
            "Doe",
            ["sefaria_news", "text_updates"],
            newsletter_list,
            marketing_opt_out=False,
        )

        # Both lists added
        call_args = mock_update.call_args
        added = set(call_args[0][1])
        assert added == {"1", "3"}

        assert sorted(result["subscribed_newsletters"]) == [
            "sefaria_news",
            "text_updates",
        ]

        # wants_marketing_emails set to True
        mock_update_flag.assert_called_once_with(None, True)


class TestFetchUserSubscriptionsIntegration:
    """Integration tests for fetch_user_subscriptions_impl with wants_marketing_emails"""

    @mock.patch("api.newsletter_service.UserProfile")
    @mock.patch("api.newsletter_service.get_contact_list_memberships")
    @mock.patch("api.newsletter_service._client.make_request")
    def test_stale_opt_out_scenario(
        self, mock_request, mock_get_memberships, mock_profile_class
    ):
        """
        Integration: Stale opt-out scenario - user has wants_marketing_emails=False in MongoDB
        but has active managed subscriptions in AC (re-subscribed via another channel).
        The backend corrects and persists the stale MongoDB flag.
        """
        mock_request.return_value = {
            "contacts": [{"id": "100", "email": "user@example.com"}]
        }
        # User has active managed subscriptions in AC
        mock_get_memberships.return_value = ["1", "3"]

        # MongoDB says user opted out
        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.wants_marketing_emails = False
        mock_profile.learning_level = None
        mock_profile_class.return_value = mock_profile

        mock_user = mock.MagicMock()
        mock_user.is_authenticated = True

        newsletter_list = [
            {"stringid": "sefaria_news", "id": "1"},
            {"stringid": "text_updates", "id": "3"},
        ]

        result = newsletter_service.fetch_user_subscriptions_impl(
            "user@example.com", newsletter_list, user=mock_user
        )

        assert result["wants_marketing_emails"] is True
        assert len(result["subscribed_newsletters"]) == 2
        assert mock_profile.wants_marketing_emails is True
        mock_profile.save.assert_called_once()


# ============================================================================
# View-through-service integration tests
#
# Use the real Django Client to POST/GET, real service code, with AC and
# MongoDB mocked at the boundary. This catches bugs that can't surface when
# *_impl is mocked at the view layer (e.g. bugs in managed-list scoping or
# the diff calculation between current and selected lists).
# ============================================================================


@pytest.mark.django_db
class TestViewThroughServiceNormalUpdate:
    """
    POST /api/newsletter/preferences (normal update, marketing_opt_out=False).
    Full service logic runs end-to-end — verifies managed-list scoping.
    """

    @mock.patch("api.newsletter_service._load_user_profile", return_value=None)
    @mock.patch("api.newsletter_service._update_wants_marketing_emails")
    @mock.patch("api.newsletter_service._client.make_request")
    @mock.patch("api.newsletter_service.get_cached_newsletter_list")
    def test_diff_scoped_to_managed_lists(
        self,
        mock_get_list,
        mock_ac_request,
        mock_update_flag,
        mock_load_profile,
        logged_in_client,
    ):
        """
        User has managed lists 1, 3 and unmanaged list 99 (all active).
        Selecting only list 1 should remove list 3, leave list 99 untouched.
        """
        mock_get_list.return_value = _MANAGED_NEWSLETTERS
        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {"list": "1", "status": "1"},
                {"list": "3", "status": "1"},
                {"list": "99", "status": "1"},
            ]
        )

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps({"newsletters": {"sefaria_news": True, "text_updates": False}}),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data["success"] is True
        assert data["subscribedNewsletters"] == ["sefaria_news"]

        added, removed = _extract_list_mutations(mock_ac_request)
        assert "3" in removed, "Managed list 3 should be unsubscribed"
        assert "99" not in removed, "Unmanaged list 99 must NOT be touched"
        assert "1" not in added, "List 1 already active — no re-subscribe needed"

        mock_update_flag.assert_called_once_with(None, True)

    @mock.patch("api.newsletter_service._load_user_profile", return_value=None)
    @mock.patch("api.newsletter_service._update_wants_marketing_emails")
    @mock.patch("api.newsletter_service._client.make_request")
    @mock.patch("api.newsletter_service.get_cached_newsletter_list")
    def test_adding_new_managed_list(
        self,
        mock_get_list,
        mock_ac_request,
        mock_update_flag,
        mock_load_profile,
        logged_in_client,
    ):
        """
        User has only list 1. Selecting both list 1 and 3 should add list 3.
        """
        mock_get_list.return_value = _MANAGED_NEWSLETTERS
        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {"list": "1", "status": "1"},
            ]
        )

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps({"newsletters": {"sefaria_news": True, "text_updates": True}}),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert sorted(data["subscribedNewsletters"]) == ["sefaria_news", "text_updates"]

        added, removed = _extract_list_mutations(mock_ac_request)
        assert "3" in added, "List 3 should be newly subscribed"
        assert len(removed) == 0, "No lists should be removed"


@pytest.mark.django_db
class TestViewThroughServiceOptOut:
    """
    POST /api/newsletter/preferences (marketing_opt_out=True).
    Full service logic runs — verifies ALL lists (managed + unmanaged) are removed.
    """

    @mock.patch("api.newsletter_service._load_user_profile", return_value=None)
    @mock.patch("api.newsletter_service._update_wants_marketing_emails")
    @mock.patch("api.newsletter_service._client.make_request")
    @mock.patch("api.newsletter_service.get_cached_newsletter_list")
    def test_opt_out_removes_all_active_lists(
        self,
        mock_get_list,
        mock_ac_request,
        mock_update_flag,
        mock_load_profile,
        logged_in_client,
    ):
        """
        Opt-out: user has managed lists 1, 3 and unmanaged list 99.
        ALL active lists should be unsubscribed, wants_marketing_emails set to False.
        """
        mock_get_list.return_value = _MANAGED_NEWSLETTERS
        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {"list": "1", "status": "1"},
                {"list": "3", "status": "1"},
                {"list": "99", "status": "1"},
            ],
            all_lists=[
                {"id": "1", "stringid": "sefaria_news", "name": "Sefaria News"},
                {"id": "3", "stringid": "text_updates", "name": "Text Updates"},
                {"id": "99", "stringid": "internal_list", "name": "Internal"},
            ],
        )

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps(
                {"newsletters": {"sefaria_news": True}, "marketingOptOut": True}
            ),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data["success"] is True
        assert data["subscribedNewsletters"] == []
        assert data["marketingOptOut"] is True

        added, removed = _extract_list_mutations(mock_ac_request)
        assert removed == {
            "1",
            "3",
            "99",
        }, "All active lists must be removed on opt-out"
        assert len(added) == 0, "No lists should be added during opt-out"

        mock_update_flag.assert_called_once_with(None, False)

    @mock.patch("api.newsletter_service._load_user_profile", return_value=None)
    @mock.patch("api.newsletter_service._update_wants_marketing_emails")
    @mock.patch("api.newsletter_service._client.make_request")
    @mock.patch("api.newsletter_service.get_cached_newsletter_list")
    def test_opt_out_skips_already_unsubscribed_lists(
        self,
        mock_get_list,
        mock_ac_request,
        mock_update_flag,
        mock_load_profile,
        logged_in_client,
    ):
        """
        Opt-out: list 3 already unsubscribed (status=2). Should only remove list 1.
        active_only=True filtering in service prevents wasted API calls.
        """
        mock_get_list.return_value = _MANAGED_NEWSLETTERS
        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {"list": "1", "status": "1"},
                {"list": "3", "status": "2"},  # already unsubscribed
            ],
            all_lists=[
                {"id": "1", "stringid": "sefaria_news", "name": "Sefaria News"},
                {"id": "3", "stringid": "text_updates", "name": "Text Updates"},
            ],
        )

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps({"newsletters": {}, "marketingOptOut": True}),
            content_type="application/json",
        )

        assert response.status_code == 200

        added, removed = _extract_list_mutations(mock_ac_request)
        assert removed == {"1"}, "Only active list 1 should be removed"
        assert "3" not in removed, "Already-unsubscribed list 3 should be skipped"

        mock_update_flag.assert_called_once_with(None, False)

    @mock.patch("api.newsletter_service._load_user_profile", return_value=None)
    @mock.patch("api.newsletter_service._update_wants_marketing_emails")
    @mock.patch("api.newsletter_service._client.make_request")
    @mock.patch("api.newsletter_service.get_cached_newsletter_list")
    def test_opt_out_without_active_lists_still_persists_opt_out(
        self,
        mock_get_list,
        mock_ac_request,
        mock_update_flag,
        mock_load_profile,
        logged_in_client,
    ):
        """
        A never-subscribed logged-in user can still explicitly opt out. There
        are no AC memberships to remove, but the local preference must persist.
        """
        mock_get_list.return_value = _MANAGED_NEWSLETTERS
        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[],
            all_lists=[
                {"id": "1", "stringid": "sefaria_news", "name": "Sefaria News"},
                {"id": "3", "stringid": "text_updates", "name": "Text Updates"},
            ],
        )

        response = logged_in_client.post(
            "/api/newsletter/preferences",
            json.dumps({"newsletters": {}, "marketingOptOut": True}),
            content_type="application/json",
        )

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data["success"] is True
        assert data["subscribedNewsletters"] == []
        assert data["marketingOptOut"] is True

        added, removed = _extract_list_mutations(mock_ac_request)
        assert added == set()
        assert removed == set()
        mock_update_flag.assert_called_once_with(None, False)


@pytest.mark.django_db
class TestViewThroughServiceFetchSubscriptions:
    """
    GET /api/newsletter/subscriptions.
    Full service logic runs — verifies list-ID-to-stringid mapping and
    wants_marketing_emails propagation from MongoDB through to HTTP response.
    """

    @mock.patch("api.newsletter_service.UserProfile")
    @mock.patch("api.newsletter_service._client.make_request")
    @mock.patch("api.newsletter_service.get_cached_newsletter_list")
    def test_maps_list_ids_to_stringids(
        self, mock_get_list, mock_ac_request, mock_profile_class, logged_in_client
    ):
        """
        Service maps AC list IDs back to stringids using the newsletter list.
        Only managed lists with matching IDs appear in the response.
        """
        mock_get_list.return_value = _MANAGED_NEWSLETTERS

        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.wants_marketing_emails = True
        mock_profile.learning_level = None
        mock_profile_class.return_value = mock_profile

        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {"list": "1", "status": "1"},
                {"list": "3", "status": "1"},
                {"list": "99", "status": "1"},  # unmanaged — no stringid mapping
            ]
        )

        response = logged_in_client.get("/api/newsletter/subscriptions")

        assert response.status_code == 200
        data = json.loads(response.content)
        assert sorted(data["subscribedNewsletters"]) == ["sefaria_news", "text_updates"]
        # List 99 has no stringid mapping → excluded from response
        assert data["wantsMarketingEmails"] is True

    @mock.patch("api.newsletter_service.UserProfile")
    @mock.patch("api.newsletter_service._client.make_request")
    @mock.patch("api.newsletter_service.get_cached_newsletter_list")
    def test_active_managed_subscription_corrects_stale_wants_marketing_false(
        self, mock_get_list, mock_ac_request, mock_profile_class, logged_in_client
    ):
        """
        UserProfile.wants_marketing_emails=False is stale when AC has any active
        membership, including managed lists shown by this frontend.
        """
        mock_get_list.return_value = _MANAGED_NEWSLETTERS

        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.wants_marketing_emails = False
        mock_profile.learning_level = None
        mock_profile_class.return_value = mock_profile

        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {"list": "1", "status": "1"},
            ]
        )

        response = logged_in_client.get("/api/newsletter/subscriptions")

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data["wantsMarketingEmails"] is True
        assert data["subscribedNewsletters"] == ["sefaria_news"]
        assert mock_profile.wants_marketing_emails is True
        mock_profile.save.assert_called_once()

    @mock.patch("api.newsletter_service.UserProfile")
    @mock.patch("api.newsletter_service._client.make_request")
    @mock.patch("api.newsletter_service.get_cached_newsletter_list")
    def test_active_unmanaged_subscription_corrects_stale_wants_marketing_false(
        self, mock_get_list, mock_ac_request, mock_profile_class, logged_in_client
    ):
        """
        Unmanaged AC lists are not exposed as frontend newsletter selections, but
        any active AC membership still proves the local opt-out flag is stale.
        """
        mock_get_list.return_value = _MANAGED_NEWSLETTERS

        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.wants_marketing_emails = False
        mock_profile.learning_level = None
        mock_profile_class.return_value = mock_profile

        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {"list": "99", "status": "1"},
            ]
        )

        response = logged_in_client.get("/api/newsletter/subscriptions")

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data["wantsMarketingEmails"] is True
        assert data["subscribedNewsletters"] == []
        assert mock_profile.wants_marketing_emails is True
        mock_profile.save.assert_called_once()

    @mock.patch("api.newsletter_service.UserProfile")
    @mock.patch("api.newsletter_service._client.make_request")
    @mock.patch("api.newsletter_service.get_cached_newsletter_list")
    def test_wants_marketing_emails_false_remains_false_without_active_memberships(
        self, mock_get_list, mock_ac_request, mock_profile_class, logged_in_client
    ):
        """
        A user who explicitly opted out and has no active AC memberships should
        remain opted out.
        """
        mock_get_list.return_value = _MANAGED_NEWSLETTERS

        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.wants_marketing_emails = False
        mock_profile.learning_level = None
        mock_profile_class.return_value = mock_profile

        mock_ac_request.side_effect = _ac_side_effect(contact_memberships=[])

        response = logged_in_client.get("/api/newsletter/subscriptions")

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data["wantsMarketingEmails"] is False
        assert data["subscribedNewsletters"] == []
        assert mock_profile.wants_marketing_emails is False
        mock_profile.save.assert_not_called()

    @mock.patch("api.newsletter_service.get_contact_learning_level")
    @mock.patch("api.newsletter_service.UserProfile")
    @mock.patch("api.newsletter_service._client.make_request")
    @mock.patch("api.newsletter_service.get_cached_newsletter_list")
    def test_learning_level_propagates_from_ac(
        self,
        mock_get_list,
        mock_ac_request,
        mock_profile_class,
        mock_get_ll,
        logged_in_client,
    ):
        """
        Learning level from AC propagates through service → view → HTTP response.
        """
        mock_get_list.return_value = _MANAGED_NEWSLETTERS

        mock_profile = mock.MagicMock()
        mock_profile.id = 42
        mock_profile.wants_marketing_emails = True
        mock_profile.learning_level = None
        mock_profile_class.return_value = mock_profile

        mock_ac_request.side_effect = _ac_side_effect(
            contact_memberships=[
                {"list": "1", "status": "1"},
            ]
        )
        mock_get_ll.return_value = 4

        response = logged_in_client.get("/api/newsletter/subscriptions")

        assert response.status_code == 200
        data = json.loads(response.content)
        assert data["learningLevel"] == 4
        assert data["subscribedNewsletters"] == ["sefaria_news"]
