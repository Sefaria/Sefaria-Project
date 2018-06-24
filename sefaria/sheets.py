# -*- coding: utf-8 -*-
"""
sheets.py - backend core for Sefaria Source sheets

Writes to MongoDB Collection: sheets
"""
import regex
import dateutil.parser
from datetime import datetime, timedelta
from bson.son import SON
from collections import defaultdict

import sefaria.model as model
import sefaria.model.abstract as abstract
from sefaria.system.database import db
from sefaria.model.notification import Notification, NotificationSet
from sefaria.model.following import FollowersSet
from sefaria.model.user_profile import UserProfile, annotate_user_list, public_user_data, user_link
from sefaria.utils.util import strip_tags, string_overlap, titlecase
from sefaria.system.exceptions import InputError
from sefaria.system.cache import django_cache_decorator
from history import record_sheet_publication, delete_sheet_publication
from settings import SEARCH_INDEX_ON_SAVE
import search
import sys
import hashlib
import urllib

if not hasattr(sys, '_doc_build'):
	from django.contrib.auth.models import User
from django.contrib.humanize.templatetags.humanize import naturaltime



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
	if "assigner_id" in sheet:
		asignerData = public_user_data(sheet["assigner_id"])
		sheet["assignerName"]  = asignerData["name"]
	if "viaOwner" in sheet:
		viaOwnerData = public_user_data(sheet["viaOwner"])
		sheet["viaOwnerName"]  = viaOwnerData["name"]
	ownerData = public_user_data(sheet["owner"])
	sheet["ownerName"]  = ownerData["name"]
	sheet["naturalDateCreated"] = naturaltime(datetime.strptime(sheet["dateCreated"], "%Y-%m-%dT%H:%M:%S.%f"))
	return sheet

def user_sheets(user_id, sort_by="date", limit=0, skip=0):
	query = {"owner": int(user_id)}
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
    if authenticated == True:
        query = {"status": {"$in": ["unlisted", "public"]}, "group": group}
    else:
        query = {"status": "public", "group": group}

    response = {
        "sheets": sheet_list(query=query, sort=[["title", 1]]),
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
		"modified": dateutil.parser.parse(sheet["dateModified"]).strftime("%m/%d/%Y"),
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
	Returns tags ordered by count for sheets matching query.
	"""
	if sort_by == "count":
		sort_query = SON([("count", -1), ("_id", -1)])
	elif sort_by == "alpha":
		sort_query = SON([("_id", 1)])
	elif sort_by == "trending":
		return recent_public_tags(days=14)
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


def recent_public_tags(days=14, ntags=14):
	"""
	Returns list of tag/counts on public sheets modified in the last 'days'.
	"""
	cutoff            = datetime.now() - timedelta(days=days)
	query             = {"status": "public", "dateModified": { "$gt": cutoff.isoformat() } }
	unnormalized_tags = sheet_tag_counts(query)[:ntags]

	tags = defaultdict(int)
	results = []

	for tag in unnormalized_tags:
		tags[model.Term.normalize(tag["tag"])] += tag["count"]

	for tag in tags.items():
		if len(tag[0]):
			results.append({"tag": tag[0], "count": tag[1]})

	results = sorted(results, key=lambda x: -x["count"])

	return results


def save_sheet(sheet, user_id, search_override=False):
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

		sheet["views"] = existing["views"] 										# prevent updating views
		sheet["owner"] = existing["owner"] 										# prevent updating owner
		sheet["likes"] = existing["likes"] if "likes" in existing else [] 		# prevent updating likes

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
		if sheet["status"] == "public" and "datePublished" not in sheet:
			# PUBLISH
			sheet["datePublished"] = datetime.now().isoformat()
			record_sheet_publication(sheet["id"], user_id)
			broadcast_sheet_publication(user_id, sheet["id"])
		if sheet["status"] != "public":
			# UNPUBLISH
			delete_sheet_publication(sheet["id"], user_id)
			NotificationSet({"type": "sheet publish",
								"content.publisher_id": user_id,
								"content.sheet_id": sheet["id"]
							}).delete()

	db.sheets.update({"id": sheet["id"]}, sheet, True, False)

	if "tags" in sheet:
		update_sheet_tags(sheet["id"], sheet["tags"])


	if sheet["status"] == "public" and SEARCH_INDEX_ON_SAVE and not search_override:
		index_name = search.get_new_and_current_index_names()['current']
		search.index_sheet(index_name, sheet["id"])

	'''
	global last_updated
	last_updated[sheet["id"]] = sheet["dateModified"]
	'''

	return sheet


def is_valid_source(source):
	if not ("ref" in source or "outsideText" in source or "outsideBiText" in source or "comment" in source or "media" in source):
		return False
	return True


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


def get_top_sheets(limit=3):
	"""
	Returns 'top' sheets according to some magic heuristic.
	Currently: return the most recently active sheets with more than 100 views. 
	"""
	query = {"status": "public", "views": {"$gte": 100}}
	return sheet_list(query=query, limit=limit)


def get_sheets_for_ref(tref, uid=None):
	"""
	Returns a list of sheets that include ref,
	formating as need for the Client Sidebar.
	If `uid` is present return user sheets, otherwise return public sheets. 
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
	sheetsObj = db.sheets.find(query,
		{"id": 1, "title": 1, "owner": 1, "viaOwner":1, "via":1, "dateCreated": 1, "includedRefs": 1, "views": 1, "tags": 1, "status": 1, "summary":1, "attribution":1, "assigner_id":1, "likes":1, "options":1}).sort([["views", -1]])
	sheets = list((s for s in sheetsObj))
	user_ids = list(set([s["owner"] for s in sheets]))
	django_user_profiles = User.objects.filter(id__in=user_ids).values('email','first_name','last_name','id')
	user_profiles = {item['id']: item for item in django_user_profiles}
	mongo_user_profiles = list(db.profiles.find({"id": {"$in": user_ids}},{"id":1,"slug":1}))
	mongo_user_profiles = {item['id']: item for item in mongo_user_profiles}
	for profile in user_profiles:
		user_profiles[profile]["slug"] = mongo_user_profiles[profile]["slug"]

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
			ownerData = user_profiles.get(sheet["owner"], {'first_name': u'Ploni', 'last_name': u'Almoni', 'email': u'test@sefaria.org', 'slug': 'Ploni-Almoni', 'id': None})

			default_image = "https://www.sefaria.org/static/img/profile-default.png"
			gravatar_base = "https://www.gravatar.com/avatar/" + hashlib.md5(ownerData["email"].lower()).hexdigest() + "?"
			gravatar_url_small = gravatar_base + urllib.urlencode({'d': default_image, 's': str(80)})

			if "assigner_id" in sheet:
				asignerData = public_user_data(sheet["assigner_id"])
				sheet["assignerName"] = asignerData["name"]
				sheet["assignerProfileUrl"] = asignerData["profileUrl"]
			if "viaOwner" in sheet:
				viaOwnerData = public_user_data(sheet["viaOwner"])
				sheet["viaOwnerName"] = viaOwnerData["name"]
				sheet["viaOwnerProfileUrl"] = viaOwnerData["profileUrl"]

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
				"ownerName":       ownerData["first_name"]+" "+ownerData["last_name"],
				"via":			   sheet.get("via", None),
				"viaOwnerName":	   sheet.get("viaOwnerName", None),
				"assignerName":	   sheet.get("assignerName", None),
				"viaOwnerProfileUrl":	   sheet.get("viaOwnerProfileUrl", None),
				"assignerProfileUrl":	   sheet.get("assignerProfileUrl", None),
				"ownerProfileUrl": "/profile/" + ownerData["slug"],
				"ownerImageUrl":   gravatar_url_small,
				"status":          sheet["status"],
				"views":           sheet["views"],
				"tags":            sheet.get("tags", []),
				"likes":           sheet.get("likes", []),
				"summary":         sheet.get("summary", None),
				"attribution":     sheet.get("attribution", None),
				"category":        "Sheets", # ditto
				"type":            "sheet", # ditto
			}

			results.append(sheet_data)


	return results


def update_sheet_tags(sheet_id, tags):
	"""
	Sets the tag list for sheet_id to those listed in list 'tags'.
	"""
	tags = list(set(tags)) 	# tags list should be unique
	normalizedTags = [titlecase(tag) for tag in tags]
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


@django_cache_decorator(time=(60 * 60))
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

	for tag in tags.items():
		if len(tag[0]):
			results.append({"tag": tag[0], "count": tag[1]})

	sort_keys =  {
		"alpha": lambda x: x["tag"],
		"count": lambda x: -x["count"],
		"alpha-hebrew": lambda x: x["tag"] if len(x["tag"]) and x["tag"][0] in u"אבגדהוזחטיכלמנסעפצקרשת0123456789" else u"ת" + x["tag"],
	}
	results = sorted(results, key=sort_keys[sort_by])

	return results


def get_sheets_by_tag(tag, public=True, uid=None, group=None):
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

	sheets = db.sheets.find(query).sort([["views", -1]])
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
	followers = FollowersSet(publisher_id)
	for follower in followers.uids:
		n = Notification({"uid": follower})
		n.make_sheet_publish(publisher_id=publisher_id, sheet_id=sheet_id)
		n.save()


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
# TODO fix me to reflect new structure where subsources and included_refs no longer exist.

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
		"included_refs",
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
		"summary" # double check this one
	]

	def regenerate_contained_refs(self):
		self.included_refs = refs_in_sources(self.sources)
		self.save()

	def get_contained_refs(self):
		return [model.Ref(r) for r in self.included_refs]

	def is_hebrew(self):
		"""Returns True if this sheet appears to be in Hebrew according to its title"""
		from sefaria.utils.hebrew import is_hebrew
		import regex
		title = strip_tags(self.title)
		# Consider a sheet Hebrew if its title contains Hebrew character but no English characters
		return is_hebrew(title) and not regex.search(u"[a-z|A-Z]", title)


class SheetSet(abstract.AbstractMongoSet):
	recordClass = Sheet


def change_tag(old_tag, new_tag_or_list):
	# new_tag_or_list can be either a string or a list of strings
	# if a list of strings, then old_tag is replaced with all of the tags in the list

	new_tag_list = [new_tag_or_list] if isinstance(new_tag_or_list, basestring) else new_tag_or_list

	for sheet in SheetSet({"tags": old_tag}):
		sheet.tags = [tag for tag in sheet.tags if tag != old_tag] + new_tag_list
		sheet.save()