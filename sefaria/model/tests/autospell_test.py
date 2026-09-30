# -*- coding: utf-8 -*-


# This is failing because of the Postgres access happening in build_full_auto_completer()
# E   RuntimeError: Database access not allowed, use the "django_db" mark, or the "db" or "transactional_db" fixtures to enable it.
# todo: Add the right mark to get the module allowed

"""

import pytest
from sefaria.model import *


def setup_module(module):
    library.get_toc_tree()
    library.build_full_auto_completer()
    library.build_lexicon_auto_completers()
    library.build_cross_lexicon_auto_completer()


class Test_Complete_Method(object):
    # Does limit return exactly the right number of results?
    @pytest.mark.parametrize("ac,search", [
        (library.full_auto_completer("en"), "cor"),
        (library.full_auto_completer("he"), "תור"),
        (library.cross_lexicon_auto_completer(), "גדד")
    ])
    @pytest.mark.parametrize("limit", [5, 10, 15])
    def test_limits(self, ac, search, limit):
        assert len(ac.complete(search, limit)[0]) == limit

    # Are all string titles accounted for in objects?
    # Are all object titles accounted for in string titles?
    @pytest.mark.parametrize("ac,search", [
        (library.full_auto_completer("en"), "cor"),
        (library.full_auto_completer("he"), "תור"),
        (library.cross_lexicon_auto_completer(), "גדד")
    ])
    @pytest.mark.parametrize("limit", [10, 0])
    def test_object_completness(self,  ac, search, limit):
        [strs, objs] = ac.complete(search, limit)
        o_set = set([o["title"] for o in objs])
        s_set = set(strs)
        assert o_set == s_set

    # Do we swap languages for non matches?
    @pytest.mark.parametrize("he_str,en_str", [
        ("גשמןקך", "daniel"),
        ("דםמעד", "songs"),
        ("קבלה", "eckv"),
        ("יוסף", "hux;")
    ])
    def test_language_flip(self,he_str,en_str):
        assert library.full_auto_completer("he").complete(he_str,10)[0] == library.full_auto_completer("en").complete(en_str, 10)[0]

"""




    # Does 0 limit work to have no limits?
    # How do we test that?
    # Do individual dictionary autompleters return results?
    # Do cross dictionary ac return results from all dicts?
    # Are all refs noted as such in name api?
    # Do dictionary entries resolve in name api?


# The tests below deliberately avoid build_full_auto_completer() (see the Postgres note at
# the top of this file): get_search_categories reads only the Mongo-backed TOC tree.

import pytest

from sefaria.model import library
from sefaria.model.category import TocCategory, TocTextIndex
from sefaria.model.autospell import (
    INDEX_CONTAINER_MIN,
    get_search_categories,
    is_category_boundary,
    is_index_container,
)


def _subtree_index_count(node):
    """Full (un-short-circuited) count, so the tests don't reuse the implementation's math."""
    n = 0
    for child in node.children:
        if isinstance(child, TocTextIndex):
            n += 1
        elif isinstance(child, TocCategory):
            n += _subtree_index_count(child)
    return n


class TestCategoryBoundary(object):
    @pytest.mark.parametrize("name", [
        "Commentary", "commentaries", "Rishonim on Tanakh", "Acharonim", "Geonim",
        "Savoraim", "Other Kabbalah Works", "Modern", "Targum", "Guides", "comments",
    ])
    def test_boundaries(self, name):
        assert is_category_boundary(name)

    @pytest.mark.parametrize("name", [
        "Tanakh", "Talmud", "Mishneh Torah", "Rashi", "Seder Moed", "Kabbalah",
    ])
    def test_non_boundaries(self, name):
        assert not is_category_boundary(name)

    def test_matches_whole_words_only(self):
        # "Commentary" is a boundary; a title that merely *contains* a boundary word as a
        # substring of a longer word is not (the pattern is \b-anchored).
        assert not is_category_boundary("Otherworldly Texts")


class TestSearchCategories(object):
    """
    A category is indexed only if it is a real container of texts: at least
    INDEX_CONTAINER_MIN indices somewhere beneath it.
    """

    @classmethod
    def setup_class(cls):
        cls.cats = get_search_categories(library.get_toc_tree().get_root())

    def test_returns_categories(self):
        assert len(self.cats) > 0
        assert all(isinstance(c, TocCategory) for c in self.cats)

    def test_every_category_holds_at_least_two_indices(self):
        thin = [("/".join(c.full_path), _subtree_index_count(c))
                for c in self.cats if _subtree_index_count(c) < INDEX_CONTAINER_MIN]
        assert thin == [], f"categories with fewer than {INDEX_CONTAINER_MIN} indices: {thin[:10]}"

    def test_no_boundary_nodes_are_returned(self):
        named = [c.primary_title("en") for c in self.cats]
        assert [n for n in named if is_category_boundary(n)] == []

    def test_keeps_top_level_categories_that_have_no_direct_index_children(self):
        # The headline case for counting indices at any depth rather than among direct
        # children: these hold only subcategories at their top level, but thousands of
        # texts below. A direct-children test would drop every one of them.
        paths = {"/".join(c.full_path) for c in self.cats}
        for path in ("Tanakh", "Talmud", "Mishnah", "Midrash", "Halakhah/Mishneh Torah"):
            assert path in paths, f"{path} missing from searchable categories"
            node = next(c for c in self.cats if "/".join(c.full_path) == path)
            assert sum(1 for ch in node.children if isinstance(ch, TocTextIndex)) == 0
            assert _subtree_index_count(node) >= INDEX_CONTAINER_MIN

    def test_harvests_commentators_from_below_a_boundary(self):
        # "Rishonim on Tanakh" is a boundary: it is dropped, but the commentators under it
        # are kept -- those that are themselves containers of two or more texts.
        paths = {"/".join(c.full_path) for c in self.cats}
        assert "Tanakh/Rishonim on Tanakh" not in paths
        assert any(p.startswith("Tanakh/Rishonim on Tanakh/") for p in paths)

    def test_drops_single_book_categories(self):
        # A category wrapping exactly one text is that text under another name, and the
        # text is already searchable on its own.
        paths = {"/".join(c.full_path) for c in self.cats}
        assert "Halakhah/Shulchan Arukh/Commentary/Magen Avraham" not in paths

    def test_is_index_container_agrees_with_a_full_count(self):
        # is_index_container short-circuits; make sure the short-circuit didn't change the
        # answer relative to counting the whole subtree.
        root = library.get_toc_tree().get_root()
        checked = 0
        for child in root.children:
            if isinstance(child, TocCategory):
                assert is_index_container(child) == (_subtree_index_count(child) >= INDEX_CONTAINER_MIN)
                checked += 1
        assert checked > 0
