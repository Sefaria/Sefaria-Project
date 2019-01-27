"""
workflows.py - functions for directing assignments of work on Sefaria.

Depends largely on counts.py for knowing what work is complete and incomplete.
"""

from random import sample, shuffle

from sefaria.model import *
# noinspection PyUnresolvedReferences
from sefaria.system.database import db
import summaries
from utils.talmud import section_to_daf


def next_untranslated_ref_in_text(text, section=None, enCounts=None, tryNext=True):
	"""
	Returns a ref of the first occurrence of a Hebrew text in 'text' 
	that does not have an English translation, or is not currently locked.

	* section  - optinally restrict the search to a particular section
	* enCounts - a jagged array of counts of available english texted, assumed to 
				 already have been marked for locked texts.
	* tryNext  - when a section is specified, but no ref is found, should we move on
				 to the next section or just fail?
	"""
	oref = Ref(text).padded_ref()

	if not enCounts:
		state = oref.get_state_node()
		if not state:
			return {"error": "No state found for %s" % text}

		en = state.var("en", "availableTexts")
		enCounts = mark_locked(text, en)

	if section:
		try:
			en = enCounts[section - 1]
		except:
			# This section is out of bounds
			return None
	else: 
		en = enCounts

	indices = find_zero(en)
	if not indices:
		if section and tryNext:
			# If a section was specified, but nothing was found
			# try moving on to the next 
			return next_untranslated_ref_in_text(text, section=section + 1, enCounts=enCounts)
		else:
			return None

	if section:
		indices = [section - 1] + indices

	if oref.is_talmud():
		sections = [section_to_daf(indices[0] + 1)] + [str(x + 1) for x in indices[1:]]
	else:
		sections = [str(x + 1) for x in indices]

	return oref.book + " " + ":".join(sections)


def random_untranslated_ref_in_text(text, skip=None):
	"""
	Returns the first untranslted ref from a random section of text.
	(i.e., this isn't choosing across all refs, only the first untranslated in each section)

	* skip  - a section number to disallow (so users wont get the same section twice in a row when asking for random)
	"""
	state = StateNode(text)
	if not state:
		return None

	enCounts = mark_locked(text, state.var("en", "availableTexts"))

	options = range(len(state.var("he", "availableTexts")))
	shuffle(options)
	if skip:
		options = [x for x in options if x != skip]

	for section in options:
		ref = next_untranslated_ref_in_text(text, section=section, enCounts=enCounts, tryNext=False)
		if ref and "error" not in ref:
			return ref

	return None


def next_untranslated_text_in_category(category, skip=0):
	"""
	Returns the first text in category that does not have a complete translation.
	* skip - number of texts to skip over while looking for a match. 
	"""
	texts = summaries.get_texts_summaries_for_category(category)
	for text in texts:
		if text["percentAvailable"]["en"] < 100:
			if skip == 0:
				return text["title"]
			else:
				skip -= 1

	return None


def random_untranslated_text_in_category(cat):
	#todo: move to object model.  But is this used anymore?
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
		#pRef = parse_ref(lock["ref"])
		oref = Ref(lock["ref"]).padded_ref()
		if oref.book != text: continue
		# reach into the jagged array to find the right
		# position to set
		zoom = counts
		for i in range(oref.index_node.depth-1):
			zoom = zoom[oref.sections[i] - 1]
		try:
			zoom[oref.sections[-1]-1] = 1
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