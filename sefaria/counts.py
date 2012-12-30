from collections import defaultdict
import texts as sefaria


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
	
	query = {"title": ref} if ref else {}
	indices = sefaria.db.index.find(query)

	for index in indices:
		if index["categories"][0] == "Commentary":
			continue

		print index["title"]
		c = { "title": index["title"] }
		sefaria.db.counts.remove(c)

		if index["categories"][0] in ("Tanach", "Mishna", "Talmud"):

			# For these texts, consider what is present in the db across 
			# English and Hebrew to represent actual total counts
			counts = count_texts(index["title"])
			if "error" in counts:
				print counts["error"]
				continue
			index["lengths"] = counts["lengths"]
			c["sectionCounts"] = zero_jagged_array(counts["counts"])
		else:
			if "length" in index:
				index["lengths"] = [index["length"]]

		en = count_texts(index["title"], lang="en")
		he = count_texts(index["title"], lang="he")

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
				hp = ep = "unknown"
			else:
				hp = heTotal / float(total) * 100
				ep = enTotal / float(total) * 100
		else: 
			hp = ep = "unknown"

		c["percentAvailable"] = {
			"he": hp,
			"en": ep,
		}

		sefaria.db.index.save(index)
		sefaria.db.counts.save(c)

	return c


def count_category(cat, lang=None):
	"""
	Count the number of sections of various types in an entire category and calculate percentages
	Depends on text counts already being saved in counts collection
	"""
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

