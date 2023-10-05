"""
following.py - handle following relationships between users

Writes to MongoDB Collection: following
"""
from datetime import datetime

from sefaria.system.database import db
from sefaria.system.cache import django_cache

import structlog

logger = structlog.get_logger(__name__)


class FollowRelationship(object):
    def __init__(self, follower=None, followee=None):
        self.follower = follower
        self.followee = followee
        self.follow_date = datetime.now()

    def exists(self):
        return bool(db.following.find_one({"follower": self.follower, "followee": self.followee}))

    def follow(self):
        from sefaria.model.notification import Notification

        db.following.save(vars(self))

        # Notification for the Followee
        notification = Notification({"uid": self.followee})
        notification.make_follow(follower_id=self.follower)
        notification.save()

        return self

    def unfollow(self):
        db.following.remove({"follower": self.follower, "followee": self.followee})


class FollowSet(object):
    def __init__(self):
        self.uids = []
        return self

    @property
    def count(self):
        return len(self.uids)


class FollowersSet(FollowSet):
    def __init__(self, uid):
        self.uids = db.following.find({"followee": uid}).distinct("follower")


class FolloweesSet(FollowSet):
    def __init__(self, uid):
        self.uids = db.following.find({"follower": uid}).distinct("followee")


@django_cache(timeout=60 * 60 * 24)
def aggregate_profiles(lang="english", limit=None):
    match_stage = {"status": "public"} if lang == "english" else {"status": "public", "sheetLanguage": "hebrew"}
    pipeline = [
        {"$match": match_stage},  # get all the sheets matching the criteria
        {"$sortByCount": "$owner"}  # group them by owner and count how many each owner has
    ]

    if limit is not None:
        pipeline += [
            {"$match": {"count": {"$gte": limit}}}
            # limit to owners with 3 or more sheets ("count" field is a result of the previous stage) that matched the first match
        ]

    pipeline += [
        {"$lookup": {
            # perform a "left join", use the "_id" field from the last stage, which contains the user/owner id of sheets, to look up corresponding profile obj
            "from": "profiles",
            "localField": "_id",
            "foreignField": "id",
            "as": "user"}},
        {"$unwind": {
            # not sure this does anything, if there are accidental multiple user profiles for one user id, it unwinds them
            "path": "$user",
            "preserveNullAndEmptyArrays": True
        }}
    ]
    results = db.sheets.aggregate(pipeline)
    try:
        profiles = {r["user"]["id"]: r for r in results if "user" in r}
    except KeyError:
        logger.error("Encountered sheet owner with no profile record.  No users will be recommended for following.")
        profiles = {}
    return profiles


creators = None


def general_follow_recommendations(lang="english", n=4):
    """
    Recommend people to follow without any information about the person we're recommending for.
    """
    from random import choices
    from django.contrib.auth.models import User
    from sefaria.system.database import db

    global creators
    if not creators:
        creators = []
        profiles = aggregate_profiles(lang=lang, limit=3)
        user_records = User.objects.in_bulk(profiles.keys())
        creators = []
        for id, u in user_records.items():
            fullname = u.first_name + " " + u.last_name
            user = {
                "name": fullname,
                "url": "/profile/" + profiles[id]["user"]["slug"],
                "uid": id,
                "image": profiles[id]["user"]["profile_pic_url_small"],
                "organization": profiles[id]["user"]["organization"],
                "sheetCount": profiles[id]["count"],
            }
            creators.append(user)
        creators = sorted(creators, key=lambda x: -x["sheetCount"])

    top_creators = creators[:1300]
    recommendations = choices(top_creators, k=n) if len(top_creators) else []

    return recommendations
