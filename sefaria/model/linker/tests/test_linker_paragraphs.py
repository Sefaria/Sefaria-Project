import pytest
from sefaria.model.linker.linker import Linker


@pytest.mark.parametrize(
    "input_str,expected_paragraphs,expected_spans",
    [
        ("Paragraph one.\nParagraph two.", ["Paragraph one.", "Paragraph two."], [(14, 15)]),
        ("A\n\nB", ["A", "B"], [(1, 3)]),
        ("No breaks here", ["No breaks here"], []),
        ("First\nSecond\nThird", ["First", "Second", "Third"], [(5, 6), (12, 13)]),
        ("  Leading\n\nTrailing  ", ["  Leading", "Trailing  "], [(9, 11)]),
        ("Para1\n\nPara2\n\nPara3", ["Para1", "Para2", "Para3"], [(5, 7), (12, 14)]),
        ("\nStart with break", ['', "Start with break"], [(0, 1)]),
        ("End with break\n", ["End with break", ''], [(14, 15)]),
    ]
)
def test_break_input_into_paragraphs(input_str, expected_paragraphs, expected_spans):
    linker = Linker.__new__(Linker)  # bypass __init__
    paragraphs, spans = linker._Linker__break_input_into_paragraphs(input_str)
    assert paragraphs == expected_paragraphs
    assert spans == expected_spans
