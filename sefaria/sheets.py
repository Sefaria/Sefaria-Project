import sys
import pymongo
import cgi
import simplejson as json
from settings import *
from datetime import datetime

PRIVATE_SHEET = 0 # Only the owner can view or edit
LINK_SHEET_VIEW = 1 # Anyone with the link can view
LINK_SHEET_EDIT = 2 # Anyone with the link can edit
PUBLIC_SHEET_VIEW = 3 # Listed publicaly, anyone can view
PUBLIC_SHEET_EDIT = 4 # Listed publically, anyone can edit

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)
sheets = db.sheets


def get_sheet(id=None):
	if id is None:
		return {"error": "No sheet id given."}
	s = sheets.find_one({"id": int(id)})
	if not s:
		return {"error": "Couldn't find sheet with id: %s" % (id)}
	s["_id"] = str(s["_id"])
	return s


def sheet_list(user_id=None):
	if not user_id:
		sheet_list = sheets.find({"status": {"$in": [PUBLIC_SHEET_VIEW, PUBLIC_SHEET_EDIT]}}).sort([["dateModified", -1]])
	elif user_id:
		sheet_list = sheets.find({"owner": int(user_id)}).sort([["dateModified", -1]])
	response = {}
	response["sheets"] = []
	if sheet_list.count() == 0:
		return response
	while sheet_list.alive:
	 	n = sheet_list.next()
		s = {}
		print n["_id"]
		s["id"] = n["id"]
		s["title"] = n["title"] if "title" in n else "Untitled Sheet"
 		response["sheets"].append(s)
 	return response

def save_sheet(sheet, user_id):
	
	sheet["dateModified"] = datetime.now().isoformat()
	
	if "id" in sheet:
		existing = db.sheets.find_one({"id": sheet["id"]})
		existing.update(sheet)
		sheet = existing

	else:
		sheet["dateCreated"] = datetime.now().isoformat()
		lastId = sheets.find().sort([['id', -1]]).limit(1)
		if lastId.count():
			sheet["id"] = lastId.next()["id"] + 1
		else:
			sheet["id"] = 1
		sheet["owner"] = user_id
		sheet["status"] = PRIVATE_SHEET
		
	sheets.update({"id": sheet["id"]}, sheet, True, False)
	return sheet

def add_to_sheet(id, ref):
	sheet = sheets.find_one({"id": id})
	if not sheet:
		return {"error": "No sheet with id %s." % (id)}
	sheet["dateModified"] = datetime.now().isoformat()
	sheet["sources"].append({"ref": ref})
	sheets.save(sheet)
	return {"status": "ok", "id": id, "ref": ref}