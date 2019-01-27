# -*- coding: utf-8 -*-
"""
counts.py - functions for counting and the number of available segments and versions of a text.

Writes to MongoDB Collection: counts

Counts documents exist for each text as well as each category of texts. Documents for 
texts are keyed by the 'title' field, documents for categories are keyed by the 'categories'
field, which is an array of strings.
"""


'''
def get_counts_doc(title):
	"""
	Returns the stored count doc for 'title',
	where title is a text title, category title or list of categories.
	"""
	raise InputError("This function is under repair.  Our Apologies.")

	if isinstance(title, list):
		# text is a list of categories
		return get_category_count(title)

	categories = library.get_text_categories()
	if title in categories:
		# text is a single category name
		return get_category_count([title])

	# Treat 'text' as a text title
	query = {"title": title}
	c = db.counts.find_one(query)

	# r2: try an Index node
	if not c:
		node = library.get_schema_node(title, "en")  #right to assume en?
		count = db.counts.find_one({"title": node.index.title})
		c = trim_count(count, node)
	return c

# referenced in summaries.add_counts_to_category
# not currently used
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

	# Count this category
	counts = defaultdict(int)
	percent = 0.0
	percentCount = 0
	cat = [cat] if isinstance(cat, basestring) else cat
	indxs = IndexSet({"$and": [{'categories.0': cat[0]}, {"categories": {"$all": cat}}]})
	for indx in indxs:
		counts["Text"] += 1
		text_count = Count().load({ "title": indx.title })
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

# referenced in summaries.add_counts_to_category
# not currently used
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

# no usages
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


#Superceded by StateNode.get_percent_available()
# still used for cats
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

#Superceded by StateNode.get_available_counts_dict()
def get_available_counts(text, lang="en"):

#Superceded by StateNode.get_available_counts_dict()
def make_available_counts_dict(index, count):

#Superceded by StateNode.get_untranslated_count_by_unit()
def get_untranslated_count_by_unit(text, unit):

#Superceded by StateNode.get_translated_count_by_unit()
def get_translated_count_by_unit(text, unit):

'''