"""
calendar.py - functions for looking up information relating texts to dates.

Uses MongoDB collections: dafyomi, parshiot
"""
import sefaria.model as model
from sefaria.system.database import db


def daf_yomi(date):
	"""
	Returns the daf yomi for date
	"""

	date_str = date.strftime(" %m/ %d/%Y").replace(" 0", "").replace(" ", "")
	daf = db.dafyomi.find_one({"date": date_str})
	yom = {
		"name": daf["daf"],
		"url": model.Ref(daf["daf"] + "a").url()
	}
	return yom


def this_weeks_parasha(datetime, diaspora=True):
	"""
	Returns the upcoming Parasha for datetime. 
	"""

	p = db.parshiot.find({"date": {"$gt": datetime}, "diaspora": {'$in': [diaspora, None]}}, limit=1).sort([("date", 1)])
	p = p.next()

	return p