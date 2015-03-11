# -*- coding: utf-8 -*-
"""
Annotates every source in all source sheets with a Hebrew Ref.
"""
from sefaria.model import *
from sefaria.system.database import db


def add_he_ref_to_source(source):
    if "ref" in source:
        try:
            source["heRef"] = Ref(source["ref"]).he_normal()
        except:
            pass

    if "subsources" in source:
        source["subsources"] = [add_he_ref_to_source(s) for s in source["subsources"]]

    return source

sheets = db.sheets.find()

for sheet in sheets:
    sheet["sources"] = [add_he_ref_to_source(s) for s in sheet["sources"]]
    db.sheets.save(sheet)

