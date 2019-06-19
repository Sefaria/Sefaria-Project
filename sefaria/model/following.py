"""
following.py - handle following relationships between users

Writes to MongoDB Collection: following
"""
from datetime import datetime

from sefaria.system.database import db


class FollowRelationship(object):
	def __init__(self, follower=None, followee=None):
		self.follower = follower
		self.followee = followee
		self.follow_date = datetime.now()

	def exists(self):
		bool(db.following.find_one({"follower": self.follower, "followee": self.followee}))

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
		uids = []
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