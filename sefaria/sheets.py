# -*- coding: utf-8 -*-
"""
sheets.py - backend core for Sefaria Source sheets

Writes to MongoDB Collection: sheets
"""
import regex
import dateutil.parser
import bleach
from datetime import datetime, timedelta
from bson.son import SON
from collections import defaultdict

import sefaria.model as model
import sefaria.model.abstract as abstract
from sefaria.system.database import db
from sefaria.model.notification import Notification, NotificationSet
from sefaria.model.following import FollowersSet
from sefaria.model.user_profile import UserProfile, annotate_user_list, public_user_data, user_link
from sefaria.model.group import Group
from sefaria.model.story import UserStory, UserStorySet
from sefaria.utils.util import strip_tags, string_overlap, titlecase
from sefaria.system.exceptions import InputError
from pymongo.errors import DuplicateKeyError
from sefaria.system.cache import django_cache
from .history import record_sheet_publication, delete_sheet_publication
from .settings import SEARCH_INDEX_ON_SAVE
from . import search
import sys
import hashlib
import urllib.request, urllib.parse, urllib.error
import logging
logger = logging.getLogger(__name__)

if not hasattr(sys, '_doc_build'):
	from django.contrib.auth.models import User
from django.contrib.humanize.templatetags.humanize import naturaltime

import logging
logger = logging.getLogger(__name__)


# Simple cache of the last updated time for sheets
# last_updated = {}


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


def get_sheet_metadata(id = None):
	assert id
	s = db.sheets.find_one({"id": int(id)}, {"title": 1, "owner": 1, "summary": 1, "ownerImageUrl": 1})
	return s


def get_sheet_node(sheet_id=None, node_id=None):
	"""
	Returns the source sheet with id.
	"""
	if sheet_id is None:
		return {"error": "No sheet id given."}
	if node_id is None:
		return {"error": "No node id given."}
	s = db.sheets.find_one({
		"id": int(sheet_id),
		"sources.node": int(node_id)
	}, {
		"sources.$": 1,
		"_id": 0
	})

	if not s:
		return {"error": "Couldn't find node with sheet id: %s and node id: %s" % (sheet_id, node_id)}
	return s["sources"][0]


def get_sheet_for_panel(id=None):
	sheet = get_sheet(id)
	if "error" in sheet:
		return sheet
	if "assigner_id" in sheet:
		asignerData = public_user_data(sheet["assigner_id"])
		sheet["assignerName"]  = asignerData["name"]
	if "viaOwner" in sheet:
		viaOwnerData = public_user_data(sheet["viaOwner"])
		sheet["viaOwnerName"]  = viaOwnerData["name"]
	ownerData = public_user_data(sheet["owner"])
	sheet["ownerName"]  = ownerData["name"]
	sheet["ownerProfileUrl"] = public_user_data(sheet["owner"])["profileUrl"]
	sheet["ownerImageUrl"] = public_user_data(sheet["owner"])["imageUrl"]
	sheet["naturalDateCreated"] = naturaltime(datetime.strptime(sheet["dateCreated"], "%Y-%m-%dT%H:%M:%S.%f"))
	sheet["sources"] = annotate_user_links(sheet["sources"])
	if "group" in sheet:
		group = Group().load({"name": sheet["group"]})
		try:
			sheet["groupLogo"] = group.imageUrl
		except:
			sheet["groupLogo"] = None
	return sheet

def user_sheets(user_id, sort_by="date", limit=0, skip=0, private=True):
	query = {"owner": int(user_id)}
	if not private:
		query["status"] = "public"
	if sort_by == "date":
		sort = [["dateModified", -1]]
	elif sort_by == "views":
		sort = [["views", -1]]

	response = {
		"sheets": sheet_list(query=query, sort=sort, limit=limit, skip=skip)
	}
	return response


def public_sheets(sort=[["dateModified", -1]], limit=50, skip=0):
	query = {"status": "public"}
	response = {
		"sheets": sheet_list(query=query, sort=sort, limit=limit, skip=skip)
	}
	return response


def group_sheets(group, authenticated):
	islisted = getattr(group, "listed", False)
	if authenticated == False and islisted:
		query = {"status": "public", "group": group.name}
	else:
		query = {"status": {"$in": ["unlisted", "public"]}, "group": group.name}

	response = {
		"sheets": sheet_list(query=query),
	}
	return response


def sheet_list(query=None, sort=None, skip=0, limit=None):
	"""
	Returns a list of sheets with only fields needed for displaying a list.
	"""
	projection = {
		"id": 1,
		"title": 1,
		"status": 1,
		"owner": 1,
		"views": 1,
		"dateModified": 1,
		"dateCreated": 1,
		"tags": 1,
		"group": 1,
	}
	if not query:
		return []
	sort = sort if sort else [["dateModified", -1]]
	sheets = db.sheets.find(query, projection).sort(sort).skip(skip)
	if limit:
		sheets = sheets.limit(limit)

	return [sheet_to_dict(s) for s in sheets]

def annotate_user_links(sources):
	"""
	Search a sheet for any addedBy fields (containg a UID) and add corresponding user links.
	"""
	for source in sources:
		if "addedBy" in source:
			source["userLink"] = user_link(source["addedBy"])
	return sources

def sheet_to_dict(sheet):
	"""
	Returns a JSON serializable dictionary of Mongo document `sheet`.
	Annotates sheet with user profile info that is useful to client.
	"""
	profile = public_user_data(sheet["owner"])
	sheet_dict = {
		"id": sheet["id"],
		"title": strip_tags(sheet["title"]) if "title" in sheet else "Untitled Sheet",
		"status": sheet["status"],
		"author": sheet["owner"],
		"ownerName": profile["name"],
		"ownerImageUrl": profile["imageUrl"],
		"views": sheet["views"],
		"group": sheet.get("group", None),
		"modified": dateutil.parser.parse(sheet["dateModified"]).strftime("%m/%d/%Y"),
		"created": sheet.get("dateCreated", None),
		"tags": sheet["tags"] if "tags" in sheet else [],
		"options": sheet["options"] if "options" in sheet else [],
	}
	return sheet_dict


def user_tags(uid):
	"""
	Returns a list of tags that `uid` has, ordered by tag order in user profile (if existing)
	"""
	user_tags = sheet_tag_counts({"owner": uid})
	user_tags = order_tags_for_user(user_tags, uid)
	return user_tags


def sheet_tag_counts(query, sort_by="count"):
	"""
	Returns tags ordered by count for sheets matching `query`.
	"""
	if sort_by == "count":
		sort_query = SON([("count", -1), ("_id", -1)])
	elif sort_by == "alpha":
		sort_query = SON([("_id", 1)])
	else:
		return []

	tags = db.sheets.aggregate([
			{"$match": query },
			{"$unwind": "$tags"},
			{"$group": {"_id": "$tags", "count": {"$sum": 1}}},
			{"$sort": sort_query },
			{"$project": { "_id": 0, "tag": "$_id", "count": "$count"}}], cursor={})
	tags = list(tags)
	return tags


def order_tags_for_user(tag_counts, uid):
	"""
	Returns of list of tag/count dicts order according to user's preference,
	Adds empty tags if any appear in user's sort list but not in tags passed in
	"""
	profile   = UserProfile(id=uid)
	tag_order = getattr(profile, "tag_order", None)
	if tag_order:
		empty_tags = tag_order[:]
		tags = [tag_count["tag"] for tag_count in tag_counts]
		empty_tags = [tag for tag in tag_order if tag not in tags]

		for tag in empty_tags:
			tag_counts.append({"tag": tag, "count": 0})
		try:
			tag_counts = sorted(tag_counts, key=lambda x: tag_order.index(x["tag"]))
		except:
			pass

	return tag_counts


def trending_tags(days=7, ntags=14):
	"""
	Returns a list of trending tags plus sheet count and author count modified in the last `days`.
	"""
	cutoff = datetime.now() - timedelta(days=days)
	query  = {
		"status": "public",
		"dateModified": { "$gt": cutoff.isoformat() },
		"viaOwner": {"$exists": 0},
		"assignment_id": {"$exists": 0}
	}

	tags = db.sheets.aggregate([
			{"$match": query },
			{"$unwind": "$tags"},
			{"$group": {"_id": "$tags", "sheet_count": {"$sum": 1}, "authors": {"$addToSet": "$owner"}}},
			{"$project": { "_id": 0, "tag": "$_id", "sheet_count": "$sheet_count", "authors": "$authors"}}], cursor={})

	unnormalized_tags = list(tags)
	tags = defaultdict(lambda: {"sheet_count": 0, "authors": set()})
	results = []

	for tag in unnormalized_tags:
		norm_term = model.Term.normalize(tag["tag"])
		tags[norm_term]["sheet_count"] += tag["sheet_count"]
		tags[norm_term]["authors"].update(set(tag["authors"]))

	for tag in list(tags.items()):
		if len(tag[0]) and len(tag[1]["authors"]) > 1:  # A trend needs to include at least 2 people
			results.append({"tag": tag[0],
							"count": tag[1]["sheet_count"],
							"author_count": len(tag[1]["authors"]),
							"he_tag": model.Term.normalize(tag[0], "he")})

	results = sorted(results, key=lambda x: -x["author_count"])

	return results[:ntags]


def rebuild_sheet_nodes(sheet):
	def find_next_unused_node(node_number, used_nodes):
		while True:
			node_number += 1
			if node_number not in used_nodes:
				return node_number

	try:
		sheet_id = sheet["id"]
	except KeyError:  # this will occur on new sheets, as we won't know the id until the sheet is succesfully saved
		sheet_id = 'New Sheet'
	next_node, checked_sources, nodes_used = 0, [], set()

	for source in sheet.get("sources", []):
		if "node" not in source:
			print("adding nodes to sheet {}".format(sheet_id))
			next_node = find_next_unused_node(next_node, nodes_used)
			source["node"] = next_node

		elif source["node"] is None:
			print("found null node in sheet {}".format(sheet_id))
			next_node = find_next_unused_node(next_node, nodes_used)
			source["node"] = next_node
			nodes_used.add(next_node)

		elif source["node"] in nodes_used:
			print("found repeating node in sheet " + str(sheet_id))
			next_node = find_next_unused_node(next_node, nodes_used)
			source["node"] = next_node

		nodes_used.add(source["node"])

		if "ref" in source and "text" not in source:
			print("adding sources to sheet {}".format(sheet_id))
			source["text"] = {}

			try:
				oref = model.Ref(source["ref"])
				tc_eng = model.TextChunk(oref, "en")
				tc_heb = model.TextChunk(oref, "he")
				if tc_eng:
					source["text"]["en"] = tc_eng.ja().flatten_to_string()
				if tc_heb:
					source["text"]["he"] = tc_heb.ja().flatten_to_string()

			except:
				print("error on {} on sheet {}".format(source["ref"], sheet_id))
				continue

		checked_sources.append(source)

	sheet["sources"] = checked_sources
	sheet["nextNode"] = find_next_unused_node(next_node, nodes_used)
	return sheet


def save_sheet(sheet, user_id, search_override=False, rebuild_nodes=False):
	"""
	Saves sheet to the db, with user_id as owner.
	"""
	def next_sheet_id():
		last_id = db.sheets.find().sort([['id', -1]]).limit(1)
		if last_id.count():
			sheet_id = last_id.next()["id"] + 1
		else:
			sheet_id = 1
		return sheet_id

	sheet["dateModified"] = datetime.now().isoformat()
	status_changed = False
	if "id" in sheet:
		new_sheet = False
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

		sheet["views"] = existing["views"] 										# prevent updating views
		sheet["owner"] = existing["owner"] 										# prevent updating owner
		sheet["likes"] = existing["likes"] if "likes" in existing else [] 		# prevent updating likes

		existing.update(sheet)
		sheet = existing

	else:
		new_sheet = True
		sheet["dateCreated"] = datetime.now().isoformat()
		if "status" not in sheet:
			sheet["status"] = "unlisted"
		sheet["owner"] = user_id
		sheet["views"] = 1

		#ensure that sheet sources have nodes (primarily for sheets posted via API)
		nextNode = sheet.get("nextNode", 1)
		sheet["nextNode"] = nextNode
		checked_sources = []
		for source in sheet["sources"]:
			if "node" not in source:
				source["node"] = nextNode
				nextNode += 1
			checked_sources.append(source)
		sheet["sources"] = checked_sources

	if status_changed and not new_sheet:
		if sheet["status"] == "public" and "datePublished" not in sheet:
			# PUBLISH
			sheet["datePublished"] = datetime.now().isoformat()
			record_sheet_publication(sheet["id"], user_id)  # record history
			broadcast_sheet_publication(user_id, sheet["id"])
		if sheet["status"] != "public":
			# UNPUBLISH
			delete_sheet_publication(sheet["id"], user_id)  # remove history
			UserStorySet({"storyForm": "publishSheet",
								"data.publisher": user_id,
								"data.sheet_id": sheet["id"]
							}).delete()
			NotificationSet({"type": "sheet publish",
								"content.publisher_id": user_id,
								"content.sheet_id": sheet["id"]
							}).delete()

	sheet["includedRefs"] = refs_in_sources(sheet.get("sources", []))

	if rebuild_nodes:
		sheet = rebuild_sheet_nodes(sheet)

	if new_sheet:
		# mongo enforces a unique sheet id, get a new id until a unique one has been found
		while True:
			try:
				sheet["id"] = next_sheet_id()
				db.sheets.insert_one(sheet)
				break
			except DuplicateKeyError:
				pass

	else:
		db.sheets.find_one_and_replace({"id": sheet["id"]}, sheet)

	if "tags" in sheet:
		update_sheet_tags(sheet["id"], sheet["tags"])

	if sheet["status"] == "public" and SEARCH_INDEX_ON_SAVE and not search_override:
		try:
			index_name = search.get_new_and_current_index_names("sheet")['current']
			search.index_sheet(index_name, sheet["id"])
		except:
			logger.error("Failed index on " + str(sheet["id"]))

	'''
	global last_updated
	last_updated[sheet["id"]] = sheet["dateModified"]
	'''

	return sheet


def is_valid_source(source):
	if not ("ref" in source or "outsideText" in source or "outsideBiText" in source or "comment" in source or "media" in source):
		return False
	return True


def bleach_text(text):
	ok_sheet_tags = ['blockquote', 'p', 'a', 'ul', 'ol', 'nl', 'li', 'b', 'i', 'strong', 'em', 'small', 'big', 'span', 'strike',
			'hr', 'br', 'div', 'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'sup', 'u']

	ok_sheet_attrs = {'a': [ 'href', 'name', 'target', 'data-ref' ],'img': [ 'src' ], 'p': ['style'], 'span': ['style'], 'div': ['style'], 'td': ['colspan'],"*": ["class"]}

	ok_sheet_styles = ['color', 'background-color', 'text-align']

	return bleach.clean(text, tags=ok_sheet_tags, attributes=ok_sheet_attrs, styles=ok_sheet_styles, strip=True)



def clean_source(source):
	if "ref" in source:
		source["text"]["he"] = bleach_text(source["text"]["he"])
		source["text"]["en"] = bleach_text(source["text"]["en"])

	elif "outsideText" in source:
		source["outsideText"] = bleach_text(source["outsideText"])

	elif "comment" in source:
		source["comment"] = bleach_text(source["comment"])

	elif "outsideBiText" in source:
		source["outsideBiText"]["he"] = bleach_text(source["outsideBiText"]["he"])
		source["outsideBiText"]["en"] = bleach_text(source["outsideBiText"]["en"])

	return source


def add_source_to_sheet(id, source, note=None):
	"""
	Add source to sheet 'id'.
	Source is a dictionary that includes one of the following:
		'ref' (indicating a source)
		'outsideText' (indicating a single language outside text)
		'outsideBiText' (indicating a bilingual outside text)
		'comment' (indicating a comment)
		'media' (indicating a media object)
	if string `note` is present, add it as a coment immediately after the source.
		pass
	"""
	if not is_valid_source(source):
		return {"error": "Malformed source could not be added to sheet"}
	sheet = db.sheets.find_one({"id": id})
	if not sheet:
		return {"error": "No sheet with id %s." % (id)}
	sheet["dateModified"] = datetime.now().isoformat()
	nextNode = sheet.get("nextNode", 1)
	source["node"] = nextNode
	sheet["nextNode"] = nextNode + 1
	sheet["sources"].append(source)
	if note:
		sheet["sources"].append({"outsideText": note, "options": {"indented": "indented-1"}})
	db.sheets.save(sheet)
	return {"status": "ok", "id": id, "source": source}

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


def refs_in_sources(sources, refine_refs=False):
	"""
	Returns a list of refs found in sources.
	"""
	refs = []
	for source in sources:
		if "ref" in source:
			ref = source["ref"]
			if refine_refs:
				text = source.get("text", {}).get("he", None)
				ref  = refine_ref_by_text(ref, text) if text else source["ref"]
			refs.append(ref)
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
		if not isinstance(hay[n], str):
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


def update_included_refs(query=None, hours=None, refine_refs=False):
	"""
	Rebuild included_refs index on sheets matching `query` or sheets
	that have been modified in the last `hours`.
	"""
	if hours:
		cutoff = datetime.now() - timedelta(hours=hours)
		query = { "dateModified": { "$gt": cutoff.isoformat() } }

	if query is None:
		print("Specify either a query or number of recent hours to update.")
		return

	sheets = db.sheets.find(query)

	for sheet in sheets:
		sources = sheet.get("sources", [])
		refs = refs_in_sources(sources, refine_refs=refine_refs)
		db.sheets.update({"_id": sheet["_id"]}, {"$set": {"includedRefs": refs}})


def get_top_sheets(limit=3):
	"""
	Returns 'top' sheets according to some magic heuristic.
	Currently: return the most recently active sheets with more than 100 views.
	"""
	query = {"status": "public", "views": {"$gte": 100}}
	return sheet_list(query=query, limit=limit)


def get_sheets_for_ref(tref, uid=None, in_group=None):
	"""
	Returns a list of sheets that include ref,
	formating as need for the Client Sidebar.
	If `uid` is present return user sheets, otherwise return public sheets.
	If `in_group` (list) is present, only return sheets in one of the listed groups.
	"""
	oref = model.Ref(tref)
	# perform initial search with context to catch ranges that include a segment ref
	regex_list = oref.context_ref().regex(as_list=True)
	ref_clauses = [{"includedRefs": {"$regex": r}} for r in regex_list]
	query = {"$or": ref_clauses }
	if uid:
		query["owner"] = uid
	else:
		query["status"] = "public"
	if in_group:
		query["group"] = {"$in": in_group}
	sheetsObj = db.sheets.find(query,
		{"id": 1, "title": 1, "owner": 1, "viaOwner":1, "via":1, "dateCreated": 1, "includedRefs": 1, "views": 1, "tags": 1, "status": 1, "summary":1, "attribution":1, "assigner_id":1, "likes":1, "group":1, "options":1}).sort([["views", -1]])
	sheets = list((s for s in sheetsObj))
	user_ids = list(set([s["owner"] for s in sheets]))
	django_user_profiles = User.objects.filter(id__in=user_ids).values('email','first_name','last_name','id')
	user_profiles = {item['id']: item for item in django_user_profiles}
	mongo_user_profiles = list(db.profiles.find({"id": {"$in": user_ids}},{"id":1,"slug":1,"profile_pic_url_small":1}))
	mongo_user_profiles = {item['id']: item for item in mongo_user_profiles}
	for profile in user_profiles:
		try:
			user_profiles[profile]["slug"] = mongo_user_profiles[profile]["slug"]
		except:
			user_profiles[profile]["slug"] = "/"

		try:
			user_profiles[profile]["profile_pic_url_small"] = mongo_user_profiles[profile].get("profile_pic_url_small", '')
		except:
			user_profiles[profile]["profile_pic_url_small"] = ""

	ref_re = "("+'|'.join(regex_list)+")"
	results = []
	for sheet in sheets:
		potential_matches = [r for r in sheet["includedRefs"] if r.startswith(oref.index.title)]
		matched_refs = [r for r in potential_matches if regex.match(ref_re, r)]

		for match in matched_refs:
			try:
				match = model.Ref(match)
			except InputError:
				continue
			ownerData = user_profiles.get(sheet["owner"], {'first_name': 'Ploni', 'last_name': 'Almoni', 'email': 'test@sefaria.org', 'slug': 'Ploni-Almoni', 'id': None, 'profile_pic_url_small': ''})
			if len(ownerData.get('profile_pic_url_small', '')) == 0:
				default_image = "https://www.sefaria.org/static/img/profile-default.png"
				gravatar_base = "https://www.gravatar.com/avatar/" + hashlib.md5(ownerData["email"].lower().encode('utf-8')).hexdigest() + "?"
				gravatar_url_small = gravatar_base + urllib.parse.urlencode({'d':default_image, 's':str(80)})
				ownerData['profile_pic_url_small'] = gravatar_url_small
			if "assigner_id" in sheet:
				asignerData = public_user_data(sheet["assigner_id"])
				sheet["assignerName"] = asignerData["name"]
				sheet["assignerProfileUrl"] = asignerData["profileUrl"]
			if "viaOwner" in sheet:
				viaOwnerData = public_user_data(sheet["viaOwner"])
				sheet["viaOwnerName"] = viaOwnerData["name"]
				sheet["viaOwnerProfileUrl"] = viaOwnerData["profileUrl"]

			if "group" in sheet:
				group = Group().load({"name": sheet["group"]})
				sheet["groupLogo"]       = getattr(group, "imageUrl", None)
				sheet["groupTOC"]        = getattr(group, "toc", None)

			sheet_data = {
				"owner":           sheet["owner"],
				"_id":             str(sheet["_id"]),
				"id":              str(sheet["id"]),
				"anchorRef":       match.normal(),
				"anchorVerse":     match.sections[-1] if len(match.sections) else 1,
				"public":          sheet["status"] == "public",
				"title":           strip_tags(sheet["title"]),
				"sheetUrl":        "/sheets/" + str(sheet["id"]),
				"options": 		   sheet["options"],
				"naturalDateCreated": naturaltime(datetime.strptime(sheet["dateCreated"], "%Y-%m-%dT%H:%M:%S.%f")),
				"group":           sheet.get("group", None),
				"groupLogo" : 	   sheet.get("groupLogo", None),
				"groupTOC":        sheet.get("groupTOC", None),
				"ownerName":       ownerData["first_name"]+" "+ownerData["last_name"],
				"via":			   sheet.get("via", None),
				"viaOwnerName":	   sheet.get("viaOwnerName", None),
				"assignerName":	   sheet.get("assignerName", None),
				"viaOwnerProfileUrl":	   sheet.get("viaOwnerProfileUrl", None),
				"assignerProfileUrl":	   sheet.get("assignerProfileUrl", None),
				"ownerProfileUrl": "/profile/" + ownerData["slug"],
				"ownerImageUrl":   ownerData.get('profile_pic_url_small',''),
				"status":          sheet["status"],
				"views":           sheet["views"],
				"tags":            sheet.get("tags", []),
				"likes":           sheet.get("likes", []),
				"summary":         sheet.get("summary", None),
				"attribution":     sheet.get("attribution", None),
				"is_featured":     sheet.get("is_featured", False),
				"category":        "Sheets", # ditto
				"type":            "sheet", # ditto
			}

			results.append(sheet_data)

			break

	return results


def update_sheet_tags(sheet_id, tags):
	"""
	Sets the tag list for sheet_id to those listed in list 'tags'.
	"""
	tags = list(set(tags)) 	# tags list should be unique
	# replace | with - b/c | is a reserved char for search sheet queries when filtering on tags
	normalizedTags = [titlecase(tag).replace('|','-') for tag in tags]
	db.sheets.update({"id": sheet_id}, {"$set": {"tags": normalizedTags}})

	return {"status": "ok"}


def get_last_updated_time(sheet_id):
	"""
	Returns a timestamp of the last modified date for sheet_id.
	"""
	'''
	if sheet_id in last_updated:
		return last_updated[sheet_id]
	'''

	sheet = db.sheets.find_one({"id": sheet_id}, {"dateModified": 1})

	if not sheet:
		return None

	'''
	last_updated[sheet_id] = sheet["dateModified"]
	'''
	return sheet["dateModified"]


@django_cache(timeout=(60 * 60))
def public_tag_list(sort_by="alpha"):
	"""
	Returns a list of all public tags, sorted either alphabetically ("alpha") or by popularity ("count")
	"""
	tags = defaultdict(int)
	results = []

	unnormalized_tags = sheet_tag_counts({"status": "public"})
	lang = "he" if sort_by == "alpha-hebrew" else "en"
	for tag in unnormalized_tags:
		tags[model.Term.normalize(tag["tag"], lang)] += tag["count"]

	for tag in list(tags.items()):
		if len(tag[0]):
			results.append({"tag": tag[0], "count": tag[1]})

	sort_keys =  {
		"alpha": lambda x: x["tag"],
		"count": lambda x: -x["count"],
		"alpha-hebrew": lambda x: x["tag"] if len(x["tag"]) and x["tag"][0] in "אבגדהוזחטיכלמנסעפצקרשת0123456789" else "ת" + x["tag"],
	}
	results = sorted(results, key=sort_keys[sort_by])

	return results


def get_sheets_by_tag(tag, public=True, uid=None, group=None, proj=None, limit=0, page=0):
	"""
	Returns all sheets tagged with 'tag'
	"""
	term = model.Term().load_by_title(tag)
	tags = term.get_titles() if term else [tag]
	query = {"tags": {"$in": tags} } if tag else {"tags": {"$exists": 0}}

	if uid:
		query["owner"] = uid
	elif group:
		query["group"] = group
	elif public:
		query["status"] = "public"

	sheets = db.sheets.find(query, proj).sort([["views", -1]]).limit(limit).skip(page * limit)
	return sheets


def add_visual_data(sheet_id, visualNodes, zoom):
	"""
	Adds visual layout data to db
	"""
	db.sheets.update({"id": sheet_id},{"$unset": { "visualNodes": "", "zoom": "" } })
	db.sheets.update({"id": sheet_id},{"$push": {"visualNodes": {"$each": visualNodes},"zoom" : zoom}})


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
	#todo: work on batch creation / save pattern
	followers = FollowersSet(publisher_id)
	for follower in followers.uids:
		n = Notification({"uid": follower})
		n.make_sheet_publish(publisher_id=publisher_id, sheet_id=sheet_id)
		n.save()
		UserStory.from_sheet_publish(follower, publisher_id, sheet_id).save()


def make_sheet_from_text(text, sources=None, uid=1, generatedBy=None, title=None, segment_level=False):
	"""
	Creates a source sheet owned by 'uid' that includes all of 'text'.
	'sources' is a list of strings naming commentators or texts to include.
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
			assert isinstance(leaf_spanning_ref, model.Ref)
			if segment_level:
				refs += [ref for ref in leaf_spanning_ref.all_segment_refs() if oref.contains(ref)]
			else:  # section level
				refs += [ref for ref in leaf_spanning_ref.split_spanning_ref() if oref.contains(ref)]
		else:
			refs.append(leaf.ref())

		for ref in refs:
			ref_dict = { "ref": ref.normal() }
			sheet["sources"].append(ref_dict)

	return save_sheet(sheet, uid)


# This is here as an alternative interface - it's not yet used, generally.

class Sheet(abstract.AbstractMongoRecord):
	collection = 'sheets'

	required_attrs = [
		"title",
		"sources",
		"status",
		"options",
		"dateCreated",
		"dateModified",
		"owner",
		"id"
	]
	optional_attrs = [
		"generatedBy",  # this had been required, but it's not always there.
		"is_featured",  # boolean - show this sheet, unsolicited.
		"includedRefs",
		"views",
		"nextNode",
		"tags",
		"promptedToPublish",
		"attribution",
		"datePublished",
		"lastModified",
		"via",
		"viaOwner",
		"assignment_id",
		"assigner_id",
		"likes",
		"group",
		"generatedBy",
		"highlighterTags",
		"summary" # double check this one
	]

	def is_hebrew(self):
		"""Returns True if this sheet appears to be in Hebrew according to its title"""
		from sefaria.utils.hebrew import is_hebrew
		import regex
		title = strip_tags(self.title)
		# Consider a sheet Hebrew if its title contains Hebrew character but no English characters
		return is_hebrew(title) and not regex.search("[a-z|A-Z]", title)


class SheetSet(abstract.AbstractMongoSet):
	recordClass = Sheet


def change_tag(old_tag, new_tag_or_list):
	# new_tag_or_list can be either a string or a list of strings
	# if a list of strings, then old_tag is replaced with all of the tags in the list

	new_tag_list = [new_tag_or_list] if isinstance(new_tag_or_list, str) else new_tag_or_list

	for sheet in SheetSet({"tags": old_tag}):
		sheet.tags = [tag for tag in sheet.tags if tag != old_tag] + new_tag_list
		sheet.save()
