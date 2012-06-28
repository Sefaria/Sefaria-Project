from collections import defaultdict
import texts as sefaria


def count_texts(ref, lang=None):
	"""
	Count available versions of a text, segment by segment
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
		# TODO Look at the sections in ref, not just total book
		this_count = count_array(text["chapter"])
		counts = sum_count_arrays(counts, this_count)

	result = { "counts": counts, "lengths": [], "sectionNames": pref["sectionNames"] }
	#result = dict(result.items() + pref.items()

	for d in range(depth):
		result["lengths"].append(sum_counts(counts, d))

	return result


def count_category(cat, lang=None):
	"""
	Count the number of sections of various types in an entire category
	Depends on text counts already being set on index records
	"""
	counts = defaultdict(int)
	texts = sefaria.db.index.find({ "categories": cat })
	for text in texts:
		i = sefaria.db.index.find_one({ "title": text["title"] })
		if i["categories"][0] == "Commentary":
			return {}
		c = i["availableCounts"][lang]
		counts["Text"] += 1
		for i in range(len(text["sectionNames"])):
			counts[text["sectionNames"][i]] += c[i]

	return dict(counts)


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
	Sum the counts of a text at given depth
	E.g, for counts on all of Job, depth 0 counts chapters, depth 1 counts verses
	"""
	if depth == 0:
		if counts == 0:
			return 0
		return len(counts)
	else:
		sum = 0
		for i in range(len(counts)):
			sum += sum_counts(counts[i], depth-1)
		return sum


def zero_jagged_array(array):
	"""
	Take a jagged array and return a jagged array or identical shape
	with all elements replace by 0.
	"""
	if isinstance(array, list):
		return [zero_jagged_array(a) for a in array]
	else:
		return 0

