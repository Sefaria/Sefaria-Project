# -*- coding: utf-8 -*-

import pytest
from sefaria.model import *


def setup_module(module):
    library.get_toc_tree()
    library.build_full_auto_completer()
    library.build_ref_auto_completer()
    library.build_lexicon_auto_completers()
    library.build_cross_lexicon_auto_completer()


@pytest.mark.django_db()
class Test_Complete_Method(object):
    # Does limit return exactly the right number of results?
    @pytest.mark.parametrize("ac,search", [
        (library.full_auto_completer("en"), "cor"),
        (library.full_auto_completer("he"), "תור"),
        (library.cross_lexicon_auto_completer(), "גדד")
    ])
    @pytest.mark.parametrize("limit", [5, 10, 15])
    def test_limits(self, ac, search, limit):
        assert len(ac.complete(search, limit)[0]) == limit

    # Are all string titles accounted for in objects?
    # Are all object titles accounted for in string titles?
    @pytest.mark.parametrize("ac,search", [
        (library.full_auto_completer("en"), "cor"),
        (library.full_auto_completer("he"), "תור"),
        (library.cross_lexicon_auto_completer(), "גדד")
    ])
    @pytest.mark.parametrize("limit", [10, 0])
    def test_object_completness(self,  ac, search, limit):
        [strs, objs] = ac.complete(search, limit)
        o_set = set([o["title"] for o in objs])
        s_set = set(strs)
        assert o_set == s_set

    # Do we swap languages for non matches?
    @pytest.mark.parametrize("he_str,en_str", [
        ("גשמןקך", "daniel"),
        ("דםמעד", "songs"),
        ("קבלה", "eckv"),
        ("יוסף", "hux;")
    ])
    def test_language_flip(self,he_str,en_str):
        assert library.full_auto_completer("he").complete(he_str,10)[0] == library.full_auto_completer("en").complete(en_str, 10)[0]


    # Does 0 limit work to have no limits?
    # How do we test that?
    # Do individual dictionary autompleters return results?
    # Do cross dictionary ac return results from all dicts?
    # Are all refs noted as such in name api?
    # Do dictionary entries resolve in name api?
