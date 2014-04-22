from datetime import date, datetime

from texts import db, url_ref

def daf_yomi(date):
	"""
	Returns the daf yomi for date
	"""

	date_str = date.strftime(" %m/ %d/%Y").replace(" 0", "").replace(" ", "")
	daf = db.dafyomi.find_one({"date": date_str})
	yom = {
		"name": daf["daf"],
		"url": url_ref(daf["daf"] + "a")
	}
	return yom


def this_weeks_parasha(datetime):
	"""
	Returns the upcoming Parasha for date. 
	"""

	p = db.parshiot.find({"date": {"$gt": datetime}}, limit=1).sort([("date", 1)])
	p = p.next()

	return p