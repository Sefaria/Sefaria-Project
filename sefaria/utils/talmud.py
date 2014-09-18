from sefaria.utils.hebrew import encode_hebrew_numeral

def section_to_daf(section, lang="en"):
	"""
	Transforms a section number to its corresponding daf string,
	in English or in Hebrew.
	"""
	section += 1
	daf = section / 2

	if lang == "en":
		if section > daf * 2:
			daf = "%db" % daf
		else:
			daf = "%da" % daf

	elif lang == "he":
		if section > daf * 2:
			daf = ("%s " % encode_hebrew_numeral(daf)) + u"\u05D1"
		else:
			daf = ("%s " % encode_hebrew_numeral(daf)) + u"\u05D0"

	return daf


def daf_to_section(daf):
	"""
	Transforms a daf string (e.g., '4b') to its corresponding stored section number.
	"""
	amud = daf[-1]
	daf = int(daf[:-1])
	section = daf * 2
	if amud == "a": section -= 1
	return section


def parse_daf_string(daf):
	"""
	Take a string representing a daf ('55', amud ('55b')
	or a line on a daf ('55b:2') and return of list parsing it in
	ints.

	'2a' -> [3], '2a:4' -> [3, 4]
	"""
	return []