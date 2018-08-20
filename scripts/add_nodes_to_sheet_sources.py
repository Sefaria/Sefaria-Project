# -*- coding: utf-8 -*-

import django
django.setup()

from sefaria.model import *
from sefaria.system.database import db

sheets = db.sheets.find()

for sheet in sheets:
    olddoc = sheet;
    newdoc = {};
    included_refs = []

    nextNode = sheet.get("nextNode", 1)
    checked_sources = []

    sources = sheet.get("sources", [])
    for source in sources:
        if "node" not in source:
            source["node"] = nextNode
            nextNode += 1
        checked_sources.append(source)
    sheet["sources"] = checked_sources


    newdoc = olddoc

    newdoc["sources"] = sheet["sources"]
    newdoc["nextNode"] = nextNode

    db.sheets.update({'_id': olddoc["_id"]}, newdoc);

