import hashlib
import urllib
import re
import bleach
import sys
from random import randint

if not hasattr(sys, '_doc_build'):
	from django.contrib.auth.models import User
	from django.core.mail import EmailMultiAlternatives
	from django.template.loader import render_to_string
	from django.core.validators import URLValidator, EmailValidator
	from django.core.exceptions import ValidationError
	from anymail.exceptions import AnymailRecipientsRefused

from . import abstract as abst
from sefaria.model.following import FollowersSet, FolloweesSet
from sefaria.system.database import db
from django.utils import translation


class UserHistory(abst.AbstractMongoRecord):
	collection = 'user_history'

	required_attrs = [
		"uid",  # user id
		"ref",
		"he_ref",
		"versions",
		"time_read",
		"time_stamp",
		"server_time_stamp"
	]

	optional_attrs = [
		"flags"
	]


class UserHistorySet(abst.AbstractMongoSet):
	recordClass = UserHistory


class UserProfile(object):
	def __init__(self, id=None, slug=None, email=None):

		if slug:  # Load profile by slug, if passed
			profile = db.profiles.find_one({"slug": slug})
			if profile:
				self.__init__(id=profile["id"])
				return

		try:
			if email and not id:  # Load profile by email, if passed.
				user = User.objects.get(email__iexact=email)
				id = user.id
			else:
				user = User.objects.get(id=id)
			self.first_name        = user.first_name
			self.last_name         = user.last_name
			self.email             = user.email
			self.date_joined       = user.date_joined
		except:
			# These default values allow profiles to function even
			# if the Django User records are missing (for testing)
			self.first_name        = "User"
			self.last_name         = str(id)
			self.email             = "test@sefaria.org"
			self.date_joined       = None

		self._id                   = None  # Mongo ID of profile doc
		self.id                    = id    # user ID
		self.slug                  = ""
		self.position              = ""
		self.organization          = ""
		self.jewish_education      = []
		self.bio                   = ""
		self.website               = ""
		self.location              = ""
		self.public_email          = ""
		self.youtube               = ""
		self.facebook              = ""
		self.twitter               = ""
		self.linkedin              = ""
		self.pinned_sheets         = []
		self.interrupting_messages = ["newUserWelcome"]
		self.partner_group        = ""
		self.partner_role         = ""

		self.settings     =  {
			"email_notifications": "daily",
			"interface_language": "english",
			"textual_custom" : "sephardi"
		}
		# dict that stores the last time an attr has been modified
		self.attr_time_stamps = {
			"settings": 0
		}

		self._name_updated      = False


		# Update with saved profile doc in MongoDB
		profile = db.profiles.find_one({"id": id})
		profile = self.migrateFromOldRecents(profile)
		if profile:
			self.update(profile)

		# Followers
		self.followers = FollowersSet(self.id)
		self.followees = FolloweesSet(self.id)

		# Gravatar
		default_image           = "https://www.sefaria.org/static/img/profile-default.png"
		gravatar_base           = "https://www.gravatar.com/avatar/" + hashlib.md5(self.email.lower()).hexdigest() + "?"
		self.gravatar_url       = gravatar_base + urllib.urlencode({'d':default_image, 's':str(250)})
		self.gravatar_url_small = gravatar_base + urllib.urlencode({'d':default_image, 's':str(80)})

	@property
	def full_name(self):
		return self.first_name + " " + self.last_name

	def _set_flags_on_update(self, obj):
		if "first_name" in obj or "last_name" in obj:
			if self.first_name != obj["first_name"] or self.last_name != obj["last_name"]:
				self._name_updated = True

	def migrateFromOldRecents(self, profile):
		"""
		migrate from recentlyViewed which is a flat list and only saves one item per book to readingHistory, which is a dict and saves all reading history
		"""
		if profile is None:
			profile = {}  # for testing, user doesn't need to exist
		if "recentlyViewed" in profile:
			import pytz
			from datetime import datetime
			from dateutil import parser
			# fun times with python datetime
			epoch = datetime.utcfromtimestamp(0).replace(tzinfo=pytz.UTC)
			# define total_seconds which exists in Python3
			total_seconds = lambda delta: delta.days * 86400 + delta.seconds + delta.microseconds / 1e6
			default_epoch_time = total_seconds(datetime(2011, 11, 20, tzinfo=pytz.UTC) - epoch)  # the Sefaria epoch. time since Brett's epic first commit
			user_history = [
				{
					"uid": self.id,
					"ref": r[0],
					"he_ref": r[1],
					"time_stamp": total_seconds(parser.parse(r[2]) - epoch) if r[2] is not None else default_epoch_time,
					"server_time_stamp": total_seconds(parser.parse(r[2]) - epoch) if r[2] is not None else default_epoch_time,
					"time_read": (r[3] if r[3] and isinstance(r[3], int) else 0) * randint(3 * 60, 5 * 60),  # we dont really know how long they've read this book. it's probably correlated with the number of times they opened the book. lets let Hashem decide
					"versions": {
						"en": r[4],
						"he": r[5]
					}
				} for r in profile['recentlyViewed']
			]
			for temp_uh in user_history:
				uh = UserHistory(temp_uh)
				uh.save()
			profile.pop('recentlyViewed', None)
			db.profiles.find_one_and_update({"id": self.id}, {"$unset": {"recentlyViewed": True}})
			self.save()
		return profile

	def update(self, obj):
		"""
		Update this object with the fields in dictionry 'obj'
		"""
		self._set_flags_on_update(obj)
		self.__dict__.update(obj)

		return self

	def update_empty(self, obj):
		self._set_flags_on_update(obj)
		for k, v in obj.items():
			if v:
				if k not in self.__dict__ or self.__dict__[k] == '' or self.__dict__[k] == []:
					self.__dict__[k] = v

	def save(self):
		"""
		Save profile to DB, updated Django User object if needed
		"""
		# Sanitize & Linkify fields that allow HTML
		self.bio = bleach.linkify(self.bio)

		d = self.to_DICT()
		if self._id:
			d["_id"] = self._id
		db.profiles.save(d)

		# store name changes on Django User object
		if self._name_updated:
			user = User.objects.get(id=self.id)
			user.first_name = self.first_name
			user.last_name  = self.last_name
			user.save()
			self._name_updated = False

		return self

	def errors(self):
		"""
		Returns a string with any validation errors,
		or None if the profile is valid.
		"""
		# Slug
		if re.search("[^a-z0-9\-]", self.slug):
			return "Profile URLs may only contain lowercase letters, numbers and hyphens."

		existing = db.profiles.find_one({"slug": self.slug, "_id": {"$ne": self._id}})
		if existing:
			return "The Profile URL you have requested is already in use."
		# URL Fields: website, facebook, linkedin
		url_val = URLValidator()
		try:
			if self.facebook: url_val(self.facebook)
		except ValidationError, e:
			return "The Facebook URL you entered is not valid."
		try:
			if self.linkedin: url_val(self.linkedin)
		except ValidationError, e:
			return "The LinkedIn URL you entered is not valid."
		try:
			if self.website: url_val(self.website)
		except ValidationError, e:
			return "The Website URL you entered is not valid."
		email_val = EmailValidator()
		try:
			if self.email: email_val(self.email)
		except ValidationError, e:
			return "The email address you entered is not valid."

		return None

	def exists(self):
		"""
		Returns True if this is a real existing user, not simply a mock profile.
		"""
		return bool(self.date_joined)

	def assign_slug(self):
		"""
		Set the slug according to the profile name,
		using the first available number at the end if duplicated exist
		"""
		slug = "%s-%s" % (self.first_name, self.last_name)
		slug = slug.lower()
		slug = slug.replace(" ", "-")
		slug = re.sub(r"[^a-z0-9\-]", "", slug)
		self.slug = slug
		dupe_count = 0
		while self.errors():
			dupe_count += 1
			self.slug = "%s%d" % (slug, dupe_count)

		return self

	def join_invited_groups(self):
		"""
		Add this user as a member of any group for which there is an outstanding invitation.
		"""
		from sefaria.model import GroupSet
		groups = GroupSet({"invitations.email": self.email})
		for group in groups:
			group.add_member(self.id)
			group.remove_invitation(self.email)

	def follows(self, uid):
		"""Returns true if this user follows uid"""
		return uid in self.followees.uids

	def followed_by(self, uid):
		"""Returns true if this user is followed by uid"""
		return uid in self.followers.uids

	def recent_notifications(self):
		from sefaria.model.notification import NotificationSet
		return NotificationSet().recent_for_user(self.id)

	def unread_notification_count(self):
		return unread_notifications_count_for_user(self.id)

	def interrupting_message(self):
		"""
		Returns the next message to interupt the user with, if any are queued up.
		"""
		messages = self.interrupting_messages
		return messages[0] if len(messages) > 0 else None

	def mark_interrupting_message_read(self, message):
		"""
		Removes `message` from the users list of queued interrupting_messages.
		"""
		if message in self.interrupting_messages:
			self.interrupting_messages.remove(message)
			self.save()

	def to_DICT(self):
		"""Return a json serializble dictionary this profile"""
		dictionary = {
			"id":                    self.id,
			"slug":                  self.slug,
			"position":              self.position,
			"organization":          self.organization,
			"jewish_education":      self.jewish_education,
			"bio":                   self.bio,
			"website":               self.website,
			"location":              self.location,
			"public_email":          self.public_email,
			"facebook":              self.facebook,
			"twitter":               self.twitter,
			"linkedin":              self.linkedin,
			"youtube":               self.youtube,
			"pinned_sheets":         self.pinned_sheets,
			"settings":              self.settings,
			"attr_time_stamps":      self.attr_time_stamps,
			"interrupting_messages": getattr(self, "interrupting_messages", []),
			"tag_order":             getattr(self, "tag_order", None),
			"partner_group":         self.partner_group,
			"partner_role":          self.partner_role
		}
		return dictionary

	def to_JSON(self):
		return json.dumps(self.to_DICT)


def email_unread_notifications(timeframe):
	"""
	Looks for all unread notifications and sends each user one email with a summary.
	Marks any sent notifications as "read".

	timeframe may be:
	* 'daily'  - only send to users who have the daily email setting
	* 'weekly' - only send to users who have the weekly email setting
	* 'all'    - send all notifications
	"""
	from sefaria.model.notification import NotificationSet

	users = db.notifications.find({"read": False, "is_global": False}).distinct("uid")

	for uid in users:
		profile = UserProfile(id=uid)
		if profile.settings["email_notifications"] != timeframe and timeframe != 'all':
			continue
		notifications = NotificationSet().unread_personal_for_user(uid)
		if notifications.count() == 0:
			continue
		try:
			user = User.objects.get(id=uid)
		except User.DoesNotExist:
			continue

		if "interface_language" in profile.settings:
			translation.activate(profile.settings["interface_language"][0:2])

		message_html  = render_to_string("email/notifications_email.html", {"notifications": notifications, "recipient": user.first_name})
		#message_text = util.strip_tags(message_html)
		actors_string = notifications.actors_string()
		# TODO Hebrew subjects
		if actors_string:
			verb      = "have" if " and " in actors_string else "has"
			subject   = "%s %s new activity on Sefaria" % (actors_string, verb)
		elif notifications.like_count() > 0:
			noun      = "likes" if notifications.like_count() > 1 else "like"
			subject   = "%d new %s on your Source Sheet" % (notifications.like_count(), noun)
		from_email    = "Sefaria <hello@sefaria.org>"
		to            = user.email

		msg = EmailMultiAlternatives(subject, message_html, from_email, [to])
		msg.content_subtype = "html"  # Main content is now text/html
		#msg.attach_alternative(message_text, "text/plain")
		try:
			msg.send()
			notifications.mark_read(via="email")
		except AnymailRecipientsRefused:
			print u'bad email address: {}'.format(to)

		if "interface_language" in profile.settings:
			translation.deactivate()


def unread_notifications_count_for_user(uid):
	"""Returns the number of unread notifications belonging to user uid"""
	# Check for globals to add...
	from sefaria.model.notification import NotificationSet
	return NotificationSet().unread_for_user(uid).count()


public_user_data_cache = {}
def public_user_data(uid):
	"""Returns a dictionary with common public data for `uid`"""
	if uid in public_user_data_cache:
		return public_user_data_cache[uid]

	profile = UserProfile(id=uid)
	try:
		user = User.objects.get(id=uid)
		is_staff = user.is_staff()
	except:
		is_staff = False

	data = {
		"name": profile.full_name,
		"profileUrl": "/profile/" + profile.slug,
		"imageUrl": profile.gravatar_url_small,
		"isStaff": is_staff,
		"uid": uid
	}
	public_user_data_cache[uid] = data
	return data


def user_name(uid):
	"""Returns a string of a user's full name"""
	data = public_user_data(uid)
	return data["name"]


def user_link(uid):
	"""Returns a string with an <a> tag linking to a users profile"""
	data = public_user_data(uid)
	link = "<a href='" + data["profileUrl"] + "' class='userLink'>" + data["name"] + "</a>"
	return link


def is_user_staff(uid):
	"""
	Returns True if the user with uid is staff.
	"""
	data = public_user_data(uid)
	try:
		uid  = int(uid)
		user = User.objects.get(id=uid)
		return user.is_staff
	except:
		return False


def user_started_text(uid, title):
	"""
	Returns true if uid was responsible for first adding 'title'
	to the library.

	This checks for the oldest matching index change record for 'title'.
	If someone other than the initiator changed the text's title, this function
	will incorrectly report False, but this matches our intended behavior to
	lock name changes after an admin has stepped in.
	"""
	log = db.history.find({"title": title}).sort([["date", -1]]).limit(1)
	if log.count():
		return log[0]["user"] == uid
	return False



def annotate_user_list(uids):
	"""
	Returns a list of dictionaries giving details (names, profile links)
	for the user ids list in uids.
	"""
	annotated_list = []
	for uid in uids:
		data = public_user_data(uid)
		annotated = {
			"userLink": user_link(uid),
			"imageUrl": data["imageUrl"]
		}
		annotated_list.append(annotated)

	return annotated_list
