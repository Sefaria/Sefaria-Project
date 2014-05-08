# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import pymongo
import os
import locale
import datetime
path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")
from sefaria.settings import *
from sefaria.counts import count_words_in_texts
from sefaria.sheets import LISTED_SHEETS

connection = pymongo.Connection(MONGO_HOST)
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

he     = count_words_in_texts(db.texts.find({"language": "he"}))
trans  = count_words_in_texts(db.texts.find({"language": {"$ne": "he"}}))
sct    = count_words_in_texts(db.texts.find({"versionTitle": "Sefaria Community Translation"}))

# Number of Contributors
contributors = set(db.history.distinct("user"))
contributors = contributors.union(set(db.sheets.find({"status": {"$in": LISTED_SHEETS}}).distinct("owner")))
contributors = len(contributors)

# Number of Links
links = db.links.count()

# Number of Source sheets
sheets = db.sheets.count()

metrics = {
	"timestamp": datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0),
	"heWords": he,
	"transWords": trans,
	"sctWords": sct,
	"contributors": contributors,
	"links": links,
	"sheets": sheets,
}

db.metrics.save(metrics)