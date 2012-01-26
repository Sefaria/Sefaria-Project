# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import pymongo
import re 
import copy
from config import *
from datetime import datetime
import simplejson as json

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
indices = {}
parsed = {}

def getIndex(book=None):
	"""
	Return index information about 'book', but not the text. 
	
	If 'book' is absent return the set of known book titles.
	"""
	res = indices.get(book)
	if res:
		return copy.deepcopy(res)
	
	if not book: 
		titles = db.index.distinct("titleVariants")
		titles.extend(db.index.distinct("maps.from"))
		return titles

	book = (book[0].upper() + book[1:]).replace("_", " ")
	i = db.index.find_one({"titleVariants": book})
	
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
		bookIndex = getIndex(match.group(2))
		i = {"title": match.group(1) + " on " + bookIndex["title"],
				 "categories": ["Commentary"]}
		i = dict(bookIndex.items() + i.items())
		i["sectionNames"].append("Comment")
		i["titleVariants"] = [i["title"]]
		i["commentaryBook"] = bookIndex["title"]
		indices[book] = copy.deepcopy(i)
		return i		
	
	return {"error": "Unknown book: '%s'." % book}


def list_depth(x):
	# returns 1 for [], 2 for [[]], etc.
	# special case: doesn't count a level unless all elements in
	# that level are lists, e.g. [[], ""] has a list depth of 1
	if len(x) > 0 and all(map(lambda y: isinstance(y, list), x)):
		return 1 + list_depth(x[0])
	else:
		return 1

def merge_translations(text):
	# This is a recursive function that merges the text in multiple
	# translations to fill any gaps and deliver as much text as
	# possible.
	depth = list_depth(text)
	if depth > 2:
		results = []
		for x in range(max(map(len, text))):
			translations = map(None, *text)[x]
			remove_nones = lambda x: x or []
			results.append(merge_translations(map(remove_nones, translations)))
		return results
	elif depth == 1:
		text = map(lambda x: [x], text)
	merged = map(None, *text)
	text = map(max, merged)
	return text


def textFromCur(ref, textCur, context):
	text = []
	for t in textCur:
		try:
			# these lines dive down into t until the
			# text is found
			result = t['chapter'][0]
			if len(ref['sections']) < len(ref['sectionNames']) or context == 0:
				sections = ref['sections'][1:]
			else:
				sections = ref['sections'][1:-1]
			for i in sections:
				result = result[int(i) - 1]
			text.append(result)
			ref["versionTitle"] = t.get("versionTitle") or ""
			ref["versionSource"] = t.get("versionSource") or ""
		except IndexError:
			# this happens when t doesn't have the text we're looking for
			pass
	if list_depth(text) == 1:
		while '' in text:
			text.remove('')
	if len(text) == 0:
		ref['text'] = []
	elif len(text) == 1:
		ref['text'] = text[0]
	elif len(text) > 1:
		# these two lines merge multiple lists into
		# one list that has the minimum number of gaps.
		# e.g. [["a", ""], ["", "b", "c"]] becomes ["a", "b", "c"]
		ref['text'] = merge_translations(text)
	return ref


def getText(ref, context=1, commentary=True):
	
	r = parseRef(ref)
	if "error" in r:
		return r
		
	skip = r["sections"][0] - 1
	limit = 1
	# search for the book - TODO: look for a stored default version
	textCur = db.texts.find({"title": r["book"], "language": "en"}, {"chapter": {"$slice": [skip, limit]}})
	r = textFromCur(r, textCur, context)
	
	# check for Hebrew - TODO: look for a stored default version
	heCur = db.texts.find({"title": r["book"], "language": "he"}, {"chapter": {"$slice": [skip,limit]}})
	heRef = textFromCur(copy.deepcopy(r), heCur, context)

	r["he"] = heRef.get("text") or []
	r["heVersionTitle"] = heRef.get("versionTitle") or ""
	r["heVersionSource"] = heRef.get("versionSource") or ""

	if commentary:
		searchRef = r["book"] + "." + ".".join("%s" % s for s in r["sections"][:len(r["sectionNames"])-1])
		links = getLinks(searchRef)
		r["commentary"] = links if "error" not in links else []
	
	if "shorthand" in r:
		r["book"] = r["shorthand"]
		d = r["shorthandDepth"]
		for key in ("sections", "toSections", "sectionNames"):
			r[key] = r[key][d:]		
			
	if r["type"] == "Talmud":
		daf = r["sections"][0] + 1
		r["sections"][0] = str(daf / 2) + "b" if (daf % 2) else str((daf+1) / 2) + "a"
		r["title"] = r["book"] + " " + r["sections"][0]
		if "toSections" in r: r["toSections"][0] = r["sections"][0]		
	
	elif r["type"] == "Commentary":
		d = len(r["sections"]) if len(r["sections"]) < 2 else 2
		r["title"] = r["book"] + " " + ":".join(["%s" % s for s in r["sections"][:d]])
	
	return r


def getLinks(ref):
	"""
	Return a list links and commentary tied to 'ref'.
	Retrieve texts for each link. 
	"""
	
	links = []
	reRef = normRef(ref)
	reRef = "^%s$|^%s\:" % (reRef, reRef)
	linksCur = db.links.find({"refs": {"$regex": reRef}})
	# For all links that mention ref (in any position)
	for link in linksCur:
		# find the position of "anchor", the one we're getting links for
		pos = 0 if re.match(reRef, link["refs"][0]) else 1 
		com = {}
		
		anchorRef = parseRef(link["refs"][pos])
		if "error" in anchorRef:
			links.append({"error": "Error parsing %s: %s" % (link["refs"][pos], anchorRef["error"])})
			continue
		
		
		linkRef = parseRef( link[ "refs" ][ ( pos + 1 ) % 2 ] )
		if "error" in linkRef:
			links.append({"error": "Error parsing %s: %s" % (link["refs"][(pos + 1) % 2], linkRef["error"])})
			continue
		
		com["category"] = linkRef["type"]
		com["type"] = link["type"]
		
		if com["category"] == "Commentary": # strip redundant verse ref for commentators 
			split = linkRef["book"].find(" on ")
			com["commentator"] = linkRef["book"][:split]
			com["category"] = com["commentator"]
		else:
			com["commentator"] = linkRef["book"]
		
		
		com["ref"] = linkRef["ref"]
		com["anchorRef"] = "%s %s" % (anchorRef["book"], ":".join("%s" % s for s in anchorRef["sections"][0:-1]))
		com["anchorVerse"] = anchorRef["sections"][-1]	 
		com["anchorText"] = link["anchorText"] if "anchorText" in link else ""
		
		text = getText(linkRef["ref"], context=0, commentary=False)
		com["text"] = text["text"] if text["text"] else ""
		com["he"] = text["he"] if text["he"] else ""
		
		links.append(com)		



	commentary = db.commentary.find({"ref": ref}).sort([["_id", -1]])
	for c in commentary:
		com = {}
		com["commentator"] = com["category"] = c["commentator"]
		com["anchorRef"] = c["ref"]
		com["id"] = c["id"]
		com["anchorVerse"] = c["refVerse"]
		com["source"] = ""
		if "source" in c: com["source"] = c["source"] 
		if "anchorText" in c: com["anchorText"] = c["anchorText"]
		com["text"] = c["text"]
		links.append(com)		
	return links


	
def parseRef(ref, pad=True):
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
	
	pRef = {"ref": ref}
	
	ref = ref.decode('utf-8').replace(u"–", "-").replace(":", ".").replace("_", " ")
	# capitalize first letter (don't title case all to avoid e.g., "Song Of Songs")	
	ref = ref[0].upper() + ref[1:]
	if ref in parsed and pad:
		return copy.deepcopy(parsed[ref])
	
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
				parsedRef = parseRef(ref)
				d = len(parseRef(to, pad=False)["sections"])
				parsedRef["shorthand"] = pRef["book"]
				parsedRef["shorthandDepth"] = d	
				parsed[ref] = copy.deepcopy(parsedRef)
				return parsedRef
	
	# Find index record or book
	index = getIndex(pRef["book"])
	
	if "error" in index:
		parsed[ref] = copy.deepcopy(index)
		return index
 	
	pRef["book"] = index["title"]
	pRef["type"] = index["categories"][0]
	del index["title"]
	pRef.update(index)
	
	if index["categories"][0] == "Talmud":
		result = subParseTalmud(pRef, index)
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

		
	# end of range (if any)
	if len(toSplit) > 1:
		cv = toSplit[1].split(".")
		delta = len(pRef["sections"]) - len(cv)
		for i in range(delta, len(pRef["sections"])):
			pRef["toSections"][i] = int(cv[i - delta]) 
	
		
	if "length" in index and len(pRef["sections"]):
		# give error if requested section is out of bounds
		if pRef["sections"][0] > index["length"]:
			result = {"error": "%s only has %d %ss." % (pRef["book"], index["length"], pRef["sectionNames"][0])}
			parsed[ref] = copy.deepcopy(result)
			return result
	
	trimmedSections = pRef["sections"][:len(pRef["sectionNames"]) - 1]

	if pRef["categories"][0] == "Commentary":
		text = getText("%s.%s" % (pRef["commentaryBook"], ".".join([str(s) for s in trimmedSections[:-1]])), False, 0)
		length = max(len(text["text"]), len(text["he"]))
		
	# add Next / Prev links - TODO goto next/prev book
	if not "length" in index or pRef["sections"][0] < index["length"]: #if this is not the last section
		next = trimmedSections[:]
		if pRef["categories"][0] == "Commentary" and next[-1] == length:
			next[-2] = next[-2] + 1
			next[-1] = 1
		else:	
			next[-1] = next[-1] + 1
		pRef["next"] = {"ref": "%s %s" % (pRef["book"], ".".join([str(s) for s in next]))}
	
	if False in [x==1 for x in trimmedSections]: #if this is not the first section
		prev = trimmedSections[:]
		if pRef["categories"][0] == "Commentary" and prev[-1] == 1:
			pSections = prev[:-1]
			pSections[-1] = pSections[-1] - 1 if pSections[-1] > 1 else 1
			prevText = getText("%s.%s" % (pRef["commentaryBook"], ".".join([str(s) for s in pSections])), False, 0)
			pLength = max(len(prevText["text"]), len(prevText["he"]))
			prev[-2] = prev[-2] - 1 if prev[-2] > 1 else 1
			prev[-1] = pLength
		else:
			prev[-1] = prev[-1] - 1 if prev[-1] > 1 else 1
		pRef["prev"] = {"ref": "%s %s" % (pRef["book"], ".".join([str(s) for s in prev]))}
	
	parsed[ref] = copy.deepcopy(pRef)
	return pRef
	

def subParseTalmud(pRef, index):
	toSplit = pRef["ref"].split("-")
	
	bcv = toSplit[0].replace(":", ".").split(".")
	
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
		
		if len(bcv) == 3:
			pRef["sections"].append(bcv[2])	
			pRef["toSections"].append(bcv[2])
	
	pRef["toSections"] = pRef["sections"][:]

	if len(toSplit)	== 2:
		pRef["toSections"] = toSplit[1].replace(r"[ :]", ".").split(".")
		if len(pRef["toSections"]) < 2:
			pRef["toSections"].insert(0, pRef["sections"][0])
	
	if pRef["sections"][0] < index["length"] * 2:
		nextDaf = (str(daf) + "b" if amud == "a" else str(daf+1) + "a")
		pRef["next"] = {"ref": "%s %s" % (pRef["book"], nextDaf)}
	
	if pRef["sections"][0] > 3:
		prevDaf = (str(daf-1) + "b" if amud == "a" else str(daf) + "a")
		pRef["prev"] = {"ref": "%s %s" % (pRef["book"], prevDaf)}
		
	return pRef


def normRef(ref):
	"""
	Normalize a ref. 
	"""
	
	pRef = parseRef(ref, pad=False)
	if "error" in pRef: return False
	
	nref = pRef["book"]
	nref += " " + ":".join([str(s) for s in pRef["sections"]])
	
	for i in range(len(pRef["sections"])):
		if not pRef["sections"][i] == pRef["toSections"][i]:
			nref += "-%s" % (":".join([str(s) for s in pRef["toSections"][i:]]))
			break
	
	return nref

def saveText(ref, text):
	"""
	Save a version of a text named by ref
	
	j is a dict which must include attributes to be stored on the version doc, as well as the text itself
	
	returns saved JSON on ok or error
	"""
	
	# Validate Args
	pRef = parseRef(ref)
	if "error" in pRef:
		return pRef
	
	chapter = pRef["sections"][0]
	verse = pRef["sections"][1] if len(pRef["sections"]) > 1 else None
	subVerse = pRef["sections"][2] if len(pRef["sections"]) > 2 else None
	
	if not validateText(text):
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
		
		db.texts.save(existing)
		
		if pRef["type"] == "Commentary":
			addCommentaryLinks(ref)

		
		del existing["_id"]
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
	
		del text["text"]
		db.texts.update({"title": pRef["book"], "versionTitle": text["versionTitle"], "language": text["language"]}, text, True, False)
		
		if pRef["type"] == "Commentary":
			addCommentaryLinks(ref)
		
		
		return text

	return {"error": "It didn't work."}

def validateText(text):
	"""
	validate a dictionary representing a text to be written to db.texts
	"""
	
	# Required Keys	
	for key in ("versionTitle", "language", "text"):
		if not key in text: 
			return False
	
	# TODO Check text structure matches ref
	
	return True

def saveLink(link):
	"""
	Save a new link to the DB. link should have: 
		- refs - array of connected refs
		- type 
		- anchorText - relative to the first? 
	"""
	
	link["refs"] = [normRef(link["refs"][0]), normRef(link["refs"][1])]
	db.links.update({"refs": link["refs"], "type": link["type"]}, link, True, False)
	return link


def addCommentaryLinks(ref):
	
	text = getText(ref, 0, 0)
	ref = ref.replace("_", " ")
	book = ref[ref.find(" on ")+4:]
	length = max(len(text["text"]), len(text["he"]))
	
	
	for i in range(length):
			link = {}
			link["refs"] = [book, ref + "." + str(i+1)]
			link["type"] = "commentary"
			link["anchorText"] = ""
			saveLink(link)



def saveIndex(index):
	"""
	Save an index record to the DB. 
	Index records contain metadata about texts, but not the text itself.
	"""
	
	existing = db.index.find_one({"title": index["title"]})
	
	if existing:
		index = dict(existing.items() + index.items())
	
	# need to save provisionally else normRef below will fail
	db.index.save(index)
	
	for i in range(len(index["maps"])):
		nref = normRef(index["maps"][i]["to"])
		if not nref:
			return {"error": "Couldn't understand text reference: '%s'." % index["maps"][i]["to"]}
		index["maps"][i]["to"] = nref
	
	# save with normilzed maps
	db.index.save(index)
	
	indices[index["title"]] = copy.deepcopy(index)
	parsed = {}
	
	del index["_id"]
	return index
	
	
def makeTOC():
	talmud = db.index.find({"categories.0": "Talmud"}).sort("order.0")
	
	html = ""
	seder = ""
	
	for m in talmud:
		if not m["categories"][1] == seder:
			html += "</div><div class='sederBox'><span class='seder'>%s:</span> " % m["categories"][1]
			seder = m["categories"][1]
		html += "<span class='refLink'>%s</span>, " % m["title"]
		
	html = html[6:-2] + "</div>"
	
	f = open("talmudBox.html", "w")
	f.write(html)
	f.close()
	

def indexAll():
	from indextank.client import ApiClient
	import pprint
	api = ApiClient('http://:Yl82EKYAwbJGl1@p9e3.api.indextank.com')

	index = api.get_index('texts')
	
	textsCur = db.texts.find()
	
	for text in textsCur:
		docs = []
		print "Adding %s" % text["title"] + " / " + text["versionTitle"] + " / " + text["language"]
		about = getIndex(text["title"])
		for chapter in range(len(text["chapter"])):
			doc = copy.deepcopy(text)
			doc["text"] = doc["title"] + " " + str(chapter+1) + "\n" + doc["versionTitle"] +"\n" +  segArrayToStr(text["chapter"][chapter])
			doc["chapter"] = chapter+1
			doc["ref"] = doc["title"].replace(" ", "_") + "." + str(chapter+1) # TODO Handle Talmud
			del doc["chapter"]
			del doc["_id"]
			if "revisionNum" in doc: del doc["revisionNum"]
			if "revisionDate" in doc: del doc["revisionDate"] 
			
			if not "error" in about:
				categories = {"type": about["categories"][0],
					"book": about["title"]}
				
				if len(about["categories"]) > 1: categories["type2"] = about["categories"][1]
				
				variables = {0: about["totalOrder"] + (float(chapter) / 1000)}
			
			docid = doc["ref"] + " / " + doc["versionTitle"] +" / " + doc["language"]
			docs.append({"docid": docid, "fields": doc, "categories": categories, "variables": variables})
		
		index.add_documents(docs)
		print "Ok."

def segArrayToStr(arr):
	string = ""
	for i in range(len(arr)):
		if type(arr[i]) == unicode: string += "  %s" % arr[i]
		elif type(arr[i]) == list: string += segArrayToStr(arr[i])
		else: return False
	return string