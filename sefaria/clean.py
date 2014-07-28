"""
Small utilities for fixing problems that occur in the DB.
"""

import sys
import os
from pprint import pprint
from datetime import datetime, date, timedelta

from settings import *
from sefaria.utils.util import *
from sefaria.system.database import db
import texts
import sefaria.model.index as indx

def remove_refs_with_false():
	"""
	Removes any links and history records about links that contain False
	as one of the refs. 
	"""
	db.links.remove({"refs": False})
	db.history.remove({"new.refs": False})
	db.history.find({"new.refs": False})


def remove_old_counts():
	"""
	Deletes counts documents which no longer correspond to a text or category.
	"""
	counts = db.counts.find()
	for count in counts:
		if "title" in count:
			i = texts.parse_ref(count["title"])
			if "error" in i:
				print "Old text %s" % count['title']
				db.counts.remove(count)
		else:
			#TODO incomplete
			continue
			categories = counts["categories"]
			i = indx.IndexSet({"$and": [{'categories.0': categories[0]}, {"categories": {"$all": categories}}, {"categories": {"$size": len(categories)}} ]})
			if not i.count():
				print "Old category %s" % " > ".join(categories)