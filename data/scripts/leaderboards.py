# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import os
import pymongo
from bson.code import Code
from datetime import datetime, date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from sefaria.settings import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)


def update_top_contributors(days=None):

	if days:
		condition = { "date": { "$gt": datetime.now() - timedelta(days) }, "method": {"$ne": "API"} }
		collection = "leaders_%d" % days
	else:
		condition = { "method": {"$ne": "API"} }
		collection = "leaders_alltime"

	reducer = Code("""
					function(obj, prev) {

						switch(obj.rev_type) {
							case "add text":
								if (obj.language !== 'he' && obj.version === "Sefaria Community Translation") {
									prev.count += Math.max(obj.revert_patch.length / 10, 10);
								} else if(obj.language !== 'he') {
									prev.count += Math.max(obj.revert_patch.length / 400, 2);
								} else {
									prev.count += Math.max(obj.revert_patch.length / 800, 1);
								}
								break;
							case "edit text":
								prev.count += Math.max(obj.revert_patch.length / 1200, 1);
								break;
							case "revert text":
								prev.count += 1;
								break;
							case "add index":
								prev.count += 5;
								break;
							case "edit index":
								prev.count += 1;
								break;
							case "add link":
								prev.count += 2;
								break;
							case "edit link":
								prev.count += 1;
								break;
							case "delete link":
								prev.count += 1;
								break;
							case "add note":
								prev.count += 1;
								break;
							case "edit note":
								prev.count += 1;
								break;
							case "delete note":
								prev.count += 1;
								break;			
						}
					}
				""")

	leaders = db.history.group(['user'], 
						condition, 
						{'count': 0},
						reducer)

	for l in leaders:
		doc = {"_id": l["user"], "count": l["count"]}
		db[collection].save(doc)


update_top_contributors()
update_top_contributors(7)
update_top_contributors(30)