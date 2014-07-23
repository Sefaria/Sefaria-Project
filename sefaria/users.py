"""
users.py - dealing with Sefaria users, user settings and  profile information

Writes to MongoDB Collection: profiles
"""

import urllib
import hashlib

from django.contrib.auth.models import User

from sefaria.system.database import db
from following import FollowersSet, FolloweesSet


class UserProfile(object):
	def __init__(self, id):

		user = User.objects.get(id=id)

		self.first_name         = user.first_name
		self.last_name          = user.last_name
		self.email              = user.email

		self._id                = None # Mongo ID of profile doc
		self.id                 = id   # user ID
 		self.position           = ""
		self.organization       = ""
		self.bio                = ""
		self.website            = ""
		self.location           = ""
		self.public_email       = ""
		self.facebook           = ""
		self.twitter            = ""
		self.settings     =  {
			"email_notifications": "daily",
		}

		profile = db.profiles.find_one({"id": id})
		if profile:
			self.update(profile)

		# Followers
		self.followers = FollowersSet(self.id)
		self.followees = FolloweesSet(self.id)

		# Gravatar
		default_image           = "http://inclusiveinnovationhub.org/assets/avatars/missing_large.png" # "http://www.sefaria.org/static/img/profile-default.png"
		gravatar_base           = "http://www.gravatar.com/avatar/" + hashlib.md5(user.email.lower()).hexdigest() + "?"
		self.gravatar_url       = gravatar_base + urllib.urlencode({'d':default_image, 's':str(250)})
		self.gravatar_url_small = gravatar_base + urllib.urlencode({'d':default_image, 's':str(80)})


	def update(self, obj):
		"""
		Update this object with the fields in dictionry 'obj'
		"""
		if "first_name" in obj or "last_name" in obj:
			if self.first_name != obj["first_name"] or self.last_name != obj["last_name"]:
				self._name_updated = True

		self.__dict__.update(obj)

		return self

	def save(self):
		d = self.to_DICT()
		if self._id:
			d["_id"] = self._id
		db.profiles.save(d)

		if self._name_updated:
			user = User.objects.get(id=self.id)
			user.first_name = self.first_name
			user.last_name  = self.last_name
			user.save()
			self._name_updated = False

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
			"website":      self.website,
			"location":     self.location,
			"public_email": self.public_email,
			"facebook":     self.facebook,
			"twitter":      self.twitter,		
			"settings":     self.settings,
		}
		return d 

	def to_JSON(self):
		return json.dumps(self.to_DICT)


# Simple Cache for user links
user_links = {}
def user_link(uid):
	"""Returns a string with an <a> tag linking to a users profile"""
	if uid in user_links:
		return user_links[uid]
	try:
		uid  = int(uid)
		user = User.objects.get(id=uid)
		name = user.first_name + " " + user.last_name
		name = "Anonymous" if name == " " else name
		url  = '/profile/' + user._username
	except:
		# Don't choke on unknown users, just leave a placeholder
		# (so that testing on history can happen without needing the user DB)
		name = "User %d" % uid
		url  = "#"

	link = "<a href='" + url + "' class='userLink'>" + name + "</a>"
	user_links[uid] = link
	return link


def user_name(uid):
	"""Returns a string of a users full name"""
	try:
		uid  = int(uid)
		user = User.objects.get(id=uid)
		name = user.first_name + " " + user.last_name
		name = "Anonymous" if name == " " else name
	except:
		# Don't choke on unknown users, just leave a placeholder
		# (so that testing on history can happen without needing the user DB)
		name = "User %d" % uid
	return name


def annotate_user_list(uids):
	"""
	Returns a list of dictionaries giving details (names, profile links) for the user ids list in uids.
	"""
	annotated_list = []
	for uid in uids:
		annotated = {
			"userLink": user_link(uid),
			"imageUrl": users.UserProfile(uid).gravatar_url_small,
		}
		annotated_list.append(annotated)

	return annotated_list


def is_user_staff(uid):
	"""
	Returns True if the user with uid is staff.
	"""
	try:
		uid  = int(uid)
		user = User.objects.get(id=uid)
		return user.is_staff
	except:
		return False