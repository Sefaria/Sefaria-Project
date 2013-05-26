from texts import *


def next_translation(text):
	"""
	Returns a ref of the first occurence of a Hebrew text named in 'text' 
	that does not have an English translation.
	"""
	pref = parse_ref(text)
	if "error" in pref:
		return pref

	counts = db.counts.find_one({"title": pref["book"]})
	if not counts:
		return {"error": "No counts found for %s" % text}

	en = counts["availableTexts"]["en"]

	indices = find_zero(en)
	if not indices:
		return {"error": "%s seems to be fully translated." % text}

	if pref["categories"][0] == "Talmud":
		sections = [section_to_daf(indices[0])] + [str(x+1) for x in indices[1:]]
	else:
		sections = [str(x+1) for x in indices]

	return pref["book"] + " " + ":".join(sections)


def next_text(category):
	"""
	Returns the first text in category that does not have a complete translation.
	"""
	return False


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