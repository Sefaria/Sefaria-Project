# -*- coding: utf-8 -*-

import django
django.setup()
import pytest
from sefaria.system.exceptions import InputError
import regex as re
from sefaria.utils.hebrew import is_hebrew

import sefaria.model as m


class Test_find_citation_in_text(object):

    def test_regex_string_en_js(self):
        st = 'Ruth 1 1'
        title = 'Ruth'

        lang = "he" if is_hebrew(title) else "en"
        res = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False)
        match = re.search(res, st)
        match_string = '' if not match else match.group()
        print(match_string)
        assert m.Ref(st) in [r for r in m.library.get_refs_in_string(match_string)]
        assert [r for r in m.library.get_refs_in_string(match_string)] == m.library.get_refs_in_string('('+st+')')

    def test_regex_string_he_js_with_prefix(self):
        st = 'ובויקרא כ"ה'
        title = 'ויקרא'

        lang = "he" if is_hebrew(title) else "en"
        res = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False)
        res_no_comments = re.sub('\s+', '', re.sub('\s*?#.*?\n', '', res))
        match = re.search(res_no_comments, st)
        match_string = '' if not match else match.group()
        print(match_string)
        assert [r for r in m.library.get_refs_in_string('(' + match_string + ')')] == m.library.get_refs_in_string('('+st+')')

