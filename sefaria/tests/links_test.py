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