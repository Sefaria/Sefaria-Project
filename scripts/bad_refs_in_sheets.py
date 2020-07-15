# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.system.database import db

sheets = db.sheets.find()
bad_refs   = 0
bad_sheets = set([])

for sheet in sheets:
    for ref in sheet["sources"]:
        if "ref" in ref:
            try:
                Ref(ref["ref"])
            except:
                bad_refs += 1
                bad_sheets.add(sheet["id"])
                print("%s --- bad ref in sheet %d" % (ref["ref"], sheet["id"]))

print("***")
print("%d bad refs in %d sheets" % (bad_refs, len(bad_sheets)))