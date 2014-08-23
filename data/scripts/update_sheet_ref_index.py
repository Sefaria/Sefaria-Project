# -*- coding: utf-8 -*-
"""
Update ref index on source sheets
"""

import sys
import os
import re
from datetime import datetime, timedelta

p = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

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
print "%d sheets updated" % sheets.count()
for sheet in sheets:
    sources = sheet.get("sources", [])
    refs = refs_in_sources(sources)
    db.sheets.update({"_id": sheet["_id"]}, {"$set": {"included_refs": refs}})