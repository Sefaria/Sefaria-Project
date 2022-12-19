# -*- coding: utf-8 -*-

import pytest
from sefaria.model import *
from sefaria.helper.legacy_ref import legacy_ref_parser_handler, ZoharLegacyRefParser, NoLegacyRefParserError
from sefaria.system.database import db
from sefaria.system.exceptions import PartialRefInputError


@pytest.fixture(scope="module", autouse=True)
def test_zohar_index():
    """
    Creates depth 2 Zohar index which will not be able to parse depth 3 refs
    @return:
    """
    en_title = "TestZohar"
    schema = {
        "key": en_title,
        "titles": [
            {
                "lang": "en",
                "text": en_title,
                "primary": True
            },
            {
                "lang": "he",
                "text": 'זהר לא אמיתי',
                "primary": True
            }
        ],
        "nodeType": "JaggedArrayNode",
        "depth": 2,
        "addressTypes": ["Integer", "Integer"],
        "sectionNames": ["Chapter","Verse"]
    }
    index_dict = {
        "schema": schema,
        "title": en_title,
        "categories": ["Kabbalah"],
    }
    i = Index(index_dict)
    i.save()

    yield i

    i.delete()


@pytest.fixture(scope="module")
def segment_level_zohar_tref(test_zohar_index):
    return "TestZohar.1.15a.1"


@pytest.fixture(scope="module")
def ranged_zohar_tref(test_zohar_index):
    return "TestZohar.1.15a.1-6"


@pytest.fixture(scope="module")
def tref_no_legacy_parser():
    return "Genesis, Vayelech 3"


def get_book(tref):
    book = Ref(tref).book
    if book == "TestZohar":
        return "Zohar"
    return book


def get_partial_ref_error(tref):
    try:
        Ref(tref)
    except PartialRefInputError as err:
        return err


class TestLegacyRefs:
    """
    At the time of writing, these tests should all fail, as there is still no Zohar refactor and no zohar mapping
    """
    def test_old_zohar_ref_fail(self, segment_level_zohar_tref):
        # Simply tests that an old Zohar ref fails
        with pytest.raises(PartialRefInputError):
            Ref(segment_level_zohar_tref)

    def test_old_zohar_ranged_ref_fail(self, ranged_zohar_tref):
        # Simply tests that an old ranged Zohar ref fails
        with pytest.raises(PartialRefInputError):
            Ref(ranged_zohar_tref)

    def test_old_zohar_partial_ref(self, segment_level_zohar_tref):
        # tests that once a ranged ref fails that its partial ref exception contains the appropriate data
        err = get_partial_ref_error(segment_level_zohar_tref)
        book = get_book(err.matched_part)
        assert book == "Zohar"

    def test_old_zohar_partial_ref_legacy_loader(self, segment_level_zohar_tref):
        err = get_partial_ref_error(segment_level_zohar_tref)
        book = get_book(err.matched_part)
        assert type(legacy_ref_parser_handler[book] == ZoharLegacyRefParser)
            
    def test_old_zohar_partial_ref_legacy_parsing(self, segment_level_zohar_tref):
        err = get_partial_ref_error(segment_level_zohar_tref)
        book = get_book(err.matched_part)
        parser = legacy_ref_parser_handler[book]
        convertedRef = parser.parse(segment_level_zohar_tref)
        assert "orig_ref" in convertedRef # or hasattr?
        assert "legacy_converted" in convertedRef
        assert convertedRef.normal() == "Zohar, Bereshit.1.1-2"

    def test_random_partial_ref_legacy_parsing(self, tref_no_legacy_parser):
        err = get_partial_ref_error(tref_no_legacy_parser)
        with pytest.raises(NoLegacyRefParserError):
            legacy_ref_parser_handler[Ref(err.matched_part).book]
