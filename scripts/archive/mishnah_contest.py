# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import pymongo
import csv
import os
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

from datetime import datetime
path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from django.contrib.auth.models import User

from settings import *
from history import make_leaderboard_condition

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)
	

settings = {
	"contest_start"    : datetime.strptime("12/1/13", "%m/%d/%y"),
	"contest_end"      : datetime.strptime("1/1/14", "%m/%d/%y"),
	"version"          : "Sefaria Community Translation",
	"ref_regex"        : "^Mishna ",
	"assignment_url"   : "/translate/mishnah",
	"title"            : "Mishnah Translation 2013", 
}


leaderboard_condition = make_leaderboard_condition( start     = settings["contest_start"], 
													end       = settings["contest_end"], 
													version   = settings["version"], 
													ref_regex = settings["ref_regex"])

leaderboard_condition["rev_type"] = "add text"

translated = db.history.find(leaderboard_condition)

with open('mishnah-contest.csv', 'wb') as csvfile:
	writer = csv.writer(csvfile)
	writer.writerow(["Name", "Mishnah", "Link"])
	for m in translated:
		user = User.objects.get(id=m["user"])
		name = "%s %s" % (user.first_name, user.last_name)	
		writer.writerow([name, m["ref"], "www.sefaria.org/%s" % m["ref"].replace(" ", "_")])