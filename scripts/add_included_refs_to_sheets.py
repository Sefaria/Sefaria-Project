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

    sources = sheet.get("sources", [])
    for source in sources:
        if "ref" in source:
            try:
                included_refs.append(Ref(source["ref"]).normal())
            except:
                print("Bad Ref: {0}".format(source["ref"]))

    newdoc = olddoc
    included_refs = list(set(included_refs))  # refs should be unique

    newdoc["includedRefs"] = included_refs

    db.sheets.update({'_id': olddoc["_id"]}, newdoc);

