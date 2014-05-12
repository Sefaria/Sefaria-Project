"""
sheets.py - backend core for Sefaria Source sheets

Writes to MongoDB Collection: sheets
"""

import sys
import pymongo
import cgi
import simplejson as json
import dateutil.parser
from datetime import datetime
from pprint import pprint

from settings import *
from util import strip_tags, annotate_user_list
from notifications import Notification
import search

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

# Simple cache of the last updated time for sheets
last_updated = {}

connection = pymongo.Connection(MONGO_HOST)
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

sheets = db.sheets


def get_sheet(id=None):
	"""
	Returns the source sheet with id. 
	"""
	if id is None:
		return {"error": "No sheet id given."}
	s = sheets.find_one({"id": int(id)})
	if not s:
		return {"error": "Couldn't find sheet with id: %s" % (id)}
	s["_id"] = str(s["_id"])
	return s


def get_topic(topic=None):
	"""
	Returns the topic sheet with 'topic'. (OUTDATED) 
	"""	
	if topic is None:
		return {"error": "No topic given."}
	s = sheets.find_one({"status": 5, "url": topic})
	if not s:
		return {"error": "Couldn't find topic: %s" % (topic)}
	s["_id"] = str(s["_id"])
	return s


def sheet_list(user_id=None):
	"""
	Returns a list of sheets belonging to user_id.
	If user_id is None, returns a list of public sheets.
	"""
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
	"""
	Saves sheet to the db, with user_id as owner.
	"""
	sheet["dateModified"] = datetime.now().isoformat()

	if "id" in sheet:
		existing = db.sheets.find_one({"id": sheet["id"]})

		if sheet["lastModified"] != existing["dateModified"]:
			existing["error"] = "Sheet updated."
			existing["rebuild"] = True
			return existing

		del sheet["lastModified"]
		sheet["views"] = existing["views"] # prevent updating views
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
		sheet["views"] = 1
		
	sheets.update({"id": sheet["id"]}, sheet, True, False)
	
	if sheet["status"] in LISTED_SHEETS and SEARCH_INDEX_ON_SAVE:
		search.index_sheet(sheet["id"])

	global last_updated
	last_updated[sheet["id"]] = sheet["dateModified"]

	return sheet


def add_source_to_sheet(id, source):
	"""
	Add source to sheet 'id'.
	Source is a dictionary that includes at least 'ref' and 'text' (with 'en' and 'he')
	"""
	sheet = sheets.find_one({"id": id})
	if not sheet:
		return {"error": "No sheet with id %s." % (id)}
	sheet["dateModified"] = datetime.now().isoformat()
	sheet["sources"].append(source)
	sheets.save(sheet)
	return {"status": "ok", "id": id, "ref": source["ref"]}


def copy_source_to_sheet(to_sheet, from_sheet, source):
	"""
	Copy source of from_sheet to to_sheet.
	"""
	copy_sheet = sheets.find_one({"id": from_sheet})
	if not copy_sheet:
		return {"error": "No sheet with id %s." % (from_sheet)}
	if source >= len(from_sheet["source"]):
		return {"error": "Sheet %d only has %d sources." % (from_sheet, len(from_sheet["sources"]))}
	copy_source = copy_sheet["source"][source]

	sheet = sheets.find_one({"id": to_sheet})
	if not sheet:
		return {"error": "No sheet with id %s." % (to_sheet)}
	sheet["dateModified"] = datetime.now().isoformat()
	sheet["sources"].append(copy_source)
	sheets.save(sheet)
	return {"status": "ok", "id": to_sheet, "ref": copy_source["ref"]}


def add_ref_to_sheet(id, ref):
	"""
	Add source 'ref' to sheet 'id'.
	"""
	sheet = sheets.find_one({"id": id})
	if not sheet:
		return {"error": "No sheet with id %s." % (id)}
	sheet["dateModified"] = datetime.now().isoformat()
	sheet["sources"].append({"ref": ref})
	sheets.save(sheet)
	return {"status": "ok", "id": id, "ref": ref}


def update_sheet_tags(sheet_id, tags):
	"""
	Sets the tag list for sheet_id to those listed in list 'tags'.
	"""
	tags = list(set(tags)) 	# tags list should be unique
	sheets.update({"id": sheet_id}, {"$set": {"tags": tags}})

	return {"status": "ok"}


def get_last_updated_time(sheet_id):
	"""
	Returns a timestamp of the last modified date for sheet_id.
	"""
	if sheet_id in last_updated:
		return last_updated[sheet_id]

	sheet = sheets.find_one({"id": sheet_id}, {"dateModified": 1})

	if not sheet:
		return None

	last_updated[sheet_id] = sheet["dateModified"]
	return sheet["dateModified"]


def make_sheet_list_by_tag():
	"""
	Returns an alphabetized list of tags and sheets included in each tag.
	"""
	tags = {}
	results = []

	sheet_list = sheets.find({"status": {"$in": LISTED_SHEETS }})
	for sheet in sheet_list:
		sheet_tags = sheet.get("tags", [])
		for tag in sheet_tags:
			if tag not in tags:
				tags[tag] = {"tag": tag, "count": 0, "sheets": []}
			tags[tag]["sheets"].append({"title": strip_tags(sheet["title"]), "id": sheet["id"], "views": sheet["views"]})
			tags[tag]["count"] += 1

	for tag in tags.values():
		tag["sheets"] = sorted(tag["sheets"], key=lambda x: -x["views"] )
		results.append(tag)

	results = sorted(results, key=lambda x: x["tag"])

	return results


def add_like_to_sheet(sheet_id, uid):
	"""
	Add uid as a liker of sheet_id.
	"""
	db.sheets.update({"id": sheet_id}, {"$addToSet": {"likes": uid}})
	sheet = get_sheet(sheet_id)

	notification = Notification(uid=sheet["owner"])
	notification.make_sheet_like(liker_id=uid, sheet_id=sheet_id)
	notification.save()


def remove_like_from_sheet(sheet_id, uid):
	"""
	Remove uid as a liker of sheet_id.
	"""
	db.sheets.update({"id": sheet_id}, {"$pull": {"likes": uid}})


def likers_list_for_sheet(sheet_id):
	"""
	Returns a list of people who like sheet_id, including their names and profile links.
	"""
	sheet = get_sheet(sheet_id)
	likes = sheet.get("likes", [])
	return(annotate_user_list(likes))




