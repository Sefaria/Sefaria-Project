import sys
import pymongo
import cgi
import simplejson as json
import dateutil.parser
from datetime import datetime
from settings import *

PRIVATE_SHEET      = 0 # Only the owner can view or edit (NOTE currently 0 is treated as 1)
LINK_SHEET_VIEW    = 1 # Anyone with the link can view
LINK_SHEET_EDIT    = 2 # Anyone with the link can edit
PUBLIC_SHEET_VIEW  = 3 # Listed publicly, anyone can view, owner can edit
PUBLIC_SHEET_EDIT  = 4 # Listed publicly, anyone can edit or view
TOPIC_SHEET        = 5 # Listed as a topic, anyone can edit
GROUP_SHEET        = 6 # Sheet belonging to a group, visible and editable by group
PUBLIC_GROUP_SHEET = 7 # Sheet belonging to a group, visible to all, editable by group

LISTED_SHEETS      = (PUBLIC_SHEET_EDIT, PUBLIC_SHEET_VIEW, PUBLIC_GROUP_SHEET)
EDITABLE_SHEETS    = (LINK_SHEET_EDIT, PUBLIC_SHEET_EDIT, TOPIC_SHEET)
GROUP_SHEETS       = (GROUP_SHEET, PUBLIC_GROUP_SHEET)


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


def get_topic(topic=None):
	if topic is None:
		return {"error": "No topic given."}
	s = sheets.find_one({"status": 5, "url": topic})
	if not s:
		return {"error": "Couldn't find topic: %s" % (topic)}
	s["_id"] = str(s["_id"])
	return s


def sheet_list(user_id=None):
	if not user_id:
		sheet_list = sheets.find({"status": {"$in": LISTED_SHEETS }}).sort([["dateModified", -1]])
	elif user_id:
		sheet_list = sheets.find({"owner": int(user_id), "status": {"$ne": 5}}).sort([["dateModified", -1]])
	response = {}
	response["sheets"] = []
	if sheet_list.count() == 0:
		return response
	while sheet_list.alive:
	 	n = sheet_list.next()
		s = {}
		s["id"] = n["id"]
		s["title"] = n["title"] if "title" in n else "Untitled Sheet"
		s["author"] = n["owner"]
		s["size"] = len(n["sources"])
		s["modified"] = dateutil.parser.parse(n["dateModified"]).strftime("%m/%d/%Y")
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
		if "status" not in sheet:
			sheet["status"] = PRIVATE_SHEET
		sheet["owner"] = user_id
		
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

