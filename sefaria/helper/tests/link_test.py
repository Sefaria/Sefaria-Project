import pytest

from sefaria.model import *
from sefaria.helper.link import rebuild_commentary_links


class Link_Test(object):

    def test_rebuild_commentary_links(self):
        rebuild_commentary_links("Rashi on Menachot", 1)
        rebuild_commentary_links("Rashi on Exodus", 1)
