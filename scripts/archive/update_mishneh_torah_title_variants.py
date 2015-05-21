# -*- coding: utf-8 -*-
import sys
import os
import json
import pymongo
from pprint import pprint
p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
from sefaria.settings import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

mishneh_torah = json.loads(open("mishneh-torah.json", "r").read())

indices = db.index.find({"categories.0": "Mishneh Torah"}).sort([["order.0", 1]])

for i in indices:
	del i["titleVariants"]
	i["titleVariants"] = mishneh_torah[i["order"][0]-1]["titleVariants"]
	pprint(i)
	db.index.save(i)