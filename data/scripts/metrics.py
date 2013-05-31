# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import pymongo
import os
import locale
import datetime
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from sefaria.settings import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

def count_words_in_texts(curr):
	"""
	Counts all the words of texts in curr, 
	prints total with msg
	"""
	total = sum([count_words(t["chapter"]) for t in curr ])
	return total


def count_words(text):
	"""
	Counts the number of words in a jagged array whose terminals are strings.
	"""
	if isinstance(text, basestring):
		return len(text.split(" "))
	elif isinstance(text, list):
		return sum([count_words(i) for i in text])
	else:
		return 0


he     = count_words_in_texts(db.texts.find({"language": "he"}))
trans  = count_words_in_texts(db.texts.find({"language": {"$ne": "he"}}))
sct    = count_words_in_texts(db.texts.find({"versionTitle": "Sefaria Community Translation"}))

# Number of Contributors
contributors = set(db.history.distinct("user"))
contributors = contributors.union(set(db.sheets.find({"status": 3}).distinct("owner")))
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