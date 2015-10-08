"""
sheets.py - backend core for Sefaria Source sheets

Writes to MongoDB Collection: sheets
"""
import regex
from datetime import datetime, timedelta

import dateutil.parser

import sefaria.model as model
from sefaria.system.database import db
from sefaria.model.notification import Notification, NotificationSet
from sefaria.model.following import FollowersSet
from sefaria.model.user_profile import annotate_user_list
from sefaria.utils.util import strip_tags, string_overlap
from sefaria.utils.users import user_link
from sefaria.system.exceptions import InputError
from history import record_sheet_publication, delete_sheet_publication
from settings import SEARCH_INDEX_ON_SAVE
import search


# Simple cache of the last updated time for sheets
last_updated = {}


def get_sheet(id=None):
	"""
	Returns the source sheet with id.
	"""
	if id is None:
		return {"error": "No sheet id given."}
	s = db.sheets.find_one({"id": int(id)})
	if not s:
		return {"error": "Couldn't find sheet with id: %s" % (id)}
	s["_id"] = str(s["_id"])
	return s



def sheet_list(user_id=None):
	"""
	Returns a list of sheets belonging to user_id.
	If user_id is None, returns a list of public sheets.
	"""
	if not user_id:
		sheet_list = db.sheets.find({"status": "public"}).sort([["dateModified", -1]])
	elif user_id:
		sheet_list = db.sheets.find({"owner": int(user_id), "status": {"$ne": 5}}).sort([["dateModified", -1]])

	response = {
		"sheets": [],
	}

	for sheet in sheet_list:
		s = {}
		s["id"]       = sheet["id"]
		s["title"]    = sheet["title"] if "title" in sheet else "Untitled Sheet"
		s["author"]   = sheet["owner"]
		s["size"]     = len(sheet["sources"])
		s["modified"] = dateutil.parser.parse(sheet["dateModified"]).strftime("%m/%d/%Y")

		response["sheets"].append(s)
 
	return response


def save_sheet(sheet, user_id):
	"""
	Saves sheet to the db, with user_id as owner.
	"""
	sheet["dateModified"] = datetime.now().isoformat()
	status_changed = False
	if "id" in sheet:
		existing = db.sheets.find_one({"id": sheet["id"]})

		if sheet["lastModified"] != existing["dateModified"]:
			# Don't allow saving if the sheet has been modified since the time
			# that the user last received an update
			existing["error"] = "Sheet updated."
			existing["rebuild"] = True
			return existing
		del sheet["lastModified"]
		if sheet["status"] != existing["status"]:
			status_changed = True

		sheet["views"] = existing["views"] # prevent updating views
		existing.update(sheet)
		sheet = existing

	else:
		sheet["dateCreated"] = datetime.now().isoformat()
		lastId = db.sheets.find().sort([['id', -1]]).limit(1)
		if lastId.count():
			sheet["id"] = lastId.next()["id"] + 1
		else:
			sheet["id"] = 1
		if "status" not in sheet:
			sheet["status"] = "unlisted"
		sheet["owner"] = user_id
		sheet["views"] = 1

	if status_changed:
		if sheet["status"] is "public" and "datePublished" not in sheet:
			# PUBLISH
			sheet["datePublished"] = datetime.now().isoformat()
			record_sheet_publication(sheet["id"], user_id)
			broadcast_sheet_publication(user_id, sheet["id"])
		if sheet["status"] is not "public":
			# UNPUBLISH
			delete_sheet_publication(sheet["id"], user_id)
			NotificationSet({"type": "sheet publish",
								"content.publisher_id": user_id,
								"content.sheet_id": sheet["id"]
							}).delete()

	db.sheets.update({"id": sheet["id"]}, sheet, True, False)

	if sheet["status"] is "public" and SEARCH_INDEX_ON_SAVE:
		search.index_sheet(sheet["id"])

	global last_updated
	last_updated[sheet["id"]] = sheet["dateModified"]

	return sheet


def add_source_to_sheet(id, source):
	"""
	Add source to sheet 'id'.
	Source is a dictionary that includes at least 'ref' and 'text' (with 'en' and 'he')
	"""
	sheet = db.sheets.find_one({"id": id})
	if not sheet:
		return {"error": "No sheet with id %s." % (id)}
	sheet["dateModified"] = datetime.now().isoformat()
	sheet["sources"].append(source)
	db.sheets.save(sheet)
	return {"status": "ok", "id": id, "source": source}


def copy_source_to_sheet(to_sheet, from_sheet, source):
	"""
	Copy source of from_sheet to to_sheet.
	"""
	copy_sheet = db.sheets.find_one({"id": from_sheet})
	if not copy_sheet:
		return {"error": "No sheet with id %s." % (from_sheet)}
	if source >= len(from_sheet["source"]):
		return {"error": "Sheet %d only has %d sources." % (from_sheet, len(from_sheet["sources"]))}
	copy_source = copy_sheet["source"][source]

	sheet = db.sheets.find_one({"id": to_sheet})
	if not sheet:
		return {"error": "No sheet with id %s." % (to_sheet)}
	sheet["dateModified"] = datetime.now().isoformat()
	sheet["sources"].append(copy_source)
	db.sheets.save(sheet)
	return {"status": "ok", "id": to_sheet, "ref": copy_source["ref"]}


def add_ref_to_sheet(id, ref):
	"""
	Add source 'ref' to sheet 'id'.
	"""
	sheet = db.sheets.find_one({"id": id})
	if not sheet:
		return {"error": "No sheet with id %s." % (id)}
	sheet["dateModified"] = datetime.now().isoformat()
	sheet["sources"].append({"ref": ref})
	db.sheets.save(sheet)
	return {"status": "ok", "id": id, "ref": ref}


def refs_in_sources(sources):
	"""
	Recurisve function that returns a list of refs found anywhere in sources.
	"""
	refs = []
	for source in sources:
		if "ref" in source:
			text = source.get("text", {}).get("he", None)
			ref  = refine_ref_by_text(source["ref"], text) if text else source["ref"]
			refs.append(ref)
		if "subsources" in source:
			refs = refs + refs_in_sources(source["subsources"])

	return refs


def refine_ref_by_text(ref, text):
	"""
	Returns a ref (string) which refines 'ref' (string) by comparing 'text' (string),
	to the hebrew text stored in the Library.
	"""
	try:
		oref   = model.Ref(ref).section_ref()
	except:
		return ref
	needle = strip_tags(text).strip().replace("\n", "")
	hay    = model.TextChunk(oref, lang="he").text

	start, end = None, None
	for n in range(len(hay)):
		if not isinstance(hay[n], basestring):
			# TODO handle this case
			# happens with spanning ref like "Shabbat 3a-3b"
			return ref

		if needle in hay[n]:
			start, end = n+1, n+1
			break

		if not start and string_overlap(hay[n], needle):
			start = n+1
		elif string_overlap(needle, hay[n]):
			end = n+1
			break

	if start and end:
		if start == end:
			refined = "%s:%d" % (oref.normal(), start)
		else:
			refined = "%s:%d-%d" % (oref.normal(), start, end)
		ref = refined

	return ref


def update_included_refs(hours=1):
	"""
	Rebuild included_refs index on all sheets that have been modified
	in the last 'hours' or all sheets if hours is 0.
	"""
	if hours == 0:
		query = {}
	else:
		cutoff = datetime.now() - timedelta(hours=hours)
		query = { "dateModified": { "$gt": cutoff.isoformat() } }

	db.sheets.ensure_index("included_refs")

	sheets = db.sheets.find(query)

	for sheet in sheets:
		sources = sheet.get("sources", [])
		refs = refs_in_sources(sources)
		db.sheets.update({"_id": sheet["_id"]}, {"$set": {"included_refs": refs}})


def get_sheets_for_ref(tref, pad=True, context=1):
	"""
	Returns a list of sheets that include ref,
	formating as need for the Client Sidebar.
	"""
	oref = model.Ref(tref)
	if pad:
		oref = oref.padded_ref()
	if context:
		oref = oref.context_ref(context)

	ref_re = oref.regex()

	results = []
	sheets = db.sheets.find({"included_refs": {"$regex": ref_re}, "status": "public"},
								{"id": 1, "title": 1, "owner": 1, "included_refs": 1})
	for sheet in sheets:
		# Check for multiple matching refs within this sheet
		matched_refs = [r for r in sheet["included_refs"] if regex.match(ref_re, r)]
		for match in matched_refs:
			try:
				match = model.Ref(match)
			except InputError:
				continue
			com                = {}
			com["category"]    = "Sheets"
			com["type"]        = "sheet"
			com["owner"]       = sheet["owner"]
			com["_id"]         = str(sheet["_id"])
			com["anchorRef"]   = match.normal()
			com["anchorVerse"] = match.sections[-1]
			com["public"]      = True
			com["commentator"] = user_link(sheet["owner"])
			com["text"]        = "<a class='sheetLink' href='/sheets/%d'>%s</a>" % (sheet["id"], strip_tags(sheet["title"]))

			results.append(com)

	return results


def update_sheet_tags(sheet_id, tags):
	"""
	Sets the tag list for sheet_id to those listed in list 'tags'.
	"""
	tags = list(set(tags)) 	# tags list should be unique
	db.sheets.update({"id": sheet_id}, {"$set": {"tags": tags}})

	return {"status": "ok"}


def get_last_updated_time(sheet_id):
	"""
	Returns a timestamp of the last modified date for sheet_id.
	"""
	if sheet_id in last_updated:
		return last_updated[sheet_id]

	sheet = db.sheets.find_one({"id": sheet_id}, {"dateModified": 1})

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

	sheet_list = db.sheets.find({"status": 3})
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


def get_sheets_by_tag(tag, public=True, uid=None, group=None):
	"""
	Returns all sheets tagged with 'tag'
	"""
	query = {"tags": tag } if tag else {"tags": {"$exists": 0}}

	if uid:
		query["owner"] = uid
	elif group:
		query["group"] = group
	elif public:
		query["status"] = "public"

	print query
	sheets = db.sheets.find(query).sort([["views", -1]])
	return sheets


def add_like_to_sheet(sheet_id, uid):
	"""
	Add uid as a liker of sheet_id.
	"""
	db.sheets.update({"id": sheet_id}, {"$addToSet": {"likes": uid}})
	sheet = get_sheet(sheet_id)

	notification = Notification({"uid": sheet["owner"]})
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


def broadcast_sheet_publication(publisher_id, sheet_id):
	"""
	Notify everyone who follows publisher_id about sheet_id's publication
	"""
	followers = FollowersSet(publisher_id)
	for follower in followers.uids:
		n = Notification({"uid": follower})
		n.make_sheet_publish(publisher_id=publisher_id, sheet_id=sheet_id)
		n.save()


def make_sheet_from_text(text, sources=None, uid=1, generatedBy=None, title=None):
	"""
	Creates a source sheet owned by 'uid' that includes all of 'text'.
	'sources' is a list of strings naming commentators or texts to includes a subsources.
	"""
	oref  = model.Ref(text)
	sheet = {
		"title": title if title else oref.normal() if not sources else oref.normal() + " with " + ", ".join([s.replace(" on " + text, "") for s in sources]),
		"sources": [],
		"status": 0,
		"options": {"numbered": 0, "divineNames": "noSub"},
		"generatedBy": generatedBy or "make_sheet_from_text",
		"promptedToPublish": datetime.now().isoformat(),
	}

	i     = oref.index
	leafs = i.nodes.get_leaf_nodes()
	for leaf in leafs:
		refs = []
		if leaf.first_section_ref() != leaf.last_section_ref():
			leaf_spanning_ref = leaf.first_section_ref().to(leaf.last_section_ref())
			refs += [ref for ref in leaf_spanning_ref.split_spanning_ref() if oref.contains(ref)]
		else:
			refs.append(leaf.ref())

		for ref in refs:
			ref_dict = { "ref": ref.normal() }
			if sources:
				ref_dict["subsources"] = []
				subsources = ref.linkset().filter(sources)
				for sub in subsources:
					subref = sub.refs[1] if regex.match(ref.regex(), sub.refs[0]) else sub.refs[0]
					ref_dict["subsources"].append({"ref": subref})
				ref_dict["subsources"] = sorted(ref_dict["subsources"], key=lambda x : x["ref"])

			sheet["sources"].append(ref_dict)

	return save_sheet(sheet, uid)




