# -*- coding: utf-8 -*-
import sys
import os
import datetime

from sefaria.system.database import db
from sefaria.model.text import VersionSet

# BANDAID for import issues from sheets.py
LISTED_SHEETS = (3,4,7)

he     = VersionSet({"language": "he"}).count_words()
trans  = VersionSet({"language": {"$ne": "he"}}).count_words()
sct    = VersionSet({"versionTitle": "Sefaria Community Translation"}).count_words()

# Number of Contributors
contributors = set(db.history.distinct("user"))
contributors = contributors.union(set(db.sheets.find({"status": {"$in": LISTED_SHEETS}}).distinct("owner")))
contributors = len(contributors)

# Number of Links
links = db.links.count()

# Number of Source sheets
sheets = db.sheets.count()

metrics = {
    "timestamp": datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0),
    "heWords": he,
    "transWords": trans,
    "sctWords": sct,
    "contributors": contributors,
    "links": links,
    "sheets": sheets,
}

db.metrics.save(metrics)