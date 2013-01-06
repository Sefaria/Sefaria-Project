import os

# To allow these files to be run from command line
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

from django.http import HttpResponse
from django.utils import simplejson as json
from django.contrib.auth.models import User
import mailchimp
from local_settings import MAILCHIMP, MAILCHIMP_ANNOUNCE_ID


def jsonResponse(data, callback=None, status=200):
	if "error" in data:
		status = 500
	if callback:
		return jsonpResponse(data, callback, status)
	if "_id" in data:
		data["_id"] = str(data["_id"])
	return HttpResponse(json.dumps(data), mimetype="application/json", status=status)


def jsonpResponse(data, callback, status=200):
	if "_id" in data:
		data["_id"] = str(data["_id"])
	return HttpResponse("%s(%s)" % (callback, json.dumps(data)), mimetype="application/javascript", status=status)


def user_link(uid):
	try:
		uid = int(uid)
		user = User.objects.get(id=uid)
		name = user.first_name + " " + user.last_name
		url = user._username
	except User.DoesNotExist:
		name = "Someone"
		url = "#"

	link = "<a href='/contributors/" + url + "'>" + name + "</a>"
	return link


def subscribe_to_announce(email, first_name=None, last_name=None):
	"""
	Subscribes an email address to the Announce Mailchimp list
	"""
	if not MAILCHIMP:
		return

        mlist = mailchimp.utils.get_connection().get_list_by_id(MAILCHIMP_ANNOUNCE_ID)
	return mlist.subscribe(email, {'EMAIL': email}, email_type='html')

