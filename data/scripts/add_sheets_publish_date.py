# -*- coding: utf-8 -*-
"""
Add a 'datePublished' field to all existing public source sheets. 
"""
import sys
import os

from datetime import datetime

path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from sefaria.database import db
from sefaria.sheets import LISTED_SHEETS


sheets = db.sheets.find({"status": {"$in": LISTED_SHEETS}})
for sheet in sheets:
	sheet["datePublished"] = sheet["dateCreated"]
	db.sheets.save(sheet)