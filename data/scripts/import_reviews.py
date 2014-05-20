# -*- coding: utf-8 -*-

import sys
import os
import pymongo
import csv
from pprint import pprint

from datetime import datetime, date, timedelta

path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from sefaria.database import db
from sefaria.reviews import validate_review
from sefaria.texts import get_text, get_version_list

filename = sys.argv[1]

if os.path.isdir(filename):
	files = [filename + "/" + f for f in os.listdir(filename)]
else:
	files = [filename]

reviewers = {
	"Anne Pettit": 6856,
	"Maya Rosen": 5878,
	"Ayelet Wenger": 5733,
	"Avi Garelick": 12,
	"Deborah Galaski": 7053,
	"Jeremy Markiz": 7263,
	"Adir Yalkut": 0,
}

version_langs = {
	"Wikisource Mishna": "he",
	"Sefaria Community Translation": "en",
	"Wikisource Tanach with Trope": "he",
	'Open Mishna': "en",
	'Eighteen Treatises from the Mishna': "en",
	'Mishna Sheviit : Chapter 7': "he",
	'Mishna Sheviit: Chapter 8': "he",
	'Mishna Yomit': "en",
	'Hyman Goldin 1913 Translation': "en",
	'Sefaria Translation': 'en',
}


for filename in files:
	with open(filename, 'rb') as csvfile:
		reviews = csv.reader(csvfile)
		header = reviews.next()
		for row in reviews:
			
			try:
				review = {
					"user":     reviewers[row[1]],
					"date":     datetime.strptime(row[0], "%m/%d/%Y").replace(hour=23, minute=59),
					"rev_type": "review",
					"score":    float(row[4]),
					"comment":  row[5],
					"ref":      row[2].strip(),
					"language": version_langs[row[3]],
					"version":  row[3],
				}
			except Exception, e:
				print "ERROR Importing: %s" % e
				continue

			valid = validate_review(review)
			if "error" in valid:
				print "ERROR Validating: %s" % valid["error"]
				continue

			text = get_text(review["ref"], context=1, commentary=False, version=review["version"], lang=review["language"])
			field = "text" if review["language"] == "en" else "he"
			if not text[field]:
				print "ERROR Matching: No text found for %s, %s" % (review["ref"], review["version"])
				versions = get_version_list(review["ref"])
				print "Versions: %s" % ", ".join([v["versionTitle"] for v in versions if v["language"] == review["language"]])

			db.history.save(review)