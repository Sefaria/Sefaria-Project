"""
users.py - dealing with Sefaria users, user settings and  profile information

Writes to MongoDB Collection: profiles
"""
from pprint import pprint
from sefaria.system.database import db


class UserProfile(object):
	def __init__(self, id):
		self.id           = id
 		self.position     = ""
		self.organization = ""
		self.bio          = ""
		self.settings     =  {
			"email_notifications": "daily",
		}
		profile = db.profiles.find_one({"id": id})
		if profile:
			self.update(profile)

	def update(self, obj):
		self.__dict__.update(obj)
		return self

	def save(self):
		db.profiles.save(vars(self))
		return self

