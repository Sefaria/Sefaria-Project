from sefaria.utils.util import find_all_html_elements_indices, truncate_string
from sefaria.image_generator import html_to_text_canonical

class TestFindAllHtmlElementsIndices:

    def test_empty_input(self):
        input_string = ""
        expected_output = {}
        assert find_all_html_elements_indices(input_string) == expected_output

    def test_no_html_elements(self):
        input_string = "This is a test string without any HTML elements."
        expected_output = {}
        assert find_all_html_elements_indices(input_string) == expected_output

    def test_single_html_element(self):
        input_string = "<b>This is a paragraph.</b>"
        expected_output = {2: 0, 26: 23}
        assert find_all_html_elements_indices(input_string) == expected_output

    def test_multiple_html_elements(self):
        input_string = '<a href="sefaria data-ref="sefaria">This is a <b>test</b> string with <i>HTML</i> elements.</a>'
        expected_output = {35: 0, 48: 46, 56: 53, 72: 70, 80: 77, 94: 91}
        assert find_all_html_elements_indices(input_string) == expected_output


class TestTruncateString:

    def test_short_string(self):
        string = "This is a short string."
        min_length = 10
        max_length = 25
        expected_output = "This is a short string."
        assert truncate_string(string, min_length, max_length) == expected_output

    def test_long_string_without_break_chars(self):
        string = "This is a long string without any break characters."
        min_length = 10
        max_length = 20
        expected_output = "This is a long…"
        assert truncate_string(string, min_length, max_length) == expected_output

    def test_long_string_with_break_chars(self):
        string = "This is a long string, which has multiple break characters, like .,;."
        min_length = 10
        max_length = 25
        expected_output = "This is a long string…"
        assert truncate_string(string, min_length, max_length) == expected_output

    def test_long_string_with_html_elements(self):
        string = '<b>This is a long string with <sub class="footnote">HTML</sup> attributes.</b>'
        min_length = 10
        max_length = 35
        expected_output = "<b>This is a long string with…"
        assert truncate_string(string, min_length, max_length) == expected_output

    def test_string_length_equals_max(self):
        string = 'string with length of 24'
        min_length = 10
        max_length = 24
        expected_output = "string with length of 24"
        assert truncate_string(string, min_length, max_length) == expected_output

    def test_long_string_with_html_closing_tag_after_max_length(self):
        string = 'This is a long string aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa <i>a</i>'
        min_length = 10
        max_length = 22
        expected_output = "This is a long string…"
        assert truncate_string(string, min_length, max_length) == expected_output


def test_html_to_text_canonical_cases():
    cases = [
        ("nbsp_decodes_to_unicode_nbsp", "a&nbsp;b", "a\u00a0b"),
        ("thinsp_decodes_to_unicode_thin_space", "a&thinsp;b", "a\u2009b"),
        ("numeric_entities_decode", "x&#160;y&#x2009;z", "x\u00a0y\u2009z"),
        ("br_becomes_newline", "a<br>b<br />c<br/>d", "a\nb\nc\nd"),
        ("literal_newlines_removed_before_br", "a\nb<br>c", "ab\nc"),
        ("div_and_p_close_become_newlines", "<div>a</div><p>b</p>c", "a\nb\nc"),
        ("table_cells_become_tabs_and_rows_newlines", "<table><tr><td>1</td><td>2</td></tr></table>", "1\t2\t\n"),
        ("collapse_duplicate_blank_lines", "a<br><br>b", "a\nb"),
    ]

    for name, inp, expected in cases:
        assert html_to_text_canonical(inp) == expected, name
