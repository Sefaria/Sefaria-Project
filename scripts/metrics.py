# -*- coding: utf-8 -*-
import sys
import os
import datetime
import django
django.setup()

from sefaria.system.database import db
from sefaria.model.text import VersionSet


he     = VersionSet({"language": "he"}).word_count()
trans  = VersionSet({"language": {"$ne": "he"}}).word_count()
sct    = VersionSet({"versionTitle": "Sefaria Community Translation"}).word_count()

# Number of Contributors
contributors = set(db.history.distinct("user"))
contributors = contributors.union(set(db.sheets.find({"status": "public"}).distinct("owner")))
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