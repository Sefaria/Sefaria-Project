"""
Account merge unit tests.

This file tests the small pure helpers in sefaria/utils/user.py one at a time.
"Pure" means the helper only reads its inputs and returns a value. It never
touches MongoDB or SQL, so these tests pass in plain dicts and need no
database or fixtures.

If you're testing how the merge steps work together against real data, write
the test in user_integration_test.py instead. If you're testing the staff web
form, use sefaria/tests/account_merge_view_test.py.
"""
import pytest

from sefaria.system.exceptions import InputError
from sefaria.utils import user as user_utils
from sefaria.utils.user import ProfileMode

SOURCE, DESTINATION, OTHER = 1, 2, 99


# ============================================================================
# Input checks
# ============================================================================

class TestParseUid:
    """Tests for _parse_uid, which turns an account ID into an int"""

    @pytest.mark.parametrize("uid,expected", [(12, 12), ("12", 12)])
    def test_accepts_ints_and_digit_strings(self, uid, expected):
        """An int or a string of digits becomes an int"""
        assert user_utils._parse_uid(uid) == expected

    @pytest.mark.parametrize("uid", [True, False, 1.5, None, "abc", ""])
    def test_rejects_everything_else(self, uid):
        """Booleans, floats, None, and non-digit strings raise InputError"""
        with pytest.raises(InputError, match="IDs must be integers"):
            user_utils._parse_uid(uid)


class TestProfileMode:
    """Tests for _profile_mode, which turns the two public booleans into one mode"""

    @pytest.mark.parametrize("fill,override,expected", [
        (True, False, ProfileMode.FILL),
        (True, True, ProfileMode.OVERRIDE),
        (False, True, ProfileMode.OVERRIDE),
        (False, False, ProfileMode.KEEP_DESTINATION),
    ])
    def test_override_wins_over_fill(self, fill, override, expected):
        """Override is chosen whenever it is True, even if fill is True too"""
        assert user_utils._profile_mode(fill, override) is expected


# ============================================================================
# Profile data
# ============================================================================

class TestProfileUpdates:
    """Tests for _profile_updates, which builds the $set document for the destination profile"""

    def test_keep_destination_changes_nothing(self):
        """KEEP_DESTINATION returns no updates, whatever the source has"""
        updates = user_utils._profile_updates({"location": "source"}, {}, ProfileMode.KEEP_DESTINATION, now=1)
        assert updates == {}

    def test_fill_copies_only_into_blank_fields(self):
        """FILL copies a field only when the destination's value is blank"""
        source = {"location": "source", "website": "source.example", "position": "source"}
        destination = {"location": "personal", "website": "", "position": None}
        updates = user_utils._profile_updates(source, destination, ProfileMode.FILL, now=1)
        assert updates == {"website": "source.example", "position": "source"}

    def test_override_copies_over_existing_values(self):
        """OVERRIDE copies a field even when the destination already has a value"""
        updates = user_utils._profile_updates({"location": "source"}, {"location": "personal"},
                                              ProfileMode.OVERRIDE, now=1)
        assert updates == {"location": "source"}

    @pytest.mark.parametrize("profile_mode", [ProfileMode.FILL, ProfileMode.OVERRIDE])
    def test_blank_source_values_are_never_copied(self, profile_mode):
        """An empty source value never replaces or fills anything, in any mode"""
        source = {"bio": "", "website": None, "location": "source"}
        destination = {"bio": "<p>Mine</p>", "website": "mine.example", "location": "personal"}
        updates = user_utils._profile_updates(source, destination, profile_mode, now=1)
        expected = {"location": "source"} if profile_mode is ProfileMode.OVERRIDE else {}
        assert updates == expected

    def test_fields_not_in_the_copy_list_are_ignored(self):
        """Identity fields such as CRM IDs are never copied, even in OVERRIDE"""
        updates = user_utils._profile_updates({"sf_app_user_id": "work-crm"}, {}, ProfileMode.OVERRIDE, now=1)
        assert updates == {}

    def test_bio_is_cleaned(self):
        """A copied bio has unsafe HTML removed"""
        updates = user_utils._profile_updates({"bio": "<script>x</script><p>Hi</p>"}, {}, ProfileMode.FILL, now=1)
        assert "<script>" not in updates["bio"]
        assert "Hi" in updates["bio"]

    def test_only_reading_settings_are_copied(self):
        """Reading settings move; privacy and email settings stay as the destination set them"""
        source = {"settings": {"interface_language": "hebrew", "reading_history": False,
                               "email_notifications": "never"}}
        updates = user_utils._profile_updates(source, {"settings": {}}, ProfileMode.OVERRIDE, now=1)
        assert updates["settings"] == {"interface_language": "hebrew"}

    def test_changed_settings_record_the_time(self):
        """When settings change, the settings time stamp is set to `now` so apps re-sync"""
        updates = user_utils._profile_updates({"settings": {"interface_language": "hebrew"}}, {},
                                              ProfileMode.FILL, now=123)
        assert updates["attr_time_stamps.settings"] == 123

    def test_unchanged_settings_leave_the_time_stamp_alone(self):
        """When the settings end up the same, neither they nor the time stamp are written"""
        same = {"settings": {"interface_language": "hebrew"}}
        updates = user_utils._profile_updates(same, same, ProfileMode.OVERRIDE, now=123)
        assert "settings" not in updates
        assert "attr_time_stamps.settings" not in updates

    def test_pinned_sheets_and_tags_are_combined_in_order(self):
        """Lists keep the destination's order, then add the source's new items"""
        source = {"pinned_sheets": [1, 2], "tag_order": ["a", "b"]}
        destination = {"pinned_sheets": [2, 3], "tag_order": ["b", "c"]}
        updates = user_utils._profile_updates(source, destination, ProfileMode.FILL, now=1)
        assert updates["pinned_sheets"] == [2, 3, 1]
        assert updates["tag_order"] == ["b", "c", "a"]

    def test_inputs_are_not_changed(self):
        """The source and destination dicts are left exactly as they were"""
        source = {"version_preferences_by_corpus": {"Tanakh": {"en": "source"}}, "pinned_sheets": [1]}
        destination = {"version_preferences_by_corpus": {"Tanakh": {"he": "personal"}}, "pinned_sheets": [2]}
        user_utils._profile_updates(source, destination, ProfileMode.FILL, now=1)
        assert destination == {"version_preferences_by_corpus": {"Tanakh": {"he": "personal"}}, "pinned_sheets": [2]}
        assert source == {"version_preferences_by_corpus": {"Tanakh": {"en": "source"}}, "pinned_sheets": [1]}


class TestCombinePreferences:
    """Tests for _combine_preferences, which merges nested preference dicts key by key"""

    def test_nested_dicts_are_merged_not_replaced(self):
        """A nested dict gains the missing keys instead of being replaced whole"""
        combined = user_utils._combine_preferences({"Tanakh": {"en": "personal"}},
                                                   {"Tanakh": {"en": "source", "he": "source-he"}},
                                                   replace_existing=False)
        assert combined == {"Tanakh": {"en": "personal", "he": "source-he"}}

    def test_replace_existing_overwrites_values(self):
        """With replace_existing, the incoming value wins for keys both sides have"""
        combined = user_utils._combine_preferences({"Tanakh": {"en": "personal"}},
                                                   {"Tanakh": {"en": "source"}}, replace_existing=True)
        assert combined == {"Tanakh": {"en": "source"}}

    def test_blank_incoming_values_never_replace_existing_ones(self):
        """Even with replace_existing, an empty incoming value leaves the existing one alone"""
        combined = user_utils._combine_preferences({"translation_language_preference": "en", "textual_custom": "sephardi"},
                                                   {"translation_language_preference": None, "textual_custom": ""},
                                                   replace_existing=True)
        assert combined == {"translation_language_preference": "en", "textual_custom": "sephardi"}

    def test_false_and_zero_are_kept(self):
        """False and 0 are real choices, so they are not filled in"""
        combined = user_utils._combine_preferences({"flag": False, "count": 0}, {"flag": True, "count": 5},
                                                   replace_existing=False)
        assert combined == {"flag": False, "count": 0}


class TestOrderedUnion:
    """Tests for _ordered_union"""

    def test_keeps_first_seen_order_without_duplicates(self):
        """Items appear once, in the order they were first seen"""
        assert user_utils._ordered_union([3, 1, 3], [1, 2]) == [3, 1, 2]


# ============================================================================
# Sheet collections and follows
# ============================================================================

class TestMergedRoles:
    """Tests for _merged_roles, which rewrites one collection's role lists"""

    def test_source_is_replaced_by_destination(self):
        """The source's ID is swapped for the destination's in every role"""
        group = {"admins": [SOURCE], "members": [OTHER], "publishers": [SOURCE, OTHER]}
        roles = user_utils._merged_roles(group, SOURCE, DESTINATION)
        assert roles == {"admins": [DESTINATION], "members": [OTHER], "publishers": [DESTINATION, OTHER]}

    def test_duplicates_are_removed(self):
        """If both accounts had the same role, the destination appears only once"""
        roles = user_utils._merged_roles({"members": [SOURCE, DESTINATION]}, SOURCE, DESTINATION)
        assert roles == {"members": [DESTINATION]}

    def test_admin_is_not_also_listed_as_member(self):
        """An admin already has member rights, so the member entry is dropped"""
        roles = user_utils._merged_roles({"admins": [SOURCE], "members": [DESTINATION, OTHER]},
                                         SOURCE, DESTINATION)
        assert roles == {"admins": [DESTINATION], "members": [OTHER]}

    def test_null_role_lists_are_left_as_they_are(self):
        """A role list stored as null is skipped instead of crashing the merge"""
        roles = user_utils._merged_roles({"admins": [SOURCE], "members": None}, SOURCE, DESTINATION)
        assert roles == {"admins": [DESTINATION]}

    def test_missing_role_lists_stay_missing(self):
        """A role list the group doesn't have is not added"""
        assert user_utils._merged_roles({"admins": [SOURCE]}, SOURCE, DESTINATION) == {"admins": [DESTINATION]}


class TestDuplicateEdgeIds:
    """Tests for _duplicate_edge_ids, which finds repeated follows or blocks"""

    def test_returns_every_copy_after_the_first(self):
        """The first (oldest) edge is kept; later copies of the same pair are returned"""
        edges = [{"_id": "a", "follower": 1, "followee": 2},
                 {"_id": "b", "follower": 1, "followee": 2},
                 {"_id": "c", "follower": 2, "followee": 1},
                 {"_id": "d", "follower": 1, "followee": 2}]
        assert user_utils._duplicate_edge_ids(edges, "follower", "followee") == ["b", "d"]


# ============================================================================
# Reading history
# ============================================================================

class TestBookmarkKey:
    """Tests for _bookmark_key, which decides when two bookmarks are the same"""

    def test_version_order_does_not_matter(self):
        """The same versions written in a different key order give the same key"""
        first = {"ref": "Genesis 1:1", "versions": {"en": "a", "he": "b"}}
        second = {"ref": "Genesis 1:1", "versions": {"he": "b", "en": "a"}}
        assert user_utils._bookmark_key(first) == user_utils._bookmark_key(second)

    def test_secondary_flag_makes_a_different_bookmark(self):
        """A secondary bookmark is not the same as a primary one for the same ref"""
        primary = {"ref": "Genesis 1:1"}
        secondary = {"ref": "Genesis 1:1", "secondary": True}
        assert user_utils._bookmark_key(primary) != user_utils._bookmark_key(secondary)


class TestChooseWinners:
    """Tests for _choose_winners, which picks one record from each competing group"""

    def record(self, _id, uid, stamp):
        return {"_id": _id, "uid": uid, "time_stamp": stamp}

    def test_newest_record_wins(self):
        """The record with the largest time stamp wins; the rest are losers"""
        old, new = self.record("a", SOURCE, 100), self.record("b", SOURCE, 200)
        assert user_utils._choose_winners({"Genesis": [old, new]}, "time_stamp", DESTINATION) == [(new, [old])]

    def test_tie_goes_to_the_destination(self):
        """With equal time stamps, the destination's own record wins"""
        theirs, ours = self.record("b", SOURCE, 100), self.record("a", DESTINATION, 100)
        [(winner, _)] = user_utils._choose_winners({"Genesis": [theirs, ours]}, "time_stamp", DESTINATION)
        assert winner is ours

    def test_groups_with_one_record_are_skipped(self):
        """A record with nothing to compete against is left out"""
        groups = {"Genesis": [self.record("a", SOURCE, 100)]}
        assert user_utils._choose_winners(groups, "time_stamp", DESTINATION) == []


# ============================================================================
# Sheets
# ============================================================================

class TestReassignSources:
    """Tests for _reassign_sources, which moves source credits on a sheet"""

    def test_credits_move_at_every_nesting_level(self):
        """addedBy changes at any depth, and the saved userLink is removed"""
        sources = [{"addedBy": SOURCE, "userLink": "old", "subsources": [
            {"subsources": [{"addedBy": SOURCE, "userLink": "old"}]}]}]
        assert user_utils._reassign_sources(sources, SOURCE, DESTINATION) == [
            {"addedBy": DESTINATION, "subsources": [{"subsources": [{"addedBy": DESTINATION}]}]}]

    def test_other_users_credits_are_untouched(self):
        """Sources added by someone else come back unchanged"""
        sources = [{"addedBy": OTHER, "userLink": "theirs"}]
        assert user_utils._reassign_sources(sources, SOURCE, DESTINATION) == sources

    def test_input_is_not_changed(self):
        """The original sources list is left as it was"""
        sources = [{"addedBy": SOURCE, "subsources": [{"addedBy": SOURCE}]}]
        user_utils._reassign_sources(sources, SOURCE, DESTINATION)
        assert sources == [{"addedBy": SOURCE, "subsources": [{"addedBy": SOURCE}]}]


class TestSheetChanges:
    """Tests for _sheet_changes, which builds the MongoDB update for one sheet"""

    def test_owner_moves_and_cached_owner_details_are_removed(self):
        """A new owner means the saved owner name and picture would be wrong, so they are removed"""
        changes = user_utils._sheet_changes({"owner": SOURCE, "ownerName": "Old"}, SOURCE, DESTINATION)
        assert changes["$set"] == {"owner": DESTINATION}
        assert set(changes["$unset"]) == {"ownerName", "ownerImageUrl", "ownerProfileUrl", "ownerOrganization"}

    def test_like_moves_without_duplicates(self):
        """The source's like becomes the destination's, and a sheet both liked keeps one like"""
        assert user_utils._sheet_changes({"likes": [OTHER, SOURCE]}, SOURCE, DESTINATION) == {
            "$set": {"likes": [OTHER, DESTINATION]}}
        assert user_utils._sheet_changes({"likes": [SOURCE, DESTINATION]}, SOURCE, DESTINATION) == {
            "$set": {"likes": [DESTINATION]}}

    def test_source_credits_move(self):
        """A source the old account added is credited to the new account"""
        changes = user_utils._sheet_changes({"sources": [{"addedBy": SOURCE}]}, SOURCE, DESTINATION)
        assert changes == {"$set": {"sources": [{"addedBy": DESTINATION}]}}

    def test_unrelated_sheet_is_left_alone(self):
        """A sheet that only has nested sources from other people needs no update"""
        sheet = {"owner": OTHER, "likes": [OTHER], "sources": [{"subsources": [{"addedBy": OTHER}]}]}
        assert user_utils._sheet_changes(sheet, SOURCE, DESTINATION) is None


class TestFieldsByCollection:
    """Tests for _fields_by_collection"""

    def test_groups_fields_and_keeps_their_order(self):
        """Fields are grouped under their collection, in the order they were listed"""
        references = (("notes", "owner"), ("sheets", "owner"), ("notes", "author"))
        assert user_utils._fields_by_collection(references) == {"notes": ["owner", "author"], "sheets": ["owner"]}
