# -*- coding: utf-8 -*-

import sys
import os
import re
import copy
import pymongo
import simplejson as json
from datetime import datetime
from pprint import pprint

from bson.objectid import ObjectId
import operator
import bleach

from settings import *
from counts import *
from history import *
from summaries import *
from search import index_text
from hebrew import encode_hebrew_numeral, decode_hebrew_numeral


# To allow these files to be run directly from command line (w/o Django shell)
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

# HTML Tag whitelist for sanitizing user submitted text
ALLOWED_TAGS = ("i", "b", "u", "strong", "em", "big", "small")

connection = pymongo.Connection(MONGO_HOST)
db = connection[SEFARIA_DB]
if SEFARIA_DB_USER and SEFARIA_DB_PASSWORD:
	db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

# Simple caches for indices, parsed refs, table of contents and texts list
indices = {}
parsed = {}
toc_cache = None
texts_titles_cache = None
texts_titles_json = None


def get_index(book):
	"""
	Return index information about string 'book', but not the text.
	"""
	# look for result in indices cache
	res = indices.get(book)
	if res:
		return copy.deepcopy(res)

	book = (book[0].upper() + book[1:]).replace("_", " ")
	i = db.index.find_one({"titleVariants": book})

	# Simple case: found an exact match in the index collection
	if i:
		keys = ("sectionNames", "categories", "title", "heTitle", "length", "lengths", "maps", "titleVariants")
		i = dict((key,i[key]) for key in keys if key in i)
		if "sectionNames" in i:
			i["textDepth"] = len(i["sectionNames"])
		indices[book] = copy.deepcopy(i)
		return i

	# Try matching "Commentator on Text" e.g. "Rashi on Genesis"
	commentators = db.index.find({"categories.0": "Commentary"}).distinct("titleVariants")
	books = db.index.find({"categories.0": {"$in": ["Tanach", "Talmud"]}}).distinct("titleVariants")

	commentatorsRe = "^(" + "|".join(commentators) + ") on (" + "|".join(books) +")$"
	match = re.match(commentatorsRe, book)
	if match:
		i = get_index(match.group(1))
		bookIndex = get_index(match.group(2))
		i["commentaryBook"] = bookIndex["title"]
		i["commentaryCategories"] = bookIndex["categories"]
		i["categories"] = ["Commentary"] + bookIndex["categories"] + [bookIndex["title"]]
		i["commentator"] = match.group(1)
		if "heTitle" in i:
			i["heCommentator"] = i["heTitle"]
		i["title"] = match.group(1) + " on " + bookIndex["title"]
		if "heTitle" in i and "heTitle" in bookIndex:
			i["heBook"] = i["heTitle"]
			i["heTitle"] = i["heTitle"] + u" \u05E2\u05DC " + bookIndex["heTitle"]
		i["sectionNames"] = bookIndex["sectionNames"] + ["Comment"]
		i["textDepth"] = len(i["sectionNames"])
		i["titleVariants"] = [i["title"]]
		i["length"] = bookIndex["length"]
		indices[book] = copy.deepcopy(i)
		return i

	# TODO return a virtual index for shorthands

	return {"error": "Unknown text: '%s'." % book}


def merge_translations(text, sources):
	"""
	This is a recursive function that merges the text in multiple
	translations to fill any gaps and deliver as much text as
	possible.
	e.g. [["a", ""], ["", "b", "c"]] becomes ["a", "b", "c"]
	"""
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
			# a one dimensional list, but in so doing the mapping of source name to segments
			# is lost of merged texts of depth > 2 (this mapping is not currenly used in general)
			result_sources += source
		return [results, result_sources]

	if depth == 1:
		text = map(lambda x: [x], text)

	merged = map(None, *text)
	text = []
	text_sources = []
	for verses in merged:
		# Look for the first non empty version (which will be the oldest)
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


def text_from_cur(ref, textCur, context):
	"""
	Take a parsed ref and DB cursor of texts and construct a text to return out of what's available.
	Merges text fragments when necessary so that the final version has maximum text.
	"""
	versions = []
	versionTitles = []
	versionSources = []
	versionStatuses = []
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
			# dive down into text until the request segment is found
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
		except IndexError:
			# this happens when t doesn't have the text we're looking for
			pass

	if list_depth(versions) == 1:
		while '' in versions:
			versions.remove('')

	if len(versions) == 0:
		ref['text'] = "" if context == 0 else []

	elif len(versions) == 1:
		ref['text'] = versions[0]
		ref['versionTitle'] = versionTitles[0]
		ref['versionSource'] = versionSources[0]
		ref['versionStatus'] = versionStatuses[0]

	elif len(versions) > 1:
		ref['text'], ref['sources'] = merge_translations(versions, versionTitles)
		if len([x for x in set(ref['sources'])]) == 1:
			# if sources only lists one title, no merge acually happened
			ref['versionTitle'] = ref['sources'][0]
			ref['versionSource'] = versionSources[versionTitles.index(ref['sources'][0])]
			ref['versionStatus'] = versionStatuses[versionTitles.index(ref['sources'][0])]
			del ref['sources']

 	return ref


def get_text(ref, context=1, commentary=True, version=None, lang=None, pad=True):
	"""
	Take a string reference to a segment of text and return a dictionary including
	the text and other info.
		* 'context': how many levels of depth above the requet ref should be returned.
	  		e.g., with context=1, ask for a verse and receive its surrounding chapter as well.
	  		context=0 gives just what is asked for.
		* 'commentary': whether or not to search for and return connected texts as well.
		* 'version' + 'lang': use to specify a particular version of a text to return.
	"""
	r = parse_ref(ref, pad=pad)
	if "error" in r:
		return r

	if is_spanning_ref(r):
		# If ref spans sections, call get_text for each section
		return get_spanning_text(r)

	skip = r["sections"][0] - 1 if len(r["sections"]) else 0
	limit = 1
	chapter_slice = {"_id": 0} if len(r["sectionNames"]) == 1 else {"_id": 0, "chapter": {"$slice": [skip,limit]}}

	textCur = heCur = None
	# pull a specific version of text
	if version and lang == "en":
		textCur = db.texts.find({"title": r["book"], "language": lang, "versionTitle": version}, chapter_slice)

	elif version and lang == "he":
		heCur = db.texts.find({"title": r["book"], "language": lang, "versionTitle": version}, chapter_slice)

	# If no criteria set above, pull all versions,
	# Prioritize first according to "priority" field (if present), then by oldest text first
	# Order here will determine which versions are used in case of a merge
	textCur = textCur or db.texts.find({"title": r["book"], "language": "en"}, chapter_slice).sort([["priority", -1], ["_id", 1]])
	heCur   = heCur   or db.texts.find({"title": r["book"], "language": "he"}, chapter_slice).sort([["priority", -1], ["_id", 1]])

	# Extract / merge relevant text. Pull Hebrew from a copy of r first, since text_from_cur alters r
	heRef = text_from_cur(copy.deepcopy(r), heCur, context)
	r = text_from_cur(r, textCur, context)

	# Add fields pertaining the the Hebrew text under different field names
	r["he"]              = heRef.get("text") or []
	r["heVersionTitle"]  = heRef.get("versionTitle", "")
	r["heVersionSource"] = heRef.get("versionSource", "")
	r["heVersionStatus"] = heRef.get("versionStatus", "")
	if "sources" in heRef:
		r["heSources"] = heRef.get("sources")

	# find commentary on this text if requested
	if commentary:
		if r["type"] == "Talmud":
			searchRef = r["book"] + " " + section_to_daf(r["sections"][0])
		elif r["type"] == "Commentary" and r["commentaryCategories"][0] == "Talmud":
			searchRef = r["book"] + " " + section_to_daf(r["sections"][0])
			searchRef += (".%d" % r["sections"][1]) if len(r["sections"]) > 1 else ""
		else:
			sections = ["%s" % s for s in r["sections"][:len(r["sectionNames"])-1]]
			if not len(sections) and len(r["sectionNames"]) > 1:
				sections = ["1"]
			searchRef = ".".join([r["book"]] + sections)
		links = get_links(searchRef)
		r["commentary"] = links if "error" not in links else []

		# get list of available versions of this text
		# but only if you care enough to get commentary also (hack)
		r["versions"] = get_version_list(ref)

	# use shorthand if present, masking higher level sections
	if "shorthand" in r:
		r["book"] = r["shorthand"]
		d = r["shorthandDepth"]
		for key in ("sections", "toSections", "sectionNames"):
			r[key] = r[key][d:]

	# replace ints with daf strings (3->"2a") if text is Talmud or commentary on Talmud
	if r["type"] == "Talmud" or r["type"] == "Commentary" and r["commentaryCategories"][0] == "Talmud":
		daf = r["sections"][0]
		r["sections"][0] = section_to_daf(daf)
		r["title"] = r["book"] + " " + r["sections"][0]
		if "heTitle" in r:
			r["heBook"] = r["heTitle"]
			r["heTitle"] = r["heTitle"] + " " + section_to_daf(daf, lang="he")
		if r["type"] == "Commentary" and len(r["sections"]) > 1:
			r["title"] = "%s Line %d" % (r["title"], r["sections"][1])
		if "toSections" in r: r["toSections"][0] = r["sections"][0]

	elif r["type"] == "Commentary":
		d = len(r["sections"]) if len(r["sections"]) < 2 else 2
		r["title"] = r["book"] + " " + ":".join(["%s" % s for s in r["sections"][:d]])

	return r


def is_spanning_ref(pRef):
	"""
	Returns True if the parsed ref (pRef) spans across text sections.
	(where "section" is the second lowest segment level, e.g., "Chapter", "Daf")
	Shabbat 13a-b - True, Shabbat 13:3-14 - False
	Job 4:3-5:3 - True, Job 4:5-18 - False
	"""
	depth = pRef["textDepth"]
	if depth == 1:
		# text of depth 1 can't be spanning
		return False

	if len(pRef["sections"]) == 0:
		# can't be spanning if no sections set
		return False

	if len(pRef["sections"]) <= depth - 2:
		point = len(pRef["sections"]) - 1
	else:
		point = depth - 2

	if pRef["sections"][point] == pRef["toSections"][point]:
		return False

	return True


def get_spanning_text(pRef):
	"""
	Gets text for a ref that spans across text sections.

	TODO refactor to handle commentary on spanning refs
	TODO properly track version names and lists which may differ across sections
	"""
	refs = split_spanning_ref(pRef)
	text, he = [], []
	for ref in refs:
		result = get_text(ref, context=0, commentary=False)
		text.append(result["text"])
		he.append(result["he"])

	result["text"] = text
	result["he"] = he
	result["spanning"] = True
	result.update(pRef)
	return result


def split_spanning_ref(pRef):
	"""
	Returns a list of refs that do not span sections which corresponds
	to the spanning ref in pRef.
	Shabbat 13b-14b -> ["Shabbat 13b", "Shabbat 14a", "Shabbat 14b"]

	TODO This currently ignores any segment level specifications
	e.g, Job 4:10-6:4 -> ["Job 4", "Job 5", "Job 6"]
	"""
	depth = pRef["textDepth"]
	if depth == 1:
		return [pRef["ref"]]

	start, end = pRef["sections"][depth-2], pRef["toSections"][depth-2]

	refs = []

	# build a parsed ref for each new ref
	# this ignores segment level specfications, which are added back later
	for n in range(start, end+1):
		section_pRef = copy.deepcopy(pRef)
		section_pRef["sections"] = pRef["sections"][0:depth-1]
		section_pRef["sections"][-1] = n
		section_pRef["toSections"] = section_pRef["sections"]
		refs.append(make_ref(section_pRef))

	# add segment specificity to beginning
	last_segment = get_segment_count_for_ref(refs[0])
	refs[0] = "%s:%d-%d" % (refs[0], pRef["sections"][-1], last_segment)

	# add segment specificity to end
	refs[-1] = "%s:1-%d" % (refs[-1], pRef["toSections"][-1])

	return refs


def get_segment_count_for_ref(ref):
	"""
	Returns the number of segments stored in the DB
	for ref.
	a.k.a., return the number of verses for a chapter.
	"""
	text = get_text(ref, commentary=False)
	return max(len(text["text"]), len(text["he"]))


def get_version_list(ref):
	"""
	Returns a list of available text versions matching 'ref'
	"""
	pRef = parse_ref(ref)
	skip = pRef["sections"][0] - 1 if len(pRef["sections"]) else 0
	limit = 1
	versions = db.texts.find({"title": pRef["book"]}, {"chapter": {"$slice": [skip, limit]}})

	vlist = []
	for v in versions:
		text = v['chapter']
		for i in [0] + pRef["sections"][1:]:
			try:
				text = text[i]
			except (IndexError, TypeError):
				text = None
				continue
		if text:
			vlist.append({"versionTitle": v["versionTitle"], "language": v["language"]})

	return vlist

def make_ref_re(ref):
	"""
	Returns a string for a Regular Expression which will find any refs that match
	'ref' exactly, or more specific that 'ref'
	E.g., "Genesis 1" yields an RE that match "Genesis 1" and "Genesis 1:3"
	"""
	pRef = parse_ref(ref)
	reRef = "^%s$|^%s\:" % (ref, ref)
	if len(pRef["sectionNames"]) == 1 and len(pRef["sections"]) == 0:
		reRef += "|^%s \d" % ref

	return reRef


def get_links(ref, with_text=True):
	"""
	Return a list links tied to 'ref'.
	If with_text, retrieve texts for each link.
	"""
	links = []
	nRef = norm_ref(ref)
	reRef = make_ref_re(ref)

	# for storing all the section level texts that need to be looked up
	texts = {}

	linksCur = db.links.find({"refs": {"$regex": reRef}})
	# For all links that mention ref (in any position)
	for link in linksCur:
		# each link contins 2 refs in a list
		# find the position (0 or 1) of "anchor", the one we're getting links for
		pos = 0 if re.match(reRef, link["refs"][0]) else 1
		com = format_link_for_client(link, nRef, pos, with_text=False)

		if with_text and "error" not in com:
			top_ref = top_section_ref(com["ref"])
			pRef = parse_ref(com["ref"])
			# Lookup and save top level text, only if we haven't already
			if top_ref not in texts:
				texts[top_ref] = get_text(top_ref, context=0, commentary=False, pad=False)

			sections, toSections = pRef["sections"][1:],  pRef["toSections"][1:]
			com["text"] = grab_section_from_text(sections, texts[top_ref]["text"], toSections)
			com["he"]   = grab_section_from_text(sections, texts[top_ref]["he"],   toSections)

		links.append(com)

	return links


def format_link_for_client(link, ref, pos, with_text=True):
	"""
	Returns an object that represents 'link' in the format expected by the reader client.
	TODO - much of this format is legacy and should be cleaned up.
	"""
	com = {}

	# The text we're asked to get links to
	anchorRef = parse_ref(link["refs"][pos])
	if "error" in anchorRef:
		return {"error": "Error parsing %s: %s" % (link["refs"][pos], anchorRef["error"])}

	# The link we found to anchorRef
	linkRef = parse_ref( link[ "refs" ][ ( pos + 1 ) % 2 ] )
	if "error" in linkRef:
		return {"error": "Error parsing %s: %s" % (link["refs"][(pos + 1) % 2], linkRef["error"])}

	com["_id"]           = str(link["_id"])
	com["category"]      = linkRef["type"]
	com["type"]          = link["type"]
	com["ref"]           = linkRef["ref"]
	com["anchorRef"]     = make_ref(anchorRef)
	com["sourceRef"]     = make_ref(linkRef)
	com["anchorVerse"]   = anchorRef["sections"][-1]
	com["commentaryNum"] = linkRef["sections"][-1] if linkRef["type"] == "Commentary" else 0
	com["anchorText"]    = link["anchorText"] if "anchorText" in link else ""

	if with_text:
		text             = get_text(linkRef["ref"], context=0, commentary=False)
		com["text"]      = text["text"] if text["text"] else ""
		com["he"]        = text["he"] if text["he"] else ""

	# strip redundant verse ref for commentators
	if com["category"] == "Commentary":
		# if the ref we're looking for appears exactly in the commentary ref, strip redundant info
		if ref in linkRef["ref"]:
			com["commentator"] = linkRef["commentator"]
			com["heCommentator"] = linkRef["heCommentator"] if "heCommentator" in linkRef else com["commentator"]
		else:
			com["commentator"] = linkRef["ref"]
			com["heCommentator"] = linkRef["heTitle"] if "heTitle" in linkRef else com["commentator"]
	else:
		com["commentator"] = linkRef["book"]
		com["heCommentator"] = linkRef["heTitle"] if "heTitle" in linkRef else com["commentator"]

	if "heTitle" in linkRef:
		com["heTitle"] = linkRef["heTitle"]

	return com


def get_notes(ref, public=True, uid=None, pad=True, context=0):
	"""
	Returns a list of notes related to ref.
	If public, include any public note.
	If uid is set, return private notes of uid.
	"""
	links = []
	nRef = norm_ref(ref, pad=pad, context=context)
	if not nRef:
		return []
	reRef = make_ref_re(nRef)

	if public and uid:
		query = {"ref": {"$regex": reRef}, "$or": [{"public": True}, {"owner": uid}]}
	elif public:
		query = {"ref": {"$regex": reRef}, "public": True}
	elif uid:
		query = {"ref": {"$regex": reRef}, "owner": uid}


	# Find any notes associated with this ref
	notes = db.notes.find(query)
	for note in notes:
		com = format_note_for_client(note)
		if note["owner"] != uid:
			com["text"] = com["commentator"] + " - " + com["text"] if com["commentator"] else com["text"]
			com["commentator"] = user_link(note["owner"])
		links.append(com)

	return links


def format_note_for_client(note):
	"""
	Returns an object that represents note in the format expected by the reader client,
	matching the format of links, which are currently handled together.
	"""
	com = {}
	anchorRef = parse_ref(note["ref"])

	com["commentator"] = note["title"]
	com["category"]    = "Notes"
	com["type"]        = "note"
	com["owner"]       = note["owner"]
	com["_id"]         = str(note["_id"])
	com["anchorRef"]   = note["ref"]
	com["anchorVerse"] = anchorRef["sections"][-1]
	com["anchorText"]  = note["anchorText"] if "anchorText" in note else ""
	com["text"]        = note["text"]
	com["public"]      = note["public"] if "public" in note else False

	return com


def parse_ref(ref, pad=True):
	"""
	Take a string reference (e.g. 'Job.2:3-3:1') and returns a parsed dictionary of its fields

	If pad is True, ref sections will be padded with 1's until the sections are at least within one
	level from the depth of the text.

	Returns:
		* ref - the original string reference
		* book - a string name of the text
		* sectionNames - an array of strings naming the kinds of sections in this text (Chapter, Verse)
		* textDepth - an integer denote the number of sections named in sectionNames
		* sections - an array of ints giving the requested sections numbers
		* toSections - an array of ints giving the requested sections at the end of a range
		* next, prev - an dictionary with the ref and labels for the next and previous sections
		* categories - an array of categories for this text
		* type - the highest level category for this text
	"""
	try:
		ref = ref.decode('utf-8').replace(u"–", "-").replace(":", ".").replace("_", " ")
	except UnicodeEncodeError, e:
		return {"error": "UnicodeEncodeError: %s" % e}
	except AttributeError, e:
		return {"error": "AttributeError: %s" % e}

	try:
		# capitalize first letter (don't title case all to avoid e.g., "Song Of Songs")
		ref = ref[0].upper() + ref[1:]
	except IndexError:
		pass

	#parsed is the cache for parse_ref
	if ref in parsed and pad:
		return copy.deepcopy(parsed[ref])

	pRef = {}

	# Split into range start and range end (if any)
	toSplit = ref.split("-")
	if len(toSplit) > 2:
		pRef["error"] = "Couldn't understand ref (too many -'s)"
		parsed[ref] = copy.deepcopy(pRef)
		return pRef

	# Get book
	base = toSplit[0]
	bcv = base.split(".") # bcv stands for book, chapter, verse, from a time when all we had was tanakh
	# Normalize Book
	pRef["book"] = bcv[0].replace("_", " ")

	# handle space between book and sections (Genesis 4:5) as well as . (Genesis.4.3)
	if re.match(r".+ \d+[ab]?", pRef["book"]):
		p = pRef["book"].rfind(" ")
		bcv.insert(1, pRef["book"][p+1:])
		pRef["book"] = pRef["book"][:p]


	# Try looking for a stored map (shorthand)
	shorthand = db.index.find_one({"maps": {"$elemMatch": {"from": pRef["book"]}}})
	if shorthand:
		for i in range(len(shorthand["maps"])):
			if shorthand["maps"][i]["from"] == pRef["book"]:
				# replace the shorthand in ref with its mapped value and recur
				to = shorthand["maps"][i]["to"]
				if ref == to: ref = to
				else:
					ref = ref.replace(pRef["book"]+" ", to + ".")
					ref = ref.replace(pRef["book"], to)
				parsedRef = parse_ref(ref)
				d = len(parse_ref(to, pad=False)["sections"])
				parsedRef["shorthand"] = pRef["book"]
				parsedRef["shorthandDepth"] = d
				parsed[ref] = copy.deepcopy(parsedRef)
				return parsedRef

	# Find index record or book
	index = get_index(pRef["book"])

	if "error" in index:
		parsed[ref] = copy.deepcopy(index)
		return index

	if index["categories"][0] == "Commentary" and "commentaryBook" not in index:
		parsed[ref] = {"error": "Please specify a text that %s comments on." % index["title"]}
		return parsed[ref]

	pRef["book"] = index["title"]
	pRef["type"] = index["categories"][0]
	del index["title"]
	pRef.update(index)

	# Special Case Talmud or commentaries on Talmud from here
	if pRef["type"] == "Talmud" or pRef["type"] == "Commentary" and "commentaryCategories" in index and index["commentaryCategories"][0] == "Talmud":
		pRef["bcv"] = bcv
		pRef["ref"] = ref
		result = subparse_talmud(pRef, index, pad=pad)
		result["ref"] = make_ref(pRef)
		if pad:
			# only cache padded versions
			parsed[ref] = copy.deepcopy(result)
		return result

	# Parse section numbers
	try:
		pRef["sections"] = []
		# Book only
		if len(bcv) == 1 and pad:
			pRef["sections"] = [1 for i in range(len(pRef["sectionNames"]) - 1)]
		else:
			for i in range(1, len(bcv)):
				pRef["sections"].append(int(bcv[i]))

		# Pad sections with 1's, so e,g. "Mishneh Torah 4:3" points to "Mishneh Torah 4:3:1"
		if pad:
			for i in range(len(pRef["sections"]), len(pRef["sectionNames"]) -1):
				pRef["sections"].append(1)

		pRef["toSections"] = pRef["sections"][:]


		# handle end of range (if any)
		if len(toSplit) > 1:
			cv = toSplit[1].split(".")
			delta = len(pRef["sections"]) - len(cv)
			for i in range(delta, len(pRef["sections"])):
				pRef["toSections"][i] = int(cv[i - delta])
	except ValueError:
		parsed[ref] = {"error": "Couldn't understand text sections: %s" % ref}
		return parsed[ref]

	# give error if requested section is out of bounds
	if "length" in index and len(pRef["sections"]):
		if pRef["sections"][0] > index["length"]:
			result = {"error": "%s only has %d %ss." % (pRef["book"], index["length"], pRef["sectionNames"][0])}
			parsed[ref] = copy.deepcopy(result)
			return result

	if pRef["categories"][0] == "Commentary" and "commentaryBook" not in pRef:
		pRef["ref"] = pRef["book"]
		return pRef

	pRef["next"] = next_section(pRef)
	pRef["prev"] = prev_section(pRef)

	pRef["ref"] = make_ref(pRef)
	if pad:
		parsed[ref] = copy.deepcopy(pRef)
	return pRef


def subparse_talmud(pRef, index, pad=True):
	"""
	Special sub method for parsing Talmud references,
	allowing for Daf numbering "2a", "2b", "3a" etc.

	This function returns the first section as an int which correponds
	to how the text is stored in the DB,
	e.g. 2a = 3, 2b = 4, 3a = 5.

	get_text will transform these ints back into daf strings
	before returning to the client.
	"""
	toSplit = pRef["ref"].split("-")
	bcv = pRef["bcv"]
	del pRef["bcv"]

	pRef["sections"] = []
	if len(bcv) == 1 and pad:
		# Set the daf to 2a if pad and none specified
		daf = 2
		amud = "a"
		pRef["sections"].append(3)

	elif len(bcv) > 1:
		daf = bcv[1]
		if not re.match("\d+[ab]?", daf):
			pRef["error"] = "Couldn't understand Talmud Daf reference: %s" % daf
			return pRef
		try:
			if daf[-1] in ["a", "b"]:
				amud = daf[-1]
				daf = int(daf[:-1])
			else:
				amud = "a"
				daf = int(daf)
		except ValueError:
			return {"error": "Couldn't understand daf: %s" % pRef["ref"]}

		if "length" in index and daf > index["length"]:
			pRef["error"] = "%s only has %d dafs." % (pRef["book"], index["length"])
			return pRef

		chapter = daf * 2
		if amud == "a": chapter -= 1

		pRef["sections"] = [chapter]
		pRef["toSections"] = [chapter]

		# line numbers or line number and comment numbers specified
		if len(bcv) > 2:
			pRef["sections"].extend(map(int, bcv[2:]))
			pRef["toSections"].extend(map(int, bcv[2:]))

	if pad:
		# add additional padding if needed
		# (e.g change Rashi on Shabbat 2a -> Rashi on Shabbat 2a:1)
		for i in range(pRef["textDepth"] - len(pRef["sections"]) - 1):
			pRef["sections"].append(1)

	pRef["toSections"] = pRef["sections"][:]

	if len(pRef["sections"]) == 0:
		return pRef

	# Handle range if specified
	if len(toSplit)	== 2:
		toSections = toSplit[1].replace(r"[ :]", ".").split(".")

		# 'Shabbat 23a-b'
		if toSections[0] == 'b':
			toSections[0] = pRef["sections"][0] + 1

		# 'Shabbat 24b-25a'
		elif re.match("\d+[ab]", toSections[0]):
			toSections[0] = daf_to_section(toSections[0])
		pRef["toSections"] = [int(s) for s in toSections]

		delta = len(pRef["sections"]) - len(pRef["toSections"])
		for i in range(delta -1, -1, -1):
			pRef["toSections"].insert(0, pRef["sections"][i])

	# Set next daf, or next line for commentary on daf
	if "length" not in index or pRef["sections"][0] < index["length"] * 2: # 2 because talmud length count dafs not amuds
		if pRef["type"] == "Talmud":
			nextDaf = section_to_daf(pRef["sections"][0] + 1)
			pRef["next"] = "%s %s" % (pRef["book"], nextDaf)
		elif pRef["type"] == "Commentary":
			daf = section_to_daf(pRef["sections"][0])
			line = pRef["sections"][1] if len(pRef["sections"]) > 1 else 1
			pRef["next"] = "%s %s:%d" % (pRef["book"], daf, line + 1)

	# Set previous daf, or previous line for commentary on daf
	if pRef["type"] == "Commentary" or pRef["sections"][0] > 3: # three because first page is '2a' = 3
		if pRef["type"] == "Talmud":
			prevDaf = section_to_daf(pRef["sections"][0] - 1)
			pRef["prev"] = "%s %s" % (pRef["book"], prevDaf)
		elif pRef["type"] == "Commentary":
			daf = section_to_daf(pRef["sections"][0])
			line = pRef["sections"][1] if len(pRef["sections"]) > 1 else 1
			if line > 1:
				pRef["prev"] = "%s %s:%d" % (pRef["book"], daf, line - 1)

	return pRef


def parse_daf_string(daf):
	"""
	Take a string representing a daf ('55', amud ('55b')
	or a line on a daf ('55b:2') and return of list parsing it in
	ints.

	'2a' -> [3], '2a:4' -> [3, 4]
	"""
	return []


def next_section(pRef):
	"""
	Returns a ref of the section after the one designated by pRef
	or the section that contains the segment designated by pRef.
	E.g, Genesis 2 -> Genesis 3
	"""
	# If this is a one section text there is no next section
	if pRef["textDepth"] == 1:
		return None

	# Trim sections to the length of section, not segments
	next = pRef["sections"][:pRef["textDepth"] - 1]
	if (len(next) == 0): # zero if sections is empty
		next = [1]

	if pRef["categories"][0] == "Commentary":
		text = get_text("%s.%s" % (pRef["commentaryBook"], ".".join([str(s) for s in next[:-1]])), False, 0)
		if "error" in text: return None
		length = max(len(text["text"]), len(text["he"]))

	# If this is the last section there is no next
	# Since 'length' only applies to top level, this only
	# works with text depth 2.
	if "length" in pRef and pRef["textDepth"] == 2 and next[0] >= pRef["length"]:
		return None

	# Increment the appropriate section
	if pRef["categories"][0] == "Commentary" and next[-1] == length:
		next[-2] = next[-2] + 1
		next[-1] = 1
	else:
		next[-1] = next[-1] + 1
	nextRef = "%s %s" % (pRef["book"], ".".join([str(s) for s in next]))

	return nextRef


def prev_section(pRef):
	"""
	Returns a ref of the section before the one designated by pRef.
	Returns None if this is the first section.
	E.g, Genesis 2 -> Genesis 3
	"""
	# If this is a one section text there is no prev section
	if len(pRef["sectionNames"]) == 1:
		return None

	# Trimmed to the length of sections, not segments
	prev = pRef["sections"][:len(pRef["sectionNames"]) - 1]
	if (len(prev) == 0):
		prev = pRef["sections"]

	# if this is not the first section
	if False not in [x==1 for x in prev]:
		return None

	if pRef["categories"][0] == "Commentary" and prev[-1] == 1:
		pSections = prev[:-1]
		pSections[-1] = pSections[-1] - 1 if pSections[-1] > 1 else 1
		prevText = get_text("%s.%s" % (pRef["commentaryBook"], ".".join([str(s) for s in pSections])), False, 0)
		if "error" in prevText: return None
		pLength = max(len(prevText["text"]), len(prevText["he"]))
		prev[-2] = prev[-2] - 1 if prev[-2] > 1 else 1
		prev[-1] = pLength
	else:
		prev[-1] = prev[-1] - 1 if prev[-1] > 1 else 1
	prevRef = "%s %s" % (pRef["book"], ".".join([str(s) for s in prev]))

	return prevRef


def daf_to_section(daf):
	"""
	Transforms a daf string (e.g., '4b') to its corresponding stored section number.
	"""
	amud = daf[-1]
	daf = int(daf[:-1])
	section = daf * 2
	if amud == "a": section -= 1
	return section


def section_to_daf(section, lang="en"):
	"""
	Trasnforms a section number to its corresponding daf string,
	in English or in Hebrew.
	"""
	section += 1
	daf = section / 2

	if lang == "en":
		if section > daf * 2:
			daf = "%db" % daf
		else:
			daf = "%da" % daf

	elif lang == "he":
		if section > daf * 2:
			daf = ("%s " % encode_hebrew_numeral(daf)) + u"\u05D1"
		else:
			daf = ("%s " % encode_hebrew_numeral(daf)) + u"\u05D0"

	return daf


def norm_ref(ref, pad=False, context=0):
	"""
	Returns a normalized string ref for 'ref' or False if there is an
	error parsing ref.
	* pad: whether to insert 1s to make the ref specfic to at least section level
		e.g.: "Genesis" --> "Genesis 1"
	* context: how many levels to 'zoom out' from the most specific possible ref
		e.g., with context=1, "Genesis 4:5" -> "Genesis 4"
	"""
	pRef = parse_ref(ref, pad=pad)
	if "error" in pRef: return False
	if context:
		pRef["sections"] = pRef["sections"][:pRef["textDepth"]-context]
		pRef["toSections"] = pRef["sections"][:pRef["textDepth"]-context]

	return make_ref(pRef)


def make_ref(pRef):
	"""
	Returns a string ref which is the normalized form of the parsed dictionary 'pRef'
	"""
	if pRef["type"] == "Commentary" and "commentaryCategories" not in pRef:
		return pRef["book"]

	if pRef["type"] == "Talmud" or pRef["type"] == "Commentary" and pRef["commentaryCategories"][0] == "Talmud":
		talmud = True
		nref = pRef["book"]
		nref += " " + section_to_daf(pRef["sections"][0]) if len(pRef["sections"]) > 0 else ""
		nref += ":" + ":".join([str(s) for s in pRef["sections"][1:]]) if len(pRef["sections"]) > 1 else ""
	else:
		talmud = False
		nref = pRef["book"]
		sections = ":".join([str(s) for s in pRef["sections"]])
		if len(sections):
			nref += " " + sections

	for i in range(len(pRef["sections"])):
		if not pRef["sections"][i] == pRef["toSections"][i]:
			if i == 0 and pRef and talmud:
				nref += "-%s" % (":".join([str(s) for s in [section_to_daf(pRef["toSections"][0])] + pRef["toSections"][i+1:]]))
			else:
				nref += "-%s" % (":".join([str(s) for s in pRef["toSections"][i:]]))
			break

	return nref


def url_ref(ref):
	"""
	Takes a string ref and returns it in a form suitable for URLs, eg. "Mishna_Berakhot.3.5"
	"""
	pref = parse_ref(ref, pad=False)
	if "error" in pref: return False
	ref = make_ref(pref)
	if not ref: return False
	ref = ref.replace(" ", "_").replace(":", ".")

	# Change "Mishna_Brachot_2:3" to "Mishna_Brachot.2.3", but don't run on "Mishna_Brachot"
	if len(pref["sections"]) > 0:
		last = ref.rfind("_")
		if last == -1:
			return ref
		lref = list(ref)
		lref[last] = "."
		ref = "".join(lref)

	return ref


def top_section_ref(ref):
	"""
	Returns a ref (string) that corrsponds to the highest level section above the ref passed.
	refs with no sections specified are padded to 1

	e.g., Job 4:5 -> Job 4, Rashi on Genesis 1:2:3 -> Rashi on Genesis 1
	"""
	pRef = parse_ref(ref, pad=True)
	if "error" in pRef:
		return pRef

	pRef["sections"] = pRef["sections"][:1]
	pRef["toSections"] = pRef["toSections"][:1]

	return make_ref(pRef)


def save_text(ref, text, user, **kwargs):
	"""
	Save a version of a text named by ref.

	text is a dict which must include attributes to be stored on the version doc,
	as well as the text itself,

	Returns saved JSON on ok or error.
	"""
	# Validate Ref
	pRef = parse_ref(ref, pad=False)
	if "error" in pRef:
		return pRef

	# Validate Posted Text
	validated =  validate_text(text, ref)
	if "error" in validated:
		return validated

	text["text"] = sanitize_text(text["text"])

	chapter  = pRef["sections"][0] if len(pRef["sections"]) > 0 else None
	verse    = pRef["sections"][1] if len(pRef["sections"]) > 1 else None
	subVerse = pRef["sections"][2] if len(pRef["sections"]) > 2 else None

	# Check if we already have this	text
	existing = db.texts.find_one({"title": pRef["book"], "versionTitle": text["versionTitle"], "language": text["language"]})

	if existing:
		# Have this (book / version / language)

		if existing.get("status", "") == "locked":
			return {"error": "This text has been locked against further edits."}

		# Pad existing version if it has fewer chapters
		if len(existing["chapter"]) < chapter:
			for i in range(len(existing["chapter"]), chapter):
				existing["chapter"].append([])

		# Save at depth 2 (e.g. verse: Genesis 4.5, Mishna Avot 2.4, array of comentary eg. Rashi on Genesis 1.3)
		if len(pRef["sections"]) == 2:
			if isinstance(existing["chapter"][chapter-1], basestring):
				existing["chapter"][chapter-1] = [existing["chapter"][chapter-1]]

			# Pad chapter if it doesn't have as many verses as the new text
			for i in range(len(existing["chapter"][chapter-1]), verse):
				existing["chapter"][chapter-1].append("")

			existing["chapter"][chapter-1][verse-1] = text["text"]


		# Save at depth 3 (e.g., a single Rashi Commentary: Rashi on Genesis 1.3.2)
		elif len(pRef["sections"]) == 3:

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
		elif len(pRef["sections"]) == 1:
			existing["chapter"][chapter-1] = text["text"]

		# Save as an entire named text
		elif len(pRef["sections"]) == 0:
			existing["chapter"] = text["text"]

		# Update version source
		existing["versionSource"] = text["versionSource"]

		record_text_change(ref, text["versionTitle"], text["language"], text["text"], user, **kwargs)
		db.texts.save(existing)

		del existing["_id"]
		if 'revisionDate' in existing:
			del existing['revisionDate']

		response = existing

	# New (book / version / language)
	else:
		text["title"] = pRef["book"]

		# add placeholders for preceding chapters
		if len(pRef["sections"]) > 0:
			text["chapter"] = []
			for i in range(chapter):
				text["chapter"].append([])

		# Save at depth 2 (e.g. verse: Genesis 4.5, Mishan Avot 2.4, array of comentary eg. Rashi on Genesis 1.3)
		if len(pRef["sections"]) == 2:
			chapterText = []
			for i in range(1, verse):
				chapterText.append("")
			chapterText.append(text["text"])
			text["chapter"][chapter-1] = chapterText

		# Save at depth 3 (e.g., a single Rashi Commentary: Rashi on Genesis 1.3.2)
		elif len(pRef["sections"]) == 3:
			for i in range(verse):
				text["chapter"][chapter-1].append([])
			subChapter = []
			for i in range(1, subVerse):
				subChapter.append([])
			subChapter.append(text["text"])
			text["chapter"][chapter-1][verse-1] = subChapter

		# Save at depth 1 (e.g, a whole chapter posted to Genesis.4)
		elif len(pRef["sections"]) == 1:
			text["chapter"][chapter-1] = text["text"]

		# Save an entire named text
		elif len(pRef["sections"]) == 0:
			text["chapter"] = text["text"]

		record_text_change(ref, text["versionTitle"], text["language"], text["text"], user, **kwargs)

		del text["text"]
		db.texts.update({"title": pRef["book"], "versionTitle": text["versionTitle"], "language": text["language"]}, text, True, False)

		response = text

	# Finish up for both existing and new texts

	# Commentaries generate links to their base text automatically
	if pRef["type"] == "Commentary":
		add_commentary_links(ref, user)

	# scan text for links to auto add
	add_links_from_text(ref, text, user)

	# count available segments of text
	if kwargs.get("count_after", True):
		update_summaries_on_change(pRef["book"])

	# index this text for search
	if SEARCH_INDEX_ON_SAVE and kwargs.get("index_after", True):
		index_text(ref)

	return response


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


def validate_text(text, ref):
	"""
	validate a dictionary representing a text to be written to db.texts
	"""
	# Required Keys
	for key in ("versionTitle", "versionSource", "language", "text"):
		if not key in text:
			return {"error": "Field '%s' missing from posted JSON."  % key}

	pRef = parse_ref(ref, pad=False)

	# Validate depth of posted text matches expectation
	posted_depth = 0 if isinstance(text["text"], basestring) else list_depth(text["text"])
	implied_depth = len(pRef["sections"]) + posted_depth
	if  implied_depth != pRef["textDepth"]:
		return {"error": "Text Structure Mismatch. The stored depth of %s is %d, but the text posted to %s implies a depth of %d." % (pRef["book"], pRef["textDepth"], ref, implied_depth)}

	return {"status": "ok"}


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


def save_link(link, user):
	"""
	Save a new link to the DB. link should have:
		- refs - array of connected refs
		- type
		- anchorText - relative to the first?
	"""
	if not validate_link(link):
		return {"error": "Error validating link."}


	link["refs"] = [norm_ref(link["refs"][0]), norm_ref(link["refs"][1])]

	if "_id" in link:
		# editing an existing link
		objId = ObjectId(link["_id"])
		link["_id"] = objId
	else:
		# Don't bother saving a connection that already exists (updates should occur with an _id)
		existing = db.links.find_one({"refs": link["refs"], "type": link["type"]})
		if existing:
			return {"error": "This connection already exists. Try editing instead."}
		else:
			# this is a new link
			objId = None

	db.links.save(link)
	record_obj_change("link", {"_id": objId}, link, user)

	return format_link_for_client(link, link["refs"][0], 0)


def validate_link(link):
	if False in link["refs"]:
		return False

	return True


def save_note(note, uid):
	"""
	Save a note repsented by the dictionary 'note'.
	"""
	note["ref"] = norm_ref(note["ref"])
	if "_id" in note:
		# updating an existing note
		note["_id"] = objId = ObjectId(note["_id"])
		existing = db.notes.find_one({"_id": objId})
		if not existing:
			return {"error": "Note not found."}
	else:
		# new note
		objId = None
		note["owner"] = uid
		existing = {}

	existing.update(note)
	db.notes.save(existing)

	if note["public"]:
		record_obj_change("note", {"_id": objId}, existing, uid)

	return format_note_for_client(existing)


def delete_link(id, user):
	record_obj_change("link", {"_id": ObjectId(id)}, None, user)
	db.links.remove({"_id": ObjectId(id)})
	return {"response": "ok"}


def delete_note(id, user):
	note = db.notes.find_one({"_id": ObjectId(id)})
	if not note:
		return {"error": "Note not found."}
	if note["public"]:
		record_obj_change("note", {"_id": ObjectId(id)}, None, user)
	db.notes.remove({"_id": ObjectId(id)})
	return {"response": "ok"}


def add_commentary_links(ref, user):
	"""
	Automatically add links for each comment in the commentary text denoted by 'ref'.
	E.g., for the ref 'Sforno on Kohelet 3:2', automatically set links for
	Kohelet 3:2 <-> Sforno on Kohelet 3:2:1, Kohelet 3:2 <-> Sforno on Kohelet 3:2:2, etc.
	for each segment of text (comment) that is in 'Sforno on Kohelet 3:2'.
	"""
	text = get_text(ref, commentary=0, context=0, pad=False)
	ref = norm_ref(ref)
	if not ref:
		return False
	book = ref[ref.find(" on ")+4:]

	if len(text["sections"]) == len(text["sectionNames"]):
		# this is a single comment, trim the last secton number (comment) from ref
		book = book[0:book.rfind(":")]
		link = {
			"refs": [book, ref],
			"type": "commentary",
			"anchorText": ""
		}
		save_link(link, user)

	elif len(text["sections"]) == (len(text["sectionNames"]) - 1):
		# this is single group of comments
		length = max(len(text["text"]), len(text["he"]))
		for i in range(length):
				link = {
					"refs": [book, ref + ":" + str(i+1)],
					"type": "commentary",
					"anchorText": ""
				}
				save_link(link, user)

	else:
		# this is a larger group of comments, recur on each section
		length = max(len(text["text"]), len(text["he"]))
		for i in range(length):
			add_commentary_links("%s:%d" % (ref, i+1), user)


def add_links_from_text(ref, text, user):
	"""
	Scan a text for explicit references to other texts and automatically add new links between
	ref and the mentioned text.

	text["text"] may be a list of segments, an individual segment, or None.

	"""
	if not text or "text" not in text:
		return
	elif isinstance(text["text"], list):
		for i in range(len(text["text"])):
			subtext = copy.deepcopy(text)
			subtext["text"] = text["text"][i]
			add_links_from_text("%s:%d" % (ref, i+1), subtext, user)
	elif isinstance(text["text"], basestring):
		matches = get_refs_in_text(text["text"])
		for mref in matches:
			link = {"refs": [ref, mref], "type": ""}
			if validate_link(link):
				save_link(link, user)


def save_index(index, user, **kwargs):
	"""
	Save an index record to the DB.
	Index records contain metadata about texts, but not the text itself.
	"""
	global indices, parsed
	index = norm_index(index)

	validation = validate_index(index)
	if "error" in validation:
		return validation

	# Ensure primary title is listed among title variants
	if index["title"] not in index["titleVariants"]:
		index["titleVariants"].append(index["title"])

	title = index["title"]
	# Handle primary title change
	if "oldTitle" in index:
		old_title = index["oldTitle"]
		update_text_title(old_title, title)
		del index["oldTitle"]
	else:
		old_title = None


	# Merge with existing if any to preserve serverside data
	# that isn't visibile in the client (like chapter counts)
	existing = db.index.find_one({"title": title})
	if existing:
		index = dict(existing.items() + index.items())

	record_obj_change("index", {"title": title}, index, user)
	# save provisionally to allow norm_ref below to work
	db.index.save(index)
	# normalize all maps' "to" value
	if "maps" not in index:
		index["maps"] = []
	for i in range(len(index["maps"])):
		nref = norm_ref(index["maps"][i]["to"])
		if not nref:
			return {"error": "Couldn't understand text reference: '%s'." % index["maps"][i]["to"]}
		index["maps"][i]["to"] = nref

	# now save with normilzed maps
	db.index.save(index)

	update_summaries_on_change(title, old_ref=old_title, recount=bool(old_title)) # only recount if the title changed

	del index["_id"]
	return index


def validate_index(index):
	# Required Keys
	for key in ("title", "titleVariants", "categories", "sectionNames"):
		if not key in index:
			return {"error": "Text index is missing a required field"}

	# Keys that should be non empty lists
	for key in ("categories", "sectionNames"):
		if not isinstance(index[key], list) or len(index[key]) == 0:
			return {"error": "%s field must be a non empty list of strings." % key}

	# Disallow special characters in text titles
	if any((c in '.-\\/') for c in index["title"]):
		return {"error": "Text title may not contain periods, hyphens or slashes."}

	# Disallow special character in categories
	for cat in index["categories"]:
		if any((c in '.-') for c in cat):
			return {"error": "Categories may not contain periods or hyphens."}

	# Disallow special character in sectionNames
	for cat in index["sectionNames"]:
		if any((c in '.-\\/') for c in cat):
			return {"error": "Text Structure names may not contain periods, hyphens or slashes."}

	# Make sure all title variants are unique
	for variant in index["titleVariants"]:
		existing = db.index.find_one({"titleVariants": variant})
		if existing and existing["title"] != index["title"]:
			if "oldTitle" not in index or existing["title"] != index["oldTitle"]:
				return {"error": 'A text called "%s" already exists.' % variant}

	return {"ok": 1}


def norm_index(index):
	"""
	Normalize an index dictionary.
	Uppercases the first letter of title and each title variant.
	"""
	index["title"] = index["title"][0].upper() + index["title"][1:]
	if "titleVariants" in index:
		variants = [v[0].upper() + v[1:] for v in index["titleVariants"]]
		index["titleVariants"] = variants

	return index


def update_text_title(old, new):
	"""
	Update all dependant documents when a text's primary title changes, inclduing:
		* titles on index documents (if not updated already)
		* titles of stored text versions
		* refs stored in links
		* refs stored in history
		* refs stores in notes
		* titles stored on text counts
		* titles in text summaries  - TODO
		* titles in top text counts
		* reset indices and parsed cache
	"""
	global indices, parsed
	indices = {}
	parsed = {}

	update_title_in_index(old, new)
	update_title_in_texts(old, new)
	update_title_in_links(old, new)
	update_title_in_notes(old, new)
	update_title_in_history(old, new)
	update_title_in_counts(old, new)


def update_title_in_index(old, new):
	i = db.index.find_one({"title": old})
	if i:
		i["title"] = new
		i["titleVariants"].remove(old)
		i["titleVariants"].append(new)
		db.index.save(i)


def update_title_in_texts(old, new):
	versions = db.texts.find({"title": old})
	for v in versions:
		v["title"] = new
		db.texts.save(v)


def update_title_in_links(old, new):
	"""
	Update all stored links to reflect text title change.
	"""
	pattern = r'^%s(?= \d)' % re.escape(old)
	links = db.links.find({"refs": {"$regex": pattern}})
	for l in links:
		l["refs"] = [re.sub(pattern, new, r) for r in l["refs"]]
		db.links.save(l)


def update_title_in_history(old, new):
	"""
	Update all history entries which reference 'old' to 'new'.
	"""
	pattern = r'^%s(?= \d)' % re.escape(old)
	text_hist = db.history.find({"ref": {"$regex": pattern}})
	for h in text_hist:
		h["ref"] = re.sub(pattern, new, h["ref"])
		db.history.save(h)

	index_hist = db.history.find({"title": old})
	for i in index_hist:
		i["title"] = new
		db.history.save(i)

	link_hist = db.history.find({"new": {"refs": {"$regex": pattern}}})
	for h in link_hist:
		h["new"]["refs"] = [re.sub(pattern, new, r) for r in h["new"]["refs"]]
		db.history.save(h)


def update_title_in_notes(old, new):
	"""
	Update all stored links to reflect text title change.
	"""
	pattern = r'^%s(?= \d)' % old
	notes = db.notes.find({"ref": {"$regex": pattern}})
	for n in notes:
		n["ref"] = re.sub(pattern, new, n["ref"])
		db.notes.save(n)


def update_title_in_counts(old, new):
	c = db.counts.find_one({"title": old})
	if c:
		c["title"] = new
		db.counts.save(c)


def rename_category(old, new):
	"""
	Walk through all index records, replacing every category instance
	called 'old' with 'new'.
	"""
	indices = db.index.find({"categories": old})
	for i in indices:
		i["categories"] = [new if cat == old else old for cat in i["categories"]]
		db.index.save(i)

	update_summaries()


def resize_text(title, new_structure, upsize_in_place=False):
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

	reset_texts_cache()
	update_counts(title)
	update_summaries_on_change(title)

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


def reset_texts_cache():
	"""
	Resets caches that only update when text index information changes.
	"""
	global indices, parsed, texts_titles_cache, texts_titles_json, toc_cache
	indices = {}
	parsed = {}
	toc_cache = None
	texts_titles_cache = None
	texts_titles_json = None
	delete_template_cache('texts_list')


def get_refs_in_text(text):
	"""
	Returns a list of valid refs found within text.
	"""
	titles = get_titles_in_text(text)
	reg = "\\b(?P<ref>"
	reg += "(" + "|".join([re.escape(title) for title in titles]) + ")"
	reg += " \d+([ab])?([ .:]\d+)?([ .:]\d+)?(-\d+([ab])?([ .:]\d+)?)?" + ")\\b"
	reg = re.compile(reg)
	matches = reg.findall(text)
	refs = [match[0] for match in matches]
	return refs


def get_titles_in_text(text):
	"""
	Returns a list of known text titles that occur within text.
	"""
	all_titles = get_text_titles()
	matched_titles = [title for title in all_titles if text.find(title) > -1]

	return matched_titles


def get_counts(ref):
	"""
	Look up a saved document of counts relating to the text ref.
	"""
	title = parse_ref(ref)
	if "error" in title:
		return title
	c = db.counts.find_one({"title": title["book"]})
	if not c:
		return {"error": "No counts found for %s" % ref}
	i = get_index(title["book"])
	if "error" in i:
		return i
	c.update(i)
	del c["_id"]
	return c


def get_text_titles(query={}):
	"""
	Return a list of all known text titles, including title variants and shorthands/maps.
	Optionally take a query to limit results.
	Cache the fill list which is used on every page (for nav autocomplete)
	"""
	global texts_titles_cache

	if query or not texts_titles_cache:
		titles = db.index.find(query).distinct("titleVariants")
		titles.extend(db.index.find(query).distinct("maps.from"))

		if query:
			return titles

		texts_titles_cache = titles

	return texts_titles_cache


def get_text_titles_json():
	"""
	Returns JSON of full texts list, keeps cached
	"""
	global texts_titles_json
	if not texts_titles_json:
		texts_titles_json = json.dumps(get_text_titles())

	return texts_titles_json


def get_text_categories():
	"""
	Reutrns a list of all known text categories.
	"""
	return db.index.find().distinct("categories")


def get_texts_summaries_for_category(category):
	"""
	Returns the list of texts records in the table of contents corresponding to "category".
	"""
	toc = get_toc()
	summary = []
	for cat in toc:
		if cat["category"] == category:
			if "category" in cat["contents"][0]:
				for cat2 in cat["contents"]:
					summary += cat2["contents"]
			else:
				summary += cat["contents"]

			return summary

	return []


def generate_refs_list(query={}):
	"""
	Generate a list of refs to all available sections.
	"""
	refs = []
	counts = db.counts.find(query)
	for c in counts:
		if "title" not in c:
			continue # this is a category count

		i = get_index(c["title"])
		if ("error" in i):
			# If there is not index record to match the count record,
			# the count should be removed.
			db.counts.remove(c)
			continue
		title = c["title"]
		he = list_from_counts(c["availableTexts"]["he"])
		en = list_from_counts(c["availableTexts"]["en"])
		sections = union(he, en)
		for n in sections:
			if i["categories"][0] == "Talmud":
				n = section_to_daf(int(n))
			if "commentaryCategories" in i and i["commentaryCategories"][0] == "Talmud":
				split = n.split(":")
				n = ":".join([section_to_daf(int(n[0]))] + split[1:])
			ref = "%s %s" % (title, n) if n else title
			refs.append(ref)

	return refs


def list_from_counts(count, pre=""):
	"""
	Recursive function to transform a count array (a jagged array counting
	how many versions of each text segment are availble) into a list of
	available sections numbers.

	A section is considered available if at least one of its segments is available.

	E.g., [[1,1],[0,1]]	-> [1,2]
	      [[0,0], [1,0]] -> [2]
		  [[[1,2], [0,1]], [[0,0], [1,0]]] -> [1:1, 1:2, 2:2]
	"""
	urls = []

	if not count:
		return urls

	elif isinstance(count[0], int):
		# The count we're looking at represents a section
		# List it in urls if it not all empty
		if not all(v == 0 for v in count):
			urls.append(pre)
			return urls

	for i, c in enumerate(count):
		if isinstance(c, list):
			p = "%s:%d" % (pre, i+1) if pre else str(i+1)
			urls += list_from_counts(c, pre=p)

	return urls


def get_commentary_texts_list():
	"""
	Returns a list of text titles that exist in the DB which are commentaries.
	"""
	commentators = db.index.find({"categories.0": "Commentary"}).distinct("title")
	commentaryRE = "^(%s) on " % "|".join(commentators)
	texts = db.texts.find({"title": {"$regex": commentaryRE}}).distinct("title")

	return texts


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

	except IndexError, TypeError:
		return ""

	return text


def union(a, b):
    """ return the union of two lists """
    return list(set(a) | set(b))
