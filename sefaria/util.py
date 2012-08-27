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


def decode_hebrew_numeral(h):
	"""
	Takes a string representing a Hebrew numeral and returns it integer value. 
	"""
	values = hebrew_numerals

	if h == values[15] or h == values[16]:
		return values[h]

	n = 0
	for c in h:
		n += values[h[c]]

	return n;
	

def encode_hebrew_numeral(n):
	"""
	Takes an integer and returns a string encoding it as a Hebrew numeral. 
	"""
	values = hebrew_numerals

	if n == 15 or n == 16:
		return values[n]
	
	heb = ""
	if n >= 100:
		hundreds = n - (n % 100)
		heb += values[hundreds]
		n -= hundreds
	if n >= 10:
		tens = n - (n % 10)
		heb += values[tens]
		n -= tens
	if n > 0:
		heb += values[n]
	
	return heb


hebrew_numerals = { 
	u"\u05D0": 1,
	u"\u05D1": 2,
	u"\u05D2": 3,
	u"\u05D3": 4,
	u"\u05D4": 5,
	u"\u05D5": 6,
	u"\u05D6": 7,
	u"\u05D7": 8,
	u"\u05D8": 9,
	u"\u05D9": 10,
	u"\u05D8\u05D5": 15,
	u"\u05D8\u05D6": 16,
	u"\u05DB": 20,
	u"\u05DC": 30,
	u"\u05DE": 40,
	u"\u05E0": 50,
	u"\u05E1": 60,
	u"\u05E2": 70,
	u"\u05E4": 80,
	u"\u05E6": 90,
	u"\u05E7": 100,
	u"\u05E8": 200,
	u"\u05E9": 300,
	u"\u05EA": 400,
	1: u"\u05D0",
	2: u"\u05D1",
	3: u"\u05D2",
	4: u"\u05D3",
	5: u"\u05D4",
	6: u"\u05D5",
	7: u"\u05D6",
	8: u"\u05D7",
	9: u"\u05D8",
	10: u"\u05D9",
	15: u"\u05D8\u05D5",
	16: u"\u05D8\u05D6",
	20: u"\u05DB",
	30: u"\u05DC",
	40: u"\u05DE",
	50: u"\u05E0",
	60: u"\u05E1",
	70: u"\u05E2",
	80: u"\u05E4",
	90: u"\u05E6",
	100: u"\u05E7",
	200: u"\u05E8",
	300: u"\u05E9",
	400: u"\u05EA"
}