"""
users.py - dealing with Sefaria users and user settings

Writes to MongoDB Collection: profiles
"""

from django.contrib.auth.models import User
from sefaria.system.database import db

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
		name = "User %d" % uid
	return name


# Simple Cache for user links
user_links = {}
def user_link(uid):
	"""Returns a string with an <a> tag linking to a users profile"""
	if uid in user_links:
		return user_links[uid]
	
	name = user_name(uid)
	profile = db.profiles.find_one({"id": uid})
	url = "/profile/" + profile["slug"] if profile else "#"

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