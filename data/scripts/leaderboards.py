# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import os
import pymongo
from bson.code import Code
from datetime import datetime, date, timedelta

path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from sefaria.settings import *
from sefaria.history import make_leaderboard

connection = pymongo.Connection(MONGO_HOST)
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

def update_top_contributors(days=None):
	"""
	Calculate leaderboard scores for the past days, or all time if days is None.
	Store in a collection named for the length of time.
	Remove old scores.
	"""

	if days:
		cutoff = datetime.now() - timedelta(days)
		condition = { "date": { "$gt": cutoff }, "method": {"$ne": "API"} }
		collection = "leaders_%d" % days
	else:
		cutoff = None
		condition = { "method": {"$ne": "API"} }
		collection = "leaders_alltime"

	leaders = make_leaderboard(condition)

	oldtime = datetime.now()

	for l in leaders:
		doc = {"_id": l["user"], "count": l["count"], "date": datetime.now()}
		db[collection].save(doc)
	
	if cutoff:	
		db[collection].remove({"date": {"$lt": oldtime }})

update_top_contributors()
update_top_contributors(1)
update_top_contributors(7)
update_top_contributors(30)