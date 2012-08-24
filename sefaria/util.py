from django.http import HttpResponse
from django.utils import simplejson as json
from django.contrib.auth.models import User



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