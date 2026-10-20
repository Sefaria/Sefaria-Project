"""
user.py - helper functions related to users

Account data spans Django's SQL database and MongoDB.
"""
from collections import defaultdict
from contextlib import contextmanager
from copy import deepcopy
from enum import Enum
import json
import time

from django.conf import settings
from django.contrib.auth.models import User
from django.db import OperationalError, transaction
import structlog

import sefaria.model as model
from sefaria.system.database import db
from sefaria.helper.crm.crm_mediator import CrmMediator
from sefaria.system.exceptions import InputError

logger = structlog.get_logger(__name__)


def delete_user_account(uid, confirm=True):
    """ Deletes the account of `uid` as well as all owned data
    Returns True if user is successfully deleted from Mongo & User DB
    """
    user = model.UserProfile(id=uid)
    if confirm:
        print("Are you sure you want to delete the account of '%s' (%s)?" % (user.full_name, user.email))
        if input("Type 'DELETE' to confirm: ") != "DELETE":
            print("Canceled.")
            return

    try:
        crm_mediator = CrmMediator()
        if not crm_mediator.mark_for_review_in_crm(profile=user):
            logger.error("Failed to mark user for review in CRM")
    except Exception as e:
        logger.error("Failed to mark user for review in CRM")

    # Delete user's reading history
    user.delete_user_history(exclude_saved=False, exclude_last_place=False)
    # Delete Sheets, and queue their removal from search (web pods cannot write to ES)
    owned_sheet_ids = db.sheets.find({"owner": uid}, {"id": 1}).distinct("id")
    db.sheets.delete_many({"owner": uid})
    from sefaria.settings import SEARCH_INDEX_ON_SAVE
    if SEARCH_INDEX_ON_SAVE:
        from sefaria.search import queue_sheets_sync
        try:
            queue_sheets_sync(owned_sheet_ids)
        except Exception as e:
            logger.error("Failed to queue purged sheets for search removal", uid=uid, error=f"{type(e).__name__}: {e}")
    # Delete Notes
    db.notes.delete_many({"owner": uid})
    # Delete Notifcations
    db.notifications.delete_many({"uid": uid})
    # Delete Following Relationships
    db.following.delete_many({"follower": uid})
    db.following.delete_many({"followee": uid})
    # Delete Sheet Likes
    db.sheets.update_many({"likes": uid}, { "$pull": { "likes": uid } })
    # Delete Profile
    db.profiles.delete_one({"id": uid})
    # Delete User Object
    user = User.objects.get(id=uid)
    user.delete()
    
    # History is left for posterity, but will no longer be tied to a user profile

    print("User %d deleted." % uid)
    return True


def merge_user_accounts(from_uid, into_uid, fill_in_profile_data=True, override_profile_data=False, *, confirm=True):
    """Move one account's content into another account, then delete the first account.

    `from_uid` is the source account. It is deleted at the end.
    `into_uid` is the destination account. It keeps its own logins and password.

    Only run this while nobody is using either account. If it fails partway:
      - SQL changes (Django users, logins, permissions) are undone automatically.
      - MongoDB changes (sheets, history, and so on) are NOT undone.
    So after any failure, look at both accounts before trying again.

    Things that never move to the destination: the source's logins, staff and
    admin access, discussions, and experiment settings.

    The command-line version asks you to type MERGE. A web view must do its own
    permission and confirmation checks, then pass confirm=False.

    Returns {"from_uid", "into_uid", "warnings"}. Warnings are follow-up tasks
    for a person, such as a CRM record that needs manual review.

    Raises MergeNotStartedError when it stops before changing anything (bad
    input, or the account is already being merged); that is safe to retry. Any
    other error may mean some MongoDB data has already moved.
    """
    from_uid, into_uid = _parse_uid(from_uid), _parse_uid(into_uid)
    _check_accounts_can_merge(from_uid, into_uid)

    from_user = model.UserProfile(id=from_uid)
    into_user = model.UserProfile(id=into_uid)
    if confirm and not _confirmed_on_command_line(from_user, into_user):
        print("Canceled.")
        return

    profile_mode = _profile_mode(fill_in_profile_data, override_profile_data)
    try:
        with _report_if_merge_stops("content transfer", from_uid, into_uid, source_user_deleted=False):
            source, destination = _move_content_and_delete_source_user(from_uid, into_uid, profile_mode)
        with _report_if_merge_stops("source profile cleanup", from_uid, into_uid, source_user_deleted=True):
            _delete_source_profile(source)
    finally:
        # Clear caches even when the merge failed: a partial merge may already
        # show sheets under a new owner.
        cache_warning = _refresh_merge_caches(from_uid, into_uid)
        if cache_warning:
            print(cache_warning)

    crm_warning = _review_merged_crm_account(from_user, source, destination)
    if crm_warning:
        print(crm_warning)
    print("Content from %s moved into %s's account; source account deleted." %
          (from_user.email, into_user.email))
    warnings = [warning for warning in (cache_warning, crm_warning) if warning]
    return {"from_uid": from_uid, "into_uid": into_uid, "warnings": warnings}


class MergeNotStartedError(InputError):
    """The merge stopped before changing anything, so it is safe to fix the problem and retry."""


class ProfileMode(Enum):
    """What to do with profile fields (bio, location, settings, ...) during a merge."""
    FILL = "fill"                          # Copy source values only where the destination is blank.
    OVERRIDE = "override"                  # Copy source values over the destination's values (blank ones are skipped).
    KEEP_DESTINATION = "keep_destination"  # Copy nothing.


def _profile_mode(fill_in_profile_data, override_profile_data):
    # The public function takes two booleans for backward compatibility.
    # Override wins when both are True, as it always has.
    if override_profile_data:
        return ProfileMode.OVERRIDE
    if fill_in_profile_data:
        return ProfileMode.FILL
    return ProfileMode.KEEP_DESTINATION


# ---------------------------------------------------------------------------
# Where user IDs are stored
# ---------------------------------------------------------------------------

# Fields that hold a single user ID. Each one is moved with one update_many().
_SIMPLE_REFERENCES = (
    ("notes", "owner"), ("history", "user"), ("notifications", "uid"),
    ("notifications", "content.liker"), ("notifications", "content.publisher"),
    ("notifications", "content.follower"), ("notifications", "content.adder"),
)

# Every field where the source user ID may appear. After the merge, none of
# them may still hold it; _verify_merge_transfers() checks each one.
#
# Left out on purpose, so they keep the old ID:
#   - layers.owner (discussions)
#   - linker_editor_history.uid (a staff audit log that must not be rewritten)
_ALL_REFERENCES = _SIMPLE_REFERENCES + (
    ("user_history", "uid"), ("sheets", "owner"), ("sheets", "assigner_id"),
    ("sheets", "viaOwner"), ("sheets", "likes"), ("apikeys", "uid"),
    ("groups", "admins"), ("groups", "members"), ("groups", "publishers"),
    ("following", "follower"), ("following", "followee"),
    ("blocking", "blocker"), ("blocking", "blockee"),
)

# Sheet fields that hold a user ID, paired with the fields that store a copy of
# that user's name or picture. The copies would show the wrong person after the
# merge, so they are removed, and the site fills them in again when needed.
_SHEET_USER_FIELDS = (
    ("owner", ("ownerName", "ownerImageUrl", "ownerProfileUrl", "ownerOrganization")),
    ("assigner_id", ("assignerName",)),
    ("viaOwner", ("viaOwnerName", "viaOwnerProfileUrl")),
)

# The role lists on a sheet collection (the MongoDB "groups" collection).
# These are not Django permission groups.
_COLLECTION_ROLES = ("admins", "members", "publishers")

_MERGE_PROFILE_FIELDS = (
    "position", "organization", "jewish_education", "bio", "website", "location",
    "public_email", "facebook", "twitter", "linkedin", "youtube",
    "profile_pic_url", "profile_pic_url_small",
)
# Only these reading settings move. Privacy and email settings stay as the
# destination chose them.
_MERGE_READING_SETTINGS = (
    "interface_language", "textual_custom", "translation_language_preference",
    "translation_language_preference_suggested",
)


# ---------------------------------------------------------------------------
# Before the merge: check the inputs
# ---------------------------------------------------------------------------

def _parse_uid(uid):
    """Turn "12" or 12 into 12. Raise MergeNotStartedError for anything else."""
    # Python treats True as the integer 1, so reject booleans explicitly.
    # Otherwise merge_user_accounts(True, ...) would merge user 1.
    is_id_like = isinstance(uid, (str, int)) and not isinstance(uid, bool)
    if not is_id_like:
        raise MergeNotStartedError("Account IDs must be integers.")
    try:
        return int(uid)
    except ValueError:
        raise MergeNotStartedError("Account IDs must be integers.") from None


def _check_accounts_can_merge(from_uid, into_uid):
    # Merging an account into itself would end by deleting the account we
    # meant to keep.
    if from_uid == into_uid:
        raise MergeNotStartedError("Source and destination accounts must be different.")
    # Read the raw profile document here. Loading model.UserProfile for a user
    # who has no profile creates an empty one, which we don't want.
    for uid in (from_uid, into_uid):
        if not User.objects.filter(id=uid).exists():
            raise MergeNotStartedError("User %s does not exist." % uid)
        if not db.profiles.find_one({"id": uid}):
            raise MergeNotStartedError("User %s does not have a profile." % uid)


def _confirmed_on_command_line(from_user, into_user):
    print("Are you sure you want to merge the account of '%s' (%s) into the account of '%s' (%s)" %
          (from_user.full_name, from_user.email, into_user.full_name, into_user.email))
    print("Only destination logins will remain. Destination staff/admin access will be removed; "
          "source-sheet collection roles will transfer. Both accounts must be quiet.")
    return input("Type 'MERGE' to confirm: ") == "MERGE"


@contextmanager
def _report_if_merge_stops(step, from_uid, into_uid, *, source_user_deleted):
    """If the code inside this block fails, say which step failed, then re-raise the error."""
    try:
        yield
    except MergeNotStartedError:
        # Nothing has changed yet, so there is nothing to inspect.
        raise
    except Exception:
        logger.exception("Account merge stopped; inspect MongoDB before retrying",
                         from_uid=from_uid, into_uid=into_uid, step=step,
                         source_user_deleted=source_user_deleted)
        print("Merge stopped during %s. MongoDB changes may already have applied; "
              "inspect both accounts before retrying." % step)
        if source_user_deleted:
            print("The source Django user has already been deleted; inspect and finish cleanup "
                  "instead of merging again.")
        raise


# ---------------------------------------------------------------------------
# The merge itself
# ---------------------------------------------------------------------------

def _move_content_and_delete_source_user(from_uid, into_uid, profile_mode):
    """Move all content, then delete the source's Django user. Returns both raw profiles."""
    # durable=True makes Django refuse to run this inside a bigger transaction.
    # We need the SQL changes committed here, before the source profile is
    # deleted from MongoDB in the next step.
    with transaction.atomic(durable=True):
        users = _lock_users(from_uid, into_uid)
        source, destination = _load_raw_profiles(from_uid, into_uid)
        _move_content(source, destination, profile_mode)
        # Check that nothing still points at the source BEFORE deleting it.
        _verify_merge_transfers(from_uid)
        _remove_access(survivor=users[into_uid], retiring=users[from_uid])
    return source, destination


def _lock_users(from_uid, into_uid):
    # Lock both rows so a second merge of the same account fails right away
    # (nowait=True) instead of running at the same time. Locking in ID order
    # stops two merges from each waiting on the other. These are SQL locks
    # only: they do not stop someone editing the account's MongoDB data.
    locked = User.objects.select_for_update(nowait=True).filter(id__in=[from_uid, into_uid]).order_by("id")
    try:
        users = {user.id: user for user in locked}  # The query (and the lock) runs here.
    except OperationalError:
        # Nothing has changed yet, so this is safe to try again later.
        raise MergeNotStartedError("One of these accounts is already being merged. Try again when that merge ends.")
    if len(users) != 2:
        raise MergeNotStartedError("An account disappeared before the merge started.")
    return users


def _load_raw_profiles(from_uid, into_uid):
    source = db.profiles.find_one({"id": from_uid})
    destination = db.profiles.find_one({"id": into_uid})
    if not source or not destination:
        raise MergeNotStartedError("A profile disappeared before the merge started.")
    return source, destination


def _move_content(source, destination, profile_mode):
    from_uid, into_uid = source["id"], destination["id"]
    for collection, field in _SIMPLE_REFERENCES:
        db[collection].update_many({field: from_uid}, {"$set": {field: into_uid}})
    _merge_collections(from_uid, into_uid)
    _merge_relationships("following", "follower", "followee", from_uid, into_uid)
    _merge_relationships("blocking", "blocker", "blockee", from_uid, into_uid)
    _merge_history(from_uid, into_uid)
    changed_sheet_ids = _merge_sheets(from_uid, into_uid)
    _merge_profile_data(source, destination, profile_mode)

    # Delete the source's API keys. They would otherwise keep working after the
    # source user is gone.
    db.apikeys.delete_many({"uid": from_uid})

    # Trends are totals calculated from activity, so they are not moved. Delete
    # both accounts' totals; the regular setAllTrends() job rebuilds them.
    db.trend.delete_many({"uid": {"$in": [from_uid, into_uid]}})

    if settings.SEARCH_INDEX_ON_SAVE and changed_sheet_ids:
        from sefaria.search import queue_sheets_sync
        queue_sheets_sync(changed_sheet_ids)


def _remove_access(survivor, retiring):
    # The destination may be a personal account that was given staff access by
    # mistake. Remove all backend access; staff can grant it again on purpose.
    survivor.is_staff = survivor.is_superuser = False
    survivor.save(update_fields=["is_staff", "is_superuser"])
    survivor.groups.clear()
    survivor.user_permissions.clear()
    # Deleting the source also deletes (via Django cascades) its SSO accounts,
    # tokens, email addresses, and experiment settings. None of them move to the
    # destination, whose own password, email, and SSO accounts stay unchanged.
    retiring.delete()


def _delete_source_profile(source):
    # Don't use delete_user_account() here: it deletes everything the user
    # owns. If the merge missed something, we want to stop, not lose it.
    deleted = db.profiles.delete_one({"_id": source["_id"], "id": source["id"]}).deleted_count
    if deleted != 1:
        raise RuntimeError("The source profile could not be removed.")


# ---------------------------------------------------------------------------
# Profile data
# ---------------------------------------------------------------------------

def _merge_profile_data(source, destination, profile_mode):
    updates = _profile_updates(source, destination, profile_mode, now=time.time())
    if not updates:
        return
    # Write only the changed fields with $set. Using UserProfile.save() instead
    # would also run its privacy logic, which can delete reading history.
    result = db.profiles.update_one({"_id": destination["_id"], "id": destination["id"]},
                                    {"$set": updates})
    if result.matched_count != 1:
        raise RuntimeError("The destination profile disappeared during the merge.")


def _profile_updates(source, destination, profile_mode, now):
    """Work out which destination profile fields to change. Returns a $set document.

    This only reads its inputs. It does not touch the database.
    """
    from sefaria.model.user_profile import sanitize_bio

    if profile_mode is ProfileMode.KEEP_DESTINATION:
        return {}
    replace_existing = profile_mode is ProfileMode.OVERRIDE

    def should_copy(field):
        # A blank source value is never copied: it would erase the destination's value.
        has_value = not _is_blank(source.get(field))
        return has_value and (replace_existing or _is_blank(destination.get(field)))

    updates = {field: deepcopy(source[field]) for field in _MERGE_PROFILE_FIELDS if should_copy(field)}
    if "bio" in updates:
        # A bio is shown as HTML, so clean it the same way a profile edit does.
        updates["bio"] = sanitize_bio(updates["bio"] or "")

    source_settings = source.get("settings", {})
    reading_settings = {key: source_settings[key] for key in _MERGE_READING_SETTINGS if key in source_settings}
    current_settings = destination.get("settings", {})
    combined_settings = _combine_preferences(current_settings, reading_settings, replace_existing)
    if combined_settings != current_settings:
        updates["settings"] = combined_settings
        # Apps compare this time stamp to decide whether to download settings.
        updates["attr_time_stamps.settings"] = now

    current_versions = destination.get("version_preferences_by_corpus", {})
    combined_versions = _combine_preferences(
        current_versions, source.get("version_preferences_by_corpus", {}), replace_existing)
    if combined_versions != current_versions:
        updates["version_preferences_by_corpus"] = combined_versions

    for field in ("pinned_sheets", "tag_order"):
        current = destination.get(field) or []
        combined = _ordered_union(current, source.get(field) or [])
        if combined != current:
            updates[field] = combined
    return updates


def _combine_preferences(existing, incoming, replace_existing):
    """Return a new dict with `incoming` merged into `existing`, one key at a time.

    Blank incoming values are skipped. When both sides have a nested dict for a key, merge those dicts the same way,
    so one corpus preference doesn't wipe out the others.
    """
    combined = deepcopy(existing)
    for key, value in incoming.items():
        if _is_blank(value):
            continue  # Never copy an empty value over a real one.
        both_are_dicts = isinstance(combined.get(key), dict) and isinstance(value, dict)
        if both_are_dicts:
            combined[key] = _combine_preferences(combined[key], value, replace_existing)
        elif replace_existing or _is_blank(combined.get(key)):
            combined[key] = deepcopy(value)
    return combined


def _is_blank(value):
    # False and 0 are real choices a user made, so they are not blank.
    return value in (None, "", [])


def _ordered_union(first, second):
    """Items of `first`, then items of `second` not already seen, without duplicates."""
    # dict keys keep insertion order and cannot repeat.
    return list(dict.fromkeys([*first, *second]))


# ---------------------------------------------------------------------------
# Sheet collections, follows, and blocks
# ---------------------------------------------------------------------------

def _merge_collections(from_uid, into_uid):
    either_user_has_a_role = {"$or": [{role: {"$in": [from_uid, into_uid]}} for role in _COLLECTION_ROLES]}
    projection = {role: 1 for role in _COLLECTION_ROLES}
    for group in db.groups.find(either_user_has_a_role, projection):
        # Write all role lists in one update, so a group is never half-changed.
        db.groups.update_one({"_id": group["_id"]}, {"$set": _merged_roles(group, from_uid, into_uid)})


def _merged_roles(group, from_uid, into_uid):
    """Return the group's role lists with the source user replaced by the destination user."""
    def replace_source(uids):
        renamed = [into_uid if uid == from_uid else uid for uid in uids]
        return _ordered_union(renamed, [])  # Removes duplicates and keeps the order.

    roles = {role: replace_source(group[role]) for role in _COLLECTION_ROLES if role in group}
    # Admins have every member right, so an admin should not also be listed as a member.
    is_admin_and_member = into_uid in roles.get("admins", []) and into_uid in roles.get("members", [])
    if is_admin_and_member:
        roles["members"] = [uid for uid in roles["members"] if uid != into_uid]
    return roles


def _merge_relationships(collection, left, right, from_uid, into_uid):
    """Move follows (or blocks) in both directions, then remove the copies this creates.

    `left` is the user doing it (the follower); `right` is the user it is done to.
    """
    relationships = db[collection]
    for field in (left, right):
        relationships.update_many({field: from_uid}, {"$set": {field: into_uid}})
    # If the two accounts followed each other, the destination now follows itself.
    relationships.delete_many({left: into_uid, right: into_uid})

    # Sort oldest first so the original relationship (and its date) is the one kept.
    edges = relationships.find({"$or": [{left: into_uid}, {right: into_uid}]}).sort("_id", 1)
    duplicate_ids = _duplicate_edge_ids(edges, left, right)
    if duplicate_ids:
        relationships.delete_many({"_id": {"$in": duplicate_ids}})


def _duplicate_edge_ids(edges, left, right):
    """Given edges sorted oldest first, return the _id of every copy after the first."""
    seen = set()
    duplicate_ids = []
    for edge in edges:
        pair = (edge[left], edge[right])
        if pair in seen:
            duplicate_ids.append(edge["_id"])
        seen.add(pair)
    return duplicate_ids


# ---------------------------------------------------------------------------
# Reading history
# ---------------------------------------------------------------------------

def _merge_history(from_uid, into_uid):
    """Move reading history, keeping every visit.

    Both accounts may have bookmarked the same text, or both may have a "last
    place" in the same book. In each case only one record can win, so the
    others are switched off.
    """
    # Load only bookmarks and last places: they are the only records compared.
    # Ordinary visits can number in the hundreds of thousands and are moved by
    # update_many() below without being loaded.
    # Load them BEFORE moving them. Moving gives each source record a fresh
    # sync time stamp, which would make every source record look newest.
    may_compete = {"uid": {"$in": [from_uid, into_uid]},
                   "$or": [{"saved": True}, {"delete_saved": True}, {"last_place": True}]}
    records = list(db.user_history.find(may_compete))
    bookmark_groups = _group_by([r for r in records if r.get("saved") or r.get("delete_saved")], _bookmark_key)
    last_place_groups = _group_by([r for r in records if r.get("last_place")], lambda r: r.get("book"))

    now = time.time()
    # Setting server_time_stamp tells the apps that these records changed.
    db.user_history.update_many({"uid": from_uid}, {"$set": {"uid": into_uid, "server_time_stamp": now}})

    for winner, losers in _choose_winners(bookmark_groups, "server_time_stamp", into_uid):
        _update_records(losers, {"saved": False, "delete_saved": False, "server_time_stamp": now})
        _update_records([winner], {"server_time_stamp": now})
    for winner, losers in _choose_winners(last_place_groups, "time_stamp", into_uid):
        _update_records(losers, {"last_place": False, "server_time_stamp": now})


def _bookmark_key(record):
    # Two bookmarks are "the same bookmark" when the ref, the versions, and the
    # secondary flag all match. `versions` is a dict, which can't be part of a
    # tuple key, so turn it into a string with its keys in a fixed order.
    versions = json.dumps(record.get("versions", {}), sort_keys=True)
    return record.get("ref"), versions, record.get("secondary", False)


def _group_by(items, key):
    """Return {key(item): [items with that key]}."""
    groups = defaultdict(list)
    for item in items:
        groups[key(item)].append(item)
    return groups


def _choose_winners(groups, timestamp_field, into_uid):
    """For each group with more than one record, return (newest record, the other records).

    Ties go to the destination's record, then to the larger _id, so the result
    is always the same for the same data.
    """
    def newest_first(record):
        return record.get(timestamp_field, 0), record["uid"] == into_uid, str(record["_id"])

    def split(group):
        winner = max(group, key=newest_first)
        losers = [record for record in group if record["_id"] != winner["_id"]]
        return winner, losers

    return [split(group) for group in groups.values() if len(group) > 1]


def _update_records(records, fields):
    ids = [record["_id"] for record in records]
    db.user_history.update_many({"_id": {"$in": ids}}, {"$set": fields})


# ---------------------------------------------------------------------------
# Sheets
# ---------------------------------------------------------------------------

def _merge_sheets(from_uid, into_uid):
    """Move sheet ownership, likes, and source credits. Returns the IDs of changed sheets."""
    changed_sheet_ids = set()
    for field, cached_fields in _SHEET_USER_FIELDS:
        changed_sheet_ids.update(db.sheets.distinct("id", {field: from_uid}))
        db.sheets.update_many({field: from_uid}, {"$set": {field: into_uid},
                                                "$unset": {name: "" for name in cached_fields}})

    # Add the destination's like before removing the source's, so a sheet that
    # both accounts liked ends up with exactly one like.
    db.sheets.update_many({"likes": from_uid}, {"$addToSet": {"likes": into_uid}})
    db.sheets.update_many({"likes": from_uid}, {"$pull": {"likes": from_uid}})

    for sheet in _sheets_that_may_credit(from_uid):
        reassigned = _reassign_sources(sheet["sources"], from_uid, into_uid)
        if reassigned != sheet["sources"]:
            db.sheets.update_one({"_id": sheet["_id"]}, {"$set": {"sources": reassigned}})
            changed_sheet_ids.add(sheet["id"])
    return changed_sheet_ids


def _sheets_that_may_credit(from_uid):
    # Old sheets can have sources inside sources, any number of levels deep.
    # A MongoDB query can't search every level, so also load every sheet with
    # nested sources and check those in Python.
    may_credit = {"$or": [{"sources.addedBy": from_uid}, {"sources.subsources": {"$exists": True}}]}
    return db.sheets.find(may_credit, {"sources": 1, "id": 1})


def _reassign_sources(sources, from_uid, into_uid):
    """Return a copy of `sources` where the destination is credited instead of the source."""
    return [_reassign_source(source, from_uid, into_uid) for source in sources]


def _reassign_source(source, from_uid, into_uid):
    updated = dict(source)
    if updated.get("addedBy") == from_uid:
        updated["addedBy"] = into_uid
        # userLink is a saved link to the old profile; the site rebuilds it.
        updated.pop("userLink", None)
    if "subsources" in updated:
        updated["subsources"] = _reassign_sources(updated["subsources"], from_uid, into_uid)
    return updated


def _iter_sheet_sources(sources):
    """Yield every source, including sources nested inside other sources."""
    for source in sources:
        yield source
        yield from _iter_sheet_sources(source.get("subsources", []))


def _verify_merge_transfers(from_uid):
    """Raise if any field still holds the source user ID.

    This checks the database itself, rather than trusting that each step above
    worked, so a missed field stops the merge before the source is deleted.
    """
    for collection, field in _ALL_REFERENCES:
        if db[collection].find_one({field: from_uid}, {"_id": 1}):
            raise RuntimeError("Source reference remains in %s.%s; source was not deleted." % (collection, field))
    for sheet in _sheets_that_may_credit(from_uid):
        still_credited = any(source.get("addedBy") == from_uid for source in _iter_sheet_sources(sheet["sources"]))
        if still_credited:
            raise RuntimeError("Source attribution remains on sheet %s; source was not deleted." % sheet["id"])


# ---------------------------------------------------------------------------
# After the merge: caches and CRM
# ---------------------------------------------------------------------------

def _refresh_merge_caches(from_uid, into_uid):
    """Clear cached profiles on this server and the others. Returns a warning if it fails."""
    try:
        from sefaria.system.cache import invalidate_user_profile_cache
        from sefaria.system.multiserver.coordinator import server_coordinator
        invalidate_user_profile_cache([from_uid, into_uid])
        # server_coordinator is None when only one server is running.
        if server_coordinator:
            server_coordinator.publish_event("scache", "invalidate_user_profile_cache", [[from_uid, into_uid]])
    except Exception:
        # Don't raise: on failure this runs while another error is being raised,
        # and that original error is the one the operator needs to see.
        logger.exception("Account merge cache refresh failed", from_uid=from_uid, into_uid=into_uid)
        return "Profile caches could not be refreshed; refresh them before checking the merged account."


def _review_merged_crm_account(from_user, source, destination):
    """Flag the source's CRM record for a person to review. Returns a warning if that fails.

    The destination keeps its own CRM record and donor status. This does not
    merge CRM records; it only marks the source's record so staff can do that.
    """
    crm_id_field = {"SALESFORCE": "sf_app_user_id", "NATIONBUILDER": "nationbuilder_id"}.get(settings.CRM_TYPE)
    source_crm_id = source.get(crm_id_field) if crm_id_field else None
    # If both accounts share one CRM record, marking it would flag the account we kept.
    needs_review = source_crm_id and source_crm_id != destination.get(crm_id_field)
    if not needs_review:
        return None
    try:
        if CrmMediator().mark_for_review_in_crm(profile=from_user):
            return None
    except Exception:
        logger.exception("Merged source CRM review failed", from_uid=source["id"], into_uid=destination["id"])
    logger.error("Account merged; source CRM record needs manual review", crm_id=source_crm_id,
                 from_uid=source["id"], into_uid=destination["id"])
    return "Account merged; source CRM record %s needs manual review." % source_crm_id


def generate_api_key(uid):
    """ Save a new random API key for `uid` """
    user = model.UserProfile(id=uid)
    if not user._id:
        print("User %d does not exist." % uid)
        return

    import base64, hashlib, random
    key = base64.b64encode(hashlib.sha256(bytes(str(random.getrandbits(256)), encoding='utf-8')).digest(),
                           random.choice([b'rA', b'aZ', b'gQ', b'hH', b'hG', b'aR', b'DD'])).rstrip(b'==').decode('utf-8')
    db.apikeys.delete_many({"uid": uid})
    db.apikeys.insert_one({"uid": uid, "key": key})

    print("API Key for %s (uid: %d, email: %s): %s" % (user.full_name, uid, user.email, key))


def reset_all_api_keys():
    """ Updates all existing API keys with new random values """
    keys = db.apikeys.find()
    for key in keys:
        generate_api_key(key["uid"])


