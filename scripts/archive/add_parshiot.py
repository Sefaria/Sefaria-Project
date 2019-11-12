# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import django
django.setup()
import sys
import os
import csv
from datetime import datetime
from copy import deepcopy
import argparse
import glob
import sefaria.model as model
from sefaria.system.database import db

"""path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")
parashiot_file = "/var/data/Sefaria-Data/misc/parshiot.csv"
"""

#path="/path/to/csv/parashot" #no slash at the end

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


def finalize_parasha_entry(parasha):
	start = model.Ref(parasha["aliyot"][0])
	end = model.Ref(parasha["aliyot"][6])
	if end.book != start.book:
		end = model.Ref(parasha["aliyot"][5])
	parsha_ref_vars = start._core_dict()
	parsha_ref_vars['toSections'] = end.toSections
	parasha["ref"] = model.Ref(_obj=parsha_ref_vars).normal()
	parasha["haftara"] = {"ashkenazi": parasha["haftara"]}
	return deepcopy(parasha)


def parse_parashot(parashiot_file, diaspora=False):
	p=[]
	print("{}:{}".format(parashiot_file, "Diaspora" if diaspora else "Israel"))
	with open(parashiot_file, 'rb') as csvfile:
		parashiot = csv.reader(csvfile)
		next(parashiot)
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
				if parasha["date"] is not None and parasha["date"].weekday() == 5: #saturday:
					# clean up last object
					p.append(finalize_parasha_entry(parasha))

				parasha = {
					"date": datetime.strptime(row[0], "%d-%b-%Y"),
					"parasha": row[1],
					"aliyot": [ parse_span(row[3]) ],
					"diaspora": diaspora
				}
		# last one left over (Nitzavim or Nitzavim-Vayelech)
		p.append(finalize_parasha_entry(parasha))
	return p





if __name__ == '__main__':
	parser = argparse.ArgumentParser()
	parser.add_argument("-p", "--path", help="path of data csv's")
	args = parser.parse_args()
	parsha_dicts = []
	print(args.path)
	for fname in glob.glob("{}/*.csv".format(args.path)):
		parsha_dicts += parse_parashot(fname, "il" not in fname)
	db.parshiot.remove()
	for parasha in parsha_dicts:
		db.parshiot.save(parasha)
	db.parshiot.ensure_index("date")