# -*- coding: utf-8 -*-
import django
django.setup()

from sefaria.model import Group, GroupSet
from sefaria.system.database import db


# Add Sheet IDs to Collections
GroupSet().update({"sheets": []})
sheets = db.sheets.find({"$and": [{"group": {"$exists":1}}, {"group": {"$nin": ["", None]}}]})

for sheet in sheets:
	group = Group().load({"name": sheet["group"]})
	groop.sheets.append(sheet["id"])
	group.save()


# Turn "publishers" into "members"

# Update sheet "group" field to "highlightedCollection"

