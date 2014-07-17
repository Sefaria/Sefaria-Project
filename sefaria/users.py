"""
users.py - dealing with Sefaria users, user settings and  profile information

Writes to MongoDB Collection: profiles
"""
from pprint import pprint

from database import db
from following import FollowersSet, FolloweesSet

class UserProfile(object):
	def __init__(self, id):
		self._id          = None # Mongo ID of profile doc
		self.id           = id   # user ID
 		self.position     = ""
		self.organization = ""
		self.bio          = ""
		self.imageURL     = ""
		self.website      = ""
		self.location     = ""
		self.email        = ""
		self.facebook     = ""
		self.twitter      = ""

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
		d = self.to_DICT()
		if self._id:
			d["_id"] = self._id
		db.profiles.save(d)
		return self

	def follows(self, uid):
		"""Returns true if this user follows uid"""
		return uid in self.followees.uids

	def followed_by(self, uid):
		"""Returns true if this user is followed by uid"""
		return uid in self.followers.uids

	def to_DICT(self):
		"""Return a json serializble dictionary this profile"""
		d = {
			"id":           self.id,
			"position":     self.position,
			"organization": self.organization,
			"bio":          self.bio,
			"imageURL":     self.imageURL,
			"website":      self.website,
			"location":     self.location,
			"email":        self.email,
			"facebook":     self.facebook,
			"twitter":      self.twitter,		
			"settings":     self.settings,
		}
		return d 

	def to_JSON(self):
		return json.dumps(self.to_DICT)