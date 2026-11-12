"""
NumberedTitledTreeNode.after_title_regex(): the part of full_regex() that follows the title, compiled once and shared
by nodes with the same address structure. Matched after the title, it must match what full_regex(title, lang, ...)
matched for Ref parsing, and Ref parsing through it must give the same refs.
"""

import pytest

from sefaria.model import Ref, library

CASES = [
    ("Genesis", "en", "Genesis 1:3"),
    ("Genesis", "en", "Genesis.1.3"),
    ("Genesis", "en", "Genesis 1"),
    ("Shabbat", "en", "Shabbat 31a:2"),
    ("Rashi on Genesis", "en", "Rashi on Genesis 1:1:1"),
    ("בראשית", "he", "בראשית א:ג"),
    ("שבת", "he", "שבת לא."),
]


@pytest.mark.parametrize("title,lang,tref", CASES)
@pytest.mark.parametrize("kwargs", [{}, {"terminated": True}, {"strict": True}])
def test_matches_like_full_regex_after_the_title(title, lang, tref, kwargs):
    node = library.get_schema_node(title, lang)
    old = node.full_regex(title, lang, **kwargs).match(tref)
    new = node.after_title_regex(lang, **kwargs).match(tref, len(title))
    assert bool(old) == bool(new)
    if old:
        assert old.groupdict() == new.groupdict()
        assert old.end() == new.end()


def test_nodes_with_the_same_address_structure_share_one_compiled_regex():
    genesis = library.get_schema_node("Genesis", "en")
    exodus = library.get_schema_node("Exodus", "en")
    assert genesis.after_title_regex("en") is exodus.after_title_regex("en")


@pytest.mark.parametrize(
    "tref,normal,sections",
    [
        # Bavli tractates try the Mishnah first (checkFirst)
        ("Shabbat 7:1", "Mishnah Shabbat 7:1", [7, 1]),
        # Numbered structure node: the first number picks the child, whose title replaces it
        ("Orot, Seeds 2:3", "Orot, Seeds, The Wise is Preferable to Prophet 3", [3]),
        ("אורות, זרעונים ב:ג", "Orot, Seeds, The Wise is Preferable to Prophet 3", [3]),
        # Alt structure map node
        ("Genesis, Noach 3", "Genesis 7:17-8:14", [7, 17]),
    ],
)
def test_parsing_paths_that_match_after_the_title(tref, normal, sections):
    ref = Ref(tref)
    assert ref.normal() == normal
    assert ref.sections == sections
