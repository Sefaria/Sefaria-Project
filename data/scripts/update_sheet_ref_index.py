# -*- coding: utf-8 -*-
"""
Update included_refs field on source sheets
to keep n indexable list of refs that a source sheet includes. 
"""
import sys
from datetime import datetime, timedelta

from sefaria.sheets import refs_in_sources
from sefaria.system.database import db

time = sys.argv[1] if len(sys.argv) > 1 else 'hour'

if time == "all":
    query = {}
elif time == "hour":
    cutoff = datetime.now() - timedelta(hours=1)
    query = { "dateModified": { "$gt": cutoff.isoformat() } }

db.sheets.ensure_index("included_refs")

sheets = db.sheets.find(query)

for sheet in sheets:
    sources = sheet.get("sources", [])
    refs = refs_in_sources(sources)
    db.sheets.update({"_id": sheet["_id"]}, {"$set": {"included_refs": refs}})