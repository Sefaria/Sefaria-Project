from sefaria.utils.util import find_all_html_elements_indices, truncate_string, strip_markdown
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


class TestStripMarkdown:

    def test_empty_and_none(self):
        assert strip_markdown("") == ""
        assert strip_markdown(None) == ""

    def test_plain_text_unchanged(self):
        assert strip_markdown("A short description of a book.") == "A short description of a book."

    def test_link(self):
        # real sample from the 'animals' topic description
        assert strip_markdown(
            "the [book of Genesis](https://www.sefaria.org/Genesis?tab=contents) opens"
        ) == "the book of Genesis opens"

    def test_multiple_links(self):
        assert strip_markdown(
            "[Genesis](/Genesis) and [Exodus](/Exodus)"
        ) == "Genesis and Exodus"

    def test_asterisk_emphasis(self):
        # real sample from the 'hoshana-rabbah' topic description
        assert strip_markdown("reciting *hoshanot,* prayers") == "reciting hoshanot, prayers"

    def test_underscore_emphasis(self):
        # real sample from the 'gabriel-the-angel' topic description
        assert strip_markdown("_The_ angel Gabriel") == "The angel Gabriel"

    def test_bold(self):
        assert strip_markdown("a **very** important idea") == "a very important idea"
        assert strip_markdown("a __very__ important idea") == "a very important idea"

    def test_emphasis_inside_link_text(self):
        assert strip_markdown("[*Genesis*](/Genesis)") == "Genesis"

    def test_html_stripped(self):
        assert strip_markdown("a <b>bold</b> claim") == "a bold claim"

    def test_hebrew_link(self):
        assert strip_markdown("[ספר בראשית](/Genesis) נפתח") == "ספר בראשית נפתח"


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
