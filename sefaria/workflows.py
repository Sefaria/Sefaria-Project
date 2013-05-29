from texts import *


def next_translation(text):
	"""
	Returns a ref of the first occurence of a Hebrew text in 'text' 
	that does not have an English translation.
	"""
	pref = parse_ref(text)
	if "error" in pref:
		return pref

	counts = db.counts.find_one({"title": pref["book"]})
	if not counts:
		return {"error": "No counts found for %s" % text}

	en = counts["availableTexts"]["en"]
	en = mark_locked(text, en)

	indices = find_zero(en)
	if not indices:
		return {"error": "%s is fully translated." % text}

	if pref["categories"][0] == "Talmud":
		sections = [section_to_daf(indices[0])] + [str(x+1) for x in indices[1:]]
	else:
		sections = [str(x+1) for x in indices]

	return pref["book"] + " " + ":".join(sections)


def next_text(category, skip=0):
	"""
	Returns the first text in category that does not have a complete translation.
	skip - number of texts to skip over while looking for a match.
	"""
	texts = get_texts_summaries_for_category(category)
	for text in texts:
		if text["percentAvailable"]["en"] < 100:
			if skip == 0:
				return text["title"]
			else:
				skip -= 1

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
		for i in range(pRef["textDepth"]-1):
			zoom = counts[pRef["sections"][i] - 1]
		zoom[pRef["sections"][-1]-1] = 1

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