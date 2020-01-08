# -*- coding: utf-8 -*-

# adds nodes to sources w/o nodes
# adds sources to sources w/ refs but w/o texts


import django
django.setup()

from sefaria.model import *
from sefaria.system.database import db

sheets = db.sheets.find()

def is_node_used(node_number,usedNodes):
    if node_number in usedNodes:
        return True
    return False

def find_next_unused_node(node_number,usedNodes):
    node_number +=1
    if is_node_used(node_number,usedNodes):
        find_next_unused_node(node_number,usedNodes)
    return node_number



for sheet in sheets:
    olddoc = sheet;
    newdoc = {};
    included_refs = []

    nextNode = sheet.get("nextNode", 1)
    checked_sources = []
    usedNodes = []

    sources = sheet.get("sources", [])
    for source in sources:

        if "node" not in source:
            print("adding nodes to sheet "+str(sheet["id"]))
            nextNode = find_next_unused_node(nextNode,usedNodes)
            source["node"] = nextNode
        else:
            if source["node"] >= nextNode:
                nextNode = find_next_unused_node(source["node"],usedNodes)

            if source["node"] is None:
                print("found null node in sheet "+str(sheet["id"]))
                nextNode = find_next_unused_node(nextNode,usedNodes)
                source["node"] = nextNode

            if is_node_used(source["node"],usedNodes):
                print("found repeating node in sheet "+str(sheet["id"]))
                nextNode = find_next_unused_node(nextNode,usedNodes)
                source["node"] = nextNode
            else:
                usedNodes.append(source["node"])
        if "ref" in source and "text" not in source:
            print("adding sources to sheet "+str(sheet["id"]))
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
                print("error on " + str(source["ref"]) + " on sheet " + str(sheet["id"]))
                continue

        checked_sources.append(source)

    sheet["sources"] = checked_sources


    newdoc = olddoc

    newdoc["sources"] = sheet["sources"]
    newdoc["nextNode"] = nextNode +1

    db.sheets.update({'_id': olddoc["_id"]}, newdoc);

