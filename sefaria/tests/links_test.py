# -*- coding: utf-8 -*-
import pytest

from .. import texts


def setup_module(module): 
	pass


class Test_get_links():

	def test_get_links_on_range(self):
		x = len(texts.get_links("Exodus 2:3"))
		y = len(texts.get_links("Exodus 2:4"))
		assert len(texts.get_links("Exodus 2:3-4")) == (x+y)


class Test_links_from_get_text():

	def test_links_from_padded_ref(self):
		t1 = texts.get_text("Exodus")
		t2 = texts.get_text("Exodus 1")
		assert len(t1["commentary"]) == len(t2["commentary"])