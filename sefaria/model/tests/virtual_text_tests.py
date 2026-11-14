"""
Tests for virtual texts, like dictionries
Handling virtual schema nodes
Refs pointing to virtual schemas, etc

"""

import pytest

from sefaria.model import *
from sefaria.system.exceptions import DictionaryEntryNotFoundError


class Test_VirtualRefs:
    def test_identity(self):
        assert Ref("Jastrow,_אַבִּיר.1").url() == "Jastrow,_אַבִּיר.1"

    def test_parse_of_base(self):
        Ref("Jastrow")

    def test_parse_of_section(self):
        r = Ref("Jastrow, אֱגוּזָא")
        assert r.sections == []
        assert r.index_node.full_title("en") == "Jastrow, אֱגוּזָא"
        assert r.normal() == "Jastrow, אֱגוּזָא"

    def test_section_identity(self):
        r1 = Ref("Jastrow, אֱגוּזָא")
        r2 = Ref("Jastrow,_אֱגוּזָא")
        assert r1 == r2

    def test_parse_of_segment(self):
        r = Ref("Jastrow, אֱגוּזָא 1")
        assert r.sections == [1]
        assert r.index_node.full_title("en") == "Jastrow, אֱגוּזָא"
        assert r.normal() == "Jastrow, אֱגוּזָא 1"

    def test_segment_identity(self):
        r1 = Ref("Jastrow, אֱגוּזָא 1")
        r2 = Ref("Jastrow,_אֱגוּזָא.1")
        assert r1 == r2

    def test_entry_that_does_not_match_the_entry_regex_raises_input_error(self):
        """A dictionary title followed by something that is not an entry address must fail as
        an input error. It used to raise AttributeError from DictionaryEntryNode, and the
        reader catchall only converts InputError to a 404, so the URL became a 500.
        This is the request behind the 2026-11-14T14:08Z sefaria-web 500.
        """
        with pytest.raises(DictionaryEntryNotFoundError):
            Ref("Jastrow,_כָּלוּל.1</a>")

    def test_entry_with_an_extra_section_raises_input_error(self):
        with pytest.raises(DictionaryEntryNotFoundError):
            Ref("Jastrow,_כָּלוּל.1.2")
