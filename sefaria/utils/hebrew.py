# -*- coding: utf-8 -*-
"""
hebrew.py - functions relating to reading and generating Hebrew numerals.

Issues:
   Numbers like 1 million are ambiguous
   Number like 2000 is ambiguous
   Okay to construct 15/16 and then make tet-vav/etc?
"""

import re
import regex
import math

from sefaria.system.decorators import memoized
import logging
logger = logging.getLogger(__name__)


### Change to all caps for constants
GERESH = u"\u05F3"
GERSHAYIM = u"\u05F4"
ALPHABET_22 = u"אבגדהוזחטיכלמנסעפצקרשת"
FINAL_LETTERS = u"םןץףך"
ALPHABET_27 = ALPHABET_22 + FINAL_LETTERS

H2E_KEYBOARD_MAP = {u"/": u"q", u"׳": u"w", u"ק": u"e", u"ר": u"r", u"א": u"t", u"ט": u"y", u"ו": u"u", u"ן": u"i", u"ם": u"o", u"פ": u"p", u"ש": u"a", u"ד": u"s", u"ג": u"d", u"כ": u"f", u"ע": u"g", u"י": u"h", u"ח": u"j", u"ל": u"k", u"ך": u"l", u"ף": u";", u",": u"'", u"ז": u"z", u"ס": u"x", u"ב": u"c", u"ה": u"v", u"נ": u"b", u"מ": u"n", u"צ": u"m", u"ת": u",", u"ץ": u".", u".": u"/"}
E2H_KEYBOARD_MAP = {u"'": u',', u',': u'\u05ea', u'.': u'\u05e5', u'/': u'.', u';': u'\u05e3', u'A': u'\u05e9', u'B': u'\u05e0', u'C': u'\u05d1', u'D': u'\u05d2', u'E': u'\u05e7', u'F': u'\u05db', u'G': u'\u05e2', u'H': u'\u05d9', u'I': u'\u05df', u'J': u'\u05d7', u'K': u'\u05dc', u'L': u'\u05da', u'M': u'\u05e6', u'N': u'\u05de', u'O': u'\u05dd', u'P': u'\u05e4', u'Q': u'/', u'R': u'\u05e8', u'S': u'\u05d3', u'T': u'\u05d0', u'U': u'\u05d5', u'V': u'\u05d4', u'W': u'\u05f3', u'X': u'\u05e1', u'Y': u'\u05d8', u'Z': u'\u05d6', u'a': u'\u05e9', u'b': u'\u05e0', u'c': u'\u05d1', u'd': u'\u05d2', u'e': u'\u05e7', u'f': u'\u05db', u'g': u'\u05e2', u'h': u'\u05d9', u'i': u'\u05df', u'j': u'\u05d7', u'k': u'\u05dc', u'l': u'\u05da', u'm': u'\u05e6', u'n': u'\u05de', u'o': u'\u05dd', u'p': u'\u05e4', u'q': u'/', u'r': u'\u05e8', u's': u'\u05d3', u't': u'\u05d0', u'u': u'\u05d5', u'v': u'\u05d4', u'w': u'\u05f3', u'x': u'\u05e1', u'y': u'\u05d8', u'z': u'\u05d6'}
KEYBOARD_SWAP_MAP = {u"/": u"q", u"׳": u"w", u"ק": u"e", u"ר": u"r", u"א": u"t", u"ט": u"y", u"ו": u"u", u"ן": u"i", u"ם": u"o", u"פ": u"p", u"ש": u"a", u"ד": u"s", u"ג": u"d", u"כ": u"f", u"ע": u"g", u"י": u"h", u"ח": u"j", u"ל": u"k", u"ך": u"l", u"ף": u";", u",": u"'", u"ז": u"z", u"ס": u"x", u"ב": u"c", u"ה": u"v", u"נ": u"b", u"מ": u"n", u"צ": u"m", u"ת": u",", u"ץ": u".", u".": u"/",
					u"'": u',', u',': u'\u05ea', u'.': u'\u05e5', u'/': u'.', u';': u'\u05e3', u'A': u'\u05e9', u'B': u'\u05e0', u'C': u'\u05d1', u'D': u'\u05d2', u'E': u'\u05e7', u'F': u'\u05db', u'G': u'\u05e2', u'H': u'\u05d9', u'I': u'\u05df', u'J': u'\u05d7', u'K': u'\u05dc', u'L': u'\u05da', u'M': u'\u05e6', u'N': u'\u05de', u'O': u'\u05dd', u'P': u'\u05e4', u'Q': u'/', u'R': u'\u05e8', u'S': u'\u05d3', u'T': u'\u05d0', u'U': u'\u05d5', u'V': u'\u05d4', u'W': u'\u05f3', u'X': u'\u05e1', u'Y': u'\u05d8', u'Z': u'\u05d6', u'a': u'\u05e9', u'b': u'\u05e0', u'c': u'\u05d1', u'd': u'\u05d2', u'e': u'\u05e7', u'f': u'\u05db', u'g': u'\u05e2', u'h': u'\u05d9', u'i': u'\u05df', u'j': u'\u05d7', u'k': u'\u05dc', u'l': u'\u05da', u'm': u'\u05e6', u'n': u'\u05de', u'o': u'\u05dd', u'p': u'\u05e4', u'q': u'/', u'r': u'\u05e8', u's': u'\u05d3', u't': u'\u05d0', u'u': u'\u05d5', u'v': u'\u05d4', u'w': u'\u05f3', u'x': u'\u05e1', u'y': u'\u05d8', u'z': u'\u05d6'}


@memoized
def heb_to_int(unicode_char):
	"""Converts a single Hebrew unicode character into its Hebrew numerical equivalent."""

	hebrew_numerals = {
		u"\u05D0": 1,
		u"\u05D1": 2,
		u"\u05D2": 3,
		u"\u05D3": 4,
		u"\u05D4": 5,
		u"\u05D5": 6,
		u"\u05D6": 7,
		u"\u05D7": 8,
		u"\u05D8": 9,
		u"\u05D9": 10,
		u"\u05DB": 20,
		u"\u05DC": 30,
		u"\u05DE": 40,
		u"\u05E0": 50,
		u"\u05E1": 60,
		u"\u05E2": 70,
		u"\u05E4": 80,
		u"\u05E6": 90,
		u"\u05E7": 100,
		u"\u05E8": 200,
		u"\u05E9": 300,
		u"\u05EA": 400,  	# u"\u05F3": "'", # Hebrew geresh  # u"\u05F4": '"', # Hebrew gershayim  # u"'":	   "'",
		u"\u05DA": 20,		# khaf sofit
		u"\u05DD": 40,		# mem sofit
		u"\u05DF": 50, 		# nun sofit
		u"\u05E3": 80, 		# peh sofit
		u"\u05E5": 90, 		# tzadi sofit
	}

	if unicode_char not in hebrew_numerals.keys():
		raise KeyError, u"Invalid Hebrew numeral character {}".format(unicode_char)

	else:
		return hebrew_numerals[unicode_char]


def split_thousands(n, littleendian=True):
	"""
	Takes a string representing a Hebrew numeral, returns a tuple of the component thousands
	places.  Requires a geresh (apostrophe or '\u05F3') to indicate thousands.
	Ignores single geresh at end for numbers < 10.

	Default returns the smallest thousands group first in the tuple (little-endian).  Can be changed
	to big-endian by setting littleendian=False.
	"""

	# Ignore geresh on digit < 10, if present
	if n[-1] == GERESH or n[-1] == "'":
		n = n[:-1]

	#assume that two single quotes in a row should be a double quote. '' -> "
	n = n.replace(GERESH, "'").replace("''", "\"")

	ret = n.split("'")
	if littleendian:
		return reversed(ret)
	else:
		return ret


def heb_string_to_int(n):
	'''
	Takes a single thousands block of Hebrew characters, and returns the integer value of
	that set of characters, ignoring thousands order of magnitude.

	>>> heb_string_to_int(u'\u05ea\u05e9\u05e1\u05d3') # = u'תשסד'
	764
	'''

	n = re.sub(u'[\u05F4"]', u'', n)  # remove gershayim
	return sum(map(heb_to_int, n))

@memoized
def decode_hebrew_numeral(n):
	"""
	Takes any string representing a Hebrew numeral and returns it integer value.

	>>> decode_hebrew_numeral(u'ה׳תשס״ד')
	5764
	"""

	t = map(heb_string_to_int, split_thousands(n))  # split and convert to numbers
	t = map(lambda (E, num): pow(10, 3 * E) * num, enumerate(t))  # take care of thousands and add
	return sum(t)


########## ENCODING #############

def chunks(l, n):
	"""
	Yield successive n-sized chunks from l.
	"""
	for i in xrange(0, len(l), n):
		yield l[i:i + n]

@memoized
def int_to_heb(integer):
	"""
	Converts an integer that can be expressed by a single Hebrew character (1..9, 10..90, 100.400)
	and returns the Hebrew character that represents that integer.

	Also accepts values divisible by 100 from 500 to 1100.

	>> int_to_heb(10)          #This fails as a doctest.  The yud isn't seen as u'\u05d9'
	י
	>> int_to_heb(800)          #TavTav is not seen as u'\u05ea\u05ea'
	תת
	"""

	hebrew_numerals = {
		0: u"",
		1: u"\u05D0",
		2: u"\u05D1",
		3: u"\u05D2",
		4: u"\u05D3",
		5: u"\u05D4",
		6: u"\u05D5",
		7: u"\u05D6",
		8: u"\u05D7",
		9: u"\u05D8",
		10: u"\u05D9",
		15: u"\u05D8\u05D5",  # Will not be hit when used with break_int_magnitudes
		16: u"\u05D8\u05D6",  # Will not be hit when used with break_int_magnitudes
		20: u"\u05DB",
		30: u"\u05DC",
		40: u"\u05DE",
		50: u"\u05E0",
		60: u"\u05E1",
		70: u"\u05E2",
		80: u"\u05E4",
		90: u"\u05E6",
		100: u"\u05E7",
		200: u"\u05E8",
		300: u"\u05E9",
		400: u"\u05EA",
	}

	# Fill in hebrew_numeral mappings up to 1100
	for num in range(500, 1200, 100):
		hebrew_numerals[num] = hebrew_numerals[400] * (num // 400) + hebrew_numerals[num % 400]

	if integer > 1100:
		raise KeyError, "Asked to convert individual integer {} above 1100; too large.".format(integer)

	else:
		return hebrew_numerals[integer]


def break_int_magnitudes(n, start=None):
	"""break_int_magnitudes(n, start=None)

	Accepts an integer and an optional integer (multiple of 10) for at what order of
	magnitude to start breaking apart the integer.  If no option "start" is provided,
	function will determine the size of the input integer and start that the largest order
	of magnitude.

	Returns a big-endian list of the various orders of magnitude, by 10s, broken apart.

	>>> break_int_magnitudes(1129, 100)
	[1100, 20, 9]

	>>> break_int_magnitudes(2130)
	[2000, 100, 30, 0]

	>>> break_int_magnitudes(15000)
	[10000, 5000, 0, 0, 0]
	"""

	if type(n) is not int:
		raise TypeError, "Argument 'n' must be int, {} provided.".format(type(n))

	# if n == 0:
	# 	return [0]

	# Set a default for 'start' if none specified
	if start is not None:
		if not (start % 10 == 0 or start == 1):
			raise TypeError, "Argument 'start' must be 1 or divisible by 10, {} provided.".format(start)
	else:
		start = 10 ** int(math.log10(n))

	if start == 1:
		return [n]
	else:
		return [n // start * start] + break_int_magnitudes(n - n // start * start, start=start / 10)

@memoized
def sanitize(input_string, punctuation=True):
	"""sanitize(input_string, punctuation=True)

	Takes a Hebrew number input string and applies appropriate formatting and changes.  This function
	includes any special cases, like 15 and 16.

	Optional addition of gershayim or geresh at end where appropriate with "punctuation" arg.
	Thousands geresh will be added regardless from previous functions.

	Note that high numbers may appear oddly due to lack of convention.  For example,
	the sanitized version of 15000 will appear as טו׳.

	"""

	# deal with 15 and 16
	# Should we support numbers like 15,000?  Would that look like tet-vav-geresh?

	# if input_string[-2:] in (encode_small_hebrew_numeral(15), encode_small_hebrew_numeral(16)):
	# 	input_string = input_string[:-2] + int_to_heb(heb_string_to_int(input_string[-2:]))

	# This takes care of all instances of 15/16, even in the thousands

	replacement_pairs = (
		(u'\u05d9\u05d4', u'\u05d8\u05d5'),  #15
		(u'\u05d9\u05d5', u'\u05d8\u05d6'),  #16
		(u'\u05e8\u05e2\u05d4', u'\u05e2\u05e8\u05d4'),  #275
		(u'\u05e8\u05e2\u05d1', u'\u05e2\u05e8\u05d1'),  #272
		(u'\u05e8\u05e2', u'\u05e2\u05e8'),  #270
	)

	for wrong, right in replacement_pairs:
		input_string = re.sub(wrong, right, input_string)

	if punctuation:
		# add gershayim at end
		if len(input_string) > 1:
			if GERESH not in input_string[-2:]:
				input_string = input_string[:-1] + GERSHAYIM + input_string[-1:]
		else:
			# or, add single geresh at end
			input_string += GERESH

	return input_string


def decompose_presentation_forms(orig_char):
	decomp_map = {u'יִ': u'\u05d9\u05b4',
		u'ﬞ ' : u'\u05bf',
		u'ײַ': u'\u05f2\u05b7',
		u'ﬠ': u'\u05e2',
		u'ﬡ': u'\u05d0',
		u'ﬢ': u'\u05d3',
		u'ﬣ': u'\u05d4',
		u'ﬤ': u'\u05db',
		u'ﬥ': u'\u05dc',
		u'ﬦ': u'\u05dd',
		u'ﬧ': u'\u05e8',
		u'ﬨ': u'\u05ea',
		u'שׁ': u'\u05e9\u05c1',
		u'שׂ': u'\u05e9\u05c2',
		u'שּׁ': u'\u05e9\u05bc\u05c1',
		u'שּׂ': u'\u05e9\u05bc\u05c2',
		u'אַ': u'\u05d0\u05b7',
		u'אָ': u'\u05d0\u05b8',
		u'אּ': u'\u05d0\u05bc',
		u'בּ': u'\u05d1\u05bc',
		u'גּ': u'\u05d2\u05bc',
		u'דּ': u'\u05d3\u05bc',
		u'הּ': u'\u05d4\u05bc',
		u'וּ': u'\u05d5\u05bc',
		u'זּ': u'\u05d6\u05bc',
		u'טּ': u'\u05d8\u05bc',
		u'יּ': u'\u05d9\u05bc',
		u'ךּ': u'\u05da\u05bc',
		u'כּ': u'\u05db\u05bc',
		u'לּ': u'\u05dc\u05bc',
		u'מּ': u'\u05de\u05bc',
		u'נּ': u'\u05e0\u05bc',
		u'סּ': u'\u05e1\u05bc',
		u'ףּ': u'\u05e3\u05bc',
		u'פּ': u'\u05e4\u05bc',
		u'צּ': u'\u05e6\u05bc',
		u'קּ': u'\u05e7\u05bc',
		u'רּ': u'\u05e8\u05bc',
		u'שּ': u'\u05e9\u05bc',
		u'תּ': u'\u05ea\u05bc',
		u'וֹ': u'\u05d5\u05b9',
		u'בֿ': u'\u05d1\u05bf',
		u'כֿ': u'\u05db\u05bf',
		u'פֿ': u'\u05e4\u05bf',
		u'ﭏ': u'\u05d0\u05dc'
	}
	if isinstance(orig_char, str): #needs to be unicode
		orig_char = unicode(orig_char, 'utf-8')
	return decomp_map.get(orig_char, u'')

presentation_re = re.compile(ur"[\uFB1D-\uFB4F]")


def decompose_presentation_forms_in_str(orig_str):
	return presentation_re.sub(lambda match: decompose_presentation_forms(match.group()), orig_str)


def normalize_final_letters(orig_char):

	decomp_map = {
		u"\u05DA": u"\u05DB",		# khaf sofit
		u"\u05DD": u"\u05DE",		# mem sofit
		u"\u05DF": u"\u05E0", 		# nun sofit
		u"\u05E3": u"\u05E4", 		# peh sofit
		u"\u05E5": u"\u05E6", 		# tzadi sofit
	}

	if isinstance(orig_char, str): #needs to be unicode
		orig_char = unicode(orig_char, 'utf-8')
	return decomp_map.get(orig_char, u'')

final_letter_re = re.compile(u"[" + FINAL_LETTERS + u"]")


def normalize_final_letters_in_str(orig_str):
	return final_letter_re.sub(lambda match: normalize_final_letters(match.group()), orig_str)


def swap_keyboards_for_letter(orig_char):
	if isinstance(orig_char, str):  # needs to be unicode
		orig_char = unicode(orig_char, 'utf-8')
	return KEYBOARD_SWAP_MAP.get(orig_char, orig_char)


def swap_keyboards_for_string(orig_str):
	return re.sub(ur".", lambda match: swap_keyboards_for_letter(match.group()), orig_str)

@memoized
def encode_small_hebrew_numeral(n):
	"""
	Takes an integer under 1200 and returns a string encoding it as a Hebrew numeral.
	"""

	if n >= 1200:
		raise ValueError, "Tried to encode small numeral >= 1200."
	else:
		return u''.join(map(int_to_heb, break_int_magnitudes(n, 100)))

@memoized
def encode_hebrew_numeral(n, punctuation=True):
	"""encode_hebrew_numeral(n, punctuation=True)

	Takes an integer and returns a string encoding it as a Hebrew numeral.
	Optional "punctuation" argument adds gershayim between last two characters
	or final geresh.

	Under 1200, will use taf-taf-shin, etc.
	Above 1200, will use aleph + geresh for thousands.

	This function is not intended for numbers 1,000,000 or more, as there is not currently
	an established convention and there can be ambiguity.  This can be the same for numbers like
	2000 (which would be displayed as bet-geresh) and should instead possibly use words, like "bet elef."
	"""

	if n < 1200:
		ret = encode_small_hebrew_numeral(n)
	else:

		# Break into magnitudes, then break into thousands buckets, big-endian
		ret = list(chunks(list(reversed(break_int_magnitudes(n))), 3))

		# Eliminate the orders of magnitude in preparation for being encoded
		ret = map(lambda (x, y): int(sum(y) * pow(10, -3 * x)), enumerate(ret))

		# encode and join together, separating thousands with geresh
		ret = GERESH.join(map(encode_small_hebrew_numeral, reversed(ret)))

	ret = sanitize(ret, punctuation)

	return ret

@memoized
def encode_hebrew_daf(daf):
	"""
	Turns a daf string ("21a") to a hebrew daf string ("כא.")
	"""
	daf, amud = daf[:-1], daf[-1]
	amud_mark = {"a": ".", "b": ":"}[amud]
	return encode_hebrew_numeral(int(daf), punctuation=False) + amud_mark


def strip_nikkud(rawString):
	return regex.sub(r"[\u0591-\u05C7]", "", rawString)


#todo: rewrite to handle edge case of hebrew words in english texts, and latin characters in Hebrew text
def is_hebrew(s, heb_only=False):
	if not heb_only and regex.search(u"\p{Hebrew}", s):
		return True
	elif heb_only and regex.search(u"\p{Hebrew}", s) and not regex.search(u"[a-zA-Z]", s):
		return True
	return False


def strip_cantillation(text, strip_vowels=False):
	if strip_vowels:
		strip_regex = re.compile(ur"[\u0591-\u05bd\u05bf-\u05c5\u05c7]", re.UNICODE)
	else:
		strip_regex = re.compile(ur"[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5]", re.UNICODE)
	return strip_regex.sub('', text)


def has_cantillation(text, detect_vowels=False):
	if detect_vowels:
		rgx = re.compile(ur"[\u0591-\u05bd\u05bf-\u05c5\u05c7]", re.UNICODE)
	else:
		rgx = re.compile(ur"[\u0591-\u05af\u05bd\u05bf\u05c0\u05c4\u05c5]", re.UNICODE)
	return bool(rgx.search(text))


def gematria(string):
	"""Returns the gematria of `str`, ignore any characters in string that have now gematria (like spaces)"""
	total = 0
	for letter in string:
		try:
			total += heb_to_int(letter)
		except:
			pass
	return total


def hebrew_plural(s):
	"""
	Hebrew friendly plurals
	"""
	known = {
		"Daf":      "Dappim",
		"Mitzvah":  "Mitzvot",
		"Negative Mitzvah": "Negative Mitzvot",
		"Positive Mitzvah": "Positive Mitzvot",
		"Mitsva":   "Mitzvot",
		"Mesechet": "Mesechtot",
		"Perek":    "Perokim",
		"Siman":    "Simanim",
		"Seif":     "Seifim",
		"Se'if":    "Se'ifim",
		"Seif Katan": "Seifim Katanim",
		"Mishnah":  "Mishnayot",
		"Mishna":   "Mishnayot",
		"Chelek":   "Chelekim",
		"Parasha":  "Parshiot",
		"Parsha":   "Parshiot",
		"Pasuk":    "Psukim",
		"Midrash":  "Midrashim",
		"Teshuva":  "Teshuvot",
		"Aliyah":   "Aliyot",
		"Tikun":    "Tikunim",
	}

	return known[s] if s in known else str(s) + "s"


def hebrew_term(s):
	from sefaria.model import library
	from sefaria.system.exceptions import BookNameError

	if is_hebrew(s):
		return s

	term = library.get_simple_term_mapping().get(s)
	if term:
		return term["he"]
	else:
		try:
			# If s is a text title, look for a stored Hebrew title
			i = library.get_index(s)
			return i.get_title("he")
		except BookNameError:
			return ''


def hebrew_parasha_name(value):
	"""
	Returns a Hebrew ref for the english ref passed in.
	"""
	from sefaria.model import Term, library
	if not value:
		return ""
	if "-" in value:
		if value == "Lech-Lecha":
			return hebrew_parasha_name(value.replace("-", " "))
		else:
			names = value.split("-")
			return ("-").join(map(hebrew_parasha_name, names))
	else:
		try:
			parasha = library.get_simple_term_mapping().get(value)["he"]
		except Exception as e:
			logger.error(e.message)
			parasha = value
		return parasha
