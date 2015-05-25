# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import pymongo
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import *
from datetime import datetime

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
	