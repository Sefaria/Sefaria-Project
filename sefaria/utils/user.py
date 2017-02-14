"""
user.py - helper functions related to users

Uses MongoDB collections: apikeys, sheets, notes, profiles, notifications
"""
from django.contrib.auth.models import User

import sefaria.model as model
from sefaria.system.database import db


def delete_user_account(uid, confirm=True):
    """ Deletes the account of `uid` as well as all ownded data """
    user = model.UserProfile(id=uid)
    if confirm:
        print "Are you sure you want to delete the account of '%s' (%s)?" % (user.full_name, user.email)
        if raw_input("Type 'DELETE' to confirm: ") != "DELETE":
            print "Canceled."
            return

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
    user = User.objects.get(id=uid)
    user.delete()
    
    # History is left for posterity, but will no longer be tied to a user profile

    print "User %d deleted." % uid


def merge_user_accounts(from_uid, into_uid):
    """ Moves all content of `from_uid` into `into_uid` then deleted `from_uid`"""
    from_user = model.UserProfile(id=from_uid)
    if not from_user._id:
        print "Source user %d does not have a profile." % from_uid
        return

    into_user = model.UserProfile(id=into_uid)
    if not into_user._id:
        print "Destination user %d does not have a profile." % into_uid
        return

    print "Are you sure you want to merge the account of '%s' (%s) into the account of of '%s' (%s)" % (from_user.full_name, from_user.email, into_user.full_name, into_user.email)
    if raw_input("Type 'MERGE' to confirm: ") != "MERGE":
        print "Canceled."
        return
    
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

    print "Content from %s moved into %s's account." % (from_user.email, into_user.email)

    delete_user_account(from_uid, confirm=False)


def generate_api_key(uid):
    """ Save a new random API key for `uid` """
    user = model.UserProfile(id=uid)
    if not user._id:
        print "User %d does not exist." % uid
        return

    import base64, hashlib, random
    key = base64.b64encode(hashlib.sha256( str(random.getrandbits(256)) ).digest(), random.choice(['rA','aZ','gQ','hH','hG','aR','DD'])).rstrip('==')
    db.apikeys.remove({"uid": uid})
    db.apikeys.save({"uid": uid, "key": key})

    print "API Key for %s (uid: %d, email: %s): %s" % (user.full_name, uid, user.email, key)


def reset_all_api_keys():
    """ Updates all existing API keys with new random values """
    keys = db.apikeys.find()
    for key in keys:
        generate_api_key(key["uid"])


def markGroup(group_name, partner_group, partner_role, silent=True):
    # For users in specified group, update user profiles with given attributes
    users = User.objects.filter(groups__name=group_name)
    if len(users) == 0:
        print "Could not find any users in group {}".format(group_name)
        return
    for user in users:
        if not silent:
            print "Marking {} as {} {}".format(user.email, partner_role, partner_group)
        profile = model.UserProfile(id=user.id)
        profile.partner_group = partner_group
        profile.partner_role = partner_role
        profile.save()


def markEmailPattern(pattern, partner_group, partner_role, silent=True):
    # For all users with matching email, update user profiles with given attributes
    users = User.objects.filter(email__contains=pattern)
    if len(users) == 0:
        print "Could not find any users matching {}".format(pattern)
        return
    for user in users:
        if not silent:
            print "Marking {} as {} {}".format(user.email, partner_role, partner_group)
        profile = model.UserProfile(id=user.id)
        profile.partner_group = partner_group
        profile.partner_role = partner_role
        profile.save()


def markUserByEmail(email, partner_group, partner_role, silent=True):
    # For user with specified email, update user profile with given attributes
    profile = model.UserProfile(email=email)
    if not profile or profile.email != email:
        print "Can not find {} != {}".format(email, profile.email)
        return
    if not silent:
        print "Marking {} as {} {}".format(profile.email, partner_role, partner_group)
    profile.partner_group = partner_group
    profile.partner_role = partner_role
    profile.save()
