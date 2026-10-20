"""
user.py - helper functions related to users

Account data spans Django's SQL database and MongoDB.
"""
from collections import defaultdict
from copy import deepcopy
import json
import time

from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
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


def merge_user_accounts(from_uid, into_uid, fill_in_profile_data=True, override_profile_data=False):
    """Move supported account data into a personal account, then delete the source.

    Run while both accounts are quiet. SQL changes roll back together, but MongoDB
    writes do not: inspect both accounts after any failure before retrying. Source
    logins, backend privileges, discussions, and experiments are never transferred.
    """
    # Normalize CLI strings as well, so merging "12" into 12 cannot delete itself.
    try:
        if any(isinstance(uid, bool) or not isinstance(uid, (str, int)) for uid in (from_uid, into_uid)):
            raise ValueError
        from_uid, into_uid = int(from_uid), int(into_uid)
    except ValueError:
        raise InputError("Account IDs must be integers.")

    # Validate before loading profiles: loading a missing profile can create it.
    # A self-merge would otherwise finish by deleting the account we meant to keep.
    if from_uid == into_uid:
        raise InputError("Source and destination accounts must be different.")
    for uid in (from_uid, into_uid):
        if not User.objects.filter(id=uid).exists():
            raise InputError("User %s does not exist." % uid)
        if not db.profiles.find_one({"id": uid}):
            raise InputError("User %s does not have a profile." % uid)

    from_user = model.UserProfile(id=from_uid)
    into_user = model.UserProfile(id=into_uid)

    print("Are you sure you want to merge the account of '%s' (%s) into the account of '%s' (%s)" %
          (from_user.full_name, from_user.email, into_user.full_name, into_user.email))
    print("Only destination logins will remain. Destination staff/admin access will be removed; "
          "source-sheet collection roles will transfer. Both accounts must be quiet.")
    if input("Type 'MERGE' to confirm: ") != "MERGE":
        print("Canceled.")
        return

    phase = "content transfer"
    sql_committed = False
    try:
        # durable=True also rejects callers that wrap the merge in a larger SQL
        # transaction: source profile cleanup must run after the SQL commit.
        with transaction.atomic(durable=True):
            # Lock in ID order so two merge commands cannot move the same account
            # simultaneously. These SQL locks do not block ordinary MongoDB edits.
            users = {u.id: u for u in User.objects.select_for_update(nowait=True)
                     .filter(id__in=[from_uid, into_uid]).order_by("id")}
            if len(users) != 2:
                raise InputError("An account disappeared before the merge started.")
            source = db.profiles.find_one({"id": from_uid})
            destination = db.profiles.find_one({"id": into_uid})
            if not source or not destination:
                raise InputError("A profile disappeared before the merge started.")

            # Every scalar reference below also participates in the final check.
            # Discussion owners and immutable staff audit logs are deliberately absent.
            for collection, field in _MERGE_REFERENCES:
                db[collection].update_many({field: from_uid}, {"$set": {field: into_uid}})
            _merge_collections(from_uid, into_uid)
            _merge_relationships("following", "follower", "followee", from_uid, into_uid)
            _merge_relationships("blocking", "blocker", "blockee", from_uid, into_uid)
            _merge_history(from_uid, into_uid)
            sheet_ids = _merge_sheets(from_uid, into_uid)
            _merge_profile_data(source, destination, fill_in_profile_data, override_profile_data)

            # Keep only the survivor's credentials. In particular, an old work API
            # key must not remain usable after its Django user has been deleted.
            db.apikeys.delete_many({"uid": from_uid})

            # These are derived totals, not possessions. Invalidate stale totals;
            # the existing setAllTrends() maintenance job can rebuild them later.
            db.trend.delete_many({"uid": {"$in": [from_uid, into_uid]}})
            if settings.SEARCH_INDEX_ON_SAVE and sheet_ids:
                from sefaria.search import queue_sheets_sync
                queue_sheets_sync(sheet_ids)
            _verify_merge_transfers(from_uid)

            phase = "SQL account retirement"
            survivor = users[into_uid]
            survivor.is_staff = survivor.is_superuser = False
            survivor.save(update_fields=["is_staff", "is_superuser"])
            survivor.groups.clear()
            survivor.user_permissions.clear()
            # Django cascades delete the source's SSO accounts, tokens, email
            # aliases, and experiment row. None should grant access to the survivor.
            # Its password, email, SSO accounts, and experiment settings stay intact.
            users[from_uid].delete()
        sql_committed = True

        # Do not use delete_user_account(): it deletes owned content. A missed
        # transfer must stop this merge instead of silently throwing that data away.
        phase = "source profile cleanup"
        if db.profiles.delete_one({"_id": source["_id"], "id": from_uid}).deleted_count != 1:
            raise RuntimeError("The source profile could not be removed.")
    except Exception:
        logger.exception("Account merge stopped; inspect MongoDB before retrying",
                         from_uid=from_uid, into_uid=into_uid, phase=phase,
                         source_sql_deleted=sql_committed)
        print("Merge stopped during %s. MongoDB changes may already have applied; "
              "inspect both accounts before retrying." % phase)
        if sql_committed:
            print("The source Django user has already been deleted; inspect and finish cleanup "
                  "instead of merging again.")
        raise
    finally:
        # A partial merge can also change displayed ownership, so invalidate even
        # on failure. Cache errors must not hide the original transfer exception.
        _refresh_merge_caches(from_uid, into_uid)

    _review_merged_crm_account(from_user, source, destination)
    print("Content from %s moved into %s's account; source account deleted." %
          (from_user.email, into_user.email))


# These are account references, not arbitrary integers embedded in documents.
_MERGE_REFERENCES = (
    ("notes", "owner"), ("history", "user"), ("notifications", "uid"),
    ("notifications", "content.liker"), ("notifications", "content.publisher"),
    ("notifications", "content.follower"), ("notifications", "content.adder"),
)
_MERGE_PROFILE_FIELDS = (
    "position", "organization", "jewish_education", "bio", "website", "location",
    "public_email", "facebook", "twitter", "linkedin", "youtube",
    "profile_pic_url", "profile_pic_url_small",
)
_MERGE_READING_SETTINGS = (
    "interface_language", "textual_custom", "translation_language_preference",
    "translation_language_preference_suggested",
)


def _merge_profile_data(source, destination, fill, override):
    if not (fill or override):
        return
    from sefaria.model.user_profile import sanitize_bio

    def combine(existing, incoming):
        # Missing nested preferences can be filled without replacing unrelated
        # destination preferences. False and zero are real choices, not blanks.
        result = deepcopy(existing)
        for key, value in incoming.items():
            if isinstance(result.get(key), dict) and isinstance(value, dict):
                result[key] = combine(result[key], value)
            elif override or key not in result or result[key] in (None, "", []):
                result[key] = deepcopy(value)
        return result

    updates = {key: deepcopy(source[key]) for key in _MERGE_PROFILE_FIELDS
               if key in source and (override or destination.get(key) in (None, "", []))}
    if "bio" in updates:
        updates["bio"] = sanitize_bio(updates["bio"] or "")
    for field in ("settings", "version_preferences_by_corpus"):
        incoming = source.get(field, {})
        if field == "settings":
            incoming = {key: incoming[key] for key in _MERGE_READING_SETTINGS if key in incoming}
        combined = combine(destination.get(field, {}), incoming)
        if combined != destination.get(field, {}):
            updates[field] = combined
            if field == "settings":
                updates["attr_time_stamps.settings"] = time.time()
    for field in ("pinned_sheets", "tag_order"):
        combined = list(destination.get(field) or [])
        for value in source.get(field) or []:
            if value not in combined:
                combined.append(value)
        if combined != (destination.get(field) or []):
            updates[field] = combined
    if updates:
        # A field-level write preserves unknown destination fields too. Calling
        # update_empty()/save() here can schedule history deletion from source
        # settings, even when the destination privacy setting does not change.
        result = db.profiles.update_one({"_id": destination["_id"], "id": destination["id"]},
                                        {"$set": updates})
        if result.matched_count != 1:
            raise RuntimeError("The destination profile disappeared during the merge.")


def _merge_collections(from_uid, into_uid):
    # MongoDB groups are sheet collections, not Django permission groups. Replace
    # each role list in one write, remove duplicates, and keep admin over member.
    query = {"$or": [{role: {"$in": [from_uid, into_uid]}}
                     for role in ("admins", "members", "publishers")]}
    for group in db.groups.find(query, {"admins": 1, "members": 1, "publishers": 1}):
        roles = {role: list(dict.fromkeys(into_uid if uid == from_uid else uid for uid in group[role]))
                 for role in ("admins", "members", "publishers") if role in group}
        if into_uid in roles.get("admins", []) and into_uid in roles.get("members", []):
            roles["members"].remove(into_uid)
        db.groups.update_one({"_id": group["_id"]}, {"$set": roles})


def _merge_relationships(collection, left, right, from_uid, into_uid):
    relationships = db[collection]
    for field in (left, right):
        relationships.update_many({field: from_uid}, {"$set": {field: into_uid}})
    relationships.delete_many({left: into_uid, right: into_uid})
    # Keep the oldest copy of each edge, including its original relationship date.
    seen = set()
    for edge in relationships.find({"$or": [{left: into_uid}, {right: into_uid}]}).sort("_id", 1):
        key = (edge[left], edge[right])
        if key in seen:
            relationships.delete_one({"_id": edge["_id"]})
        seen.add(key)


def _merge_history(from_uid, into_uid):
    records = list(db.user_history.find({"uid": {"$in": [from_uid, into_uid]}}))
    bookmarks, last_places = defaultdict(list), defaultdict(list)
    for record in records:
        if record.get("saved") or record.get("delete_saved"):
            key = (record.get("ref"), json.dumps(record.get("versions", {}), sort_keys=True),
                   record.get("secondary", False))
            bookmarks[key].append(record)
        if record.get("last_place"):
            last_places[record.get("book")].append(record)

    now = time.time()
    db.user_history.update_many({"uid": from_uid}, {"$set": {"uid": into_uid, "server_time_stamp": now}})
    # Keep reading events, including repeat visits. Only competing bookmark states
    # and last-place flags need reconciliation. Use timestamps from BEFORE transfer;
    # fresh sync timestamps would otherwise make every source choice look newer.
    for candidates in bookmarks.values():
        if len(candidates) < 2:
            continue
        winner = max(candidates, key=lambda r: (r.get("server_time_stamp", 0), r["uid"] == into_uid,
                                                 str(r["_id"])))
        for record in candidates:
            if record["_id"] != winner["_id"]:
                db.user_history.update_one({"_id": record["_id"]}, {"$set": {
                    "saved": False, "delete_saved": False, "server_time_stamp": now}})
        db.user_history.update_one({"_id": winner["_id"]}, {"$set": {"server_time_stamp": now}})
    for candidates in last_places.values():
        if len(candidates) < 2:
            continue
        winner = max(candidates, key=lambda r: (r.get("time_stamp", 0), r["uid"] == into_uid,
                                                 str(r["_id"])))
        for record in candidates:
            if record["_id"] != winner["_id"]:
                db.user_history.update_one({"_id": record["_id"]}, {"$set": {
                    "last_place": False, "server_time_stamp": now}})


def _source_attribution_sheets(from_uid):
    # Legacy sheet sources can nest arbitrarily. Inspect nested sheets as well as
    # direct matches rather than assuming only one fixed subsources depth exists.
    return db.sheets.find({"$or": [{"sources.addedBy": from_uid},
                                    {"sources.subsources": {"$exists": True}}]}, {"sources": 1, "id": 1})


def _rewrite_source_authors(sources, from_uid, into_uid):
    changed = False
    for source in _iter_sheet_sources(sources):
        if source.get("addedBy") == from_uid:
            source["addedBy"] = into_uid
            source.pop("userLink", None)
            changed = True
    return changed


def _iter_sheet_sources(sources):
    """Visit every source, including sources nested inside legacy sheet sources."""
    for source in sources:
        yield source
        yield from _iter_sheet_sources(source.get("subsources", []))


def _merge_sheets(from_uid, into_uid):
    changed = set()
    for field, stale_fields in (
        ("owner", ("ownerName", "ownerImageUrl", "ownerProfileUrl", "ownerOrganization")),
        ("assigner_id", ("assignerName",)),
        ("viaOwner", ("viaOwnerName", "viaOwnerProfileUrl")),
    ):
        changed.update(db.sheets.distinct("id", {field: from_uid}))
        db.sheets.update_many({field: from_uid}, {"$set": {field: into_uid},
                                                "$unset": {key: "" for key in stale_fields}})
    db.sheets.update_many({"likes": from_uid}, {"$addToSet": {"likes": into_uid}})
    db.sheets.update_many({"likes": from_uid}, {"$pull": {"likes": from_uid}})
    for sheet in _source_attribution_sheets(from_uid):
        if _rewrite_source_authors(sheet["sources"], from_uid, into_uid):
            db.sheets.update_one({"_id": sheet["_id"]}, {"$set": {"sources": sheet["sources"]}})
            changed.add(sheet["id"])
    return changed


def _verify_merge_transfers(from_uid):
    references = _MERGE_REFERENCES + (
        ("user_history", "uid"), ("sheets", "owner"), ("sheets", "assigner_id"),
        ("sheets", "viaOwner"), ("sheets", "likes"), ("apikeys", "uid"),
        ("groups", "admins"), ("groups", "members"), ("groups", "publishers"),
        ("following", "follower"), ("following", "followee"),
        ("blocking", "blocker"), ("blocking", "blockee"),
    )
    for collection, field in references:
        if db[collection].find_one({field: from_uid}, {"_id": 1}):
            raise RuntimeError("Source reference remains in %s.%s; source was not deleted." % (collection, field))
    for sheet in _source_attribution_sheets(from_uid):
        if any(source.get("addedBy") == from_uid for source in _iter_sheet_sources(sheet["sources"])):
            raise RuntimeError("Source attribution remains on sheet %s; source was not deleted." % sheet["id"])


def _refresh_merge_caches(from_uid, into_uid):
    try:
        from sefaria.system.cache import invalidate_user_profile_cache
        from sefaria.system.multiserver.coordinator import server_coordinator
        invalidate_user_profile_cache([from_uid, into_uid])
        if server_coordinator:
            server_coordinator.publish_event("scache", "invalidate_user_profile_cache", [[from_uid, into_uid]])
    except Exception:
        logger.exception("Account merge cache refresh failed", from_uid=from_uid, into_uid=into_uid)
        print("Profile caches could not be refreshed; refresh them before checking the merged account.")


def _review_merged_crm_account(from_user, source, destination):
    # Keep the survivor's CRM identity and donor state. Marking the source for
    # review is not a CRM merge, and must never mark a shared survivor record.
    field = {"SALESFORCE": "sf_app_user_id", "NATIONBUILDER": "nationbuilder_id"}.get(settings.CRM_TYPE)
    if not field or not source.get(field) or source[field] == destination.get(field):
        return
    try:
        if CrmMediator().mark_for_review_in_crm(profile=from_user):
            return
    except Exception:
        logger.exception("Merged source CRM review failed", from_uid=source["id"], into_uid=destination["id"])
    logger.error("Account merged; source CRM record needs manual review", crm_id=source[field],
                 from_uid=source["id"], into_uid=destination["id"])
    print("Account merged; source CRM record %s needs manual review." % source[field])


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


