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
        res = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False)
        match = re.search(res, st)
        match_string = match.group()  # 'no match' if not match else match.group()
        resp = requests.get("https://www.sefaria.org.il/{}".format(match_string))
        assert resp.status_code == 200

    def test_regex_string_he_js_with_prefix(self):
        st = 'ובויקרא כ"ה'
        title = 'ויקרא'

        lang = "he" if is_hebrew(title) else "en"
        res = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False)
        res_no_comments = re.sub('\s+', '', re.sub('\s*?#.*?\n', '', res))
        match = re.search(res_no_comments, st)
        match_string = 'no match' if not match else match.group().replace(match.group(1), '')
        resp = requests.get("https://www.sefaria.org.il/{}".format(match_string))
        assert resp.status_code == 200

    def test_regex_string_he_in_parentheses_only(self):
        st1 = '(ובויקרא כ"ה)'
        st2 = 'ובויקרא כ"ה'
        title = 'ויקרא'

        lang = "he" if is_hebrew(title) else "en"
        res = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False, parentheses=1)
        res_no_comments = re.sub('\s+', '', re.sub('\s*?#.*?\n', '', res))

        match = re.search(res_no_comments, st1)
        match_string = '' if not match else match.group().replace(match.group(1), '')
        resp = requests.get("https://www.sefaria.org.il/{}".format(match_string))
        assert resp.status_code == 200

        match = re.search(res_no_comments, st2)
        match_string = 'no match' if not match else match.group().replace(match.group(1), '')
        resp = requests.get("https://www.sefaria.org.il/{}".format(match_string))
        assert resp.status_code == 404

    def test_regex_string_he_in_parentheses(self):
        st3 = '(בדברים לב ובספרות ג ב)'
        titles = ['דברים', 'רות']


        for title in titles:
            lang = "he" if is_hebrew(title) else "en"
            res = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False, parentheses=1)
            res_no_comments = re.sub('\s+', '', re.sub('\s*?#.*?\n', '', res))

            match = re.search(res_no_comments, st3)
            match_string = 'no match' if not match else match.group().replace(match.group(1), '')
            resp = requests.get("https://www.sefaria.org.il/{}".format(match_string))
            assert resp.status_code == 200 if title == 'דברים' else 400
            print(resp.url)
            assert resp.url == 'https://www.sefaria.org.il/Deuteronomy.32' if title == 'דברים' else 'https://www.sefaria.org.il/no%20match'

    def test_regex_string_he_in_parentheses_1(self):
        st3 = '(בדברים לב ובספרות ג ב'
        titles = ['דברים', 'רות']

        for title in titles:
            lang = "he" if is_hebrew(title) else "en"
            res = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False,
                                             parentheses=1)
            res_no_comments = re.sub('\s+', '', re.sub('\s*?#.*?\n', '', res))

            match = re.search(res_no_comments, st3)
            match_string = 'no match' if not match else match.group().replace(match.group(1), '')
            resp = requests.get("https://www.sefaria.org.il/{}".format(match_string))
            assert resp.status_code == 200 if title == 'דברים' else 400
            print(resp.url)
            assert resp.url == 'https://www.sefaria.org.il/Deuteronomy.32' if title == 'דברים' else 'https://www.sefaria.org.il/no%20match'

    def test_regex_string_he_in_parentheses_3(self):
        st3 = '<p>[שיר השירים א ירושלמי כתובות (דף כח:) בשורות א]'
        titles = ['ירושלמי כתובות', 'שיר השירים']

        for title in titles:
            lang = "he" if is_hebrew(title) else "en"
            res = m.library.get_regex_string(title, lang, for_js=True, anchored=False, capture_title=False,
                                             parentheses=1)
            res_no_comments = re.compile(res, re.VERBOSE)
            match = res_no_comments.search(st3)
            match_string = 'no match' if not match else match.group().replace(match.group(1), '')
            resp = requests.get("https://www.sefaria.org.il/{}".format(match_string))
            assert resp.status_code == 200
            print(resp.url)
            assert resp.url == 'https://www.sefaria.org.il/Song_of_Songs.1' if title == 'שיר השירים' else ''
