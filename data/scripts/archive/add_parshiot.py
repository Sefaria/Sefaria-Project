# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import os
import csv
import pymongo
import json
from datetime import datetime
from copy import deepcopy
from pprint import pprint


path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")
from texts import *

parashiot_file = "/var/data/Sefaria-Data/misc/parshiot.csv"


def parse_span(ref):
	ref = ref.split(" | ")[0]
	ref = ref.replace(" - ", "-")
	return ref


def parse_haftara(ref):
	ref = parse_span(ref)
	refs = ref.split("; ")
	for i in range(len(refs)):
		if refs[i][0] in ["1", "2", "3", "4", "5", "6", "7", "8", "9"]:
			refs[i] = parse_ref(refs[i-1])["book"] + " " + refs[i]

	return refs


def parse_shabbat_name(ref):
	ref = ref.split(" | ")
	return ref[1] if len(ref) > 1 else None


p = []
with open(parashiot_file, 'rb') as csvfile:
	parashiot = csv.reader(csvfile)
	parashiot.next()
	parasha = {"date": None}
	for row in parashiot:	
		if not len(row): continue
		
		# Continuation
		if datetime.strptime(row[0], "%d-%b-%Y") == parasha["date"]:
			if row[2] == "Haftara":
				parasha["haftara"] = parse_haftara(row[3])
				parasha["shabbat_name"] = parse_shabbat_name(row[3])
			else:
				parasha["aliyot"].append( parse_span(row[3]) ) 

		# New Parasha
		else:
			if parasha["date"] is not None:
				# clean up last object
				start = parse_ref(parasha["aliyot"][0])
				end   = parse_ref(parasha["aliyot"][7])
				start["toSections"] = end["toSections"]
				parasha["ref"] = make_ref(start)
				p.append(deepcopy(parasha))

			parasha = {
				"date": datetime.strptime(row[0], "%d-%b-%Y"),
				"parasha": row[1],
				"aliyot": [ parse_span(row[3]) ]
			}


db.parshiot.remove()
for parasha in p:
	db.parshiot.save(parasha)
db.parshiot.ensure_index("date")