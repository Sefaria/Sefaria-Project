"""
users.py - dealing with Sefaria users and user settings

Writes to MongoDB Collection: profiles
"""
import sys
from sefaria.system.database import db

if not hasattr(sys, '_doc_build'):
	from django.contrib.auth.models import User


def user_name(uid):
	"""Returns a string of a user's full name"""
	try:
		uid  = int(uid)
		user = User.objects.get(id=uid)
		name = user.first_name + " " + user.last_name
		name = "Anonymous" if name == " " else name
	except:
		# Don't choke on unknown users, just leave a placeholder
		# (so that testing on history can happen without needing the user DB)
		name = "User {}".format(uid)
	return name


# Simple Cache for user links
user_links = {}
def user_link(uid):
	"""Returns a string with an <a> tag linking to a users profile"""
	if uid in user_links:
		return user_links[uid]
	
	name    = user_name(uid)
	profile = db.profiles.find_one({"id": uid})
	slug    = profile.get("slug", None) if profile else None
	url     = "/profile/" + slug if slug else "#"

	link = "<a href='" + url + "' class='userLink'>" + name + "</a>"
	user_links[uid] = link
	return link


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
