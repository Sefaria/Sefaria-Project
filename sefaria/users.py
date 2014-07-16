"""
users.py - dealing with Sefaria users, user settings and  profile information

Writes to MongoDB Collection: profiles
"""
from pprint import pprint

from database import db
from following import FollowersSet, FolloweesSet

class UserProfile(object):
	def __init__(self, id):
		self.id           = id
 		self.position     = ""
		self.organization = ""
		self.bio          = ""
		self.settings     =  {
			"email_notifications": "daily",
		}

		self.followers = FollowersSet(self.id)
		self.followees = FolloweesSet(self.id)

		profile = db.profiles.find_one({"id": id})
		if profile:
			self.update(profile)

	def update(self, obj):
		self.__dict__.update(obj)
		return self

	def save(self):
		db.profiles.save({
			"id":           self.id,
			"position":     self.position,
			"organization": self.organization,
			"bio":          self.bio,
			"settings":     self.settings,
			})
		return self

	def follows(self, uid):
		"""Returns true if this user follows uid"""
		return uid in self.followees.uids

	def followed_by(self, uid):
		"""Returns true if this user is followed by uid"""
		return uid in self.followers.uids