# -*- coding: utf-8 -*-
"""
sheets.py - backend core for Sefaria Source sheets

Writes to MongoDB Collection: sheets
"""
from sefaria.client.util import jsonResponse
import sys
import hashlib
import urllib.request, urllib.parse, urllib.error
import structlog
import regex
import dateutil.parser
import bleach
from datetime import datetime, timedelta
from functools import wraps
from bson.son import SON
from collections import defaultdict
from pymongo.errors import DuplicateKeyError
import uuid

import sefaria.model as model
import sefaria.model.abstract as abstract
from sefaria.system.database import db
from sefaria.model.notification import Notification, NotificationSet
from sefaria.model.following import FollowersSet
from sefaria.model.user_profile import UserProfile, annotate_user_list, public_user_data, user_link
from sefaria.model.collection import Collection, CollectionSet
from sefaria.model.topic import TopicSet, Topic, RefTopicLink, RefTopicLinkSet
from sefaria.utils.util import strip_tags, string_overlap, titlecase
from sefaria.utils.tibetan import is_all_tibetan,has_tibetan
from sefaria.system.exceptions import InputError, DuplicateRecordError
from sefaria.system.cache import django_cache
from .history import record_sheet_publication, delete_sheet_publication
from .settings import SEARCH_INDEX_ON_SAVE
from . import search
from sefaria.google_storage_manager import GoogleStorageManager
import re
from django.http import Http404

logger = structlog.get_logger(__name__)

if not hasattr(sys, '_doc_build'):
	from django.contrib.auth.models import User
from django.contrib.humanize.templatetags.humanize import naturaltime

import structlog
logger = structlog.get_logger(__name__)


def get_sheet(id=None):
	"""
	Returns the source sheet with id.
	"""
	if id is None:
		return {"error": "No sheet id given."}
	s = db.sheets.find_one({"id": int(id)})
	if not s:
		return {"error": "Couldn't find sheet with id: %s" % (id)}
	s["topics"] = add_langs_to_topics(s.get("topics", []))
	s["_id"] = str(s["_id"])
	collections = CollectionSet({"sheets": id, "listed": True})
	s["collections"] = [{"name": collection.name, "slug": collection.slug} for collection in collections]
	return s


def get_sheet_metadata(id = None):
	"""Returns only metadata on the sheet document"""
	assert id
	s = db.sheets.find_one({"id": int(id)}, {"title": 1, "owner": 1, "summary": 1, "ownerImageUrl": 1, "via": 1})
	return s


def get_sheet_listing_data(id):
	"""Returns metadata on sheet document plus data about its author"""
	s = get_sheet_metadata(id)
	del s["_id"]
	s["title"] = strip_tags(s["title"]).replace("\n", " ")
	profile = public_user_data(s["owner"])
	s.update({
		"ownerName": profile["name"],
		"ownerImageUrl": profile["imageUrl"],
		"ownerProfileUrl": profile["profileUrl"],
		"ownerOrganization": profile["organization"],
	})
	return s


def get_sheet_metadata_bulk(id_list, public=True):
	query = {"id": {"$in": id_list}}
	if public:
		query['status'] = 'public'
	return db.sheets.find(query, {"id": 1, "title": 1, "owner": 1, "summary": 1, "ownerImageUrl": 1, "via": 1})


def get_sheet_node(sheet_id=None, node_id=None):
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
	if "spam_sheet_quarantine" in sheet and sheet["spam_sheet_quarantine"]:
		raise Http404
	if "error" in sheet and sheet["error"] != "Sheet updated.":
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
	sheet["sources"] = annotate_user_links(sheet["sources"])
	sheet["topics"] = add_langs_to_topics(sheet.get("topics", []))
	sheet["sheetNotice"] = present_sheet_notice(sheet.get("is_moderated", None))
	if "displayedCollection" in sheet:
		collection = Collection().load({"slug": sheet["displayedCollection"]})
		if collection:
			sheet["collectionImage"] = getattr(collection, "imageUrl", None)
			sheet["collectionName"] = collection.name
		else:
			del sheet["displayedCollection"]
	return sheet


def user_sheets(user_id, sort_by="date", limit=0, skip=0, private=True):
	query = {"owner": int(user_id)}
	if not private:
		query["status"] = "public"
	if sort_by == "date":
		sort = [["dateModified", -1]]
	elif sort_by == "views":
		sort = [["views", -1]]
	else:
		sort = None

	sheets = sheet_list(query=query, sort=sort, limit=limit, skip=skip)

	if private:
		sheets = annotate_user_collections(sheets, user_id)
	else:
		sheets = annotate_displayed_collections(sheets)

	response = {
		"sheets": sheets
	}
	return response


def public_sheets(sort=[["datePublished", -1]], limit=50, skip=0, lang=None, filtered=False):
	if filtered:
		query = {"status": "public", "sources.ref": {"$exists": True}}
	else:
		query = {"status": "public"}
	if lang:
		query["sheetLanguage"] = lang
	response = {
		"sheets": sheet_list(query=query, sort=sort, limit=limit, skip=skip)
	}
	return response


def sheet_list(query=None, sort=None, skip=0, limit=None):
	"""
	Returns a list of sheets with only fields needed for displaying a list.
	"""
	projection = {
		"id": 1,
		"title": 1,
		"summary": 1,
		"status": 1,
		"owner": 1,
		"views": 1,
		"dateModified": 1,
		"dateCreated": 1,
		"datePublished": 1,
		"topics": 1,
		"displayedCollection": 1,
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
		"summary": sheet.get("summary", None),
		"status": sheet["status"],
		"author": sheet["owner"],
		"ownerName": profile["name"],
		"ownerImageUrl": profile["imageUrl"],
		"ownerProfileUrl": profile["profileUrl"],
		"ownerOrganization": profile["organization"],
		"sheetUrl": "/sheets/" + str(sheet["id"]),
		"views": sheet["views"],
		"displayedCollection": sheet.get("displayedCollection", None),
		"modified": dateutil.parser.parse(sheet["dateModified"]).strftime("%m/%d/%Y"),
		"created": sheet.get("dateCreated", None),
		"published": sheet.get("datePublished", None),
		"topics": add_langs_to_topics(sheet.get("topics", [])),
		"tags": [t['asTyped'] for t in sheet.get("topics", [])],  # for backwards compatibility with mobile
		"options": sheet["options"] if "options" in sheet else [],
	}
	return sheet_dict



def add_sheet_to_collection(sheet_id, collection, is_sheet_owner, override_displayedCollection=False):
    sheet = db.sheets.find_one({"id": sheet_id})
    if not sheet:
        raise Exception("Sheet not found")
    if sheet["id"] not in collection.sheets:
        collection.sheets.append(sheet["id"])
        # If a sheet's owner adds it to a collection, and the sheet is not highlighted
        # in another collection, set it to highlight this collection.
        if is_sheet_owner and (not sheet.get("displayedCollection", None) or override_displayedCollection):
            sheet["displayedCollection"] = collection.slug
            db.sheets.save(sheet)


def change_sheet_owner(sheet_id, new_owner_id):
    sheet = db.sheets.find_one({"id": sheet_id})
    if not sheet:
        raise Exception("Sheet not found")
    sheet["owner"] = new_owner_id
    # The following info should not be stored -- delete it so it doesn't cause issues
    if "ownerImageUrl" in sheet:
        del sheet["ownerImageUrl"]
    if "ownerProfileUrl" in sheet:
        del sheet["ownerProfileUrl"]
    if "ownerOrganization" in sheet:
        sheet["ownerOrganization"]
    db.sheets.save(sheet)


def annotate_user_collections(sheets, user_id):
	"""
	Adds a `collections` field to each sheet in `sheets` which includes the collections
	that `user_id` has put that sheet in.
	"""
	sheet_ids = [sheet["id"] for sheet in sheets]
	user_collections = CollectionSet({"sheets": {"$in": sheet_ids}})
	for sheet in sheets:
		sheet["collections"] = []
		for collection in user_collections:
			if sheet["id"] in collection.sheets:
				sheet["collections"].append({"name": collection.name, "slug": collection.slug})

	return sheets


def annotate_displayed_collections(sheets):
	"""
	Adds `displayedCollectionName` field to each sheet in `sheets` that has `displayedCollection`.
	"""
	slugs = list(set([sheet["displayedCollection"] for sheet in sheets if sheet.get("displayedCollection", None)]))
	if len(slugs) == 0:
		return sheets
	displayed_collections = CollectionSet({"slug": {"$in": slugs}})
	for sheet in sheets:
		if not sheet.get("displayedCollection", None):
			continue
		for collection in displayed_collections:
			if sheet["displayedCollection"] == collection.slug:
				sheet["displayedCollectionName"] = collection.name

	return sheets


def annotate_user_links(sources):
	"""
	Search a sheet for any addedBy fields (containg a UID) and add corresponding user links.
	"""
	for source in sources:
		if "addedBy" in source:
			source["userLink"] = user_link(source["addedBy"])
	return sources


def user_tags(uid):
	"""
	Returns a list of tags that `uid` has, ordered by tag order in user profile (if existing)
	"""
	user_tags = sheet_topics_counts({"owner": uid})
	user_tags = order_tags_for_user(user_tags, uid)
	return user_tags


def sheet_topics_counts(query, sort_by="count"):
	"""
	Returns topics ordered by count for sheets matching `query`.
	"""
	if sort_by == "count":
		sort_query = SON([("count", -1), ("_id", -1)])
	elif sort_by == "alpha":
		sort_query = SON([("_id", 1)])
	else:
		return []

	topics = db.sheets.aggregate([
		{"$match": query},
		{"$unwind": "$topics"},
		{"$group": {"_id": "$topics.slug", "count": {"$sum": 1}, "asTyped": {"$first": "$topics.asTyped"}}},
		{"$sort": sort_query},
		{"$project": {"_id": 0, "slug": "$_id", "count": "$count", "asTyped": "$asTyped"}}], cursor={})
	return add_langs_to_topics(list(topics))


def order_tags_for_user(tag_counts, uid):
	"""
	Returns of list of tag/count dicts order according to user's preference,
	Adds empty tags if any appear in user's sort list but not in tags passed in
	"""
	profile   = UserProfile(id=uid)
	tag_order = getattr(profile, "tag_order", None)
	if tag_order:
		empty_tags = tag_order[:]
		tags = [tag_count["slug"] for tag_count in tag_counts]
		empty_tags = [tag for tag in tag_order if tag not in tags]

		for tag in empty_tags:
			tag_counts.append({"tag": tag, "count": 0})
		try:
			tag_counts = sorted(tag_counts, key=lambda x: tag_order.index(x["tag"]))
		except:
			pass

	return tag_counts

@django_cache(timeout=6 * 60 * 60)
def trending_topics(days=7, ntags=14):
	"""
	Returns a list of trending topics plus sheet count and author count modified in the last `days`.
	"""
	cutoff = datetime.now() - timedelta(days=days)
	query = {
		"status": "public",
		"dateModified": {"$gt": cutoff.isoformat()},
		"viaOwner": {"$exists": 0},
		"assignment_id": {"$exists": 0}
	}

	topics = db.sheets.aggregate([
			{"$match": query},
			{"$unwind": "$topics"},
			{"$group": {"_id": "$topics.slug", "sheet_count": {"$sum": 1}, "authors": {"$addToSet": "$owner"}}},
			{"$project": {"_id": 0, "slug": "$_id", "sheet_count": "$sheet_count", "authors": "$authors"}}], cursor={})

	results = add_langs_to_topics([{
		"slug": topic['slug'],
		"count": topic['sheet_count'],
		"author_count": len(topic['authors']),
	} for topic in filter(lambda x: len(x["authors"]) > 1, topics)], use_as_typed=False, backwards_compat_lang_fields={'en': 'tag', 'he': 'he_tag'})
	results = sorted(results, key=lambda x: -x["author_count"])


	# For testing purposes: if nothing is trennding in specified number of days,
	# (because local data is stale) look at a bigger window
	# ------
	# Updated to return an empty array on 7/29/21 b/c it was causing a recursion error due to stale data on sandboxes
	# or local and for folks who only had the public dump.
	# -----------
	if len(results) == 0:
		return[]
		#return trending_topics(days=180, ntags=ntags)

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

		old_topics = existing.get("topics", [])
		topics_diff = topic_list_diff(old_topics, sheet.get("topics", []))

		old_media_urls = set([source["media"] for source in existing.get("sources") if "media" in source])
		if len(old_media_urls) > 0:
			new_media_urls = set([source["media"] for source in sheet.get("sources") if "media" in source])
			if len(old_media_urls) != len(new_media_urls):
				deleted_media = set(old_media_urls).difference(new_media_urls)
				print(deleted_media)
				for url in deleted_media:
					if url.startswith(GoogleStorageManager.BASE_URL):
						GoogleStorageManager.delete_filename((re.findall(r"/([^/]+)$", url)[0]), GoogleStorageManager.UGC_SHEET_BUCKET)

		# Protected fields -- can't be set from outside
		sheet["views"] = existing["views"]
		sheet["owner"] = existing["owner"]
		sheet["likes"] = existing["likes"] if "likes" in existing else []
		sheet["dateCreated"] = existing["dateCreated"]
		if "datePublished" in existing:
			sheet["datePublished"] = existing["datePublished"]
		if "noindex" in existing:
			sheet["noindex"] = existing["noindex"]

		# make sure sheets never get saved with an "error: field to the db...
		# Not entirely sure why the error "Sheet updated." sneaks into the db sometimes.
		if "error" in sheet:
			del sheet["error"]
		if "error" in existing:
			del existing["error"]

		existing.update(sheet)
		sheet = existing

	else:
		new_sheet = True
		sheet["dateCreated"] = datetime.now().isoformat()
		if "status" not in sheet:
			sheet["status"] = "unlisted"
		sheet["owner"] = user_id
		sheet["views"] = 1

		old_topics = []
		topics_diff = topic_list_diff(old_topics, sheet.get("topics", []))

		# ensure that sheet sources have nodes (primarily for sheets posted via API)
		# and ensure that images from copied sheets hosted on google cloud get duplicated as well
		nextNode = sheet.get("nextNode", 1)
		sheet["nextNode"] = nextNode
		checked_sources = []
		for source in sheet["sources"]:
			if "node" not in source:
				source["node"] = nextNode
				nextNode += 1
			if "media" in source and source["media"].startswith(GoogleStorageManager.BASE_URL):
				old_file = (re.findall(r"/([^/]+)$", source["media"])[0])
				to_file = f"{user_id}-{uuid.uuid1()}.{source['media'][-3:].lower()}"
				bucket_name = GoogleStorageManager.UGC_SHEET_BUCKET
				duped_image_url = GoogleStorageManager.duplicate_file(old_file, to_file, bucket_name)
				source["media"] = duped_image_url
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
			if SEARCH_INDEX_ON_SAVE and not search_override:
				es_index_name = search.get_new_and_current_index_names("sheet")['current']
				search.delete_sheet(es_index_name, sheet['id'])

			delete_sheet_publication(sheet["id"], user_id)  # remove history

			NotificationSet({"type": "sheet publish",
								"uid": user_id,
								"content.publisher_id": user_id,
								"content.sheet_id": sheet["id"]
							}).delete()

	sheet["includedRefs"] = refs_in_sources(sheet.get("sources", []))
	sheet["expandedRefs"] = model.Ref.expand_refs(sheet["includedRefs"])
	sheet["sheetLanguage"] = get_sheet_language(sheet)

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

	if len(topics_diff["added"]) or len(topics_diff["removed"]):
		update_sheet_topics(sheet["id"], sheet.get("topics", []), old_topics)
		sheet = db.sheets.find_one({"id": sheet["id"]})

	if status_changed and sheet["status"] == "public":
		# Publish, update sheet topic links as though all are new - add links for all
		update_sheet_topic_links(sheet["id"], sheet["topics"], [])
	elif status_changed and sheet["status"] != "public":
		# Unpublish, update sheet topic links as though there are now none - remove links for all
		update_sheet_topic_links(sheet["id"], [], old_topics)


	if sheet["status"] == "public" and SEARCH_INDEX_ON_SAVE and not search_override:
		try:
			index_name = search.get_new_and_current_index_names("sheet")['current']
			search.index_sheet(index_name, sheet["id"])
		except:
			logger.error("Failed index on " + str(sheet["id"]))

	return sheet


def is_valid_source(source):
	if not ("ref" in source or "outsideText" in source or "outsideBiText" in source or "comment" in source or "media" in source):
		return False
	return True


def bleach_text(text):
	ok_sheet_tags = ['blockquote', 'p', 'a', 'ul', 'ol', 'nl', 'li', 'b', 'i', 'strong', 'em', 'small', 'big', 'span', 'strike',
			'hr', 'br', 'div', 'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'sup', 'u', 'h1']

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


def get_sheet_language(sheet):
	"""
	Returns the language we believe `sheet` to be written in,
	based on the language of its title.
	"""
	title = strip_tags(sheet.get("title", "")).replace("(Copy)", "").replace("\n", " ")
	return "hebrew" if is_all_tibetan(title) else "english"


def test():
	ss = db.sheets.find({}, sort=[["_id", -1]], limit=10000)

	for s in ss:
		lang = get_sheet_language(s)
		if lang == "some hebrew":
			print("{}\thttps://www.sefaria.org/sheets/{}".format(strip_tags(s["title"]).replace("\n", ""), s["id"]))



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


def add_ref_to_sheet(id, ref, request):
	"""
	Add source 'ref' to sheet 'id'.
	"""
	sheet = db.sheets.find_one({"id": id})
	if not sheet:
		return {"error": "No sheet with id %s." % (id)}
	if(sheet["owner"] != request.user.id):
		return jsonResponse({"error": "user can only add refs to their own sheet"})
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
		db.sheets.update({"_id": sheet["_id"]}, {"$set": {"includedRefs": refs, "expandedRefs": model.Ref.expand_refs(refs)}})


def get_top_sheets(limit=3):
	"""
	Returns 'top' sheets according to some magic heuristic.
	Currently: return the most recently active sheets with more than 100 views.
	"""
	query = {"status": "public", "views": {"$gte": 100}}
	return sheet_list(query=query, limit=limit)


def get_sheets_for_ref(tref, uid=None, in_collection=None):
	"""
	Returns a list of sheets that include ref,
	formating as need for the Client Sidebar.
	If `uid` is present return user sheets, otherwise return public sheets.
	If `in_collection` (list of slugs) is present, only return sheets in one of the listed collections.
	"""
	oref = model.Ref(tref)
	# perform initial search with context to catch ranges that include a segment ref
	segment_refs = [r.normal() for r in oref.all_segment_refs()]
	query = {"expandedRefs": {"$in": segment_refs}}
	if uid:
		query["owner"] = uid
	else:
		query["status"] = "public"
	if in_collection:
		collections = CollectionSet({"slug": {"$in": in_collection}})
		sheets_list = [collection.sheets for collection in collections]
		sheets_ids = [sheet for sublist in sheets_list for sheet in sublist]
		query["id"] = {"$in": sheets_ids}

	sheetsObj = db.sheets.find(query,
		{"id": 1, "title": 1, "owner": 1, "viaOwner":1, "via":1, "dateCreated": 1, "includedRefs": 1, "expandedRefs": 1, "views": 1, "topics": 1, "status": 1, "summary":1, "attribution":1, "assigner_id":1, "likes":1, "displayedCollection":1, "options":1}).sort([["views", -1]])
	#sheetsObj.hint("expandedRefs_1")
	sheets = [s for s in sheetsObj]
	user_ids = list({s["owner"] for s in sheets})
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

	results = []
	for sheet in sheets:
		anchor_ref_list, anchor_ref_expanded_list = oref.get_all_anchor_refs(segment_refs, sheet.get("includedRefs", []), sheet.get("expandedRefs", []))
		ownerData = user_profiles.get(sheet["owner"], {'first_name': 'Ploni', 'last_name': 'Almoni', 'email': 'test@sefaria.org', 'slug': 'Ploni-Almoni', 'id': None, 'profile_pic_url_small': ''})

		if "assigner_id" in sheet:
			asignerData = public_user_data(sheet["assigner_id"])
			sheet["assignerName"] = asignerData["name"]
			sheet["assignerProfileUrl"] = asignerData["profileUrl"]
		if "viaOwner" in sheet:
			viaOwnerData = public_user_data(sheet["viaOwner"])
			sheet["viaOwnerName"] = viaOwnerData["name"]
			sheet["viaOwnerProfileUrl"] = viaOwnerData["profileUrl"]

		if "displayedCollection" in sheet:
			collection = Collection().load({"slug": sheet["displayedCollection"]})
			sheet["collectionTOC"] = getattr(collection, "toc", None)
		topics = add_langs_to_topics(sheet.get("topics", []))
		for anchor_ref, anchor_ref_expanded in zip(anchor_ref_list, anchor_ref_expanded_list):
			sheet_data = {
				"owner":           sheet["owner"],
				"_id":             str(sheet["_id"]),
				"id":              str(sheet["id"]),
				"public":          sheet["status"] == "public",
				"title":           strip_tags(sheet["title"]),
				"sheetUrl":        "/sheets/" + str(sheet["id"]),
				"anchorRef":       anchor_ref.normal(),
				"anchorRefExpanded": [r.normal() for r in anchor_ref_expanded],
				"options": 		   sheet["options"],
				"collectionTOC":   sheet.get("collectionTOC", None),
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
				"topics":          topics,
				"likes":           sheet.get("likes", []),
				"summary":         sheet.get("summary", None),
				"attribution":     sheet.get("attribution", None),
				"is_featured":     sheet.get("is_featured", False),
				"category":        "Sheets", # ditto
				"type":            "sheet", # ditto
			}

			results.append(sheet_data)
	return results


def topic_list_diff(old, new):
	"""
	Returns a dictionary with fields `removed` and `added` that describes the differences
	in topics (slug, titles pairs) between lists `old` and `new`.
	"""
	old_set = set([(t["asTyped"], t.get("slug", None)) for t in old])
	new_set = set([(t["asTyped"], t.get("slug", None)) for t in new])

	return {
		"removed": list(old_set - new_set),
		"added":   list(new_set - old_set),
	}


def update_sheet_topics(sheet_id, topics, old_topics):
	"""
	Sets the topic list for `sheet_id` to those listed in list `topics`,
	containing fields `asTyped` and `slug`.
	Performs some normalization of `asTyped` and creates new topic objects for new topics.
	"""
	normalized_slug_title_pairs = set()

	for topic in topics:
	# Dedupe, normalize titles, create/choose topics for any missing slugs
		title = normalize_new_topic_title(topic["asTyped"])
		if "slug" not in topic:
			match = choose_existing_topic_for_title(title)
			if match:
				topic["slug"] = match.slug
			else:
				new_topic = create_topic_from_title(title)
				topic["slug"] = new_topic.slug
		normalized_slug_title_pairs.add((title, topic["slug"]))

	normalized_topics = [{"asTyped": pair[0], "slug": pair[1]} for pair in normalized_slug_title_pairs]

	db.sheets.update({"id": sheet_id}, {"$set": {"topics": normalized_topics}})

	update_sheet_topic_links(sheet_id, normalized_topics, old_topics)

	return {"status": "ok"}


def normalize_new_topic_title(title):
	ALLOWED_HASHTAGS = ("#MeToo")
	if title not in ALLOWED_HASHTAGS:
		title = title.replace("#","")
	# replace | with - b/c | is a reserved char for search sheet queries when filtering on tags
	title = titlecase(title).replace('|','-')
	return title


def choose_existing_topic_for_title(title):
	"""
	Returns the best existing topic to match with `title` or None if none matches.
	"""
	existing_topics = TopicSet.load_by_title(title)
	if existing_topics.count() == 0:
		return None

	from functools import cmp_to_key

	def is_title_primary(title, topic):
		all_primary_titles = [topic.get_primary_title(lang) for lang in topic.title_group.langs]
		return title in all_primary_titles

	def compare(t1, t2):
		if is_title_primary(title, t1) == is_title_primary(title, t2):
			# If both or neither match primary title, prefer greater number of sources
			return getattr(t1, "numSources", 0) - getattr(t2, "numSources", 0)
		else:
		 	# Prefer matches to primary title
		 	return 1 if is_title_primary(title, t1) else -1

	return max(list(existing_topics), key=cmp_to_key(compare))


def update_sheet_topic_links(sheet_id, new_topics, old_topics):
	"""
	Adds and removes sheet topic links per differences in old and new topics list.
	Only adds link for public sheets.
	"""
	topic_diff = topic_list_diff(old_topics, new_topics)

	for removed in topic_diff["removed"]:
		#print("removing {}".format(removed[1]))
		RefTopicLinkSet({
			"class": "refTopic",
			"toTopic": removed[1],
			"expandedRefs": "Sheet {}".format(sheet_id),
			"linkType": "about",
			"is_sheet": True,
			"dataSource": "sefaria-users"
		}, hint="expandedRefs_1").delete()

	status = db.sheets.find_one({"id": sheet_id}, {"status": 1}).get("status", "unlisted")
	if status != "public":
		return

	for added in topic_diff["added"]:
		#print("adding {}".format(added[1]))
		attrs = {
			"class": "refTopic",
			"toTopic": added[1],
			"ref": "Sheet {}".format(sheet_id),
			"expandedRefs": ["Sheet {}".format(sheet_id)],
			"linkType": "about",
			"is_sheet": True,
			"dataSource": "sefaria-users"
		}
		tl = RefTopicLink(attrs)
		try:
			tl.save()
		except DuplicateRecordError:
			pass

def create_topic_from_title(title):
	topic = Topic({
		"slug": Topic.normalize_slug(title),
		"titles": [{
			"text": title,
			"lang": "he" if has_tibetan(title) else "en",
		"primary": True,
		}]
	})
	topic.save()
	return topic


def add_langs_to_topics(topic_list: list, use_as_typed=True, backwards_compat_lang_fields: dict = None) -> list:
	"""
	adds primary en and he to each topic in topic_list and returns new topic_list
	:param list topic_list: list of topics where each item is dict of form {'slug': required, 'asTyped': optional}
	:param dict backwards_compat_lang_fields: of shape {'en': str, 'he': str}. Defines lang fields for backwards compatibility. If None, ignore.
	:param bool use_as_typed:
	"""
	new_topic_list = []
	from sefaria.model import library
	topic_map = library.get_topic_mapping()
	if len(topic_list) > 0:
		for topic in topic_list:
			# Fall back on `asTyped` if no data is in mapping yet. If neither `asTyped` nor mapping data is availble fail safe by reconstructing a title from a slug (HACK currently affecting trending topics if a new topic isn't in cache yet)
			default_title = topic['asTyped'] if use_as_typed else topic['slug'].replace("-", " ").title()
			topic_titles = topic_map.get(topic['slug'], {"en": default_title, "he": default_title})
			new_topic = topic.copy()
			tag_lang = 'en'
			if use_as_typed:
				tag_lang = 'he' if has_tibetan(new_topic['asTyped']) else 'en'
				new_topic[tag_lang] = new_topic['asTyped']
			if not use_as_typed or tag_lang == 'en':
				new_topic['he'] = topic_titles["he"]
			if not use_as_typed or tag_lang == 'he':
				new_topic['en'] = topic_titles["en"]

			if backwards_compat_lang_fields is not None:
				for lang in ('en', 'he'):
					new_topic[backwards_compat_lang_fields[lang]] = new_topic[lang]
			new_topic_list += [new_topic]

	return new_topic_list


def get_last_updated_time(sheet_id):
	"""
	Returns a timestamp of the last modified date for sheet_id.
	"""
	sheet = db.sheets.find_one({"id": sheet_id}, {"dateModified": 1})

	if not sheet:
		return None

	return sheet["dateModified"]


@django_cache(timeout=(60 * 60))
def public_tag_list(sort_by="alpha"):
	"""
	Returns a list of all public tags, sorted either alphabetically ("alpha") or by popularity ("count")
	"""
	seen_titles = set()
	results = []
	from sefaria.helper.topic import get_all_topics
	all_tags = get_all_topics()
	lang = "he" if sort_by == "alpha-hebrew" else "en"
	for tag in all_tags:
		title = tag.get_primary_title(lang)
		if title in seen_titles:
			continue
		seen_titles.add(title)
		results.append({"tag": title, "count": getattr(tag, 'numSources', 0)})

	sort_keys =  {
		"alpha": lambda x: x["tag"],
		"count": lambda x: -x["count"],
		"alpha-hebrew": lambda x: x["tag"] if len(x["tag"]) and x["tag"][0] in "אבגדהוזחטיכלמנסעפצקרשת0123456789" else "ת" + x["tag"],
	}
	results = sorted(results, key=sort_keys[sort_by])

	return results


def get_sheets_by_topic(topic, public=True, proj=None, limit=0, page=0):
	"""
	Returns all sheets tagged with 'topic'
	"""
	# try to normalize for backwards compatibility
	from sefaria.model.abstract import SluggedAbstractMongoRecord
	topic = SluggedAbstractMongoRecord.normalize_slug(topic)
	query = {"topics.slug": topic} if topic else {"topics": {"$exists": 0}}

	if public:
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



class Sheet(abstract.AbstractMongoRecord):
	# This is here as an alternative interface - it's not yet used, generally.

	# Warning: this class doesn't implement all of the saving logic in save_sheet()
	# In current form should only be used for reading or for changes that are known to be
	# safe and without need of side effects.
	#
	# Warning: there are fields on some individual sheet documents that aren't enumerated here,
	# trying to load a document with an attribute not listed here will cause an error.

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
		"is_featured",  # boolean - show this sheet, unsolicited.
		"includedRefs",
		"expandedRefs",
		"views",
		"nextNode",
		"tags",
		"topics",
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
		"displayedCollection",
		"spam_sheet_quarantine",
		"generatedBy",
		"zoom",
		"visualNodes",
		"highlighterTags",
		"summary",
        "reviewed",
        "sheetLanguage",
        "ownerImageUrl",   # TODO this shouldn't be stored on sheets, but it is for many
        "ownerProfileUrl", # TODO this shouldn't be stored on sheets, but it is for many
	]

	def _sanitize(self):
		pass

	def is_hebrew(self):
		"""Returns True if this sheet appears to be in Hebrew according to its title"""
		import regex
		title = strip_tags(self.title)
		# Consider a sheet Hebrew if its title contains Hebrew character but no English characters
		return has_tibetan(title) and not regex.search("[a-z|A-Z]", title)


class SheetSet(abstract.AbstractMongoSet):
	recordClass = Sheet


def change_tag(old_tag, new_tag_or_list):
	# new_tag_or_list can be either a string or a list of strings
	# if a list of strings, then old_tag is replaced with all of the tags in the list

	new_tag_list = [new_tag_or_list] if isinstance(new_tag_or_list, str) else new_tag_or_list

	for sheet in SheetSet({"tags": old_tag}):
		sheet.tags = [tag for tag in sheet.tags if tag != old_tag] + new_tag_list
		sheet.save()

def get_sheet_categorization_info(find_without, skip_ids=[]):
	"""
	Returns a pseudorandom sheetId for categorization along with all existing categories
	:param find_without: the field that must contain no elements for the sheet to be returned
	:param skip_ids: sheets to skip in this session:
	"""
	if find_without == "topics":
		sheet = db.sheets.aggregate([
		{"$match": {"topics": {"$in": [None, []] }, "id": {"$nin": skip_ids}, "noTags": {"$in": [None, False]}, "status": "public"}},
		{"$sample": {"size": 1}}]).next()
	else: #categories
		sheet = db.sheets.aggregate([
		{"$match": {"categories": {"$in": [None, []] }, "sources.outsideText": {"$exists": True}, "id": {"$nin": skip_ids}, "noTags": {"$in": [None, False]}, "status": "public"}},
		{"$sample": {"size": 1}}]).next()
	categories_all = list(filter(lambda x: x != None, db.sheets.distinct("categories"))) # this is slow; maybe add index or ...?
	categorize_props = {
		"doesNotContain": find_without,
		"sheetId": sheet['id'],
		"allCategories": categories_all
	}
	return categorize_props


def update_sheet_tags_categories(body, uid):
	update_sheet_topics(body['sheetId'], body["tags"], [])
	time = datetime.now().isoformat()
	noTags = time if body.get("noTags", False) else False
	db.sheets.update_one({"id": body['sheetId']}, {"$set": {"categories": body['categories'], "noTags": noTags}, "$push": {"moderators": {"uid": uid, "time": time}}})


def present_sheet_notice(is_moderated):
	"""This method is here in case one day we will want to differentiate based on other logic on moderation"""
	return is_moderated
