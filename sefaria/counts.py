from collections import defaultdict
import texts as sefaria
from pprint import pprint


def count_texts(ref, lang=None):
	"""
	Count available versions of a text in the db, segment by segment
	"""
	counts = []

	pref = sefaria.parse_ref(ref)
	if "error" in pref:
		return pref
	depth = len(pref["sectionNames"])

	query = { "title": pref["book"] }

	if lang:
		query["language"] = lang

	texts = sefaria.db.texts.find(query)
	for text in texts:
		# TODO Look at the sections requested in ref, not just total book
		this_count = count_array(text["chapter"])
		counts = sum_count_arrays(counts, this_count)

	result = { "counts": counts, "lengths": [], "sectionNames": pref["sectionNames"] }
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

	indices = sefaria.db.index.find({})

	for index in indices:
		if index["categories"][0] == "Commentary":
			cRef = "^" + index["title"] + " on "
			texts = sefaria.db.texts.find({"title": {"$regex": cRef}})
			for text in texts:
				update_text_count(text["title"], index)
		else:	
			update_text_count(index["title"])

	sefaria.update_summaries()


def update_text_count(ref, index=None):
	"""
	Update the count records of the text specfied 
	by ref (currently at book level only) by peforming a count
	"""	
	index = index or sefaria.db.index.find_one({"title": ref})
	if not index:
		return False

	c = { "title": ref }
	sefaria.db.counts.remove(c)

	if index["categories"][0] in ("Tanach", "Mishna", "Talmud"):
		# For these texts, consider what is present in the db across 
		# English and Hebrew to represent actual total counts
		counts = count_texts(ref)
		if "error" in counts:
			return False
		index["lengths"] = counts["lengths"]
		c["sectionCounts"] = zero_jagged_array(counts["counts"])
	else:
		if "length" in index:
			index["lengths"] = [index["length"]]

	en = count_texts(ref, lang="en")
	he = count_texts(ref, lang="he")
	if "error" in en or "error" in he:
		return False

	if "sectionCounts" in c:
		totals = c["sectionCounts"]
	else:
		totals = zero_jagged_array(sum_count_arrays(en["counts"], he["counts"]))

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

	if "length" in index:
		depth = len(index["lengths"])
		heTotal = enTotal = total = 0
		for i in range(depth):
			heTotal += he["lengths"][i]
			enTotal += en["lengths"][i]
			total += index["lengths"][i]
		if total == 0:
			hp = ep = 0
		else:
			hp = heTotal / float(total) * 100
			ep = enTotal / float(total) * 100
	else: 
		hp = ep = 0

	c["percentAvailable"] = {
		"he": hp,
		"en": ep,
	}
	c["textComplete"] = {
		"he": hp > 99.5,
		"en": ep > 99.5,
	}

	sefaria.db.index.save(index)
	sefaria.db.counts.save(c)

	return c


def count_category(cat, lang=None):
	"""
	Count the number of sections of various types in an entire category and calculate percentages
	Depends on text counts already being saved in counts collection
	"""
	if not lang:
		# If no language specified, return a dict with English and Hebrew,
		# grouping hebrew and english fields
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
		if isinstance(cat, list):
			remove_doc = {"category": {"$all": cat}}
		else:
			remove_doc = {"$and": [{'category.0': {"$exists": False}}, {"category": cat}]}
		sefaria.db.counts.remove(remove_doc)
		counts_doc = {"category": cat}
		counts_doc.update(counts)
		sefaria.db.counts.save(counts_doc)

		return counts


	# Cout this cateogry
	counts = defaultdict(int)
	percent = 0.0
	percentCount = 0
	cat = [cat] if isinstance(cat, basestring) else cat
	texts = sefaria.db.index.find({ "categories": {"$all": cat }})
	for text in texts:
		counts["Text"] += 1
		text_count = sefaria.db.counts.find_one({ "title": text["title"] })
		if not text_count or "availableCounts" not in text_count or "sectionNames" not in text:
			continue
	
		c = text_count["availableCounts"][lang]
		for i in range(len(text["sectionNames"])):
			if len(c) > i:
				counts[text["sectionNames"][i]] += c[i]
	
		if "percentAvailable" in text_count and isinstance(percent, float):
			percentCount += 1
			percent += text_count["percentAvailable"][lang] if isinstance(text_count["percentAvailable"][lang], float) else 0.0
		else:
			percent = "unknown"

	percentCount = 1 if percentCount == 0 else percentCount
	percent = percent / percentCount if isinstance(percent, float) else "unknown"

	if "Daf" in counts:
		counts["Amud"] = counts["Daf"]
		counts["Daf"] = counts["Daf"] / 2

	return { "availableCounts": dict(counts), "percentAvailable": percent }


def get_category_count(categories):

	return sefaria.db.counts.find_one({"categories": {"$all": categories}})


def count_array(text):
	"""
	Take a text array and return a corresponding array counting whether or not 
	text is present in each position. 
	"""
	if isinstance(text, basestring) or text is None:
		return 0 if not text else 1
	else:
		return [count_array(t) for t in text]


def sum_count_arrays(a, b):
	"""
	Take two multidimensional arrays of ints, return a single array which 
	sums their values in each position. Missing elements are given 0 value.
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
	Take a jagged array and return a jagged array of identical shape
	with all elements replaced by 0.
	"""
	if isinstance(array, list):
		return [zero_jagged_array(a) for a in array]
	else:
		return 0


def count_words_in_texts(curr):
	"""
	Counts all the words of texts in curr, 
	"""
	total = sum([count_words(t["chapter"]) for t in curr ])
	return total


def count_words(text):
	"""
	Counts the number of words in a jagged array whose terminals are strings.
	"""
	if isinstance(text, basestring):
		return len(text.split(" "))
	elif isinstance(text, list):
		return sum([count_words(i) for i in text])
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
	Returns the available count dictionary of 'text' in 'lang',
	where text is a text title, text category or list of categories. 
	"""
	c = get_counts_doc(text)

	if "title" in c:
		# counts docs for individual have different shape
		i = sefaria.db.index.find_one({"title": c["title"]})
		c["availableCounts"] = sefaria.make_available_counts_dict(i, c)

	if c and lang in c["availableCounts"]:
		return c["availableCounts"][lang]
	else:
		return 0


def get_counts_doc(text):
	"""
	Returns the stored count doc for 'text',
	where text is a text title, text category or list of categories. 
	"""	
	if isinstance(text, list):
		query = {"category": {"$all": text}}
	else:
		i = sefaria.db.index.find_one({"titleVariants": text})
		if not i:
			# This isn't a text title, treat it as a category.
			# Look up the first text matching this category and 
			# use its complete categories list
			# (e.g., "Prophets" -> ["Tanach", Prophets])
			example = sefaria.db.index.find_one({"categories": text})
			if not example:
				# if we don't have a single text in this category,
				# then we have nothing.
				return 0
			# Don't use subcategories if this is a top level category
			if example["categories"][0] == text:
				query = {"$and": [{'category.0': {"$exists": False}}, {"category": text}]}
			else:
				query = {"category": {"$all": example["categories"]}}
		else:
			query = {"title": text}

	c = sefaria.db.counts.find_one(query)

	return c


def get_remaining_translation_count(text, unit):
	"""
	Returns the number of untranslated units of text,
	where text is a text title, text category or list of categories,
	and unit is a section name to count.
	"""
	he = get_available_counts(text, lang="he")
	en = get_available_counts(text, lang="en")

	return he[unit] - en[unit]


