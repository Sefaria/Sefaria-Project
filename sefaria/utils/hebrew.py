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


### Change to all caps for constants
GERESH = u"\u05F3"
GERSHAYIM = u"\u05F4"


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

	n = re.sub(u'[\u05F4"]', '', n)  # remove gershayim
	return sum(map(heb_to_int, n))


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


def encode_small_hebrew_numeral(n):
	"""
	Takes an integer under 1200 and returns a string encoding it as a Hebrew numeral.
	"""

	if n >= 1200:
		raise ValueError, "Tried to encode small numeral >= 1200."
	else:
		return u''.join(map(int_to_heb, break_int_magnitudes(n, 100)))


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


def encode_hebrew_daf(daf):
	"""
	Turns a daf string ("21a") to a hebrew daf string ("כא.")
	"""
	daf, amud = daf[:-1], daf[-1]
	amud_mark = {"a": ".", "b": ":"}[amud]
	return encode_hebrew_numeral(int(daf), punctuation=False) + amud_mark


def strip_nikkud(rawString):
	return rawString.replace(r"[\u0591-\u05C7]", "")


#todo: rewrite to handle edge case of hebrew words in english texts, and latin characters in Hebrew text
def is_hebrew(s):
	if regex.search(u"\p{Hebrew}", s):
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
	"""
	Simple translations for common Hebrew words
	"""
	categories = {
		"Torah":                u"תורה",
		"Tanakh":               u'תנ"ך',
		"Tanakh":               u'תנ"ך',
		"Prophets":             u"נביאים",
		"Writings":             u"כתובים",
		"Commentary":           u"מפרשים",
		"Targum":               u"תרגומים",
		"Mishnah":              u"משנה",
		"Tosefta":              u"תוספתא",
		"Talmud":               u"תלמוד",
		"Bavli":                u"בבלי",
		"Yerushalmi":           u"ירושלמי",
		"Rif":		            u'רי"ף',
		"Kabbalah":             u"קבלה",
		"Halakha":              u"הלכה",
		"Halakhah":             u"הלכה",
		"Law":					u"הלכה",
		"Midrash":              u"מדרש",
		"Aggadic Midrash":      u"מדרש אגדה",
		"Halachic Midrash":     u"מדרש הלכה",
		"Midrash Rabbah":       u"מדרש רבה",
		"Responsa":             u'שו"ת',
		"Other":                u"שונות",
		"Siddur":               u"סידור",
		"Liturgy":              u"תפילה",
		"Piyutim":              u"פיוטים",
		"Musar":                u"ספרי מוסר",
		"Chasidut":             u"חסידות",
		"Parshanut":            u"פרשנות",
		"Philosophy":           u"מחשבת ישראל",
		"Maharal":              u'מהר"ל מפראג',
		"Apocrypha":            u"ספרים חיצונים",
		"Seder Zeraim":         u"סדר זרעים",
		"Seder Moed":           u"סדר מועד",
		"Seder Nashim":         u"סדר נשים",
		"Seder Nezikin":        u"סדר נזיקין",
		"Seder Kodashim":       u"סדר קדשים",
		"Seder Toharot":        u"סדר טהרות",
		"Seder Tahorot":        u"סדר טהרות",
		"Dictionary":           u"מילון",
		"Early Jewish Thought": u"מחשבת ישראל קדומה",
		"Minor Tractates":      u"מסכתות קטנות",
		"Rosh":                 u'רא"ש',
		"Maharsha":             u'מהרשא',
		"Rashba":	        u'רשב"א',
		"Maharam Shif":		u'מהר"ם שיף',
		"Rambam":	        u'רמב"ם',
		"Yad Ramah":		u"יד רמה",
		"Radbaz":		u'רדב"ז',
		"Tosafot Yom Tov":      u"תוספות יום טוב",
		"Chidushei Halachot":   u"חידושי הלכות",
		"Chidushei Agadot":     u"חידושי אגדות",
		"Tiferet Shmuel":       u"תפארת שמואל",
		"Korban Netanel":       u"קרבן נתנאל",
		"Pilpula Charifta":     u"פילפולא חריפתא",
		"Divrey Chamudot":      u"דברי חמודות",
		"Maadaney Yom Tov":     u"מעדני יום טב",
		"Shita Mekubetzet":     u'שיטה מקובצת',
		"Modern Works":		u"יצירות מודרניות",
		"Maharshal":		u'מהרש"ל',
		"Gur Aryeh":		u'גור אריה',
		"Tur and Commentaries": u'טור ומפרשים',
		"Yachin": u'יכין',
		"Boaz": u'בועז',
        "Harchev Davar": u'הרחב דבר'
	}

	pseudo_categories = {
		"Mishneh Torah":   u"משנה תורה",
		'Introduction':    u"הקדמה",
		'Sefer Madda':     u"ספר מדע",
		'Sefer Ahavah':    u"ספר אהבה",
		'Sefer Zemanim':   u"ספר זמנים",
		'Sefer Nashim':    u"ספר נשים",
		'Sefer Kedushah':  u"ספר קדושה",
		'Sefer Haflaah':   u"ספר הפלאה",
		'Sefer Zeraim':    u"ספר זרעים",
		'Sefer Avodah':    u"ספר עבודה",
		'Sefer Korbanot':  u"ספר קורבנות",
		'Sefer Taharah':   u"ספר טהרה",
		'Sefer Nezikim':   u"ספר נזיקין",
		'Sefer Kinyan':    u"ספר קניין",
		'Sefer Mishpatim': u"ספר משפטים",
		'Sefer Shoftim':   u"ספר שופטים",
		"Shulchan Arukh":  u"שולחן ערוך",
	}

	section_names = {
		"Chapter":          u"פרק",
		"Chapters":         u"פרקים",
		"Perek":            u"פרק",
		"Line":             u"שורה",
		"Negative Mitzvah": u"מצות לא תעשה",
		"Positive Mitzvah": u"מצות עשה",
		"Negative Mitzvot": u"מצוות לא תעשה",
		"Positive Mitzvot": u"מצוות עשה",
		"Daf":              u"דף",
		"Paragraph":        u"פסקה",
		"Parsha":           u"פרשה",
		"Parasha":          u"פרשה",
		"Parashah":         u"פרשה",
		"Seif":             u"סעיף",
		"Se'if":            u"סעיף",
		"Siman":            u"סימן",
		"Section":          u"חלק",
		"Verse":            u"פסוק",
		"Sentence":         u"משפט",
		"Sha'ar":           u"שער",
		"Gate":             u"שער",
		"Comment":          u"פירוש",
		"Phrase":           u"ביטוי",
		"Mishna":           u"משנה",
		"Chelek":           u"חלק",
		"Helek":            u"חלק",
		"Year":             u"שנה",
		"Masechet":         u"מסכת",
		"Massechet":        u"מסכת",
		"Letter":           u"אות",
		"Halacha":          u"הלכה",
		"Piska":            u"פסקה",
		"Seif Katan":       u"סעיף קטן",
		"Se'if Katan":      u"סעיף קטן",
		"Volume":           u"כרך",
		"Book":             u"ספר",
		"Shar":             u"שער",
		"Seder":            u"סדר",
		"Part":             u"חלק",
		"Pasuk":            u"פסוק",
		"Sefer":            u"ספר",
		"Teshuva":          u"תשובה",
		"Teshuvot":         u"תשובות",
		"Tosefta":          u"תוספתא",
		"Halakhah":         u"הלכה",
		"Kovetz":           u"קובץ",
		"Path":             u"נתיב",
		"Parshah":          u"פרשה",
		"Midrash":          u"מדרש",
		"Mitzvah":          u"מצוה",
		"Tefillah":         u"תפילה",
		"Torah":            u"תורה",
		"Perush":           u"פירוש",
		"Peirush":          u"פירוש",
		"Aliyah":           u"עלייה",
		"Tikkun":           u"תיקון",
		"Tikkunim":         u"תיקונים",
		"Hilchot":          u"הילכות",
		"Topic":            u"נושא",
		"Contents":         u"תוכן",
		"Article":	    u"סעיף",
		"Shoresh":	u"שורש",
		"Story":	u"סיפור",
		"Remez":	u"רמז"
	}

	words = dict(categories.items() + pseudo_categories.items() + section_names.items())

	if s in words:
		return words[s]

	# If s is a text title, look for a stored Hebrew title
	try:
		from sefaria.model import library, IndexSet, Term
		from sefaria.system.exceptions import BookNameError
		i = library.get_index(s)
		return i.get_title("he")
	except BookNameError:
		term = Term().load({'name': s})
		if term:
			return term.get_primary_title('he')
	return ''


def hebrew_parasha_name(value):
	"""
	Returns a Hebrew ref for the english ref passed in.
	"""
	from sefaria.model import Term
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
			term    = Term().load({"name": value, "scheme": "Parasha"})
			parasha = term.get_titles(lang="he")[0]
		except Exception, e:
			print e
			parasha   = value
		return parasha
