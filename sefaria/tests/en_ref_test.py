# -*- coding: utf-8 -*-
import pytest

from .. import texts as t
import sefaria.system.cache as scache


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


class Test_get_refs_in_text():

	def test_bare_digits(self):
		assert set() == set(t.get_refs_in_string(texts['barenum'])) # Fixed in 5a4b813819ef652def8360da2ac1b7539896c732

	def test_positions(self):
		for a in ['bible_mid','bible_begin', 'bible_end']:
			ref = t.get_refs_in_string(texts[a])
			assert 1 == len(ref)
			assert ref[0] == "Genesis 3:5"

	def test_multiple(self):
		ref = t.get_refs_in_string(texts['2ref'])
		assert 2 == len(ref)
		assert set(['Brachot 7b','Isaiah 12:13']) == set(t.get_refs_in_string(texts['2ref']))

