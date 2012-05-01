#!/usr/bin/python2.6

import sys
import pymongo
import cgi
import simplejson as json
from datetime import datetime


connection = pymongo.Connection()
db = connection.sefaria
sheets = db.sheets

def sheetJSON(id):
	s = sheets.find_one({"id": int(id)})
	if not s:
		return "{error: 'Couldn't find id: %s}'" % (id)
	del s["_id"]
	return s


def sheetsList():
	all = sheets.find().sort([["dateModified", -1]])
	response = {}
	response["sheets"] = []
	while all.alive:
	 	n = all.next()
		s = {}
		s["id"] = n["id"]
		s["title"] = n["title"] if "title" in n else "Untitled Sheet"
 		response["sheets"].append(s)
 	return response

def saveSheet(sheet):
	
	sheet["dateModified"] = datetime.now().isoformat()
	
	if not "id" in sheet:
		sheet["dateCreated"] = datetime.now().isoformat()
		lastId = sheets.find().sort([['id', -1]]).limit(1)
		if lastId.count():
			sheet["id"] = lastId.next()["id"] + 1
		else:
			sheet["id"] = 1
		
	sheets.update({"id": sheet["id"]}, sheet, True, False)
	
	return sheet

def addToSheet(id, ref):
	sheet = sheets.find_one({"id": id})
	if not sheet:
		return {"error": "No sheet with id %s." % (id)}
	sheet["dateModified"] = datetime.now().isoformat()
	sheet["sources"].append({"ref": ref})
	sheets.save(sheet)
	return {"status": "ok", "id": id, "ref": ref}