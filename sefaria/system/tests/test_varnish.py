
import sefaria.system.sf_varnish as v
from sefaria.model import Ref

class Test_Varnish(object):

    def test_url_regex(self):
        assert v.url_regex(Ref("Exodus 15")) == ur'Exodus(\\.15$|\\.15\\.)'
        assert v.url_regex(Ref("Exodus 15:15-17")) == ur'Exodus(\\.15\\.15$|\\.15\\.15\\.|\\.15\\.16$|\\.15\\.16\\.|\\.15\\.17$|\\.15\\.17\\.)'
        assert v.url_regex(Ref("Yoma 14a")) == ur'Yoma(\\.14a$|\\.14a\\.)'
        assert v.url_regex(Ref("Yoma 14a:12-15")) == ur'Yoma(\\.14a\\.12$|\\.14a\\.12\\.|\\.14a\\.13$|\\.14a\\.13\\.|\\.14a\\.14$|\\.14a\\.14\\.|\\.14a\\.15$|\\.14a\\.15\\.)'
        assert v.url_regex(Ref("Yoma")) == ur'Yoma($|\\.)'