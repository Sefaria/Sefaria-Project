# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import pymongo
import os
import locale
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from sefaria.settings import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


def count_texts(curr, msg):
	"""
	Counts all the words of texts in curr, 
	prints total with msg
	"""
	n = curr.count()
	total = sum([count_words(t["chapter"]) for t in curr ])
	total = "{:,d}".format(total)
	print "%s: %s - in %d texts" % (msg, total, n)


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


count_texts(db.texts.find({"language": "he"}), "Total Words in Hebrew")

count_texts(db.texts.find({"language": {"$ne": "he"}}), "Total Words in Translation")

count_texts(db.texts.find({"versionTitle": "Sefaria Community Translation"}), "Total Words Translated on Sefaria")

# Number of Contributors
contributors = set(db.history.distinct("user"))
contributors = contributors.union(set(db.sheets.find({"status": 3}).distinct("owner")))
print "Number of Contributors: %d" % len(contributors)

# Number of Links
links = db.links.count()
print "Number of Textual Links: %d" % links

# Number of Source sheets
sheets = db.sheets.count()
print "Number of Source Sheets: %d" % sheets
