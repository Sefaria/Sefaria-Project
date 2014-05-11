# -*- coding: utf-8 -*-
import pytest

from .. import texts as t

def setup_module(module):
	global texts
	texts = {}
	texts['2ref'] = u"This is a test of a Brachot 7b and also of an Isaiah 12:13."
	texts['barenum'] = u"In this text, there is no reference but there is 1 bare number."  	

class TestGetTitlesInText():

	def test_catches_titles(self):
		res = t.get_titles_in_text(texts['2ref'])
		assert set(res) >= set(['Brachot','Isaiah'])
		
		res = t.get_titles_in_text(texts['barenum'])
		assert set(res) == set()

		


