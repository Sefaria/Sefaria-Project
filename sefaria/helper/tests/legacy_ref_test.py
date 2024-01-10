# -*- coding: utf-8 -*-

import pytest
import re
from sefaria.model import *
from sefaria.helper.legacy_ref import legacy_ref_parser_handler, MappingLegacyRefParser, NoLegacyRefParserError, LegacyRefParsingData, LegacyRefParserMappingKeyError
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
                "lang": "en",
                "text": "Alt Title Yo yo"
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
def test_zohar_mapping_data(test_index_title, url_test_index_title):
    lrpd = LegacyRefParsingData({
        "index_title": test_index_title,
        "data": {
            "mapping": {
                f"{url_test_index_title}.1.15a.1": f"{url_test_index_title}.1.42",
                f"{url_test_index_title}.1.15a.2": f"{url_test_index_title}.1.42",
                f"{url_test_index_title}.1.15a.3": f"{url_test_index_title}.1.43",
            },
        },
    })
    lrpd.save()

    yield lrpd

    lrpd.delete()


@pytest.fixture(scope="module")
def test_index_title():
    return "Test Zohar"


@pytest.fixture(scope="module")
def url_test_index_title(test_index_title):
    return test_index_title.replace(" ", "_")


@pytest.fixture(scope="module")
def old_and_new_trefs(request, url_test_index_title):
    old_ref, new_ref = request.param
    # if new_ref is None, means mapping doesn't exist
    new_ref = new_ref and f"{url_test_index_title}.{new_ref}"
    return f"{url_test_index_title}.{old_ref}", new_ref


def get_book(tref):
    return Ref(tref).index.title


def get_partial_ref_error(tref):
    try:
        Ref(tref)
    except PartialRefInputError as err:
        return err


@pytest.mark.parametrize("old_and_new_trefs", [
    ["1.15a.1", "1.42"],
    ["1.15a.2", "1.42"],
    ["1.15a.3", "1.43"],
    ["1.15a.1-2", "1.42"],
    ["1.15a.1-3", "1.42-43"],
    ["123.456.789", None],
    ["1.15a.1-4", None],
], indirect=True)
class TestLegacyRefsTestIndex:

    def test_old_zohar_ref_fail(self, old_and_new_trefs):
        """
        old Zohar ref fails

        @param old_and_new_trefs:
        @return:
        """
        old_tref, _ = old_and_new_trefs
        with pytest.raises(PartialRefInputError):
            Ref(old_tref)

    def test_old_zohar_partial_ref(self, test_index_title, old_and_new_trefs):
        """
        tests that once a ranged ref fails that its partial ref exception contains the appropriate data

        @param test_index_title:
        @param segment_level_zohar_tref:
        @return:
        """
        old_tref, _ = old_and_new_trefs
        err = get_partial_ref_error(old_tref)
        book = get_book(err.matched_part)
        assert book == test_index_title

    def test_old_zohar_partial_ref_legacy_loader(self, old_and_new_trefs):
        old_tref, _ = old_and_new_trefs
        err = get_partial_ref_error(old_tref)
        book = get_book(err.matched_part)
        assert type(legacy_ref_parser_handler[book] == MappingLegacyRefParser)

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

    def test_instantiate_ref_with_legacy_parse_fallback(self, url_test_index_title, old_and_new_trefs):
        old_tref, new_tref = old_and_new_trefs
        instantiate_legacy_refs_tester(url_test_index_title, old_tref, new_tref)


@pytest.mark.parametrize(('url_index_title', 'input_title', 'input_sections', 'output_tref'), [
    ["Test_Zohar", "Alt Title Yo yo", "1:15a:1", "Test_Zohar.1.42"],
    ["Test_Zohar", "Alt_Title_Yo_yo", "1:15a:1", "Test_Zohar.1.42"],
])
def test_instantiate_legacy_refs_parametrized(url_index_title, input_title, input_sections, output_tref):
    old_tref = f"{input_title}.{input_sections}"
    instantiate_legacy_refs_tester(url_index_title, old_tref, output_tref, old_title=input_title)


def instantiate_legacy_refs_tester(url_index_title, old_tref, new_tref, old_title=None):
    oref = Ref.instantiate_ref_with_legacy_parse_fallback(old_tref)
    if new_tref is None:
        assert oref.url() == url_index_title
        assert getattr(oref, 'legacy_tref', None) is None
    else:
        assert oref.url() == new_tref
        expected_legacy_tref = old_tref.replace(':', '.')
        if old_title:
            expected_legacy_tref = expected_legacy_tref.replace(old_title, url_index_title)
        assert oref.legacy_tref == expected_legacy_tref

    if new_tref is not None:
        oref = Ref.instantiate_ref_with_legacy_parse_fallback(new_tref)
        assert oref.url() == new_tref
        assert getattr(oref, 'legacy_tref', None) is None


class TestLegacyRefsRandomIndex:

    @pytest.fixture
    def tref_no_legacy_parser(self):
        return "Genesis, Vayelech 3"

    def test_random_partial_ref_legacy_parsing(self, tref_no_legacy_parser):
        err = get_partial_ref_error(tref_no_legacy_parser)
        with pytest.raises(NoLegacyRefParserError):
            legacy_ref_parser_handler[Ref(err.matched_part).index.title]
