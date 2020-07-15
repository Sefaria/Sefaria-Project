# -*- coding: utf-8 -*-

from sefaria.model import *
import json
import pprint

pset = {}

pfile = "../tmp/parshiot.json"
with open(pfile, 'rb') as parshiot_json:
    parshiot = json.load(parshiot_json)
    for parsha in parshiot:
        name = parsha["parasha"]
        if name in pset:
            continue
        if "-" in name and name != "Lech-Lecha":
            continue
        if name == "Lech-Lecha":
            name = "Lech Lecha"

        refs = parsha["aliyot"][0:7]
        start = Ref(refs[0])
        end = Ref(refs[6])
        book = start.book
        whole_ref = start.to(end).normal()

        pset[name] = {
            "refs": refs,
            "book": book,
            "whole_ref": whole_ref
        }
    pset["V'Zot HaBerachah"] = {
        "refs": ["Deuteronomy 33:1–7",
            "Deuteronomy 33:8–12",
            "Deuteronomy 33:13–17",
            "Deuteronomy 33:18–21",
            "Deuteronomy 33:22–26",
            "Deuteronomy 33:27–29",
            "Deuteronomy 34:1-12"],
        "book": "Deuteronomy",
        "whole_ref": "Deuteronomy 33:8-34:12"
    }


structs = {}

terms = TermSet({"scheme": "Parasha"})
for term in terms:
    oref = Ref(term.ref)
    if not structs.get(oref.index.title):
        structs[oref.index.title] = {
            "nodes": []
        }
    structs[oref.index.title]["nodes"].append({
        'sharedTitle': term.name,
        "nodeType": "ArrayMapNode",
        "depth": 1,
        "addressTypes": ["Aliyah"],
        "sectionNames": ["Aliyah"],
        'wholeRef': pset[term.name]["whole_ref"],
        'refs': pset[term.name]["refs"]
    })

for name, struct in list(structs.items()):
    i = library.get_index(name)
    obj = deserialize_tree(struct, index=i, struct_class=TitledTreeNode)
    obj.title_group = i.nodes.title_group
    obj.validate()

    i.set_alt_structure("Parasha", obj)
    i.save()
