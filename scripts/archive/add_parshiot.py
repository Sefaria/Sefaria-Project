# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import os
import csv
from datetime import datetime
from copy import deepcopy


path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

import sefaria.model as model
from sefaria.system.database import db

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
			refs[i] = model.Ref(refs[i - 1]).book + " " + refs[i]

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
				parasha["aliyot"].append(parse_span(row[3]))

		# New Parasha
		else:
			if parasha["date"] is not None:
				# clean up last object
				start = model.Ref(parasha["aliyot"][0])
				end   = model.Ref(parasha["aliyot"][6])
				parsha_ref_vars = vars(start)
				parsha_ref_vars.toSections = end.toSections
				parasha["ref"] = model.Ref(_obj=parsha_ref_vars).normal()
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