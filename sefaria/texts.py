# -*- coding: utf-8 -*-

import sys
import pymongo
from bson.objectid import ObjectId
import re 
import copy
from settings import *
from datetime import datetime
import simplejson as json
from pprint import pprint
import operator
from history import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

# Simple Caches for indices and parsed refs and table of contents
indices = {}
parsed = {}
toc = {}


def get_index(book):
	"""
	Return index information about 'book', but not the text. 
	"""
	
	# look for result in indices cache
	res = indices.get(book)
	if res:
		return copy.deepcopy(res)

	book = (book[0].upper() + book[1:]).replace("_", " ")
	i = db.index.find_one({"titleVariants": book})
	
	# Simple case: founnd an exact match index collection
	if i:
		del i["_id"]
		indices[book] = copy.deepcopy(i)
		return i
	
	# Try matching "Commentator on Text" e.g. "Rashi on Genesis"
	commentators = db.index.find({"categories.0": "Commentary"}).distinct("titleVariants")
	books = db.index.find({"categories.0": {"$ne": "Commentary"}}).distinct("titleVariants")

	commentatorsRe = "^(" + "|".join(commentators) + ") on (" + "|".join(books) +")$"
	match = re.match(commentatorsRe, book)
	if match:
		bookIndex = get_index(match.group(2))
		i = {"title": match.group(1) + " on " + bookIndex["title"],
				 "categories": ["Commentary"]}
		i = dict(bookIndex.items() + i.items())
		i["sectionNames"].append("Comment")
		i["titleVariants"] = [i["title"]]
		i["commentaryBook"] = bookIndex["title"]
		i["commentaryCategoires"] = bookIndex["categories"]
		i["commentator"] = match.group(1)
		indices[book] = copy.deepcopy(i)
		return i		
	
	# TODO handle giving a virtual index for shorthands (e.g, index info for Rambam, Laws of Prayer)	

	return {"error": "Unknown text: '%s'." % book}


def get_text_titles():
	"""
	Return a list of all known text titles, including title variants and shorthands/maps
	"""
	titles = db.index.distinct("titleVariants")
	titles.extend(db.index.distinct("maps.from"))
	return titles


def table_of_contents():
	"""
	Return a structured list of available texts including categories, ordering and text info
	"""

	if toc:
		return toc

	indexCur = db.index.find().sort([["order.0", 1]])
	for i in indexCur:
		cat = i["categories"][0] or "Other"
		depth = len(i["categories"])
	
		text = copy.deepcopy(i)
		del text["_id"]

		if depth < 2:
			if not cat in toc:
				toc[cat] = []
			if isinstance(toc[cat], list):
				toc[cat].append(text)
			else:
				toc[cat]["Other"].append(text)
		else:
			if not cat in toc:
				toc[cat] = {}
			elif isinstance(toc[cat], list):
				uncat = toc[cat]
				toc[cat] = {"Other": uncat}

			cat2 = i["categories"][1]

			if cat2 not in toc[cat]:
				toc[cat][cat2] = []
			toc[cat][cat2].append(text)

	return toc


def list_depth(x):
	"""
	returns 1 for [], 2 for [[]], etc.
	special case: doesn't count a level unless all elements in
	that level are lists, e.g. [[], ""] has a list depth of 1
	"""
	if len(x) > 0 and all(map(lambda y: isinstance(y, list), x)):
		return 1 + list_depth(x[0])
	else:
		return 1


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
		for x in range(max(map(len, text))):
			translations = map(None, *text)[x]
			remove_nones = lambda x: x or []
			results.append(merge_translations(map(remove_nones, translations), sources))
		return results
	elif depth == 1:
		text = map(lambda x: [x], text)
	merged = map(None, *text)
	text = []
	text_sources = []
	for verses in merged:
		max_index, max_value = max(enumerate(verses), key=operator.itemgetter(1))
		text.append(max_value)
		text_sources.append(sources[max_index])
	return [text, text_sources]


def text_from_cur(ref, textCur, context):
	"""
	Take a ref and DB cursor of texts and construcut a text to return out of what's available. 
	Merges text fragments when necessary so that the final version has maximum text.
	"""
	text = []
	sources = []
	for t in textCur:
		try:
			# these lines dive down into t until the text is found
			result = t['chapter'][0]
			# does this ref refer to a range of text
			is_range = ref["sections"] != ref["toSections"]
			if result == "" or result == []:
				continue
			if len(ref['sections']) < len(ref['sectionNames']) or context == 0 and not is_range:
				sections = ref['sections'][1:]
			else:
				# include surrounding text
				sections = ref['sections'][1:-1]
			for i in sections:
				result = result[int(i) - 1]
			if is_range and context == 0:
				start = ref["sections"][-1] - 1
				end = ref["toSections"][-1]
				result = result[start:end]
			text.append(result)
			sources.append(t.get("versionTitle") or "")
			ref["versionTitle"] = t.get("versionTitle") or ""
			ref["versionSource"] = t.get("versionSource") or ""
		except IndexError:
			# this happens when t doesn't have the text we're looking for
			pass
	if list_depth(text) == 1:
		while '' in text:
			text.remove('')
	if len(text) == 0:
		ref['text'] = "" if context == 0 else []
	elif len(text) == 1:
		ref['text'] = text[0]
	elif len(text) > 1:
		ref['text'], ref['sources'] = merge_translations(text, sources)
	return ref


def get_text(ref, context=1, commentary=True, version=None, lang=None):
	"""
	Take a string reference to a segment of text and return a dictionary including the text and other info.
	-- context: how many levels of depth above the requet ref should be returned. e.g., with context=1, ask for 
	a verse and receive it's surrounding chapter as well. context=0 gives just what is asked for.
	-- commentary: whether or not to search for and return connected texts as well.
	-- version+lang: use to specify a particular version of a text to return.
	"""
	r = parse_ref(ref)
	if "error" in r:
		return r

	skip = r["sections"][0] - 1 if len(r["sections"]) else 0
	limit = 1

	# Look for a specified version of this text
	if version and lang:
		textCur = db.texts.find({"title": r["book"], "language": lang, "versionTitle": version}, {"chapter": {"$slice": [skip, limit]}})
		r = text_from_cur(r, textCur, context)
		if r["text"] is None or len(r["text"]) == 0:
			return {"error": "No text found for %s (%s, %s)." % (ref, version, lang)}
		if lang == 'he':
			r['he'] = r['text'][:]
			r['text'] = []
			r['heVersionTitle'], r['heVersionSource'] = r['versionTitle'], r['versionSource']
		elif lang == 'en':
			r['he'] = []
	else:
		# check for Hebrew - TODO: look for a stored default version
		heCur = db.texts.find({"title": r["book"], "language": "he"}, {"chapter": {"$slice": [skip,limit]}})
		heRef = text_from_cur(copy.deepcopy(r), heCur, context)

		# search for the book - TODO: look for a stored default version
		textCur = db.texts.find({"title": r["book"], "language": "en"}, {"chapter": {"$slice": [skip, limit]}})
		r = text_from_cur(r, textCur, context)
		

		r["he"] = heRef.get("text") or []
		r["heVersionTitle"] = heRef.get("versionTitle") or ""
		r["heVersionSource"] = heRef.get("versionSource") or ""
		if "sources" in heRef:
			r["heSources"] = heRef.get("sources")


	# find commentary on this text if requested
	if commentary:
		if r["type"] == "Talmud":
			searchRef = r["book"] + " " + section_to_daf(r["sections"][0])
		elif r["type"] == "Commentary" and r["commentaryCategoires"][0] == "Talmud":
			searchRef = r["book"] + " " + section_to_daf(r["sections"][0])
			searchRef += (".%d" % r["sections"][1]) if len(r["sections"]) > 1 else ""
		else:
			sections = ".".join("%s" % s for s in r["sections"][:len(r["sectionNames"])-1])
			searchRef = r["book"] + "." + sections if len(sections) else "1"
		links = get_links(searchRef)
		r["commentary"] = links if "error" not in links else []

		# get list of available versions of this text
		# but only if you care enough to get commentary also (hack)
		r["versions"] = get_version_list(ref)

	
	# use short if present, masking higher level sections
	if "shorthand" in r:
		r["book"] = r["shorthand"]
		d = r["shorthandDepth"]
		for key in ("sections", "toSections", "sectionNames"):
			r[key] = r[key][d:]		
	
	# replace ints with daf strings (3->"2a") if text is Talmud or commentary on Talmud		
	if r["type"] == "Talmud" or r["type"] == "Commentary" and r["commentaryCategoires"][0] == "Talmud":
		daf = r["sections"][0] + 1
		r["sections"][0] = str(daf / 2) + "b" if (daf % 2) else str((daf+1) / 2) + "a"
		r["title"] = r["book"] + " " + r["sections"][0]
		if r["type"] == "Commentary" and len(r["sections"]) > 1:
			r["title"] = "%s Line %d" % (r["title"], r["sections"][1])
		if "toSections" in r: r["toSections"][0] = r["sections"][0]		
	
	elif r["type"] == "Commentary":
		d = len(r["sections"]) if len(r["sections"]) < 2 else 2
		r["title"] = r["book"] + " " + ":".join(["%s" % s for s in r["sections"][:d]])
	
	return r


def get_version_list(ref):
	"""
	Get a list of available text versions matching 'ref'
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


def get_links(ref):
	"""
	Return a list links and notes tied to 'ref'.
	Retrieve texts for each link. 

	TODO the structure of data sent back needs to be updated
	"""
	
	links = []
	nRef = norm_ref(ref)
	reRef = "^%s$|^%s\:" % (nRef, nRef)
	linksCur = db.links.find({"refs": {"$regex": reRef}})
	# For all links that mention ref (in any position)
	for link in linksCur:
		# find the position of "anchor", the one we're getting links for
		pos = 0 if re.match(reRef, link["refs"][0]) else 1 
		com = {}
		
		# Text we're asked to get links to
		anchorRef = parse_ref(link["refs"][pos])
		if "error" in anchorRef:
			links.append({"error": "Error parsing %s: %s" % (link["refs"][pos], anchorRef["error"])})
			continue
		
		# The link we found for anchorRef
		linkRef = parse_ref( link[ "refs" ][ ( pos + 1 ) % 2 ] )
		if "error" in linkRef:
			links.append({"error": "Error parsing %s: %s" % (link["refs"][(pos + 1) % 2], linkRef["error"])})
			continue
		
		com["_id"] = str(link["_id"])
		com["category"] = linkRef["type"]
		com["type"] = link["type"]
		
		if com["category"] == "Commentary": # strip redundant verse ref for commentators
			com["category"] = linkRef["commentator"]
			if nRef in linkRef["ref"]:
				com["commentator"] = linkRef["commentator"]
			else:
				com["commentator"] = linkRef["ref"]
		else:
			com["commentator"] = linkRef["book"]
		
		
		com["ref"] = linkRef["ref"]
		com["anchorRef"] = make_ref(anchorRef)
		com["sourceRef"] = make_ref(linkRef)
		com["anchorVerse"] = anchorRef["sections"][-1]	 
		com["commentaryNum"] = linkRef["sections"][-1] if linkRef["type"] == "Commentary" else 0
		com["anchorText"] = link["anchorText"] if "anchorText" in link else ""
		
		text = get_text(linkRef["ref"], context=0, commentary=False)
		com["text"] = text["text"] if text["text"] else ""
		com["he"] = text["he"] if text["he"] else ""
		
		links.append(com)		

	#Find
	notes = db.notes.find({"ref": {"$regex": reRef}})
	for note in notes:
		com = {}
		com["commentator"] = note["title"]
		com["category"] = "Notes"
		com["type"] = "note"
		com["_id"] = str(note["_id"])
		anchorRef = parse_ref(note["ref"])
		com["anchorRef"] = "%s %s" % (anchorRef["book"], ":".join("%s" % s for s in anchorRef["sections"][0:-1]))
		com["anchorVerse"] = anchorRef["sections"][-1]	 
		com["anchorText"] = note["anchorText"] if "anchorText" in note else ""
		com["text"] = note["text"]

		links.append(com)		

	return links

	
def parse_ref(ref, pad=True):
	"""
	Take a string reference (e.g. Job.2:3-3:1) and return a parsed dictionary of its fields
	
	If pad is True, ref sections will be padded with 1's until the sections are at least within one 
	level from the depth of the text. 
	
	Returns:
		* ref - the original string reference
		* book - a string name of the text
		* sectionNames - an array of strings naming the kinds of sections in this text (Chapter, Verse)
		* sections - an array of ints giving the requested sections numbers
		* toSections - an array of ints giving the requested sections at the end of a range
		* next, prev - an dictionary with the ref and labels for the next and previous sections
		* categories - an array of categories for this text
		* type - the highest level category for this text 
	"""
	
	ref = ref.decode('utf-8').replace(u"–", "-").replace(":", ".").replace("_", " ")
	# capitalize first letter (don't title case all to avoid e.g., "Song Of Songs")	
	ref = ref[0].upper() + ref[1:]

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
	bcv = base.split(".")
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
 	
	pRef["book"] = index["title"]
	pRef["type"] = index["categories"][0]
	del index["title"]
	pRef.update(index)
	
	if pRef["type"] == "Talmud" or pRef["type"] == "Commentary" and index["commentaryCategoires"][0] == "Talmud":
		pRef["bcv"] = bcv
		pRef["ref"] = ref
		result = subparse_talmud(pRef, index)
		result["ref"] = make_ref(pRef)
		parsed[ref] = copy.deepcopy(result)
		return result
	
	# Parse section numbers
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
	
	
	# give error if requested section is out of bounds	
	if "length" in index and len(pRef["sections"]):
		if pRef["sections"][0] > index["length"]:
			result = {"error": "%s only has %d %ss." % (pRef["book"], index["length"], pRef["sectionNames"][0])}
			parsed[ref] = copy.deepcopy(result)
			return result
	
	trimmedSections = pRef["sections"][:len(pRef["sectionNames"]) - 1]
	if (len(trimmedSections) == 0):
		trimmedSections = [1]

	if pRef["categories"][0] == "Commentary":
		text = get_text("%s.%s" % (pRef["commentaryBook"], ".".join([str(s) for s in trimmedSections[:-1]])), False, 0)
		length = max(len(text["text"]), len(text["he"]))
		
	# add Next / Prev links - TODO goto next/prev book
	if not "length" in index or trimmedSections[0] < index["length"]: #if this is not the last section
		next = trimmedSections[:]
		if pRef["categories"][0] == "Commentary" and next[-1] == length:
			next[-2] = next[-2] + 1
			next[-1] = 1
		else:	
			next[-1] = next[-1] + 1
		pRef["next"] = "%s %s" % (pRef["book"], ".".join([str(s) for s in next]))
	
	# Add previous link
	if False in [x==1 for x in trimmedSections]: #if this is not the first section
		prev = trimmedSections[:]
		if pRef["categories"][0] == "Commentary" and prev[-1] == 1:
			pSections = prev[:-1]
			pSections[-1] = pSections[-1] - 1 if pSections[-1] > 1 else 1
			prevText = get_text("%s.%s" % (pRef["commentaryBook"], ".".join([str(s) for s in pSections])), False, 0)
			pLength = max(len(prevText["text"]), len(prevText["he"]))
			prev[-2] = prev[-2] - 1 if prev[-2] > 1 else 1
			prev[-1] = pLength
		else:
			prev[-1] = prev[-1] - 1 if prev[-1] > 1 else 1
		pRef["prev"] = "%s %s" % (pRef["book"], ".".join([str(s) for s in prev]))
	
	pRef["ref"] = make_ref(pRef)
	if pad:
		parsed[ref] = copy.deepcopy(pRef)
	return pRef
	

def subparse_talmud(pRef, index):
	""" 
	Special sub method for parsing Talmud references, allowing for Daf numbering "2a", "2b", "3a" etc

	This function returns the first section as an int which correponds to how the text is stored in the db, 
	e.g. 2a = 3, 2b = 4, 3a = 5. 

	get_text will transform these ints back into daf strings before returning to the client. 
	"""

	toSplit = pRef["ref"].split("-")
	
	bcv = pRef["bcv"]
	del pRef["bcv"]

	pRef["sections"] = []
	if len(bcv) == 1:
		daf = 2
		amud = "a"
		pRef["sections"].append(3)
	else:
		daf = bcv[1]
		if not re.match("\d+[ab]", daf):
			pRef["error"] = "Couldn't understand Talmud Daf reference: %s" % daf
			return pRef
		amud = daf[-1]
		daf = int(daf[:-1])
		
		if daf > index["length"]:
			pRef["error"] = "%s only has %d dafs." % (pRef["book"], index["length"])
			return pRef
		
		chapter = daf * 2
		if amud == "a": chapter -= 1
		
		pRef["sections"] = [chapter]
		pRef["toSections"] = [chapter]
		
		# line numbers or lines numbers and comment numbers specified 
		if len(bcv) > 2:
			pRef["sections"].extend(map(int, bcv[2:]))
			pRef["toSections"].extend(map(int, bcv[2:]))
	
	pRef["toSections"] = pRef["sections"][:]

	# if a range is specified
	if len(toSplit)	== 2:
		pRef["toSections"] = [int(s) for s in toSplit[1].replace(r"[ :]", ".").split(".")]
		if len(pRef["toSections"]) < 2:
			pRef["toSections"].insert(0, pRef["sections"][0])
	
	# Set next daf, or next line for commentary on daf
	if pRef["sections"][0] < index["length"] * 2: # 2 because talmud length count dafs not amuds
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


def daf_to_section(daf):
	amud = daf[-1]
	daf = int(daf[:-1])
	section = daf * 2
	if amud == "a": section -= 1
	return section


def section_to_daf(section):
	section += 1
	daf = section / 2
	if section > daf * 2:
		daf = "%db" % daf
	else:
		daf = "%da" % daf
	return daf


def norm_ref(ref):
	"""
	Take a string ref and return a normalized string ref. 
	"""
	
	pRef = parse_ref(ref, pad=False)
	if "error" in pRef: return False
	return make_ref(pRef)


def make_ref(pRef):
	"""
	Take a parsed ref dictionary a return a string which is the normal form of that ref
	"""

	if pRef["type"] == "Talmud" or pRef["type"] == "Commentary" and pRef["commentaryCategoires"][0] == "Talmud":
		nref = pRef["book"] 
		nref += " " + section_to_daf(pRef["sections"][0]) if len(pRef["sections"]) > 0 else ""
		nref += ":" + ":".join([str(s) for s in pRef["sections"][1:]]) if len(pRef["sections"]) > 1 else ""
	else:
		nref = pRef["book"]
		sections = ":".join([str(s) for s in pRef["sections"]])
		if len(sections):
			nref += " " + sections
		
	for i in range(len(pRef["sections"])):
		if not pRef["sections"][i] == pRef["toSections"][i]:
			nref += "-%s" % (":".join([str(s) for s in pRef["toSections"][i:]]))
			break
	
	return nref


def url_ref(ref):
	"""
	Take a string ref and return it in a form suitable for URLs, eg. "Mishna_Berakhot.3.5"
	"""
	pref = parse_ref(ref, pad=False)
	ref = norm_ref(ref)
	if not ref:
		return False
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


def save_text(ref, text, user, **kwargs):
	"""
	Save a version of a text named by ref
	
	text is a dict which must include attributes to be stored on the version doc, as well as the text itself
	
	returns saved JSON on ok or error
	"""
	
	# Validate Args
	pRef = parse_ref(ref)
	if "error" in pRef:
		return pRef
	
	chapter = pRef["sections"][0]
	verse = pRef["sections"][1] if len(pRef["sections"]) > 1 else None
	subVerse = pRef["sections"][2] if len(pRef["sections"]) > 2 else None
	
	if not validate_text(text):
		return {"error": "Text didn't pass validation."}	 

	# Check if we already have this	text
	existing = db.texts.find_one({"title": pRef["book"], "versionTitle": text["versionTitle"], "language": text["language"]})
	
	if existing:
		# Have this (book / version / language)
		# pad existing version if it has fewer chapters
		if len(existing["chapter"]) < chapter:
			for i in range(len(existing["chapter"]), chapter):
				existing["chapter"].append([])
	
		# Save at depth 2 (e.g. verse: Genesis 4.5, Mishan Avot 2.4, array of comentary eg. Rashi on Genesis 1.3)
		if len(pRef["sections"]) == 2:
			if isinstance(existing["chapter"][chapter-1], unicode):
				existing["chapter"][chapter-1] = [existing["chapter"][chapter-1]]
			for i in range(len(existing["chapter"][chapter-1]), verse):
				existing["chapter"][chapter-1].append("")
			existing["chapter"][chapter-1][verse-1] = text["text"]		
		
		# Save at depth 3 (e.g., a single Rashi Commentary: Rashi on Genesis 1.3.2) 
		elif len(pRef["sections"]) == 3:
		
			# if chapter is a str, make it an array
			if isinstance(existing["chapter"][chapter-1], str):
				existing["chapter"][chapter-1] = [existing["chapter"][chapter-1]]
			# pad chapters with empty arrays if needed
			for i in range(len(existing["chapter"][chapter-1]), verse):
				existing["chapter"][chapter-1].append([])
		
			# if verse is a str, make it an array
			if isinstance(existing["chapter"][chapter-1][verse-1], unicode):
				existing["chapter"][chapter-1][verse-1] = [existing["chapter"][chapter-1][verse-1]]
			# pad verse with empty arrays if needed
			for i in range(len(existing["chapter"][chapter-1][verse-1]), subVerse):
				existing["chapter"][chapter-1][verse-1].append([])
			
			existing["chapter"][chapter-1][verse-1][subVerse-1] = text["text"]
		
		# Save as is (e.g, a whole chapter posted to Genesis.4)
		else:
			existing["chapter"][chapter-1] = text["text"]

		record_text_change(ref, text["versionTitle"], text["language"], text["text"], user, **kwargs)
		db.texts.save(existing)
		
		if pRef["type"] == "Commentary":
			add_commentary_links(ref, user)
		
		add_links_from_text(ref, text, user)	

		del existing["_id"]
		if 'revisionDate' in existing:
			del existing['revisionDate']
		return existing
	
	# New (book / version / language)
	else:
		text["title"] = pRef["book"]
		
		# add placeholders for preceding chapters
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
		
		# Save as is (e.g, a whole chapter posted to Genesis.4)
		else:	
			text["chapter"][chapter-1] = text["text"]
	
		record_text_change(ref, text["versionTitle"], text["language"], text["text"], user, **kwargs)
		add_links_from_text(ref, text, user)	

		del text["text"]
		db.texts.update({"title": pRef["book"], "versionTitle": text["versionTitle"], "language": text["language"]}, text, True, False)
		
		if pRef["type"] == "Commentary":
			add_commentary_links(ref, user)
		
		return text

	return {"error": "It didn't work."}


def validate_text(text):
	"""
	validate a dictionary representing a text to be written to db.texts
	"""
	
	# Required Keys	
	for key in ("versionTitle", "language", "text"):
		if not key in text: 
			return False
	
	# TODO Check text structure matches ref
	
	return True


def save_link(link, user):
	"""
	Save a new link to the DB. link should have: 
		- refs - array of connected refs
		- type 
		- anchorText - relative to the first? 
	"""

	link["refs"] = [norm_ref(link["refs"][0]), norm_ref(link["refs"][1])]
	if "_id" in link:
		objId = ObjectId(link["_id"])
		link["_id"] = objId
	else:
		# Don't bother saving a connection that already exists (updates should occur with an _id)
		existing = db.links.find_one({"refs": link["refs"], "type": link["type"]})
		if existing:
			return existing
		objId = None
	
	db.links.save(link)
	record_obj_change("link", {"_id": objId}, link, user)

	return link


def save_note(note, user):
	
	note["ref"] = norm_ref(note["ref"])
	if "_id" in note:
		note["_id"] = objId = ObjectId(note["_id"])
	else:
		objId = None
	if "owner" not in note:
		note["owner"] = user

	record_obj_change("note", {"_id": objId}, note, user)
	db.notes.save(note)
	
	note["_id"] = str(note["_id"])
	return note	


def delete_link(id, user):
	record_obj_change("link", {"_id": ObjectId(id)}, None, user)
	db.links.remove({"_id": ObjectId(id)})
	return {"response": "ok"}


def delete_note(id, user):
	record_obj_change("note", {"_id": ObjectId(id)}, None, user)
	db.notes.remove({"_id": ObjectId(id)})
	return {"response": "ok"}


def add_commentary_links(ref, user):
	"""
	When a commentary text is saved, automatically add links for each comment in the text.
	E.g., a user enters the text for Sforno on Kohelet 3:2, automatically set links for 
	Kohelet 3:2 <-> Sforno on Kohelet 3:2:1, Kohelet 3:2 <-> Sforno on Kohelete 3:2:2 etc 
	"""
	text = get_text(ref, 0, 0)
	ref = ref.replace("_", " ")
	book = ref[ref.find(" on ")+4:]
	length = max(len(text["text"]), len(text["he"]))
	for i in range(length):
			link = {}
			link["refs"] = [book, ref + "." + str(i+1)]
			link["type"] = "commentary"
			link["anchorText"] = ""
			save_link(link, user)


def add_links_from_text(ref, text, user):
	"""
	Scan a text for explicit references to other texts and automatically add new links between
	the ref and the mentioned text.

	text["text"] may be a list of segments, or an individual segment or None.

	"""
	if not text:
		return
	elif isinstance(text["text"], list):
		for i in range(len(text["text"])):
			subtext = copy.deepcopy(text)
			subtext["text"] = text["text"][i]
			add_links_from_text("%s:%d" % (ref, i+1), subtext, user)
	elif isinstance(text["text"], basestring):
		r = get_ref_regex()
		matches = r.findall(text["text"])
		for i in range(len(matches)):
			link = {"refs": [ref, matches[i][0]], "type": ""}
			save_link(link, user)


def save_index(index, user):
	"""
	Save an index record to the DB. 
	Index records contain metadata about texts, but not the text itself.
	"""
	
	index = norm_index(index)

	existing = db.index.find_one({"title": index["title"]})
	
	if existing:
		index = dict(existing.items() + index.items())

	record_obj_change("index", {"title": index["title"]}, index, user)
	# need to save provisionally else norm_ref below will fail
	db.index.save(index)
	# normalize all maps' "to" value 
	for i in range(len(index["maps"])):
		nref = norm_ref(index["maps"][i]["to"])
		if not nref:
			return {"error": "Couldn't understand text reference: '%s'." % index["maps"][i]["to"]}
		index["maps"][i]["to"] = nref
	# save with normilzed maps
	db.index.save(index)
	del index["_id"]

	indices[index["title"]] = copy.deepcopy(index)
	parsed = {}
	toc = {}
	# regenerate table of contents
	table_of_contents()

	return index


def norm_index(index):
	"""
	Normalize an index dictionary. 
	Uppercases the first letter of title and each title variant.
	"""

	index["title"] = index["title"][0].upper() + index["title"][1:]
	variants = [v[0].upper() + v[1:] for v in index["titleVariants"]]
	index["titleVariants"] = variants

	return index


def get_ref_regex():
	"""
	Create a regex to match any ref, based on known text title and title variants.
	"""
	titles = get_text_titles()
	reg = "(?P<ref>"
	reg += "(" + "|".join(titles) + ")"
	reg = reg.replace(".", "\.")
	reg += " \d+([ab])?([ .:]\d+)?([ .:]\d+)?(-\d+([ab])?([ .:]\d+)?)?" + ")"
	return re.compile(reg)













