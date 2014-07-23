"""
users.py - dealing with Sefaria users and user settings

Writes to MongoDB Collection: profiles
"""

from django.contrib.auth.models import User

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