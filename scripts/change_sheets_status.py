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

sheets = db.sheets.find({"status": 7})
for sheet in sheets:
	sheet["status"] = "public"
	db.sheets.save(sheet)
	
sheets = db.sheets.find({"status": 6})
for sheet in sheets:
	sheet["status"] = "unlisted"
	if "collaboration" in sheet["options"]:
		if sheet["options"]["collaboration"] == "anyone-can-add":
			sheet["options"]["collaboration"] = "group-can-add"
	db.sheets.save(sheet)
	

sheets = db.sheets.find({"status": 3})
for sheet in sheets:
	sheet["status"] = "public"
	db.sheets.save(sheet)

sheets = db.sheets.find({"status": 0})
for sheet in sheets:
	sheet["status"] = "unlisted"
	db.sheets.save(sheet)

sheets = db.sheets.find({"group": "None"})
for sheet in sheets:
	sheet["group"] = ""
	db.sheets.save(sheet)

