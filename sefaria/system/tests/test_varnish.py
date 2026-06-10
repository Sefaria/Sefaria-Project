from sefaria.settings import USE_VARNISH

if USE_VARNISH:
    import sefaria.system.varnish.wrapper as v
    from sefaria.model import Ref

    class Test_Varnish(object):

        def test_url_regex(self):
            if USE_VARNISH:
                assert v.url_regex(Ref("Exodus 15")) == r'Exodus(\\.15$|\\.15\\.)'
                assert v.url_regex(Ref("Exodus 15:15-17")) == r'Exodus(\\.15\\.15$|\\.15\\.15\\.|\\.15\\.16$|\\.15\\.16\\.|\\.15\\.17$|\\.15\\.17\\.)'
                assert v.url_regex(Ref("Yoma 14a")) == r'Yoma(\\.14a$|\\.14a\\.)'
                assert v.url_regex(Ref("Yoma 14a:12-15")) == r'Yoma(\\.14a\\.12$|\\.14a\\.12\\.|\\.14a\\.13$|\\.14a\\.13\\.|\\.14a\\.14$|\\.14a\\.14\\.|\\.14a\\.15$|\\.14a\\.15\\.)'
                assert v.url_regex(Ref("Yoma")) == r'Yoma($|\\.)'
                assert v.url_regex(Ref("Rashi on Genesis 1.1")) == r'Rashi\\_on\\_Genesis(\\.1\\.1$|\\.1\\.1\\.)'