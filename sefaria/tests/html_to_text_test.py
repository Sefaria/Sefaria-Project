# -*- coding: utf-8 -*-
from sefaria.image_generator import html_to_text_canonical


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

