# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import os
import pymongo

path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")

from sefaria.settings import *
from sefaria.history import User

connection = pymongo.Connection(MONGO_HOST)
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

out = ""
contributors = db.leaders_alltime.find()
for c in contributors:
	user = User.objects.get(id=c["_id"])
	out += "%s, %s, %s\n" % (user.first_name, user.last_name, user.email)

f = open('../data/tmp/contacts.csv', 'w')
f.write(out)
f.close()