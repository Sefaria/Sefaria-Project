# -*- coding: utf-8 -*-
import django
django.setup()

from sefaria.model import Group, GroupSet
from sefaria.system.database import db


# Phase 1
# - "sheets" field allowed on Group


# Add Sheet IDs to Collections
groups = GroupSet({})
for group in groups:
	print(group.name)
	group.sheets = []
	group.assign_slug(public=getattr(group, "listed", False))
	sheets = db.sheets.find({"group": group.name})
	for sheet in sheets:
		group.sheets.append(sheet["id"])
		sheet["displayedCollection"] = group.slug
		db.sheets.save(sheet)
	
	if group.public_sheet_count() < 3:
		group.listed = False
	group.save()


db.groups.create_index("sheets")
db.groups.create_index("slug", unique=True)
db.sheets.create_index("displayedCollection")

db.sheets.update_many({"options.collaboration": "group-can-add"}, {"$set": {"options.collaboration": "none"}})
db.sheets.update_many({"options.collaboration": "group-can-edit"}, {"$set": {"options.collaboration": "none"}})


# Turn "publishers" into "members"


### Phase 2
# Remove `group` field
