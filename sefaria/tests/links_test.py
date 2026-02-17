# -*- coding: utf-8 -*-
import pytest
from unittest.mock import patch

from sefaria.client.wrapper import get_links
from sefaria.helper.text import get_talmud_perek_ref_set, get_parasha_ref_set
from sefaria.model import *

def setup_module(module):
    pass


class Test_get_links():

    def test_get_links_on_range(self):
        r3 = [l["ref"] + l["type"] for l in get_links("Exodus 2:3")]
        r4 = [l["ref"] + l["type"]  for l in get_links("Exodus 2:4")]
        r34 = [l["ref"] + l["type"]  for l in get_links("Exodus 2:3-4")]

        # All links in first segment present in range
        assert all([r in r34 for r in r3])
        # All links in second segment present in range
        assert all([r in r34 for r in r4])
        # No links in range absent from segments
        assert all(r in r3 or r in r4 for r in r34)

    @patch('sefaria.client.wrapper.library.get_collections_in_library', return_value=[])
    def test_get_links_excludes_talmud_perek_refs(self, mock_collections):
        """Links whose anchor ref is a Talmud perek ref should be excluded from results."""
        perek_refs = get_talmud_perek_ref_set()
        assert len(perek_refs) > 0, "Sanity check: perek ref set should not be empty"

        # Pick a perek ref that has links in the DB
        perek_ref_with_links = None
        for pref in perek_refs:
            if LinkSet(Ref(pref)).count() > 0:
                perek_ref_with_links = pref
                break
        assert perek_ref_with_links is not None, "Could not find a perek ref with links for testing"

        links = get_links(perek_ref_with_links, with_text=False)
        anchor_refs = {l["anchorRef"] for l in links}
        assert perek_ref_with_links not in anchor_refs, (
            f"Perek ref {perek_ref_with_links} should be excluded from link anchor refs"
        )

    @patch('sefaria.client.wrapper.library.get_collections_in_library', return_value=[])
    def test_get_links_excludes_parasha_refs(self, mock_collections):
        """Links whose anchor ref is a parasha ref should be excluded from results."""
        parasha_refs = get_parasha_ref_set()
        assert len(parasha_refs) > 0, "Sanity check: parasha ref set should not be empty"

        # Pick a parasha ref that has links in the DB
        parasha_ref_with_links = None
        for pref in parasha_refs:
            if LinkSet(Ref(pref)).count() > 0:
                parasha_ref_with_links = pref
                break
        assert parasha_ref_with_links is not None, "Could not find a parasha ref with links for testing"

        links = get_links(parasha_ref_with_links, with_text=False)
        anchor_refs = {l["anchorRef"] for l in links}
        assert parasha_ref_with_links not in anchor_refs, (
            f"Parasha ref {parasha_ref_with_links} should be excluded from link anchor refs"
        )

    @patch('sefaria.client.wrapper.library.get_collections_in_library', return_value=[])
    def test_get_links_without_exclusion_would_include_perek_refs(self, mock_collections):
        """Verify that without the filtering, perek refs would appear — confirming the filter is necessary."""
        perek_refs = get_talmud_perek_ref_set()

        # Find a perek ref that has links
        perek_ref_with_links = None
        for pref in perek_refs:
            if LinkSet(Ref(pref)).count() > 0:
                perek_ref_with_links = pref
                break
        assert perek_ref_with_links is not None, "Could not find a perek ref with links for testing"

        # Patch both ref sets to be empty, disabling the filter
        with patch('sefaria.client.wrapper.get_talmud_perek_ref_set', return_value=frozenset()), \
             patch('sefaria.client.wrapper.get_parasha_ref_set', return_value=frozenset()):
            links_unfiltered = get_links(perek_ref_with_links, with_text=False)

        anchor_refs_unfiltered = {l["anchorRef"] for l in links_unfiltered}
        assert perek_ref_with_links in anchor_refs_unfiltered, (
            f"Without filtering, perek ref {perek_ref_with_links} should appear in anchor refs"
        )


class Test_links_from_get_text():

    def test_links_from_padded_ref(self):
        t1 = TextFamily(Ref("Exodus ")).contents()
        t2 = TextFamily(Ref("Exodus 1")).contents()

        assert len(t1["commentary"]) == len(t2["commentary"])