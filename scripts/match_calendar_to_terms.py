# -*- coding: utf-8 -*-
from sefaria.model import *
from sefaria.system.database import db
from sefaria.utils.hebrew import hebrew_parasha_name, is_all_hebrew
import pprint



calendar_items = db.parshiot.find({})
missing_names = set()
for calendar_item in calendar_items:
    if not is_all_hebrew(hebrew_parasha_name(calendar_item["parasha"])) and not Term().load_by_title(calendar_item["parasha"]):
        if '-' in calendar_item["parasha"]:
            calendar_item["parasha"] = calendar_item["parasha"].replace("-", "")
            db.parshiot.save(calendar_item)
        missing_names.add(calendar_item["parasha"])

pprint.pprint(sorted(missing_names))

for missing_name in missing_names:
    heb_term = str(input("Add a hebrew primary variant for '{}'\n".format(missing_name)), "utf-8")
    term = Term({
        "name": missing_name,
        "titles": [
            {
                "lang": "en",
                "text": missing_name,
                "primary": True
            },
            {
                "lang": "he",
                "text": heb_term,
                "primary": True
            }
        ],
        "scheme": "Holidays",
    }).save()




