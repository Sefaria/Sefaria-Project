# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import os
import sys

import pymongo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime

from config import *

from sefaria import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

linksCur = db.links.find()

for link in linksCur:
	link["refs"] = [normRef(link["refs"][0]), normRef(link["refs"][1])]
	db.links.save(link)
