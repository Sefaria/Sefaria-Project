# -*- coding: utf-8 -*-

import django
django.setup()
import pytest
from sefaria.system.exceptions import InputError
import regex as re
from sefaria.utils.hebrew import is_hebrew
import requests

import sefaria.model as m

base_url = 'https://www.sefaria.org.il/'
class Test_find_citation_in_text(object):

    def test_regex_string_en_js(self):
        st = 'Ruth 1 1'
        title = 'Ruth'

        lang = "he" if is_hebrew(title) else "en"
        reg_str = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False)
        reg = re.compile(reg_str, re.VERBOSE)
        match = reg.search(st)
        assert m.Ref(match.group(1)).normal() == "Ruth 1:1"

    def test_regex_string_he_js_with_prefix(self):
        st = 'ובויקרא כ"ה'
        title = 'ויקרא'

        lang = "he" if is_hebrew(title) else "en"
        reg_str = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False)
        reg = re.compile(reg_str, re.VERBOSE)
        match = reg.search(st)
        assert m.Ref(match.group(1)).normal() == "Leviticus 25"

    def test_regex_string_he_in_parentheses_only(self):
        st1 = '(ובויקרא כ"ה)'
        st2 = 'ובויקרא כ"ה'
        title = 'ויקרא'

        lang = "he" if is_hebrew(title) else "en"
        reg_str = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False, parentheses=True)
        reg = re.compile(reg_str, re.VERBOSE)
        match = reg.search(st1)
        assert m.Ref(match.group(1)).normal() == "Leviticus 25"

        match = reg.search(st1)
        assert m.Ref(match.group(1)).normal() == "Leviticus 25"

    def test_regex_string_he_in_parentheses(self):
        st3 = '(בדברים לב ובספרות ג ב)'
        titles = ['דברים', 'רות']

        for title in titles:
            lang = "he" if is_hebrew(title) else "en"
            reg_str = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False, parentheses=True)
            reg = re.compile(reg_str, re.VERBOSE)

            match = reg.search(st3)
            if title == 'דברים':
                assert m.Ref(match.group(1)).normal() == "Deuteronomy 32"
            else:
                assert match is None

    def test_regex_string_he_in_parentheses_3(self):
        st3 = '<p>[שיר השירים א ירושלמי כתובות (דף כח:) בשורות א]'
        titles = ['ירושלמי כתובות', 'שיר השירים']

        for title in titles:
            lang = "he" if is_hebrew(title) else "en"
            reg_str = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False,
                                             parentheses=True)
            reg = re.compile(reg_str, re.VERBOSE)
            match = reg.search(st3)
            if title == "ירושלמי כתובות":
                assert m.Ref(match.group(1)).normal() == "Jerusalem Talmud Ketubot 28b"
            else:
                assert m.Ref(match.group(1)).normal() == "Song of Songs 1"