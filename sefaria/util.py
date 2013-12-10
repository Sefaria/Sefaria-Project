import os

# To allow these files to be run from command line
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

import hashlib
from HTMLParser import HTMLParser

from django.http import HttpResponse
from django.utils import simplejson as json
from django.contrib.auth.models import User
from django.core.cache import cache

import mailchimp
from local_settings import MAILCHIMP, MAILCHIMP_ANNOUNCE_ID


def jsonResponse(data, callback=None, status=200):
	if callback:
		return jsonpResponse(data, callback, status)
	if "_id" in data:
		data["_id"] = str(data["_id"])
	return HttpResponse(json.dumps(data), mimetype="application/json", status=status)


def jsonpResponse(data, callback, status=200):
	if "_id" in data:
		data["_id"] = str(data["_id"])
	return HttpResponse("%s(%s)" % (callback, json.dumps(data)), mimetype="application/javascript", status=status)


def delete_template_cache(fragment_name='', *args):
    cache.delete('template.cache.%s.%s' % (fragment_name, hashlib.md5(u':'.join([arg for arg in args])).hexdigest()))


def user_link(uid):
	try:
		uid = int(uid)
		user = User.objects.get(id=uid)
		name = user.first_name + " " + user.last_name
		url = '/contributors/' + user._username
	except:
		name = "Someone"
		url = "#"

	link = "<a href='" + url + "'>" + name + "</a>"
	return link


def subscribe_to_announce(email, first_name=None, last_name=None):
	"""
	Subscribes an email address to the Announce Mailchimp list
	"""
	if not MAILCHIMP:
		return

	mlist = mailchimp.utils.get_connection().get_list_by_id(MAILCHIMP_ANNOUNCE_ID)
	return mlist.subscribe(email, {'EMAIL': email, 'FNAME': first_name, 'LNAME': last_name}, email_type='html')


class MLStripper(HTMLParser):
    def __init__(self):
        self.reset()
        self.fed = []
    def handle_data(self, d):
        self.fed.append(d)
    def get_data(self):
        return ''.join(self.fed)

def strip_tags(html):
    s = MLStripper()
    s.feed(html)
    return s.get_data()


def td_format(td_object):
	"""
	Turn a timedelta object into a nicely formatted string.
	"""
        seconds = int(td_object.total_seconds())
        periods = [
                ('year',        60*60*24*365),
                ('month',       60*60*24*30),
                ('day',         60*60*24),
                ('hour',        60*60),
                ('minute',      60),
                ('second',      1)
                ]

        strings=[]
        for period_name,period_seconds in periods:
                if seconds > period_seconds:
                        period_value , seconds = divmod(seconds,period_seconds)
                        if period_value == 1:
                                strings.append("%s %s" % (period_value, period_name))
                        else:
                                strings.append("%s %ss" % (period_value, period_name))

        return ", ".join(strings)