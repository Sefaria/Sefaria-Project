# -*- coding: utf-8 -*-

# using the pre-calculated file, 'sheet_ref_disambiguated.csv', replaces refs with updated refs

import unicodecsv
import django
from collections import defaultdict
django.setup()
from sefaria.model import *
from sefaria.system.database import db
from sefaria.system.exceptions import InputError

ids = db.sheets.find().distinct("id")

disambiguated_dict = defaultdict(dict)
with open("./data/sheet_ref_disambiguated.csv", "rb") as fin:
    csv = unicodecsv.DictReader(fin)
    for row in csv:
        try:
            source_num = int(row["Source Num"])
        except ValueError:
            source_num = 12345
        if source_num not in disambiguated_dict[int(row["Id"])]:
            disambiguated_dict[int(row["Id"])][source_num] = []
        disambiguated_dict[int(row["Id"])][source_num] += [{"Old Ref": row["Old Ref"], "New Ref": row["New Ref"]}]

for i, id in enumerate(ids):
    if i % 100 == 0:
        print(i)
    if id not in disambiguated_dict:
        continue
    sheet = db.sheets.find_one({"id": id})
    if not sheet:
        continue

    sources = sheet.get("sources", [])
    for source in sources:
        if "ref" not in source or "node" not in source or source["node"] not in disambiguated_dict[id]:
            continue
        mapping_list = disambiguated_dict[id][source["node"]]

        try:
            source_ref_norm = Ref(source["ref"]).normal()
        except InputError:
            print("error parsing {}".format(source["ref"]))
            continue
        for mapping in mapping_list:
            if source_ref_norm == mapping["Old Ref"]:
                source["ref"] = mapping["New Ref"]
                source["heRef"] = Ref(mapping["New Ref"]).he_normal()
                mapping["used"] = True
                break


    db.sheets.update({'_id': sheet["_id"]}, sheet)

print("checking not used...")
num_not_used = 0
for k, v in list(disambiguated_dict.items()):
    for k1, v1 in list(v.items()):
        for m in v1:
            if not m.get("used", False):
                num_not_used += 1
                print("{} {} {}".format(k, k1, m["Old Ref"]))

print("not used {}".format(num_not_used))
