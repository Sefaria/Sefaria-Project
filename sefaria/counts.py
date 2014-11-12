# -*- coding: utf-8 -*-

"""
counts.py - functions for counting and the number of available segments and versions of a text.

Writes to MongoDB Collection: counts

Counts documents exist for each text as well as each category of texts. Documents for 
texts are keyed by the 'title' field, documents for categories are keyed by the 'categories'
field, which is an array of strings.
"""

from collections import defaultdict
from pprint import pprint
from sefaria.system.cache import delete_template_cache
from sefaria.utils.talmud import section_to_daf

import texts
import summaries
import sefaria.model as model
from sefaria.utils.util import * # This was for delete_template_cache.  Is used for anything else?
from sefaria.system.database import db
from sefaria.system.exceptions import InputError


def count_texts(tref, lang=None):
	"""
	Count available versions of a text in the db, segment by segment.
	"""
	counts = []

	oref = model.Ref(tref)
	depth = oref.index.textDepth

	query = {"title": oref.book}

	if lang:
		query["language"] = lang

	all_texts = db.texts.find(query)
	for text in all_texts:
		# TODO Look at the sections requested in ref, not just total book
		this_count = count_array(text["chapter"])
		counts = sum_count_arrays(counts, this_count)

	result = {"counts": counts, "lengths": [], "sectionNames": oref.index.sectionNames}
	#result = dict(result.items() + pref.items()

	for d in range(depth):
		result["lengths"].append(sum_counts(counts, d))

	return result


def update_counts(ref=None):
	"""
	Update the count records of all texts or the text specfied
	by ref (currently at book level only) by peforming a count
	"""
	if ref:
		update_text_count(ref)
		return

	indices = model.IndexSet()

	for index in indices:
		if index.is_commentary():
			cRef = "^{} on ".format(index.title)
			texts = model.VersionSet({"title": {"$regex": cRef}}).distinct("title")
			for text in texts:
				update_text_count(text)
		else:
			update_text_count(index.title)

	summaries.update_summaries()


def update_text_count(book_title):
	"""
	Update the count records of the text specfied
	by ref (currently at book level only) by peforming a count
	"""
	index = model.get_index(book_title)

	c = { "title": book_title }
	existing = db.counts.find_one(c)
	if existing:
		c = existing

	en = count_texts(book_title, lang="en")
	if "error" in en:  # Still valid?
		return en
	he = count_texts(book_title, lang="he")
	if "error" in he:  # Still valid?
		return he
	c["allVersionCounts"] = sum_count_arrays(en["counts"], he["counts"])

	# totals is a zero filled JA representing to shape of total available texts
	# sum with each language to ensure counts have a 0 anywhere where they
	# are missing a segment
	totals  = zero_jagged_array(c["allVersionCounts"])
	enCount = sum_count_arrays(en["counts"], totals)
	heCount = sum_count_arrays(he["counts"], totals)

	c["availableTexts"] = {
		"en": enCount,
		"he": heCount,
	}

	c["availableCounts"] = {
		"en": en["lengths"],
		"he": he["lengths"],
	}

	if getattr(index, "length", None) and getattr(index, "lengths", None):
		depth = len(index.lengths)
		heTotal = enTotal = total = 0
		for i in range(depth):
			heTotal += he["lengths"][i]
			enTotal += en["lengths"][i]
			total += index.lengths[i]
		if total == 0:
			hp = ep = 0
		else:
			hp = heTotal / float(total) * 100
			ep = enTotal / float(total) * 100

			#temp check to see if text has wrong metadata leading to incorrect (to high) percentage
			"""if hp > 100:
				print index.title, " in hebrew has stats out of order: ", heTotal, "/", total, "=", hp
			if ep > 100:
				print index.title, " in english has stats out of order: ", enTotal, "/", total, "=", ep"""

	elif getattr(index, "length", None):
		hp = c["availableCounts"]["he"][0] / float(index.length) * 100
		ep = c["availableCounts"]["en"][0] / float(index.length) * 100
	else:
		hp = ep = 0


	c["percentAvailable"] = {
		"he": hp,
		"en": ep,
	}
	c["textComplete"] = {
		"he": hp > 99.9,
		"en": ep > 99.9,
	}

	#function to estimate how much of a text we have
	c['estimatedCompleteness'] = {
		"he" : estimate_completeness('he', index, c),
		"en" : estimate_completeness('en', index, c)
	}

	db.counts.save(c)
	return c


def estimate_completeness(lang, index, count):
	"""
	Calculates an estimate of complete the text is, given whatever information exists.
	TODO: this function is still a work in progress.
	:param lang: language to compute
	:param index: the text index object
	:param count: the text counts oject
	:return: a struct with various variables estimating the completness of the text
	"""
	result = {}
	#TODO: it's problematic to calculate the commentaries this way,
	#as they might by default have many empty elements.
	result['estimatedPercent']        = calc_text_structure_completeness(index.textDepth,count['availableTexts'][lang])
	result['availableSegmentCount']   = count["availableCounts"][lang][-1]
	result['percentAvailableInvalid'] = count['percentAvailable'][lang] > 100 or not (getattr(index, "length", None) and getattr(index, "lengths", None))
	result['percentAvailable']        = count['percentAvailable'][lang]

	result['isSparse'] = text_sparseness_level(result, index, count, lang)
	return result


def text_sparseness_level(stat_obj, index, count, lang):
	"""
	Returns a rating integer (from 1-4) of how sparse the text is. 1 being most sparse and 4 considered basically ok.
	:param stat_obj: completeness estimate object
	:param index: the text index object
	:param count: the text counts oject
	:param lang: language to compute

	:return: how sparse the text is, from 1 (vry) to 4 (almost complete or complete)
	"""
	#if we have an absolute percentage from metadata info on the text, use that.
	if stat_obj['percentAvailableInvalid']:
		percentCalc = stat_obj['estimatedPercent']
	else:
		percentCalc = stat_obj['percentAvailable']

	lang_flag = "%sComplete" % lang
	if "flags" in count and count["flags"].get(lang_flag, False): # if manually marked as complete, consider it complete
		is_sparse = 4
	#if it's a commentary, it might have many empty places, so just consider bulk amount of text
	elif index.categories[0] == "Commentary" and stat_obj["availableSegmentCount"] >= 300:
		is_sparse = 2
	#if it's basic count is under a given constant (e.g. 25) consider sparse. This will casue issues with some small texts
	#that the manual flags will fix
	elif stat_obj["availableSegmentCount"] <= 25:
		is_sparse = 1

	elif percentCalc <= 15:
		is_sparse = 1
	elif 15 < percentCalc <= 50:
		is_sparse = 2
	elif 50 < percentCalc <= 90:
		is_sparse = 3
	else:
		is_sparse = 4

	return is_sparse


def update_links_count(text=None):
	"""
	Counts the links that point to a particular text, or all of them

	Results are stored them on the 'linksCount' field of the counts document
	"""
	if not text:
		counts = db.counts.find({"title": {"$exists": 1}})
		for c in counts:
			if c["title"]:
				update_links_count(text=c["title"])

	print "%s" % text
	index = model.get_index(text)   #This is likely here just to catch any exceptions that are thrown

	c = { "title": text }
	c = db.counts.find_one(c)

	c["linksCount"] = model.LinkSet(model.Ref(text)).count()
		#db.links.find({"refs": {"$regex": model.Ref(text).regex()}}).count()

	db.counts.save(c)


def count_category(cat, lang=None):
	"""
	Count the number of sections of various types in an entire category and calculate percentages
	Depends on text counts already being saved in counts collection
	"""
	if not lang:
		# If no language specified, return a dict with English and Hebrew,
		# grouping hebrew and english fields
		cat = [cat] if isinstance(cat, basestring) else cat
		en = count_category(cat, "en")
		he = count_category(cat, "he")
		counts = {
			"percentAvailable": {
				"he": he["percentAvailable"],
				"en": en["percentAvailable"]
				},
			"availableCounts": {
				"he": he["availableCounts"],
				"en": en["availableCounts"]
				}
		}
		counts["textComplete"] = {
			"he": he["percentAvailable"] > 99.5,
			"en": en["percentAvailable"] > 99.5,
		}

		# Save to the DB
		remove_doc = {"$and": [{'categories.0': cat[0]}, {"categories": {"$all": cat}}, {"categories": {"$size": len(cat)}} ]}
		db.counts.remove(remove_doc)
		counts_doc = {"categories": cat}
		counts_doc.update(counts)
		db.counts.save(counts_doc)

		return counts

	# Count this cateogry
	counts = defaultdict(int)
	percent = 0.0
	percentCount = 0
	cat = [cat] if isinstance(cat, basestring) else cat
	indxs = model.IndexSet({"$and": [{'categories.0': cat[0]}, {"categories": {"$all": cat}}]})
	for indx in indxs:
		counts["Text"] += 1
		text_count = model.Count().load({ "title": indx.title })
		if not text_count or not hasattr(text_count, "availableCounts") or not hasattr(indx, "sectionNames"):
			continue

		c = text_count.availableCounts[lang]
		for i in range(len(indx.sectionNames)):
			if len(c) > i:
				counts[indx.sectionNames[i]] += c[i]

		if hasattr(text_count, "percentAvailable") and isinstance(percent, float):
			percentCount += 1
			percent += text_count.percentAvailable[lang] if isinstance(text_count.percentAvailable[lang], float) else 0.0
		else:
			percent = "unknown"

	percentCount = 1 if percentCount == 0 else percentCount
	percent = percent / percentCount if isinstance(percent, float) else "unknown"

	if "Daf" in counts:
		counts["Amud"] = counts["Daf"]
		counts["Daf"] = counts["Daf"] / 2

	return { "availableCounts": dict(counts), "percentAvailable": percent }


def get_category_count(categories):
	"""
	Returns the counts doc stored in the matching category list 'categories'
	"""
	# This ugly query is an approximation for the extact array in order
	# WARNING: This query get confused is we ever have two lists of categories which have
	# the same length, elements, and first element, but different order. (e.g ["a", "b", "c"] and ["a", "c", "b"])
	doc = db.counts.find_one({"$and": [{'categories.0': categories[0]}, {"categories": {"$all": categories}}, {"categories": {"$size": len(categories)}} ]})
	if doc:
		del doc["_id"]

	return doc


def update_category_counts():
	"""
	Recounts all category docs and saves to the DB.
	"""
	categories = set()
	indices = db.index.find()
	for index in indices:
		for i in range(len(index["categories"])):
			# perform a count for each sublist. E.g, for ["Talmud", "Bavli", "Seder Zeraim"]
			# also count ["Talmud"] and ["Talmud", "Bavli"]
			categories.add(tuple(index["categories"][0:i+1]))

	categories = [list(cats) for cats in categories]
	for cats in categories:
		count_category(cats)


def count_array(text):
	"""
	Returns a jagged array which corresponds in shape to 'text' that counts whether or not
	text is present in each position - 1 for text present, 0 for empty.
	"""
	if isinstance(text, list):
		return [count_array(t) for t in text]
	else:
		return 0 if not text else 1


def calc_text_structure_completeness(text_depth, structure):
	"""
	This function calculates the percentage of how full an array is compared to it's structre
	i.e how many elements are not null or zero
	:param text_depth: the depth of the array
	:param structure: a counts structure from count_texts()
	:return: a precentage of the array fullness
	"""
	result = {'full': 0, 'total':0}
	rec_calc_text_structure_completeness(text_depth,structure, result)
	return float(result['full']) / result['total'] * 100


def rec_calc_text_structure_completeness(depth, text, result):
	"""
	Recursive sub-utility function of the above function. Carries out the actual calculation recursively.
	:param depth: the depth of the current structure
	:param text: the structure to count
	:param result: the result obj to update
	:return: the result obj
	"""
	if isinstance(text, list):
		#empty array
		if not text:
			#an empty array element may represent a lot of missing text
			#TODO: maybe find a better estimate (average of text lengths at a certain depth?)
			result['total'] += 3**depth
		else:
			for t in text:
				rec_calc_text_structure_completeness(depth-1, t, result)
	else:
		result['total'] += 1
		if text is not None and text != "" and text > 0:
			result['full'] += 1


def sum_count_arrays(a, b):
	"""
	Returns a multi-dimensional array which sums each position of
	two multidimensional arrays of ints. Missing elements are given 0 value.
	[[1, 2], [3, 4]] + [[2,3], [4]] = [[3, 5], [7, 4]]
	"""
	# Treat None as 0
	if a is None:
		return sum_count_arrays(0, b)
	if b is None:
		return sum_count_arrays(a, 0)

	# If one value is an int while the other is a list,
	# Treat the int as an empty list.
	# Needed e.g, when a whole chapter is missing appears as 0
	if isinstance(a, int) and isinstance(b, list):
		return sum_count_arrays([],b)
	if isinstance(b, int) and isinstance(a, list):
		return sum_count_arrays(a,[])

	# If both are ints, return the sum
	if isinstance(a, int) and isinstance(b, int):
		return a + b
	# If both are lists, recur on each pair of values
	# map results in None value when element not present
	if isinstance(a, list) and isinstance(b, list):
		return [sum_count_arrays(a2, b2) for a2, b2 in map(None, a, b)]

	return "sum_count_arrays reached a condition it shouldn't have reached"


def sum_counts(counts, depth):
	"""
	Sum the counts of a text at given depth to get the total number of a given kind of section
	E.g, for counts on all of Job, depth 0 counts chapters, depth 1 counts verses
	"""
	if depth == 0:
		if isinstance(counts, int):
			# if we're looking at a
			return min(counts, 1)
		else:
			sum = 0
			for i in range(len(counts)):
				sum += min(sum_counts(counts[i], 0), 1)
			return sum
	else:
		sum = 0
		for i in range(len(counts)):
			sum += sum_counts(counts[i], depth-1)
		return sum


def zero_jagged_array(array):
	"""
	Returns a jagged array of identical shape to 'array'
	with all elements replaced by 0.
	"""
	if isinstance(array, list):
		return [zero_jagged_array(a) for a in array]
	else:
		return 0


def get_percent_available(text, lang="en"):
	"""
	Returns the percentage of 'text' available in 'lang',
	where text is a text title, text category or list of categories.
	"""
	c = get_counts_doc(text)

	if c and lang in c["percentAvailable"]:
		return c["percentAvailable"][lang]
	else:
		return 0


def get_available_counts(text, lang="en"):
	"""
	Returns the available counts dictionary of 'text' in 'lang',
	where text is a text title, text category or list of categories.

	The avalable counts dictionary counts the number of sections availble in
	a text, keyed by the various section names which apply to it.
	"""
	c = get_counts_doc(text)
	if not c:
		return None

	if "title" in c:
		# count docs for individual texts have different shape
		i = db.index.find_one({"title": c["title"]})
		c["availableCounts"] = make_available_counts_dict(i, c)

	if c and lang in c["availableCounts"]:
		return c["availableCounts"][lang]
	else:
		return None

link_counts = {}
def get_link_counts(cat1, cat2):
	global link_counts
	key = cat1 + "-" + cat2
	if link_counts.get(key):
		return link_counts[key]

	queries = []
	for c in [cat1, cat2]:
		if c == "Tanach" or c == "Torah" or c == "Prophets" or c == "Writings":
			queries.append({"$and": [{"categories": c}, {"categories": {"$ne": "Commentary"}}, {"categories": {"$ne": "Targum"}}]})
		else:
			queries.append({"categories": c})

	titles = []
	for q in queries:
		ts = db.index.find(q).distinct("title")
		if len(ts) == 0:
			return {"error": "No results for {}".format(q)}
		titles.append(ts)

	result = []
	for title1 in titles[0]:
		for title2 in titles[1]:
			re1 = r"^{} \d".format(title1)
			re2 = r"^{} \d".format(title2)
			links = model.LinkSet({"$and": [{"refs": {"$regex": re1}}, {"refs": {"$regex": re2}}]})  # db.links.find({"$and": [{"refs": {"$regex": re1}}, {"refs": {"$regex": re2}}]})
			if links.count():
				result.append({"book1": title1.replace(" ","-"), "book2": title2.replace(" ", "-"), "count": links.count()})

	link_counts[key] = result
	return result


def get_counts_doc(text):
	"""
	Returns the stored count doc for 'text',
	where text is a text title, text category or list of categories.
	"""
	if isinstance(text, list):
		# text is a list of categories
		return get_category_count(text)

	categories = model.library.get_text_categories()
	if text in categories:
		# text is a single category name
		return get_category_count([text])

	# Treat 'text' as a text title
	query = {"title": text}
	c = db.counts.find_one(query)
	return c


def set_counts_flag(title, flag, val):
	"""
	Set a flag on the counts doc for title.
	"""
	flag = "flags.%s" % flag
	db.counts.update({"title": title}, {"$set": {flag: val}})
	delete_template_cache("texts_dashboard")


def make_available_counts_dict(index, count):
	"""
	For index and count doc for a text, return a dictionary
	which zips together section names and available counts.
	Special case Talmud.
	"""
	counts = {"en": {}, "he": {} }
	if count and "sectionNames" in index and "availableCounts" in count:
		for num, name in enumerate(index["sectionNames"]):
			if "Talmud" in index["categories"] and name == "Daf":
				counts["he"]["Amud"] = count["availableCounts"]["he"][num]
				counts["he"]["Daf"]  = counts["he"]["Amud"] / 2
				counts["en"]["Amud"] = count["availableCounts"]["en"][num]
				counts["en"]["Daf"]  = counts["en"]["Amud"] / 2
			else:
				counts["he"][name] = count["availableCounts"]["he"][num]
				counts["en"][name] = count["availableCounts"]["en"][num]

	return counts


def get_untranslated_count_by_unit(text, unit):
	"""
	Returns the (approximate) number of untranslated units of text,
	where text is a text title, text category or list of categories,
	and unit is a section name to count.

	Counts are approximate because they do not adjust for an English section
	that may have no corresponding Hebrew.
	"""
	he = get_available_counts(text, lang="he")
	en = get_available_counts(text, lang="en")

	return he[unit] - en[unit]


def get_translated_count_by_unit(text, unit):
	"""
	Return the (approximate) number of translated units in text,
	where text is a text title, text category or list of categories,
	and unit is a section name to count.

	Counts are approximate because they do not adjust for an English section
	that may have no corresponding Hebrew.
	"""
	en = get_available_counts(text, lang="en")

	return en[unit]


def is_ref_available(tref, lang):
	"""
	Returns True if at least one complete version of ref is available in lang.
	"""
	try:
		oref = model.Ref(tref).padded_ref()
	except InputError:
		return False

	#p = texts.parse_ref(tref)
	#if "error" in p:
	#	return False
	counts_doc = get_counts_doc(oref.book)
	if not counts_doc:
		counts_doc = update_text_count(oref.book)
	counts = counts_doc["availableTexts"][lang]

	segment = texts.grab_section_from_text(oref.sections, counts, toSections=oref.toSections)

	if not isinstance(segment, list):
		segment = [segment]
	return all(segment)


def is_ref_translated(ref):
	"""
	Returns True if at least one complete version of ref is available in English.
	"""
	return is_ref_available(ref, "en")


def generate_refs_list(query={}):
	"""
	Generate a list of refs to all available sections.
	"""
	trefs = []
	counts = db.counts.find(query)
	for c in counts:
		if "title" not in c:
			continue  # this is a category count

		try:
			i = model.get_index(c["title"])
		except Exception:
			db.counts.remove(c)
			continue
			# If there is not index record to match the count record,
			# the count should be removed.

		title = c["title"]
		he = list_from_counts(c["availableTexts"]["he"])
		en = list_from_counts(c["availableTexts"]["en"])
		sections = texts.union(he, en)
		for n in sections:
			if i.categories[0] == "Talmud":
				n = section_to_daf(int(n))
			if getattr(i, "commentaryCategories", None) and i.commentaryCategories[0] == "Talmud":
				split = n.split(":")
				n = ":".join([section_to_daf(int(n[0]))] + split[1:])
			tref = "%s %s" % (title, n) if n else title
			trefs.append(tref)

	return trefs


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
