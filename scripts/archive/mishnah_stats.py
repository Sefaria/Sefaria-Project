# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import pymongo
import os
import locale
from datetime import datetime
path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")
from sefaria.settings import *
from sefaria.counts import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)
	
print("Mishnah Translation Campaign Stats")
start = datetime(2013,6,19)

# percent complete
percent = get_percent_available("Mishna")
#StateNode("Mishna").get_percent_available("en") doesn't work yet - category state
print("%d percent complete" % percent)

# mishnayot remaining
remaining = get_untranslated_count_by_unit("Mishna", "Mishna")
print("Mishnayot remaing: %d" % remaining)

# mishnayot done since 6/19
translated = db.history.find({
	"rev_type": "add text",
	"version": "Sefaria Community Translation",
	"ref": {"$regex": "^Mishna"},
	"date": {"$gt": start}
	}).count()
copied = db.history.find({
	"rev_type": "add text",
	"version": {"$ne": "Sefaria Community Translation"},
	"ref": {"$regex": "^Mishna"},
	"date": {"$gt": start}
	}).count()
done = translated+copied

print("Mishnayot completed since campaign start: %d" % (done))

# translated
print("... original translations: %d" % translated)

# copied
print("... new copied texts: %d" % copied)

# participants
participants = len(db.history.find({
	"rev_type": "add text",
	"ref": {"$regex": "^Mishna"},
	"date": {"$gt": start},
	}).distinct("user"))

print("Number of participants: %d" % participants)

# average weekly velocity
days_elapsed = (datetime.now() - start).days
day_rate = (done / days_elapsed)
print("Average mishnayot per week: %d" % (day_rate * 7))

# time to complete
days_left = remaining / day_rate if day_rate > 0 else -1
print("Days to completion (given total velocity): %d" % days_left)


# weekly velocity (this week)

# weekly velocity (this month)