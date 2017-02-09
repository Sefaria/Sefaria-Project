# -*- coding: utf-8 -*-
import pytest

from sefaria.client.wrapper import get_links
from sefaria.model import *

def setup_module(module): 
    pass


class Test_get_links():

    def test_get_links_on_range(self):
        x = len(get_links("Exodus 2:3"))
        y = len(get_links("Exodus 2:4"))
        assert len(get_links("Exodus 2:3-4")) == (x+y)


class Test_links_from_get_text():

    def test_links_from_padded_ref(self):
        t1 = TextFamily(Ref("Exodus ")).contents()
        t2 = TextFamily(Ref("Exodus 1")).contents()

        assert len(t1["commentary"]) == len(t2["commentary"])
