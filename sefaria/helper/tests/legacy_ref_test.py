# -*- coding: utf-8 -*-

import pytest
from sefaria.model import *
from sefaria.helper.legacy_ref import legacy_ref_parsers, ZoharLegacyRefParser
from sefaria.system.database import db
from sefaria.system.exceptions import PartialRefInputError

@pytest.fixture(scope="module")
def test_ref():
    return "Zohar.1.15a.1"

@pytest.fixture(scope="module")
def test_ranged_ref():
    return "Zohar.1.15a.1-6"



@pytest.xfail(reason="Not implemeted yet")
class TestLegacyRefs:
    """
    At the time of writing, these tests should all fail, as there is still no Zohar refactor and no zohar mapping
    """
    def test_old_zohar_ref_fail(self, test_ref):
        # Simply tests that an old Zohar ref fails
        with pytest.raises(PartialRefInputError):
            Ref(test_ref)

    def test_old_zohar_ranged_ref_fail(self, test_ranged_ref):
        # Simply tests that an old ranged Zohar ref fails
        with pytest.raises(PartialRefInputError):
            Ref(test_ranged_ref)

    def test_old_zohar_partial_ref(self, test_ref):
        # tests that once a ranged ref fails that its partial ref exception contains the appropriate data
        try:
            Ref(test_ref)
        except PartialRefInputError as err:
            assert Ref(err.matched_part).book == "Zohar"

    def test_old_zohar_partial_ref_legacy_loader(self, test_ref):
        try:
            Ref(test_ref)
        except PartialRefInputError as err:
            assert type(legacy_ref_parsers[Ref(err.matched_part).book] == ZoharLegacyRefParser)
            
    def test_old_zohar_partial_ref_legacy_parsing(self, test_ref):
        try:
            Ref(test_ref)
        except PartialRefInputError as err:
            parser = legacy_ref_parsers[Ref(err.matched_part).book]
            convertedRef = parser.parseLegacyRef(test_ref)
            assert "orig_ref" in convertedRef # or hasattr?
            assert "legacy_converted" in convertedRef
            assert convertedRef.normal() === "Zohar, Bereshit.1.1-2"



