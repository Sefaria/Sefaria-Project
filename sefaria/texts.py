# -*- coding: utf-8 -*-
"""
texts.py -- backend core for manipulating texts, refs (citations), links, notes and text index records.

MongoDB collections handled in this file: index, texts, links, notes, history
"""
import os
import re

# To allow these files to be run directly from command line (w/o Django shell)
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

import copy
import regex
import bleach

import sefaria.model as model
import summaries
import counts

from sefaria.utils.util import list_depth
from sefaria.utils.users import is_user_staff
from sefaria.utils.hebrew import is_hebrew
from sefaria.utils.talmud import section_to_daf

from sefaria.system.database import db
import sefaria.system.cache as scache
from sefaria.system.exceptions import InputError, DuplicateRecordError
import sefaria.tracker as tracker

# HTML Tag whitelist for sanitizing user submitted text
# Can be removed once sanitize_text is moved
ALLOWED_TAGS = ("i", "b", "br", "u", "strong", "em", "big", "small")


import logging
logging.basicConfig()
logger = logging.getLogger("texts")
#logger.setLevel(logging.DEBUG)
logger.setLevel(logging.WARNING)

# used in merge_text_versions(), text_from_cur(), and export.export_merged()
def merge_translations(text, sources):
	"""
	This is a recursive function that merges the text in multiple
	translations to fill any gaps and deliver as much text as
	possible.
	e.g. [["a", ""], ["", "b", "c"]] becomes ["a", "b", "c"]
	"""
	if not (len(text) and len(sources)):
		return ["", []]

	depth = list_depth(text)
	if depth > 2:
		results = []
		result_sources = []
		for x in range(max(map(len, text))):
			translations = map(None, *text)[x]
			remove_nones = lambda x: x or []
			result, source = merge_translations(map(remove_nones, translations), sources)
			results.append(result)
			# NOTE - the below flattens the sources list, so downstream code can always expect
			# a one dimensional list, but in so doing the mapping of source names to segments
			# is lost for merged texts of depth > 2 (this mapping is not currenly used in general)
			result_sources += source
		return [results, result_sources]

	if depth == 1:
		text = map(lambda x: [x], text)

	merged = map(None, *text)
	text = []
	text_sources = []
	for verses in merged:
		# Look for the first non empty version (which will be the oldest, or one with highest priority)
		index, value = 0, 0
		for i, version in enumerate(verses):
			if version:
				index = i
				value = version
				break
		text.append(value)
		text_sources.append(sources[index])

	if depth == 1:
		# strings were earlier wrapped in lists, now unwrap
		text = text[0]
	return [text, text_sources]


# used in get_text()
def text_from_cur(ref, textCur, context):
	"""
	Take a parsed ref and DB cursor of texts and construct a text to return out of what's available.
	Merges text fragments when necessary so that the final version has maximum text.
	"""
	versions        = []
	versionTitles   = []
	versionSources  = []
	versionStatuses = []
	versionLicenses = []
	# does this ref refer to a range of text
	is_range = ref["sections"] != ref["toSections"]

	for t in textCur:
		try:
			text = t['chapter'][0] if len(ref["sectionNames"]) > 1 else t['chapter']
			if text == "" or text == []:
				continue
			if len(ref['sections']) < len(ref['sectionNames']) or context == 0 and not is_range:
				sections = ref['sections'][1:]
				if len(ref["sectionNames"]) == 1 and context == 0:
					sections = ref["sections"]
			else:
				# include surrounding text
				sections = ref['sections'][1:-1]
			# dive down into text until the requested segment is found
			for i in sections:
				text = text[int(i) - 1]
			if is_range and context == 0:
				start = ref["sections"][-1] - 1
				end = ref["toSections"][-1]
				text = text[start:end]
			versions.append(text)
			versionTitles.append(t.get("versionTitle", ""))
			versionSources.append(t.get("versionSource", ""))
			versionStatuses.append(t.get("status", "none"))
			license = t.get("license", "unknown") if t.get("licenseVetted", False) else "unknown"
			versionLicenses.append(license)

		except IndexError:
			# this happens when t doesn't have the text we're looking for
			pass

	if list_depth(versions) == 1:
		while '' in versions:
			versions.remove('')

	if len(versions) == 0:
		ref['text'] = "" if context == 0 else []

	elif len(versions) == 1:
		ref['text']          = versions[0]
		ref['versionTitle']  = versionTitles[0]
		ref['versionSource'] = versionSources[0]
		ref['versionStatus'] = versionStatuses[0]
		ref['license']       = versionLicenses[0]

	elif len(versions) > 1:
		ref['text'], ref['sources'] = merge_translations(versions, versionTitles)
		if len([x for x in set(ref['sources'])]) == 1:
			# if sources only lists one title, no merge acually happened
			ref['versionTitle']  = ref['sources'][0]
			i                    = versionTitles.index(ref['sources'][0])
			ref['versionSource'] = versionSources[i]
			ref['versionStatus'] = versionStatuses[i]
			ref['license']       = versionLicenses[i]

			del ref['sources']

	return ref


def get_text(tref, context=1, commentary=True, version=None, lang=None, pad=True):
	"""
	Take a string reference to a segment of text and return a dictionary including
	the text and other info.
		* 'context': how many levels of depth above the request ref should be returned.
			e.g., with context=1, ask for a verse and receive its surrounding chapter as well.
			context=0 gives just what is asked for.
		* 'commentary': whether or not to search for and return connected texts as well.
		* 'version' + 'lang': use to specify a particular version of a text to return.
	"""
	oref = model.Ref(tref)
	if pad:
		oref = oref.padded_ref()

	if oref.is_spanning():
		# If ref spans sections, call get_text for each section
		return get_spanning_text(oref)

	if len(oref.sections):
		skip = oref.sections[0] - 1
		limit = 1
		chapter_slice = {"_id": 0} if len(oref.index.sectionNames) == 1 else {"_id": 0, "chapter": {"$slice": [skip, limit]}}
	else:
		chapter_slice = {"_id": 0}

	textCur = heCur = None
	# pull a specific version of text
	if version and lang == "en":
		textCur = db.texts.find({"title": oref.book, "language": lang, "versionTitle": version}, chapter_slice)

	elif version and lang == "he":
		heCur = db.texts.find({"title": oref.book, "language": lang, "versionTitle": version}, chapter_slice)

	# If no criteria set above, pull all versions,
	# Prioritize first according to "priority" field (if present), then by oldest text first
	# Order here will determine which versions are used in case of a merge
	textCur = textCur or db.texts.find({"title": oref.book, "language": "en"}, chapter_slice).sort([["priority", -1], ["_id", 1]])
	heCur   = heCur   or db.texts.find({"title": oref.book, "language": "he"}, chapter_slice).sort([["priority", -1], ["_id", 1]])

	# Conversion to Ref bogged down here, and resorted to old_dict_format(). todo: Push through to the end
	# Extract / merge relevant text. Pull Hebrew from a copy of ref first, since text_from_cur alters ref
	heRef = text_from_cur(copy.copy(oref.old_dict_format()), heCur, context)
	r = text_from_cur(oref.old_dict_format(), textCur, context)

	# Add fields pertaining the the Hebrew text under different field names
	r["he"]              = heRef.get("text", [])
	r["heVersionTitle"]  = heRef.get("versionTitle", "")
	r["heVersionSource"] = heRef.get("versionSource", "")
	r["heVersionStatus"] = heRef.get("versionStatus", "")
	r["heLicense"]       = heRef.get("license", "unknown")
	if "sources" in heRef:
		r["heSources"] = heRef.get("sources")

	# find commentary on this text if requested
	if commentary:
		from sefaria.client.wrapper import get_links
		searchRef = model.Ref(tref).padded_ref().context_ref(context).normal()
		links = get_links(searchRef)
		r["commentary"] = links if "error" not in links else []

		# get list of available versions of this text
		# but only if you care enough to get commentary also (hack)
		r["versions"] = get_version_list(tref)

	# use shorthand if present, masking higher level sections
	if "shorthand" in r:
		r["book"] = r["shorthand"]
		d = r["shorthandDepth"]
		for key in ("sections", "toSections", "sectionNames"):
			r[key] = r[key][d:]

	# replace ints with daf strings (3->"2a") if text is Talmud or commentary on Talmud
	if r["type"] == "Talmud" or r["type"] == "Commentary" and r["commentaryCategories"][0] == "Talmud":
		daf = r["sections"][0]
		r["sections"] = [section_to_daf(daf)] + r["sections"][1:]
		r["title"] = r["book"] + " " + r["sections"][0]
		if "heTitle" in r:
			r["heBook"] = r["heTitle"]
			r["heTitle"] = r["heTitle"] + " " + section_to_daf(daf, lang="he")
		if r["type"] == "Commentary" and len(r["sections"]) > 1:
			r["title"] = "%s Line %d" % (r["title"], r["sections"][1])
		if "toSections" in r:
			r["toSections"] = [r["sections"][0]] + r["toSections"][1:]

	elif r["type"] == "Commentary":
		d = len(r["sections"]) if len(r["sections"]) < 2 else 2
		r["title"] = r["book"] + " " + ":".join(["%s" % s for s in r["sections"][:d]])

	return r


# Used in get_text()
def get_spanning_text(oref):
	"""
	Gets text for a ref that spans across text sections.

	TODO refactor to handle commentary on spanning refs
	TODO properly track version names and lists which may differ across sections
	"""
	refs = oref.split_spanning_ref()
	result, text, he = {}, [], []
	for oref in refs:
		result = get_text(oref.normal(), context=0, commentary=False)
		text.append(result["text"])
		he.append(result["he"])

	result["text"] = text
	result["he"] = he
	result["spanning"] = True
	#result.update(pRef)
	return result


def get_version_list(tref):
	"""
	Returns a list of available text versions matching 'ref'
	"""
	try:
		oref = model.Ref(tref).padded_ref()
	except InputError:
		return []
	#pRef = parse_ref(tref)
	#if "error" in pRef:
	#	return []

	skip = oref.sections[0] - 1 if len(oref.sections) else 0
	limit = 1
	versions = db.texts.find({"title": oref.book}, {"chapter": {"$slice": [skip, limit]}})

	vlist = []
	for v in versions:
		text = v['chapter']
		for i in [0] + oref.sections[1:]:
			try:
				text = text[i]
			except (IndexError, TypeError):
				text = None
				continue
		if text:
			vlist.append({"versionTitle": v["versionTitle"], "language": v["language"]})

	return vlist


def get_book_link_collection(book, cat):

	if cat == "Tanach" or cat == "Torah" or cat == "Prophets" or cat == "Writings":
		query = {"$and": [{"categories": cat}, {"categories": {"$ne": "Commentary"}}, {"categories": {"$ne": "Targum"}}]}
	else:
		query = {"categories": cat}

	titles = model.IndexSet(query).distinct("title")
	if len(titles) == 0:
		return {"error": "No results for {}".format(query)}

	book_re = r'^{} \d'.format(book)
	cat_re = r'^({}) \d'.format('|'.join(titles))

	link_re = r'^(?P<title>.+) (?P<loc>\d.*)$'
	ret = []

	links = model.LinkSet({"$and": [{"refs": {"$regex": book_re}}, {"refs": {"$regex": cat_re}}]})
	for link in links:
		l1 = re.match(link_re, link.refs[0])
		l2 = re.match(link_re, link.refs[1])
		ret.append({
			"r1": {"title": l1.group("title").replace(" ", "-"), "loc": l1.group("loc")},
			"r2": {"title": l2.group("title").replace(" ", "-"), "loc": l2.group("loc")}
		})
	return ret


# used in views.texts_api and views.revert_api
def save_text(tref, text, user, **kwargs):
	"""
	Save a version of a text named by ref.

	text is a dict which must include attributes to be stored on the version doc,
	as well as the text itself,

	Returns indication of success of failure.
	"""
	from history import record_text_change
	# Validate Ref
	oref = model.Ref(tref)
	#pRef = parse_ref(tref, pad=False)
	#if "error" in pRef:
	#	return pRef

	# Validate Posted Text
	validated = validate_text(text, tref)
	if "error" in validated:
		return validated

	text["text"] = sanitize_text(text["text"])

	chapter  = oref.sections[0] if len(oref.sections) > 0 else None
	verse    = oref.sections[1] if len(oref.sections) > 1 else None
	subVerse = oref.sections[2] if len(oref.sections) > 2 else None

	# Check if we already have this	text
	existing = db.texts.find_one({"title": oref.book, "versionTitle": text["versionTitle"], "language": text["language"]})

	if existing:
		# Have this (book / version / language)

		# Only allow staff to edit locked texts
		if existing.get("status", "") == "locked" and not is_user_staff(user):
			return {"error": "This text has been locked against further edits."}

		# Pad existing version if it has fewer chapters
		if len(existing["chapter"]) < chapter:
			for i in range(len(existing["chapter"]), chapter):
				existing["chapter"].append([])

		# Save at depth 2 (e.g. verse: Genesis 4.5, Mishna Avot 2.4, array of comentary eg. Rashi on Genesis 1.3)
		if len(oref.sections) == 2:
			if isinstance(existing["chapter"][chapter-1], basestring):
				existing["chapter"][chapter-1] = [existing["chapter"][chapter-1]]

			# Pad chapter if it doesn't have as many verses as the new text
			for i in range(len(existing["chapter"][chapter-1]), verse):
				existing["chapter"][chapter-1].append("")

			existing["chapter"][chapter-1][verse-1] = text["text"]


		# Save at depth 3 (e.g., a single Rashi Commentary: Rashi on Genesis 1.3.2)
		elif len(oref.sections) == 3:

			# if chapter is a str, make it an array
			if isinstance(existing["chapter"][chapter-1], basestring):
				existing["chapter"][chapter-1] = [existing["chapter"][chapter-1]]
			# pad chapters with empty arrays if needed
			for i in range(len(existing["chapter"][chapter-1]), verse):
				existing["chapter"][chapter-1].append([])

			# if verse is a str, make it an array
			if isinstance(existing["chapter"][chapter-1][verse-1], basestring):
				existing["chapter"][chapter-1][verse-1] = [existing["chapter"][chapter-1][verse-1]]
			# pad verse with empty arrays if needed
			for i in range(len(existing["chapter"][chapter-1][verse-1]), subVerse):
				existing["chapter"][chapter-1][verse-1].append([])

			existing["chapter"][chapter-1][verse-1][subVerse-1] = text["text"]

		# Save at depth 1 (e.g, a whole chapter posted to Genesis.4)
		elif len(oref.sections) == 1:
			existing["chapter"][chapter-1] = text["text"]

		# Save as an entire named text
		elif len(oref.sections) == 0:
			existing["chapter"] = text["text"]

		# Update version source
		existing["versionSource"] = text["versionSource"]

		record_text_change(tref, text["versionTitle"], text["language"], text["text"], user, **kwargs)
		db.texts.save(existing)

		text_id = existing["_id"]
		del existing["_id"]
		if 'revisionDate' in existing:
			del existing['revisionDate']

		response = existing

	# New (book / version / language)
	else:
		text["title"] = oref.book

		# add placeholders for preceding chapters
		if len(oref.sections) > 0:
			text["chapter"] = []
			for i in range(chapter):
				text["chapter"].append([])

		# Save at depth 2 (e.g. verse: Genesis 4.5, Mishan Avot 2.4, array of comentary eg. Rashi on Genesis 1.3)
		if len(oref.sections) == 2:
			chapterText = []
			for i in range(1, verse):
				chapterText.append("")
			chapterText.append(text["text"])
			text["chapter"][chapter-1] = chapterText

		# Save at depth 3 (e.g., a single Rashi Commentary: Rashi on Genesis 1.3.2)
		elif len(oref.sections) == 3:
			for i in range(verse):
				text["chapter"][chapter-1].append([])
			subChapter = []
			for i in range(1, subVerse):
				subChapter.append([])
			subChapter.append(text["text"])
			text["chapter"][chapter-1][verse-1] = subChapter

		# Save at depth 1 (e.g, a whole chapter posted to Genesis.4)
		elif len(oref.sections) == 1:
			text["chapter"][chapter-1] = text["text"]

		# Save an entire named text
		elif len(oref.sections) == 0:
			text["chapter"] = text["text"]

		record_text_change(tref, text["versionTitle"], text["language"], text["text"], user, **kwargs)

		saved_text = text["text"]
		del text["text"]
		text_id = db.texts.insert(text)
		text["text"] = saved_text

		response = text

	# Finish up for both existing and new texts

	# count available segments of text
	if kwargs.get("count_after", True):
		summaries.update_summaries_on_change(oref.book)

	# Commentaries generate links to their base text automatically
	if oref.type == "Commentary":
		add_commentary_links(tref, user, **kwargs)

	# scan text for links to auto add
	add_links_from_text(tref, text, text_id, user, **kwargs)

	# Add this text to a queue to be indexed for search
	from sefaria.settings import SEARCH_INDEX_ON_SAVE
	if SEARCH_INDEX_ON_SAVE and kwargs.get("index_after", True):
		model.IndexQueue({
			"ref": tref,
			"lang": response["language"],
			"version": response["versionTitle"],
			"type": "ref",
		}).save()

	return {"status": "ok"}


# No usages found
def merge_text(a, b):
	"""
	Merge two lists representing texts, giving preference to a, but keeping
	values froms b when a position in a is empty or non existant.

	e.g merge_text(["", "Two", "Three"], ["One", "Nope", "Nope", "Four]) ->
		["One", "Two" "Three", "Four"]
	"""
	length = max(len(a), len(b))
	out = [a[n] if n < len(a) and (a[n] or not n < len(b)) else b[n] for n in range(length)]
	return out


# used in save_text
#todo: move to Version._validate()
def validate_text(text, tref):
	"""
	validate a dictionary representing a text to be written to db.texts
	"""
	# Required Keys
	for key in ("versionTitle", "versionSource", "language", "text"):
		if not key in text:
			return {"error": "Field '%s' missing from posted JSON."  % key}
	oref = model.Ref(tref)

	# Validate depth of posted text matches expectation
	posted_depth = 0 if isinstance(text["text"], basestring) else list_depth(text["text"])
	implied_depth = len(oref.sections) + posted_depth
	if implied_depth != oref.index.textDepth:
		raise InputError(
			u"Text Structure Mismatch. The stored depth of {} is {}, but the text posted to {} implies a depth of {}."
			.format(oref.book, oref.index.textDepth, tref, implied_depth))

	return {"status": "ok"}


# views.lock_text_api
def set_text_version_status(title, lang, version, status=None):
	"""
	Sets the status field of an existing text version.
	"""
	title   = title.replace("_", " ")
	version = version.replace("_", " ")
	text = db.texts.find_one({"title": title, "language": lang, "versionTitle": version})
	if not text:
		return {"error": "Text not found: %s, %s, %s" % (title, lang, version)}

	text["status"] = status
	db.texts.save(text)
	return {"status": "ok"}

# used in save_text
#Todo:  move to Version._sanitize or lower.
def sanitize_text(text):
	"""
	Clean html entites of text, remove all tags but those allowed in ALLOWED_TAGS.
	text may be a string or an array of strings.
	"""
	if isinstance(text, list):
		for i, v in enumerate(text):
			text[i] = sanitize_text(v)
	elif isinstance(text, basestring):
		text = bleach.clean(text, tags=ALLOWED_TAGS)
	else:
		return False
	return text


def add_commentary_links(tref, user, **kwargs):
	"""
	Automatically add links for each comment in the commentary text denoted by 'ref'.
	E.g., for the ref 'Sforno on Kohelet 3:2', automatically set links for
	Kohelet 3:2 <-> Sforno on Kohelet 3:2:1, Kohelet 3:2 <-> Sforno on Kohelet 3:2:2, etc.
	for each segment of text (comment) that is in 'Sforno on Kohelet 3:2'.
	"""
	text = get_text(tref, commentary=0, context=0, pad=False)
	tref = model.Ref(tref).normal()

	book = tref[tref.find(" on ") + 4:]

	if len(text["sections"]) == len(text["sectionNames"]):
		# this is a single comment, trim the last secton number (comment) from ref
		book = book[0:book.rfind(":")]
		link = {
			"refs": [book, tref],
			"type": "commentary",
			"anchorText": "",
			"auto": True,
			"generated_by": "add_commentary_links"
		}
		try:
			tracker.add(user, model.Link, link, **kwargs)
		except DuplicateRecordError as e:
			pass

	elif len(text["sections"]) == (len(text["sectionNames"]) - 1):
		# This means that the text (and it's corresponding ref) being posted has the amount of sections like the parent text
		# (the text being commented on) so this is single group of comments on the lowest unit of the parent text.
		# and we simply iterate and create a link for each existing one to point to the same unit of parent text
		length = max(len(text["text"]), len(text["he"]))
		for i in range(length):
				link = {
					"refs": [book, tref + ":" + str(i + 1)],
					"type": "commentary",
					"anchorText": "",
					"auto": True,
					"generated_by": "add_commentary_links"
				}
				try:
					tracker.add(user, model.Link, link, **kwargs)
				except DuplicateRecordError as e:
					pass

	elif len(text["sections"]) > 0:
		# any other case where the posted ref sections do not match the length of the parent texts sections
		# this is a larger group of comments meaning it needs to be further broken down
		# in order to be able to match the commentary to the basic parent text units,
		# recur on each section
		length = max(len(text["text"]), len(text["he"]))
		for i in range(length):
			add_commentary_links("%s:%d" % (tref, i + 1), user)
	else:
		#This is a special case of the above, where the sections length is 0 and that means this is
		# a whole text that has been posted. For  this we need a better way than get_text() to get the correct length of
		# highest order section counts.
		# We use the counts document for that.
		text_counts = counts.count_texts(tref)
		length = len(text_counts["counts"])
		for i in range(length):
			add_commentary_links("%s:%d" % (tref, i+1), user)


def add_links_from_text(ref, text, text_id, user, **kwargs):
	"""
	Scan a text for explicit references to other texts and automatically add new links between
	ref and the mentioned text.

	text["text"] may be a list of segments, an individual segment, or None.

	Lev - added return on 13 July 2014
	"""
	if not text or "text" not in text:
		return
	elif isinstance(text["text"], list):
		links = []
		for i in range(len(text["text"])):
			subtext = copy.deepcopy(text)
			subtext["text"] = text["text"][i]
			single = add_links_from_text("%s:%d" % (ref, i + 1), subtext, text_id, user, **kwargs)
			links += single
		return links
	elif isinstance(text["text"], basestring):
		links = []
		matches = get_refs_in_string(text["text"])
		for mref in matches:
			link = {
				"refs": [ref, mref],
				"type": "",
				"auto": True,
				"generated_by": "add_links_from_text",
				"source_text_oid": text_id
			}
			try:
				tracker.add(user, model.Link, link, **kwargs)
				links += [link]
			except InputError as e:
				pass
		return links


#only used in a script
def update_version_title(old, new, text_title, language):
	"""
	Rename a text version title, including versions in history
	'old' and 'new' are the version title names.
	"""
	query = {
		"title": text_title,
		"versionTitle": old,
		"language": language
	}
	db.texts.update(query, {"$set": {"versionTitle": new}}, upsert=False, multi=True)

	update_version_title_in_history(old, new, text_title, language)


def update_version_title_in_history(old, new, text_title, language):
	"""
	Rename a text version title in history records
	'old' and 'new' are the version title names.
	"""
	query = {
		"ref": {"$regex": r'^%s(?= \d)' % text_title},
		"version": old,
		"language": language,
	}
	db.history.update(query, {"$set": {"version": new}}, upsert=False, multi=True)


#only used in a script
def merge_text_versions(version1, version2, text_title, language):
	"""
	Merges the contents of two distinct text versions.
	version2 is merged into version1 then deleted.
	Preference is giving to version1 - if both versions contain content for a given segment,
	only the content of version1 will be retained.

	History entries are rewritten for version2.
	NOTE: the history of that results will be incorrect for any case where the content of
	version2 is overwritten - the history of those overwritten edits will remain.
	To end with a perfectly accurate history, history items for segments which have been overwritten
	would need to be identified and deleted.
	"""
	v1 = db.texts.find_one({"title": text_title, "versionTitle": version1, "language": language})
	if not v1:
		return {"error": "Version not found: %s" % version1 }
	v2 = db.texts.find_one({"title": text_title, "versionTitle": version2, "language": language})
	if not v2:
		return {"error": "Version not found: %s" % version2 }

	merged_text, sources = merge_translations([v1["chapter"], v2["chapter"]], [version1, version2])

	v1["chapter"] = merged_text
	db.texts.save(v1)

	update_version_title_in_history(version2, version1, text_title, language)

	db.texts.remove(v2)


def rename_category(old, new):
	"""
	Walk through all index records, replacing every category instance
	called 'old' with 'new'.
	"""
	indices = model.IndexSet({"categories": old})

	assert indices.count(), "No categories named {}".format(old)

	for i in indices:
		i.categories = [new if cat == old else cat for cat in i.categories]
		i.save()

	summaries.update_summaries()


def resize_text(title, new_structure, upsize_in_place=False):
	# todo: Needs to be converted to objects, but no usages seen in the wild.
	"""
	Change text structure for text named 'title'
	to 'new_structure' (a list of strings naming section names)

	Changes index record as well as restructuring any text that is currently saved.

	When increasing size, any existing text will become the first segment of the new level
	["One", "Two", "Three"] -> [["One"], ["Two"], ["Three"]]

	If upsize_in_place==True, existing text will stay in tact, but be wrapped in new depth:
	["One", "Two", "Three"] -> [["One", "Two", "Three"]]

	When decreasing size, information is lost as any existing segments are concatenated with " "
	[["One1", "One2"], ["Two1", "Two2"], ["Three1", "Three2"]] - >["One1 One2", "Two1 Two2", "Three1 Three2"]

	"""
	index = db.index.find_one({"title": title})
	if not index:
		return False

	old_structure = index["sectionNames"]
	index["sectionNames"] = new_structure
	db.index.save(index)

	delta = len(new_structure) - len(old_structure)
	if delta == 0:
		return True

	texts = db.texts.find({"title": title})
	for text in texts:
		if delta > 0 and upsize_in_place:
			resized = text["chapter"]
			for i in range(delta):
				resized = [resized]
		else:
			resized = resize_jagged_array(text["chapter"], delta)

		text["chapter"] = resized
		db.texts.save(text)

	# TODO Rewrite any existing Links
	# TODO Rewrite any exisitng History items

	summaries.update_summaries_on_change(title)
	scache.reset_texts_cache()

	return True


def resize_jagged_array(text, factor):
	"""
	Return a resized jagged array for 'text' either up or down by int 'factor'.
	Size up if factor is positive, down if negative.
	Size up or down the number of times per factor's size.
	E.g., up twice for '2', down twice for '-2'.
	"""
	new_text = text
	if factor > 0:
		for i in range(factor):
			new_text = upsize_jagged_array(new_text)
	elif factor < 0:
		for i in range(abs(factor)):
			new_text = downsize_jagged_array(new_text)

	return new_text


def upsize_jagged_array(text):
	"""
	Returns a jagged array for text which restructures the content of text
	to include one additional level of structure.
	["One", "Two", "Three"] -> [["One"], ["Two"], ["Three"]]
	"""
	new_text = []
	for segment in text:
		if isinstance(segment, basestring):
			new_text.append([segment])
		elif isinstance(segment, list):
			new_text.append(upsize_jagged_array(segment))

	return new_text


def downsize_jagged_array(text):
	"""
	Returns a jagged array for text which restructures the content of text
	to include one less level of structure.
	Existing segments are concatenated with " "
	[["One1", "One2"], ["Two1", "Two2"], ["Three1", "Three2"]] - >["One1 One2", "Two1 Two2", "Three1 Three2"]
	"""
	new_text = []
	for segment in text:
		# Assumes segments are of uniform type, either all strings or all lists
		if isinstance(segment, basestring):
			return " ".join(text)
		elif isinstance(segment, list):
			new_text.append(downsize_jagged_array(segment))

	# Return which was filled in, defaulted to [] if both are empty
	return new_text


def get_refs_in_string(st):
	"""
	Returns a list of valid refs found within text.
	"""
	lang = 'he' if is_hebrew(st) else 'en'

	titles = model.get_titles_in_string(st, lang)
	if not titles:
		return []

	if lang == "en":
		reg = "\\b(?P<ref>"
		reg += "(" + "|".join([re.escape(title) for title in titles]) + ")"
		reg += " \d+([ab])?([ .:]\d+)?([ .:]\d+)?(-\d+([ab])?([ .:]\d+)?)?" + ")\\b"
		reg = re.compile(reg)
	elif lang == "he":
		title_string = "|".join([re.escape(t) for t in titles])
		#Hebrew Unicode page: http://www.unicode.org/charts/PDF/U0590.pdf
		#todo: handle Ayin before Resh cases.
		#todo: This doesn't do ranges.  Do we see those in the wild?
		#todo: verify that open and closing parens are of the same type, so as not to fooled by (} or {)
		reg = ur"""(?<=										# look behind for opening brace
				[({{]										# literal '(', brace,
				[^}})]*										# anything but a closing ) or brace
			)
			(?P<ref>										# Capture the whole match as 'ref'
				({0})										# Any one book title, (Inserted with format(), below)
				\s+											# a space
				(\u05d3[\u05e3\u05e4\u05f3']\s+)?			# Daf, spelled with peh, peh sofit, geresh, or single quote
				(?:\u05e4(?:"|\u05f4|'')?)?				# Peh (for 'perek') maybe followed by a quote of some sort
				(?P<num1>									# the first number (1 of 3 styles, below)
					(?=\p{{Hebrew}}+(?:"|\u05f4|'')\p{{Hebrew}}) # (2: ") Lookahead:  At least one letter, followed by double-quote, two single quotes, or gershayim, followed by  one letter
						\u05ea*(?:"|\u05f4|'')?				# Many Tavs (400), maybe dbl quote
						[\u05e7-\u05ea]?(?:"|\u05f4|'')?	# One or zero kuf-tav (100-400), maybe dbl quote
						[\u05d8-\u05e6]?(?:"|\u05f4|'')?	# One or zero tet-tzaddi (9-90), maybe dbl quote
						[\u05d0-\u05d8]?					# One or zero alef-tet (1-9)															#
					|(?=\p{{Hebrew}})						# (3: no punc) Lookahead: at least one Hebrew letter
						\u05ea*								# Many Tavs (400)
						[\u05e7-\u05ea]?					# One or zero kuf-tav (100-400)
						[\u05d8-\u05e6]?					# One or zero tet-tzaddi (9-90)
						[\u05d0-\u05d8]?					# One or zero alef-tet (1-9)
					|\p{{Hebrew}}['\u05f3]					# (1: ') single letter, followed by a single quote or geresh
				)\s*										# end of the num1 group, maybe space
				[.:]?										# maybe a . for gemara refs or a : for tanach or gemara refs
				[,\s]*			    						# maybe a comma, maybe a space, maybe both
				(?:
					(?:\u05de\u05e9\u05e0\u05d4\s)			# Mishna spelled out, with a space after
					|(?:\u05de(?:"|\u05f4|'')?)				# or Mem (for 'mishna') maybe followed by a quote of some sort
				)?
				(?P<num2>									# second number - optional
					(?=\p{{Hebrew}}+(?:"|\u05f4|'')\p{{Hebrew}}) # (2: ") Lookahead:  At least one letter, followed by double-quote, two single quotes, or gershayim, followed by  one letter
						\u05ea*(?:"|\u05f4|'')?				# Many Tavs (400), maybe dbl quote
						[\u05e7-\u05ea]?(?:"|\u05f4|'')?	# One or zero kuf-tav (100-400), maybe dbl quote
						[\u05d8-\u05e6]?(?:"|\u05f4|'')?	# One or zero tet-tzaddi (9-90), maybe dbl quote
						[\u05d0-\u05d8]?					# One or zero alef-tet (1-9)															#
					|(?=\p{{Hebrew}})						# (3: no punc) Lookahead: at least one Hebrew letter
						\u05ea*								# Many Tavs (400)
						[\u05e7-\u05ea]?					# One or zero kuf-tav (100-400)
						[\u05d8-\u05e6]?					# One or zero tet-tzaddi (9-90)
						[\u05d0-\u05d8]?					# One or zero alef-tet (1-9)
					|\p{{Hebrew}}['\u05f3]					# (1: ') single letter, followed by a single quote or geresh
				)?[.:]?										# end of the num2 group, maybe a . or : for gemara refs
			)												# end of ref capture
			(?=												# look ahead for closing brace
				[^({{]*										# match of anything but an opening '(' or brace
				[)}}]										# zero-width: literal ')' or brace
			)
		""".format(title_string)

		reg = regex.compile(reg, regex.VERBOSE)

	matches = reg.findall(st)
	refs = [match[0] for match in matches]
	if len(refs) > 0:
		for ref in refs:
			logger.debug("get_refs_in_text: " + ref)
	return refs


def grab_section_from_text(sections, text, toSections=None):
	"""
	Returns a section of text from within the jagged array 'text'
	that is denoted by sections and toSections.
	"""
	if len(sections) == 0:
		return text
	if not text:
		return ""

	toSections = toSections or sections
	try:
		if sections[0] == toSections[0]:
			if len(sections) == 1:
				return text[sections[0]-1]
			else:
				return grab_section_from_text(sections[1:], text[sections[0]-1], toSections[1:])
		else:
			return text[ sections[0]-1 : toSections[0]-1 ]

	except IndexError:
		# Index out of bounds, we don't have this text
		return ""
	except TypeError:
		return ""
