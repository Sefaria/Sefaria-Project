# -*- coding: utf-8 -*-

from sefaria.system.database import db
from sefaria.export import export_text

texts = db.texts.find({"versionTitle": "JPS 1985 English Translation"})

for text in texts:
    export_text(text)
