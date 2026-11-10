"""
user.py - helper functions related to users

Uses MongoDB collections: apikeys, sheets, notes, profiles, notifications, user_deletions
"""

from datetime import datetime

import structlog
from django.contrib.auth.models import User
from pymongo import ReturnDocument

import sefaria.model as model
from sefaria.helper.crm.crm_mediator import CrmMediator
from sefaria.system.database import db

logger = structlog.get_logger(__name__)


def delete_user_account(uid, confirm=True):
    """Deletes the account of `uid` as well as all owned data
    Returns True if user is successfully deleted from Mongo & User DB

    Safe to run more than once for the same uid. It runs as a Celery task
    (sefaria.helper.users.tasks), which can be delivered twice, and admins have
    re-submitted deletions that looked stuck. The Django User row is deleted
    last, so if it is gone every earlier step already finished; if it is still
    there, every step is re-run, and each one is a no-op for data already removed.

    The one step whose input a re-run cannot rebuild is search cleanup: once the
    sheets are deleted from Mongo, their ids are gone. So the ids are saved in
    db.user_deletions before the sheets are deleted, and a re-run queues every
    id saved there. That record is removed after the User row.
    """
    if not uid:
        # Every query below filters on this id. With None, delete_many({"owner": None})
        # would match every sheet and note that has no owner. Fail before any step runs.
        raise ValueError(f"delete_user_account needs a user id, got {uid!r}")
    if not User.objects.filter(id=uid).exists():
        # Checked before UserProfile(), which falls back to placeholder values
        # (email "test@sefaria.org") when the User row is missing, so the CRM step
        # would act on the wrong contact.
        logger.info("delete_user_account: user already deleted", uid=uid)
        return True
    user = model.UserProfile(id=uid)
    if confirm:
        print("Are you sure you want to delete the account of '%s' (%s)?" % (user.full_name, user.email))
        if input("Type 'DELETE' to confirm: ") != "DELETE":
            print("Canceled.")
            return None

    try:
        crm_mediator = CrmMediator()
        if not crm_mediator.mark_for_review_in_crm(profile=user):
            logger.error("Failed to mark user for review in CRM")
    except Exception:
        logger.error("Failed to mark user for review in CRM")

    # Delete user's reading history
    user.delete_user_history(exclude_saved=False, exclude_last_place=False)
    # Delete Sheets, and queue their removal from search (web pods cannot write to ES).
    # Save the ids first: after delete_many a re-run could no longer find them.
    owned_sheet_ids = db.sheets.find({"owner": uid}, {"id": 1}).distinct("id")
    deletion_record = db.user_deletions.find_one_and_update(
        {"uid": uid},
        {"$addToSet": {"sheet_ids": {"$each": owned_sheet_ids}}, "$setOnInsert": {"started": datetime.utcnow()}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    db.sheets.delete_many({"owner": uid})
    from sefaria.settings import SEARCH_INDEX_ON_SAVE

    if SEARCH_INDEX_ON_SAVE:
        from sefaria.search import queue_sheets_sync

        # Not caught: a failure here must stop the deletion before the User row goes,
        # so the task retries and queues the saved ids again.
        queue_sheets_sync(deletion_record.get("sheet_ids", []))
    # Delete Notes
    db.notes.delete_many({"owner": uid})
    # Delete Notifcations
    db.notifications.delete_many({"uid": uid})
    # Delete Following Relationships
    db.following.delete_many({"follower": uid})
    db.following.delete_many({"followee": uid})
    # Delete Sheet Likes
    db.sheets.update_many({"likes": uid}, {"$pull": {"likes": uid}})
    # Delete Profile (delete_many: some ids have more than one profile document)
    db.profiles.delete_many({"id": uid})
    # Delete User Object
    User.objects.filter(id=uid).delete()
    # Only after the User row: while it exists, a re-run still needs the saved sheet ids.
    db.user_deletions.delete_one({"uid": uid})

    # History is left for posterity, but will no longer be tied to a user profile

    print("User %d deleted." % uid)
    return True


def merge_user_accounts(from_uid, into_uid, fill_in_profile_data=True, override_profile_data=False):
    """Moves all content of `from_uid` into `into_uid` then deletes `from_uid`"""
    from_user = model.UserProfile(id=from_uid)
    if not from_user._id:
        print("Source user %d does not have a profile." % from_uid)
        return

    into_user = model.UserProfile(id=into_uid)
    if not into_user._id:
        print("Destination user %d does not have a profile." % into_uid)
        return

    print(
        "Are you sure you want to merge the account of '%s' (%s) into the account of of '%s' (%s)"
        % (from_user.full_name, from_user.email, into_user.full_name, into_user.email)
    )
    if input("Type 'MERGE' to confirm: ") != "MERGE":
        print("Canceled.")
        return

    # Move user reading history
    db.user_history.update_many({"uid": from_uid}, {"$set": {"uid": into_uid}})
    # Move group admins
    db.groups.update({"admins": from_uid}, {"$set": {"admins.$": into_uid}})
    # Move group members
    db.groups.update({"members": from_uid}, {"$set": {"members.$": into_uid}})
    # Move Sheets
    db.sheets.update_many({"owner": from_uid}, {"$set": {"owner": into_uid}})
    # Move Notes
    db.notes.update_many({"owner": from_uid}, {"$set": {"owner": into_uid}})
    # Move Notifcations
    db.notifications.update_many({"uid": from_uid}, {"$set": {"uid": into_uid}})
    # Move Following Relationships
    db.following.update_many({"follower": from_uid}, {"$set": {"follower": into_uid}})
    db.following.update_many({"followee": from_uid}, {"$set": {"followee": into_uid}})
    # Delete Sheet Likes
    db.sheets.update_many({"likes": from_uid}, {"$addToSet": {"likes": into_uid}})
    db.sheets.update_many({"likes": from_uid}, {"$pull": {"likes": from_uid}})
    # Move History
    db.history.update_many({"user": from_uid}, {"$set": {"user": into_uid}})

    print("Content from %s moved into %s's account." % (from_user.email, into_user.email))
    if override_profile_data:
        into_user.update(from_user.to_mongo_dict())
        into_user.save()
    elif fill_in_profile_data:
        into_user.update_empty(from_user.to_mongo_dict())
        into_user.save()

    delete_user_account(from_uid, confirm=False)


def generate_api_key(uid):
    """Save a new random API key for `uid`"""
    user = model.UserProfile(id=uid)
    if not user._id:
        print("User %d does not exist." % uid)
        return

    import base64
    import hashlib
    import random

    key = (
        base64.b64encode(
            hashlib.sha256(bytes(str(random.getrandbits(256)), encoding="utf-8")).digest(),
            random.choice([b"rA", b"aZ", b"gQ", b"hH", b"hG", b"aR", b"DD"]),
        )
        .rstrip(b"==")
        .decode("utf-8")
    )
    db.apikeys.delete_many({"uid": uid})
    db.apikeys.insert_one({"uid": uid, "key": key})

    print("API Key for %s (uid: %d, email: %s): %s" % (user.full_name, uid, user.email, key))


def reset_all_api_keys():
    """Updates all existing API keys with new random values"""
    keys = db.apikeys.find()
    for key in keys:
        generate_api_key(key["uid"])
