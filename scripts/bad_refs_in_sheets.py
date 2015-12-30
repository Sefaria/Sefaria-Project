# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.system.database import db

sheets = db.sheets.find()
bad_refs   = 0
bad_sheets = set([])

for sheet in sheets:
    if "included_refs" not in sheet:
        print "'included_refs' missing from sheet %d" % (sheet["id"])
        continue
    for ref in sheet["included_refs"]:
        try:
            Ref(ref)
        except:
            bad_refs += 1
            bad_sheets.add(sheet["id"])
            print "%s --- bad ref in sheet %d" % (ref, sheet["id"])

print "***"
print "%d bad refs in %d sheets" % (bad_refs, len(bad_sheets))