# -*- coding: utf-8 -*-
import pytest

from sefaria.client.wrapper import get_links
from sefaria.model import *

def setup_module(module): 
    pass


class Test_get_links():

    def test_get_links_on_range(self):
        r3 = [l["ref"] + l["type"] for l in get_links("Exodus 2:3")]
        r4 = [l["ref"] + l["type"]  for l in get_links("Exodus 2:4")]
        r34 = [l["ref"] + l["type"]  for l in get_links("Exodus 2:3-4")]

        # All links in first segment present in range
        assert all([r in r34 for r in r3])
        # All links in second segment present in range
        assert all([r in r34 for r in r4])
        # No links in range absent from segments
        assert all(r in r3 or r in r4 for r in r34)


class Test_links_from_get_text():

    def test_links_from_padded_ref(self):
        t1 = TextFamily(Ref("Exodus ")).contents()
        t2 = TextFamily(Ref("Exodus 1")).contents()

        assert len(t1["commentary"]) == len(t2["commentary"])