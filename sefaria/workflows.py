from random import sample, shuffle

from texts import *

def next_untranslated_ref_in_text(text, section=None):
	"""
	Returns a ref of the first occurence of a Hebrew text in 'text' 
	that does not have an English translation, or is not currently locked.
	* section - optinally restrict the search to a particular section
	"""
	print section
	pRef = parse_ref(text)
	if "error" in pRef:
		return pRef

	counts = db.counts.find_one({"title": pRef["book"]})
	if not counts:
		return {"error": "No counts found for %s" % text}

	en = counts["availableTexts"]["en"]
	en = mark_locked(text, en)

	if section:
		try:
			en = en[section-1]
		except:
			# This section is out of bounds
			return None

	indices = find_zero(en)
	if not indices:
		if section:
			# If a section was specified, but nothing was found
			# try moving on to the next 
			print "recur"
			return next_untranslated_ref_in_text(text, section+1)
		else:
			return None

	if section:
		indices = [section-1] + indices

	if pRef["categories"][0] == "Talmud":
		sections = [section_to_daf(indices[0])] + [str(x+1) for x in indices[1:]]
	else:
		sections = [str(x+1) for x in indices]

	return pRef["book"] + " " + ":".join(sections)


def random_untranslated_ref_in_text(text):
	"""
	Returns the first untranslted ref from a random section of text.
	(i.e., this isn't choosing across all refs, only the first untranslated in each section)
	"""
	c = get_counts_doc(text)
	if not c:
		return None

	options = range(len(c["availableTexts"]["he"]))
	shuffle(options)

	for section in options:
		ref = next_untranslated_ref_in_text(text, section=section)
		if ref:
			return ref

	return None


def next_untranslated_text_in_category(category, skip=0):
	"""
	Returns the first text in category that does not have a complete translation.
	* skip - number of texts to skip over while looking for a match. 
	"""
	texts = get_texts_summaries_for_category(category)
	for text in texts:
		if text["percentAvailable"]["en"] < 100:
			if skip == 0:
				return text["title"]
			else:
				skip -= 1

	return None


def random_untranslated_text_in_category(cat):
	"""
	Return the name of a random text in 'cat' which is not
	completely translated.
	"""
	options = set(db.index.find({"categories": cat}).distinct("title"))

	while len(options):
		text = sample(options, 1)[0]
		ref = next_untranslated_ref_in_text(text) # 
		if ref:
			return text
		options.remove(text)

	return None


def mark_locked(text, counts):
	"""
	Returns a jagged array of counts which marks all currently locked
	SCT text seguments as already complete. 
	"""
	locks = db.locks.find({
							"ref": {"$regex": "^" + text},
							"lang": "en",
							"version": "Sefaria Community Translation",
						})
	for lock in locks:
		pRef = parse_ref(lock["ref"])
		if pRef["book"] != text: continue
		# reach into the jagged array to find the right
		# position to set
		zoom = counts
		for i in range(pRef["textDepth"]-1):
			zoom = zoom[pRef["sections"][i] - 1]
		try:
			zoom[pRef["sections"][-1]-1] = 1
		except:
			pass # A lock exists that refers to a now out of range segment; ignore.

	return counts


def find_zero(jag):
	"""
	Recursively walk through a jagged array looking for a 0
	return a list of indices to the zero or false.
	"""
	if isinstance(jag, int):
		return jag == 0

	for n, j in enumerate(jag):
		result = find_zero(j)
		if result:
			indices = [n] + result if isinstance(result, list) else [n]
			return indices

	return False