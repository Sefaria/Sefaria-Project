# -*- coding: utf-8 -*-

from sefaria.export import prepare_text_for_export, write_text_doc_to_disk
from sefaria.system.database import db

texts = db.texts.find({"versionTitle": "JPS 1985 English Translation"})

for text in texts:
    write_text_doc_to_disk(
        prepare_text_for_export(text)
    )
