# -*- coding: utf-8 -*-
import django
django.setup()

from sefaria.model import Collection, CollectionSet
from sefaria.system.database import db


db.sheets.create_index("displayedCollection")

# Add Sheet IDs to Collections
collections = CollectionSet({})
for collection in collections:
	print(collection.name)
	collection.sheets = []
	collection.assign_slug()
	sheets = db.sheets.find({"group": collection.name})
	for sheet in sheets:
		collection.sheets.append(sheet["id"])
		sheet["displayedCollection"] = collection.slug
		db.sheets.replace_one({"id": sheet["id"]}, sheet)
	
	if collection.public_sheet_count() < 3:
		collection.listed = False
	
	collection.members = collection.members + collection.publishers
	collection.publishers = []

	collection.save()


db.groups.create_index("sheets")
db.groups.create_index("slug", unique=True)

db.sheets.update_many({"options.collaboration": "group-can-add"}, {"$set": {"options.collaboration": "none"}})
db.sheets.update_many({"options.collaboration": "group-can-edit"}, {"$set": {"options.collaboration": "none"}})


### Phase 2
# Remove `group` field
