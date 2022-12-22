# -*- coding: utf-8 -*-

import pytest
from sefaria.model import *
from sefaria.helper.legacy_ref import legacy_ref_parser_handler, MappingLegacyRefParser, NoLegacyRefParserError, LegacyRefParsingData, LegacyRefParserMappingKeyError
from sefaria.system.database import db
from sefaria.system.exceptions import PartialRefInputError


@pytest.fixture(scope="module", autouse=True)
def test_zohar_index(test_index_title):
    """
    Creates depth 2 Zohar index which will not be able to parse depth 3 refs
    @return:
    """
    en_title = test_index_title
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


@pytest.fixture(scope="module", autouse=True)
def test_zohar_mapping_data(test_index_title, segment_level_zohar_tref, mapped_segment_level_zohar_tref):
    lrpd = LegacyRefParsingData({
        "index_title": test_index_title,
        "data": {
            "mapping": {
                segment_level_zohar_tref: mapped_segment_level_zohar_tref,
                f"{test_index_title} 1:15a:2": f"{test_index_title}:1:42",
                f"{test_index_title} 1:15a:3": f"{test_index_title}:1:43",
            },
        },
    })
    lrpd.save()

    yield lrpd

    lrpd.delete()


@pytest.fixture(scope="module")
def test_index_title():
    return "TestZohar"


@pytest.fixture(scope="module")
def segment_level_zohar_tref(test_zohar_index):
    return f"{test_zohar_index.title} 1:15a:1"


@pytest.fixture(scope="module")
def mapped_segment_level_zohar_tref(test_zohar_index):
    return f"{test_zohar_index.title}:1:42"


@pytest.fixture(scope="module")
def ranged_zohar_tref(test_zohar_index):
    return f"{test_zohar_index.title} 1:15a:1-3"

@pytest.fixture(scope="module")
def mapped_ranged_zohar_tref(test_zohar_index):
    return f"{test_zohar_index.title} 1:42-3"


@pytest.fixture(scope="module")
def tref_no_legacy_parser():
    return "Genesis, Vayelech 3"


@pytest.fixture(scope="module")
def old_and_new_trefs(request, test_index_title):
    old_ref, new_ref = request.param
    # if new_ref is None, means mapping doesn't exist
    new_ref = new_ref and f"{test_index_title} {new_ref}"
    return f"{test_index_title} {old_ref}", new_ref


def get_book(tref):
    return Ref(tref).index.title


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

    def test_old_zohar_partial_ref(self, test_index_title, segment_level_zohar_tref):
        # tests that once a ranged ref fails that its partial ref exception contains the appropriate data
        err = get_partial_ref_error(segment_level_zohar_tref)
        book = get_book(err.matched_part)
        assert book == test_index_title

    def test_old_zohar_partial_ref_legacy_loader(self, segment_level_zohar_tref):
        err = get_partial_ref_error(segment_level_zohar_tref)
        book = get_book(err.matched_part)
        assert type(legacy_ref_parser_handler[book] == MappingLegacyRefParser)

    @pytest.mark.parametrize("old_and_new_trefs", [
        ["1:15a:1", "1:42"],
        ["1:15a:2", "1:42"],
        ["1:15a:3", "1:43"],
        ["1:15a:1-2", "1:42"],
        ["1:15a:1-3", "1:42-43"],
        ["123:456:789", None],
        ["1:15a:1-4", None],
    ], indirect=True)
    def test_old_zohar_partial_ref_legacy_parsing(self, old_and_new_trefs):
        old_ref, new_ref = old_and_new_trefs
        err = get_partial_ref_error(old_ref)
        book = get_book(err.matched_part)
        parser = legacy_ref_parser_handler[book]

        if new_ref is None:
            with pytest.raises(LegacyRefParserMappingKeyError):
                parser.parse(old_ref)
        else:
            converted_ref = parser.parse(old_ref)
            assert converted_ref.legacy_tref == old_ref
            assert converted_ref.normal() == Ref(new_ref).normal()

    def test_random_partial_ref_legacy_parsing(self, tref_no_legacy_parser):
        err = get_partial_ref_error(tref_no_legacy_parser)
        with pytest.raises(NoLegacyRefParserError):
            legacy_ref_parser_handler[Ref(err.matched_part).book]
