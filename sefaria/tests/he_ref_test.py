# -*- coding: utf-8 -*-
import pytest

from .. import texts as t


def setup_module(module):
	global texts
	global refs
	texts = {}
	refs = {}
	texts['false_pos'] = u"תלמוד לומר (דברים טז, יח) שופטים תתן שוטרים"
	texts['bible_ref'] = u"אם נביא הוא נבואתו מסתלקת ממנו מדבורה דכתיב (שופטים ה, ז) חדלו פרזון בישראל"
	texts['bible_mid'] = u"יש דברים טז, יח ועוד"
	texts['bible_begin'] = u"דברים טז, יח וכל מה שכמוהו"
	texts['bible_end'] = u"אין כמו דברים טז, יח"
	#texts['2ref'] = u"This is a test of a Brachot 7b and also of an Isaiah 12:3."

class Test_get_titles_in_text():

	def test_bible_ref(self):
		res = t.get_titles_in_text(texts['bible_ref'], "he")
		assert set(res) >= set([u"שופטים"])

		res = t.get_titles_in_text(texts['false_pos'], "he")
		assert set(res) >= set([u"שופטים", u"דברים"])

	def test_positions(self):
		for a in ['bible_mid','bible_begin', 'bible_end']:
			assert set([u"דברים"]) <= set(t.get_titles_in_text(texts[a],"he"))



class Test_get_refs_in_text():

	def test_positions(self):
		for a in ['bible_mid', 'bible_begin', 'bible_end']:
			ref = t.get_refs_in_text(texts[a])
			assert 1 == len(ref)
			assert ref[0] == u"דברים טז, יח"

	def test_false_positive(self):
		ref = t.get_refs_in_text(texts['false_pos'])
		assert 1 == len(ref)
		assert ref[0] == u"דברים טז, יח"

"""
class Test_parse_ref():

	def test_short_names(self):
		ref = t.parse_ref(u"Exo. 3:1")
		assert ref['book'] == u"Exodus"

	def test_bible_range(self):
		ref = t.parse_ref(u"Job.2:3-3:1")
		assert ref['toSections'] == [3,1]

	def test_short_bible_refs(self):
		assert t.parse_ref(u"Exodus") == t.parse_ref(u"Exodus 1")

	def test_short_talmud_refs(self):
		full_ref = t.parse_ref(u"Sanhedrin 2a")
		assert full_ref == t.parse_ref(u"Sanhedrin 2")
		assert full_ref == t.parse_ref(u"Sanhedrin")

class Test_make_ref():
	pass

class Test_norm_ref():
	pass

class Test_url_ref():
	pass

"""
