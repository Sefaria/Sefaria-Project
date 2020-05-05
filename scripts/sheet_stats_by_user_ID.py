# -*- coding: utf-8 -*-
"""
Code stump to get total comments and views of a users source sheets
"""
from sys import argv
from sefaria.model import *
from sefaria.system.database import db

if len(argv) == 1:
	print("You need to enter a user ID")
	quit()

script, userID = argv


sheets = db.sheets.find({ "owner": int(userID) })

comments = 0
views = 0

for sheet in sheets:
	views = views + sheet['views']
	sources = sheet.get("sources", [])
	for source in sources:
		if "comment" in source:
			comments += 1


print("%d comments\n%d views" % (comments, views))