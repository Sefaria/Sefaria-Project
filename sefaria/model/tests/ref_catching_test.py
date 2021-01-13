# -*- coding: utf-8 -*-

import django
django.setup()
import pytest
import regex as re
from sefaria.utils.hebrew import is_hebrew
import sefaria.model as m



class In(object):
    """
    Support test assertions for `library.get_regex_string`

    Examples:
        assert In('Ruth 1 1').looking_for('Ruth').finds("Ruth 1:1")
        assert In('(ובויקרא כ"ה)').looking_for('ויקרא').with_parenthesis().finds("Leviticus 25")
        assert In('ובויקרא כ"ה').looking_for('ויקרא').with_parenthesis().finds_nothing()

    """
    def __init__(self, haystack):
        self._haystack = haystack
        self._needle = ""
        self._with_parenthesis = False

    def looking_for(self, needle):
        self._needle = needle
        return self

    def with_parenthesis(self):
        self._with_parenthesis = True
        return self

    def finds(self, result):
        match = self._do_search()
        if not match:
            return False
        if m.Ref(match.group(1)).normal() == result:
            return True
        else:
            print("Mismatched.  Found: {}, which normalizes to: {}, not {}".format(match.group(1), m.Ref(match.group(1)).normal(), result))
            return False

    def finds_nothing(self):
        return not self._do_search()

    def _do_search(self):
        lang = "he" if is_hebrew(self._needle) else "en"
        reg_str = m.library.get_regex_string(
            self._needle, lang, for_js=True, anchored=False, capture_title=False, parentheses=self._with_parenthesis)
        reg = re.compile(reg_str, re.VERBOSE)
        match = reg.search(self._haystack)
        return match


class Test_find_citation_in_text(object):

    def test_regex_string_en_js(self):
        assert In('Ruth 1 1').looking_for('Ruth').finds("Ruth 1:1")

    def test_regex_string_he_js_with_prefix(self):
        assert In('ובויקרא כ"ה').looking_for('ויקרא').finds("Leviticus 25")

    def test_regex_string_he_in_parentheses_only(self):
        assert In('(ובויקרא כ"ה)').looking_for('ויקרא').with_parenthesis().finds("Leviticus 25")
        assert In('ובויקרא כ"ה').looking_for('ויקרא').with_parenthesis().finds_nothing()

    def test_regex_string_he_in_parentheses(self):
        assert In("(בדברים לב ובספרות ג ב)").looking_for('דברים').with_parenthesis().finds("Deuteronomy 32")
        assert In("(בדברים לב ובספרות ג ב)").looking_for('רות').with_parenthesis().finds_nothing()

    def test_regex_string_he_in_parentheses_3(self):
        assert In('<p>[שיר השירים א ירושלמי כתובות (דף כח:) בשורות א]')\
            .looking_for('ירושלמי כתובות').with_parenthesis().finds("Jerusalem Talmud Ketubot 28b")

        assert In('<p>[שיר השירים א ירושלמי כתובות (דף כח:) בשורות א]')\
            .looking_for('שיר השירים').with_parenthesis().finds("Song of Songs 1")

    @pytest.mark.xfail(reason="Linker doesn't know that it should look for either Mishnah or Talmud. This is as opposed to Ref instantiation where this ref would parse correctly because it would find the check_first field on the index.")
    def test_check_first(self):
        assert In('בבא מציעא פ"ד מ"ו, ועיין לעיל').looking_for('בבא מציעא').finds("Mishnah Bava Metzia 4:6")
