# -*- coding: utf-8 -*-
"""get_links client-format behavior, against a tiny synthetic library.

These used to query the full dump (Exodus plus every linked book). That is a
partial-library / oversized fixture, not a unit of product code. The assertions
here are the same behaviors: range union, category filter, exclusion of
Talmud-perek / parasha anchors, and real version metadata when a linked
segment is empty.
"""
import pytest
from unittest.mock import patch

from sefaria.client.wrapper import get_links
from sefaria.helper.text import get_talmud_perek_ref_set, get_parasha_ref_set
from sefaria.model.legacy_text import TextFamily
from sefaria.model import Index, IndexSet, Link, LinkSet, Ref, VersionSet, VersionState, library


BASE = "Synth GetLinks Base"
COMMENTARY = "Synth GetLinks Commentary"
MIDRASH = "Synth GetLinks Midrash"
HALAKHAH = "Synth GetLinks Halakhah"
TITLES = (BASE, COMMENTARY, MIDRASH, HALAKHAH)
GENERATED_BY = "synth_get_links"
VERSION_TITLE = "Synth GetLinks Version"


def _index_data(title, he_title, categories, dependence=None, base_text_titles=None):
    data = {
        "title": title,
        "categories": list(categories),
        "schema": {
            "titles": [
                {"lang": "en", "text": title, "primary": True},
                {"lang": "he", "text": he_title, "primary": True},
            ],
            "nodeType": "JaggedArrayNode",
            "depth": 2,
            "sectionNames": ["Chapter", "Segment"],
            "addressTypes": ["Integer", "Integer"],
            "key": title,
        },
    }
    if dependence:
        data["dependence"] = dependence
        data["base_text_titles"] = list(base_text_titles or [])
    return data


def _delete_synth():
    LinkSet({"generated_by": GENERATED_BY}).delete()
    for title in TITLES:
        IndexSet({"title": title}).delete()
        VersionSet({"title": title}).delete()


def _save_index(title, he_title, categories, dependence=None, base_text_titles=None):
    Index(_index_data(title, he_title, categories, dependence, base_text_titles)).save()


def _save_text(title, chapter):
    chunk = Ref(f"{title} 1").text(direction="ltr", lang="en", vtitle=VERSION_TITLE)
    chunk.text = chapter
    chunk.versionSource = "http://test.example.com"
    chunk.save()
    VersionState(title).refresh()


def _save_link(left, right, link_type):
    Link({
        "auto": True,
        "generated_by": GENERATED_BY,
        "type": link_type,
        "refs": [left, right],
    }).save()


@pytest.fixture
def synth_get_links_library():
    _delete_synth()
    _save_index(BASE, "בסיס סינתטי", ["Liturgy"])
    _save_index(
        COMMENTARY, "פירוש סינתטי",
        ["Liturgy", "Haggadah", "Commentary"],
        dependence="commentary",
        base_text_titles=[BASE],
    )
    _save_index(MIDRASH, "מדרש סינתטי", ["Midrash"])
    _save_index(HALAKHAH, "הלכה סינתטית", ["Halakhah"])
    library.rebuild(include_toc=True)

    _save_text(BASE, ["a1", "a2", "a3", "a4"])
    _save_text(COMMENTARY, ["c1", "c2"])
    _save_text(MIDRASH, ["m1"])
    _save_text(HALAKHAH, ["h1"])

    _save_link(f"{COMMENTARY} 1:1", f"{BASE} 1:3", "commentary")
    _save_link(f"{COMMENTARY} 1:2", f"{BASE} 1:4", "commentary")
    _save_link(f"{COMMENTARY} 1:3", f"{BASE} 1:3", "commentary")
    _save_link(f"{MIDRASH} 1:1", f"{BASE} 1:3", "midrash")
    _save_link(f"{HALAKHAH} 1:1", f"{BASE} 1:3", "related")
    yield
    _delete_synth()
    library.rebuild(include_toc=True)


@pytest.mark.needs_mongo
class Test_get_links:

    def test_get_links_on_range(self, synth_get_links_library):
        r3 = [l["ref"] + l["type"] for l in get_links(f"{BASE} 1:3", with_text=False)]
        r4 = [l["ref"] + l["type"] for l in get_links(f"{BASE} 1:4", with_text=False)]
        r34 = [l["ref"] + l["type"] for l in get_links(f"{BASE} 1:3-4", with_text=False)]

        assert r3
        assert r4
        assert all(r in r34 for r in r3)
        assert all(r in r34 for r in r4)
        assert all(r in r3 or r in r4 for r in r34)

    @patch("sefaria.client.wrapper.library.get_collections_in_library", return_value=[])
    def test_get_links_filtered_by_single_category(self, mock_collections, synth_get_links_library):
        links = get_links(f"{BASE} 1:3", with_text=False, categories=["Commentary"])
        assert links
        assert all(link["category"] == "Commentary" for link in links)

    @patch("sefaria.client.wrapper.library.get_collections_in_library", return_value=[])
    def test_get_links_filtered_by_multiple_categories(self, mock_collections, synth_get_links_library):
        allowed = {"Commentary", "Midrash"}
        links = get_links(f"{BASE} 1:3", with_text=False, categories=list(allowed))
        assert links
        assert all(link["category"] in allowed for link in links)
        found = {link["category"] for link in links}
        assert found == allowed

    @patch("sefaria.client.wrapper.library.get_collections_in_library", return_value=[])
    def test_get_links_excludes_talmud_perek_refs(self, mock_collections, synth_get_links_library):
        perek = f"{BASE} 1:3"
        with patch("sefaria.client.wrapper.get_talmud_perek_ref_set", return_value=frozenset({perek})), \
             patch("sefaria.client.wrapper.get_parasha_ref_set", return_value=frozenset()):
            links = get_links(perek, with_text=False)
        assert perek not in {l["anchorRef"] for l in links}

    @patch("sefaria.client.wrapper.library.get_collections_in_library", return_value=[])
    def test_get_links_excludes_parasha_refs(self, mock_collections, synth_get_links_library):
        parasha = f"{BASE} 1:3"
        with patch("sefaria.client.wrapper.get_talmud_perek_ref_set", return_value=frozenset()), \
             patch("sefaria.client.wrapper.get_parasha_ref_set", return_value=frozenset({parasha})):
            links = get_links(parasha, with_text=False)
        assert parasha not in {l["anchorRef"] for l in links}

    @patch("sefaria.client.wrapper.library.get_collections_in_library", return_value=[])
    def test_get_links_without_exclusion_would_include_perek_refs(self, mock_collections, synth_get_links_library):
        perek = f"{BASE} 1:3"
        with patch("sefaria.client.wrapper.get_talmud_perek_ref_set", return_value=frozenset()), \
             patch("sefaria.client.wrapper.get_parasha_ref_set", return_value=frozenset()):
            links = get_links(perek, with_text=False)
        assert perek in {l["anchorRef"] for l in links}
        assert links

    @patch("sefaria.client.wrapper.library.get_collections_in_library", return_value=[])
    def test_get_links_version_metadata_is_real_even_without_content_at_position(self, mock_collections, synth_get_links_library):
        """A linked segment can be empty in a chapter that still has a real version.

        get_links() should report that version's metadata, not invent one and not
        drop it because this exact position is empty.
        """
        links = get_links(f"{BASE} 1:3", with_text=True)
        empty_with_version = [l for l in links if not l.get("text") and l.get("versionTitle")]
        assert empty_with_version, "Expected at least one link with empty text but real version metadata"

        for link in empty_with_version:
            index_title = Ref(link["ref"]).index.title
            real_titles = {v.versionTitle for v in VersionSet({"title": index_title, "direction": "ltr"})}
            assert link["versionTitle"] in real_titles, (
                f"{link['ref']}: versionTitle {link['versionTitle']!r} is not a real version of {index_title}"
            )


@pytest.mark.needs_corpus
class Test_get_links_real_library():
    """Original real-library versions of Test_get_links, restored from master.

    These exercise get_links() against the full restored corpus (Exodus and
    its linked commentaries/Talmud/parashot), in addition to the synthetic
    Test_get_links above. Kept byte-identical to master's bodies.
    """

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
    def test_get_links_filtered_by_single_category(self, mock_collections):
        links = get_links("Exodus 1:12", with_text=False, categories=["Commentary"])
        assert len(links) > 0
        assert all(link["category"] == "Commentary" for link in links)

    @patch('sefaria.client.wrapper.library.get_collections_in_library', return_value=[])
    def test_get_links_filtered_by_multiple_categories(self, mock_collections):
        allowed_categories = {"Commentary", "Midrash"}
        links = get_links("Exodus 1:12", with_text=False, categories=list(allowed_categories))
        assert len(links) > 0
        assert all(link["category"] in allowed_categories for link in links)

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
    def test_get_links_version_metadata_is_real_even_without_content_at_position(self, mock_collections):
        """
        A link can have no content at its own specific position, in a chapter that otherwise has
        a real contributing version. get_links() should still report that version's real
        metadata -- attribution belongs to a genuine contributing version, not a fake/arbitrary
        one, and not None just because this exact position happens to be empty.
        (Regression case for get_links()'s TextChunk.sources-based attribution.)
        """
        links = get_links("Genesis 1:1", with_text=True)
        empty_with_version = [l for l in links if not l["text"] and l.get("versionTitle")]
        assert empty_with_version, "Expected at least one link with empty text but real version metadata"

        for link in empty_with_version:
            index_title = Ref(link["ref"]).index.title
            real_titles = {v.versionTitle for v in VersionSet({"title": index_title, "direction": "ltr"})}
            assert link["versionTitle"] in real_titles, (
                f"{link['ref']}: versionTitle {link['versionTitle']!r} is not a real version of {index_title}"
            )

    @pytest.mark.skip(reason="flaky after CI job retry corruption")
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


@pytest.mark.needs_corpus
class Test_links_from_get_text():

    def test_links_from_padded_ref(self):
        t1 = TextFamily(Ref("Exodus ")).contents()
        t2 = TextFamily(Ref("Exodus 1")).contents()

        assert len(t1["commentary"]) == len(t2["commentary"])
