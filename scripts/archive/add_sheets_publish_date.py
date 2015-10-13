# -*- coding: utf-8 -*-
"""
Add a 'datePublished' field to all existing public source sheets. 
"""
import sys
import os

path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")

from sefaria.system.database import db

sheets = db.sheets.find({"status": "public"})
for sheet in sheets:
	sheet["datePublished"] = sheet["dateCreated"]
	db.sheets.save(sheet)