# -*- coding: utf-8 -*-
import pytest

from .. import texts as t


def setup_module(module):
	global texts
	global refs
	texts = {}
	refs = {}
	texts['bible_mid'] = u"Here we have Genesis 3:5 may it be blessed"
	texts['bible_begin'] = u"Genesis 3:5 in the house"
	texts['bible_end'] = u"Let there be Genesis 3:5"
	texts['2ref'] = u"This is a test of a Brachot 7b and also of an Isaiah 12:13."
	texts['barenum'] = u"In this text, there is no reference but there is 1 bare number."


class Test_get_titles_in_text():

	def test_no_bare_number(self):
		res = t.get_titles_in_text(texts['barenum'])
		assert set(res) == set()

	def test_positions(self):
		for a in ['bible_mid','bible_begin', 'bible_end']:
			assert set(['Genesis']) <= set(t.get_titles_in_text(texts[a]))

	def test_multi_titles(self):
		res = t.get_titles_in_text(texts['2ref'])
		assert set(res) >= set(['Brachot','Isaiah'])

class Test_get_refs_in_text():

	def test_bare_digits(self):
		assert set() == set(t.get_refs_in_text(texts['barenum'])) # Fixed in 5a4b813819ef652def8360da2ac1b7539896c732

	def test_positions(self):
		for a in ['bible_mid','bible_begin', 'bible_end']:
			ref = t.get_refs_in_text(texts[a])
			assert 1 == len(ref)
			assert ref[0] == "Genesis 3:5"

	def test_multiple(self):
		ref = t.get_refs_in_text(texts['2ref'])
		assert 2 == len(ref)
		assert set(['Brachot 7b','Isaiah 12:13']) == set(t.get_refs_in_text(texts['2ref']))


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

	def test_map(self):
		assert t.parse_ref("Me'or Einayim 24") == t.parse_ref("Me'or Einayim 24")

	def test_parsed_cache(self):
		parsed = t.parse_ref("Ramban on Genesis 1")
		assert "Ramban on Genesis 1" in t.parsed
		assert parsed == t.parse_ref("Ramban on Genesis 1")
		parsed_no_pad = t.parse_ref("Ramban on Genesis 1", pad=False)
		assert "Ramban on Genesis 1|NOPAD" in t.parsed
		assert parsed_no_pad == t.parse_ref("Ramban on Genesis 1", pad=False)
		assert parsed != parsed_no_pad

	""" comma currently broken
	def test_comma(self):
		assert t.parse_ref("Me'or Einayim 24") == t.parse_ref("Me'or Einayim, 24")
	"""

class Test_make_ref():
	pass

class Test_norm_ref():
	pass

class Test_url_ref():
	pass

