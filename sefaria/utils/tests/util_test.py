from sefaria.utils.util import find_all_html_elements_indices, truncate_string

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
