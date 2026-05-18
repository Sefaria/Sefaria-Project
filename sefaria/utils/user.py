"""
user.py - helper functions related to users

Uses MongoDB collections: apikeys, sheets, notes, profiles, notifications
"""
from django.contrib.auth.models import User
import structlog
from typing import Optional
from enum import Enum

import sefaria.model as model
from sefaria.system.database import db
from sefaria.helper.crm.crm_mediator import CrmMediator
from sefaria.helper.slack.send_message import send_message

logger = structlog.get_logger(__name__)


class DeletionType(Enum):
    """Enum for types of user account deletion"""
    SELF = "self"
    ADMIN = "admin"
    MANUAL = "manual"


def delete_user_account(
    uid: int,
    confirm: bool = True,
    deletion_type: DeletionType = DeletionType.MANUAL,
    admin_user: Optional[User] = None
) -> bool:
    """ Deletes the account of `uid` as well as all owned data
    Returns True if user is successfully deleted from Mongo & User DB

    Args:
        uid: User ID to delete
        confirm: Whether to prompt for confirmation
        deletion_type: Type of deletion - DeletionType enum (SELF, ADMIN, or MANUAL)
        admin_user: User object of admin performing deletion (for admin deletions)
    """
    user: model.UserProfile = model.UserProfile(id=uid)

    # Store user info for Slack notification before deletion
    user_email: str = user.email
    user_name: str = user.full_name or "No name given"

    # Get admin info upfront if this is an admin deletion
    admin_name: Optional[str] = None
    admin_email: Optional[str] = None
    if deletion_type == DeletionType.ADMIN and admin_user:
        admin_email = str(admin_user.email)
        try:
            admin_profile: model.UserProfile = model.UserProfile(id=admin_user.id)
            admin_name = admin_profile.full_name or "No name given"
        except Exception as e:
            # If profile lookup fails, we still have the email from admin_user
            logger.warning(f"Could not load admin profile for user {admin_user.id}: {e}")

    if confirm:
        print("Are you sure you want to delete the account of '%s' (%s)?" % (user.full_name, user.email))
        if input("Type 'DELETE' to confirm: ") != "DELETE":
            print("Canceled.")
            return False

    try:
        crm_mediator = CrmMediator()
        if not crm_mediator.mark_for_review_in_crm(profile=user):
            logger.error("Failed to mark user for review in CRM")
    except Exception as e:
        logger.error("Failed to mark user for review in CRM")

    # Delete user's reading history
    user.delete_user_history(exclude_saved=False, exclude_last_place=False)
    # Delete Sheets
    db.sheets.delete_many({"owner": uid})
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
    django_user: User = User.objects.get(id=uid)
    django_user.delete()
    
    # History is left for posterity, but will no longer be tied to a user profile

    # Send Slack notification about user deletion
    try:
        if deletion_type == DeletionType.ADMIN:
            if admin_name and admin_email:
                deletion_source: str = f"Admin deleted by {admin_name} ({admin_email})"
            elif admin_email:
                deletion_source: str = f"Admin deleted by {admin_email}"
            else:
                deletion_source: str = "Admin deleted (no admin user specified)"
        else:
            deletion_source: str = {
                DeletionType.SELF: "User self-deleted",
                DeletionType.MANUAL: "Manually deleted"
            }.get(deletion_type, "Deleted")

        success: bool = send_message(
            channel='#engineering-signal',
            username='Account Manager',
            pretext='User Account Deleted',
            text=f'{deletion_source}\nUser: {user_name} ({user_email})\nUser ID: {uid}',
            icon_emoji=':warning:'
        )
        if not success:
            logger.warning(f"Failed to send Slack notification for user deletion: {uid}")
    except Exception as e:
        logger.error(f"Error sending Slack notification for user deletion {uid}: {e}")

    print("User %d deleted." % uid)
    return True


def merge_user_accounts(from_uid, into_uid, fill_in_profile_data=True, override_profile_data=False):
    """ Moves all content of `from_uid` into `into_uid` then deletes `from_uid`"""
    from_user = model.UserProfile(id=from_uid)
    if not from_user._id:
        print("Source user %d does not have a profile." % from_uid)
        return

    into_user = model.UserProfile(id=into_uid)
    if not into_user._id:
        print("Destination user %d does not have a profile." % into_uid)
        return

    print("Are you sure you want to merge the account of '%s' (%s) into the account of of '%s' (%s)" % (from_user.full_name, from_user.email, into_user.full_name, into_user.email))
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
    db.sheets.update_many({"likes": from_uid}, { "$addToSet": { "likes": into_uid } })
    db.sheets.update_many({"likes": from_uid}, { "$pull": { "likes": from_uid } })
    # Move History
    db.history.update_many({"user": from_uid}, {"$set": {"user": into_uid}})

    print("Content from %s moved into %s's account." % (from_user.email, into_user.email))
    if override_profile_data:
        into_user.update(from_user.to_mongo_dict())
        into_user.save()
    elif fill_in_profile_data:
        into_user.update_empty(from_user.to_mongo_dict())
        into_user.save()

    delete_user_account(from_uid, confirm=False, deletion_type=DeletionType.MANUAL)


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


