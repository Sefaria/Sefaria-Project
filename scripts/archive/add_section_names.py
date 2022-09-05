# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import os
import sys

import pymongo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime

from config import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]


for i in db.index.find():

	cat = i["categories"][0]
	
	if cat == "Tanach":
		i["sectionNames"] = ["Chapter", "Verse"]
	
	elif cat == "Mishna":
		i["sectionNames"] = ["Chapter", "Mishna"]
	
	elif cat == "Talmud":
		i["sectionNames"] = ["Daf", "Line"]
	
	elif cat == "Midrash":
		i["sectionNames"] = ["Chapter", "Paragraph"]

	i["maps"] = []
	
	db.index.save(i)
	