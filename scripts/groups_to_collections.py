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
	sheets = db.sheets.find({"group": group.name})
	for sheet in sheets:
		group.sheets.append(sheet["id"])
	
	if group.public_sheet_count() < 3:
		group.listed = False
	group.save()


db.groups.create_index("sheets")

# Turn "publishers" into "members"

# Update sheet "group" field to "highlightedCollection"
