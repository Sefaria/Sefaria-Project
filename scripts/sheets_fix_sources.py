# -*- coding: utf-8 -*-

# adds nodes to sources w/o nodes
# adds sources to sources w/ refs but w/o texts


import django
django.setup()

from sefaria.model import *
from sefaria.system.database import db

sheets = db.sheets.find()

for sheet in sheets:
    olddoc = sheet;
    newdoc = {};
    included_refs = []

    nextNode = sheet.get("nextNode", 1)
    checked_sources = []

    sources = sheet.get("sources", [])
    for source in sources:

        if "node" not in source:
            print "adding nodes to sheet "+str(sheet["id"])
            source["node"] = nextNode
            nextNode += 1

        if "ref" in source and "text" not in source:
            print "adding sources to sheet "+str(sheet["id"])
            source["text"] = {}
            try:
                oref = Ref(source["ref"])
                tc_eng = TextChunk(oref, "en")
                tc_heb = TextChunk(oref, "he")
                if tc_eng:
                    source["text"]["en"] = tc_eng.ja().flatten_to_string()
                if tc_heb:
                    source["text"]["he"] = tc_heb.ja().flatten_to_string()

            except:
                print "error on " + str(source["ref"]) + " on sheet " + str(sheet["id"])
                continue

        checked_sources.append(source)

    sheet["sources"] = checked_sources


    newdoc = olddoc

    newdoc["sources"] = sheet["sources"]
    newdoc["nextNode"] = nextNode

    db.sheets.update({'_id': olddoc["_id"]}, newdoc);

