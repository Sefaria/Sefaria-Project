# -*- coding: utf-8 -*-
import types
import unicodedata
from unittest.mock import patch
import pytest
from sefaria.model import *
from sefaria.model.schema import DictionaryNode
from sefaria.model.lexicon import LexiconEntrySet, LexiconEntry, BDBEntry, KrupnikEntry, LexiconEntrySubClassMapping
from sefaria.helper.schema import change_lexicon_headword, get_available_lexicon_headword
from sefaria.system.exceptions import InputError
from sefaria.utils.util import deep_map, deep_prune


@pytest.fixture()
def make_lexicon_entry():
    """Saves a LexiconEntry (or subclass) and deletes it (by _id, so this still cleans up
    correctly even if the entry was later renamed in place, e.g. by change_lexicon_headword)
    after the test regardless of how many were created."""
    created = []

    def _make(headword, parent_lexicon, cls=LexiconEntry, **kwargs):
        entry = cls({"headword": headword, "parent_lexicon": parent_lexicon, **kwargs})
        entry.save()
        created.append(entry)
        return entry

    yield _make
    for entry in created:
        entry.delete()


class Test_Lexicon_Lookup(object):

    def test_bible_lookup(self):
        word = "תִּשְׁמֹ֑רוּ"
        lookup_ref = "Leviticus 19.3"
        #["lookup_ref", "never_split", "always_split"]
        results = LexiconLookupAggregator.lexicon_lookup(word)
        results2 = LexiconLookupAggregator.lexicon_lookup(word, **{"lookup_ref": lookup_ref})
        results3 = LexiconLookupAggregator.lexicon_lookup(word, **{"always_split": 1})
        # "BDB Dictionary" and "BDB Augmented Strong" both cover this word, so it is a
        # legitimate match in each -- not a duplicate-headword data bug.
        assert results.count() == 2
        assert all(r.headword == "שָׁמַר" for r in results)
        assert results2.count() == 2
        assert results3.count() == 2

        word2 = "עִוֵּ֔ר"
        results = LexiconLookupAggregator.lexicon_lookup(word2)
        assert results.count() == 8

    def test_hts_lookup(self):
        word = "Ma'aser Sheni"
        word2 = "Am Ha'aretz"
        word3 = "Bikurim"
        lookup_ref = "Mishnah Maaser Sheni 3"
        # ["lookup_ref", "never_split", "always_split"]
        results = LexiconLookupAggregator.lexicon_lookup(word)
        results2 = LexiconLookupAggregator.lexicon_lookup(word, **{"lookup_ref": lookup_ref})
        results3 = LexiconLookupAggregator.lexicon_lookup(word, **{"always_split": 1})
        assert results.count() == 1
        assert results[0].headword == "מעשר שני"
        assert results2.count() == 1
        assert results3.count() == 1

        results = LexiconLookupAggregator.lexicon_lookup(word2)
        assert results.count() == 1

        results = LexiconLookupAggregator.lexicon_lookup(word3)
        assert results.count() == 1


class Test_Lexicon_Save(object):

    def test_sanitize(self, make_lexicon_entry):
        content = {
            "senses": [
                {
                    "definition": " as numeral letter, <i>one</i>, as <span dir=\"rtl\">אות א׳</span> = <span dir=\"rtl\">אות אחת</span> one letter. <a class=\"refLink\" href=\"/Shabbat.104a\" data-ref=\"Shabbat 104a\">Sabb. 104ᵃ</a>; a. fr. [Editions and Mss. vary, according to space, between the full numeral and the numeral letter, <a dir=\"rtl\" class=\"refLink\" href=\"/Jastrow,_א׳.1\" data-ref=\"Jastrow, א׳ 1\">א׳</a> for <span dir=\"rtl\">אחד</span>, <span dir=\"rtl\">אחת</span>; <a dir=\"rtl\" class=\"refLink\" href=\"/Jastrow,_ב׳.1\" data-ref=\"Jastrow, ב׳ 1\">ב׳</a> for <a dir=\"rtl\" class=\"refLink\" href=\"/Jastrow,_שְׁנַיִם.1\" data-ref=\"Jastrow, שְׁנַיִם 1\">שנים</a>, <span dir=\"rtl\">שתים</span>, <a dir=\"rtl\" class=\"refLink\" href=\"/Jastrow,_שתי.1\" data-ref=\"Jastrow, שתי 1\">שתי</a> &c.]"
                },
                {
                    "definition": 'Seemingly ok definition... <a href="javascript:alert(8007)">Click me</a>'
                }
            ]
        }
        l = make_lexicon_entry("א׳ (sanitize test fixture)", "Jastrow Dictionary", cls=JastrowDictionaryEntry,
                                rid="A00006", refs=["Shabbat 104a"], prev_hw="א ⁶", next_hw="אִ־", content=content)
        # bleach preserves each tag's original attribute order rather than alphabetizing --
        # only the "&" -> "&amp;" escape differs from the input.
        assert l.content["senses"][0]["definition"] == """ as numeral letter, <i>one</i>, as <span dir="rtl">אות א׳</span> = <span dir="rtl">אות אחת</span> one letter. <a class="refLink" href="/Shabbat.104a" data-ref="Shabbat 104a">Sabb. 104ᵃ</a>; a. fr. [Editions and Mss. vary, according to space, between the full numeral and the numeral letter, <a dir="rtl" class="refLink" href="/Jastrow,_א׳.1" data-ref="Jastrow, א׳ 1">א׳</a> for <span dir="rtl">אחד</span>, <span dir="rtl">אחת</span>; <a dir="rtl" class="refLink" href="/Jastrow,_ב׳.1" data-ref="Jastrow, ב׳ 1">ב׳</a> for <a dir="rtl" class="refLink" href="/Jastrow,_שְׁנַיִם.1" data-ref="Jastrow, שְׁנַיִם 1">שנים</a>, <span dir="rtl">שתים</span>, <a dir="rtl" class="refLink" href="/Jastrow,_שתי.1" data-ref="Jastrow, שתי 1">שתי</a> &amp;c.]"""
        assert l.content["senses"][1]["definition"] == 'Seemingly ok definition... <a>Click me</a>'


class Test_DictionaryNode_AllChildren(object):
    """
    Tests for DictionaryNode.all_children(), which is memoized on self._all_children_cache
    to avoid re-querying Mongo (LexiconEntrySet + per-entry entry_class construction) on
    every call. See sefaria.model.schema.DictionaryNode.all_children.
    """

    # A small, real lexicon present in the test DB and mapped in
    # LexiconEntrySubClassMapping.lexicon_class_map, so DictionaryNode.__init__ can
    # resolve a dictionaryClass without falling back to the generic LexiconEntry.
    LEXICON_NAME = "Animadversions by Elias Levita on Sefer HaShorashim"

    def _make_dictionary_node(self):
        serial = {
            "lexiconName": self.LEXICON_NAME,
            "firstWord": "א",
            "lastWord": "ת",
            "nodeType": "DictionaryNode",
            "titles": [
                {"lang": "en", "text": "Animadversions", "primary": True},
                {"lang": "he", "text": "Animadversions", "primary": True},
            ],
        }
        return DictionaryNode(serial)

    def test_all_children_caches_lexicon_entry_set_query(self):
        """all_children() must only construct/query LexiconEntrySet once across multiple calls,
        even though it fully iterates each returned iterator every time."""
        dn = self._make_dictionary_node()

        call_count = 0
        real_lexicon_entry_set = LexiconEntrySet

        def spy(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return real_lexicon_entry_set(*args, **kwargs)

        with patch("sefaria.model.schema.LexiconEntrySet", side_effect=spy) as mock_les:
            for _ in range(3):
                children = list(dn.all_children())
                assert len(children) > 0
            assert mock_les.call_count == 1
            assert call_count == 1

    def test_all_children_matches_uncached_direct_query(self):
        """The sequence of children yielded by all_children() (by .word) must match a fresh,
        independent LexiconEntrySet enumeration (by .headword), in order."""
        dn = self._make_dictionary_node()

        cached_words = [child.word for child in dn.all_children()]

        fresh_entry_set = LexiconEntrySet({"parent_lexicon": self.LEXICON_NAME})
        fresh_headwords = [entry.headword for entry in fresh_entry_set]

        assert len(cached_words) > 0
        assert cached_words == fresh_headwords

    def test_all_children_returns_independent_iterators(self):
        """Calling all_children() twice on the same node instance must yield two independent
        iterators - fully consuming one must not exhaust the other."""
        dn = self._make_dictionary_node()

        iter_a = dn.all_children()
        iter_b = dn.all_children()

        words_a = [child.word for child in iter_a]
        words_b = [child.word for child in iter_b]

        assert len(words_a) > 0
        assert len(words_b) > 0
        assert words_a == words_b

    def test_all_children_caching_logic_without_mongo(self):
        """Safety-net test that proves out the caching behavior in isolation, without touching
        Mongo at all. Builds a bare test double (not a real DictionaryNode, since __init__
        requires Mongo via Lexicon().load) with just the attributes all_children() needs, and
        monkeypatches sefaria.model.schema.LexiconEntrySet with a fake in-memory implementation."""

        fake_entries = [
            types.SimpleNamespace(headword="alpha"),
            types.SimpleNamespace(headword="beta"),
            types.SimpleNamespace(headword="gamma"),
        ]

        call_count = 0

        class FakeLexiconEntrySet(object):
            def __init__(self, query=None):
                nonlocal call_count
                call_count += 1
                self._query = query

            def __iter__(self):
                return iter(fake_entries)

        class FakeEntryNode(object):
            def __init__(self, parent, lexicon_entry=None):
                self.word = lexicon_entry.headword

        class FakeDictionaryNode(object):
            lexiconName = "Fake Lexicon"
            entry_class = FakeEntryNode

            def __init__(self):
                self._all_children_cache = None

        fake_node = FakeDictionaryNode()

        with patch("sefaria.model.schema.LexiconEntrySet", FakeLexiconEntrySet):
            for _ in range(3):
                words = [child.word for child in DictionaryNode.all_children(fake_node)]
                assert words == ["alpha", "beta", "gamma"]
            assert call_count == 1

            iter_a = DictionaryNode.all_children(fake_node)
            iter_b = DictionaryNode.all_children(fake_node)
            words_a = [child.word for child in iter_a]
            words_b = [child.word for child in iter_b]
            assert words_a == ["alpha", "beta", "gamma"]
            assert words_b == ["alpha", "beta", "gamma"]
            assert call_count == 1


class Test_LexiconEntry_Load(object):
    """LexiconEntry.load() resolves to the correct dictionary subclass before delegating to
    the base class, so that AbstractMongoRecord.load()'s known-keys assertion checks against
    the subclass's (possibly wider) optional_attrs rather than the generic base class's."""

    FAKE_LEXICON = "Test Lexicon Load Subclass Resolution"

    def test_resolves_to_correct_subclass_via_parent_lexicon_in_query(self, make_lexicon_entry):
        with patch.dict(LexiconEntrySubClassMapping.lexicon_class_map, {self.FAKE_LEXICON: KrupnikEntry}):
            make_lexicon_entry("subclass-test", self.FAKE_LEXICON, rid="R1", content={"senses": [{"definition": "d"}]})
            loaded = LexiconEntry().load({"parent_lexicon": self.FAKE_LEXICON, "headword": "subclass-test"})
            assert isinstance(loaded, KrupnikEntry)

    def test_resolves_correct_subclass_when_query_omits_parent_lexicon(self, make_lexicon_entry):
        with patch.dict(LexiconEntrySubClassMapping.lexicon_class_map, {self.FAKE_LEXICON: KrupnikEntry}):
            entry = make_lexicon_entry("subclass-test-by-id", self.FAKE_LEXICON, rid="R1", content={"senses": [{"definition": "d"}]})
            loaded = LexiconEntry().load({"_id": entry._id})
            assert isinstance(loaded, KrupnikEntry)

    def test_returns_none_for_no_match(self):
        assert LexiconEntry().load({"parent_lexicon": self.FAKE_LEXICON, "headword": "does-not-exist"}) is None


class Test_LexiconEntry_Normalize(object):
    PARENT_LEXICON = "Test Lexicon Normalize"

    # bet, dagesh, patach -- dagesh before patach is not canonical NFC order (NFC reorders
    # to patach-before-dagesh, since patach's combining class sorts before dagesh's).
    NON_NFC = "בַּ"

    def test_normalizes_headword_prev_hw_next_hw_to_nfc_on_save(self, make_lexicon_entry):
        nfc = unicodedata.normalize("NFC", self.NON_NFC)
        assert nfc != self.NON_NFC
        entry = make_lexicon_entry(self.NON_NFC, self.PARENT_LEXICON, prev_hw=self.NON_NFC, next_hw=self.NON_NFC)
        assert entry.headword == nfc
        assert entry.prev_hw == nfc
        assert entry.next_hw == nfc

    def test_already_nfc_headword_round_trips_unchanged(self, make_lexicon_entry):
        nfc = unicodedata.normalize("NFC", self.NON_NFC)
        entry = make_lexicon_entry(nfc, self.PARENT_LEXICON)
        entry.save()
        assert entry.headword == nfc


class Test_LexiconEntry_PruneEmptyAttrs(object):
    PARENT_LEXICON = "Test Lexicon Prune"

    def test_optional_attr_emptied_is_removed(self, make_lexicon_entry):
        entry = make_lexicon_entry("prune-1", self.PARENT_LEXICON, notes="")
        assert not hasattr(entry, "notes")

    def test_nested_empty_content_collapses_and_is_removed(self, make_lexicon_entry):
        entry = make_lexicon_entry("prune-2", self.PARENT_LEXICON, content={"senses": [{"definition": ""}]})
        assert not hasattr(entry, "content")

    def test_required_attr_emptied_is_kept_present_but_pruned(self, make_lexicon_entry):
        entry = make_lexicon_entry("prune-3", self.PARENT_LEXICON, cls=BDBEntry,
                                    rid="T1", content={"senses": [{"definition": ""}]})
        assert hasattr(entry, "content")
        assert entry.content == {}

    class _DualListedAttrEntry(LexiconEntry):
        # Test-only: some real subclasses (Strongs, Rashi, Klein, KovetzYesodot, Krupnik)
        # currently list "content" in both required_attrs and optional_attrs, which is a bug
        # in its own right -- using a dedicated synthetic attr here instead of a real
        # subclass so this test still holds if that duplication is ever cleaned up.
        required_attrs = LexiconEntry.required_attrs + ["dual_attr"]
        optional_attrs = LexiconEntry.optional_attrs + ["dual_attr"]

    def test_required_attr_also_listed_as_optional_is_kept_not_deleted(self, make_lexicon_entry):
        entry = make_lexicon_entry("prune-4", self.PARENT_LEXICON, cls=self._DualListedAttrEntry,
                                    dual_attr={"a": ""})
        assert hasattr(entry, "dual_attr")
        assert entry.dual_attr == {}


class Test_LexiconEntry_ReplaceContentAttrs(object):
    def test_rejects_excluded_attr(self):
        entry = LexiconEntry({"headword": "x", "parent_lexicon": "y"})
        with pytest.raises(InputError):
            entry.replace_content_attrs({"headword": "new"})

    def test_rejects_unknown_attr(self):
        entry = LexiconEntry({"headword": "x", "parent_lexicon": "y"})
        with pytest.raises(InputError):
            entry.replace_content_attrs({"not_a_real_attr": 1})

    def test_replaces_only_content_attrs_leaving_identity_and_pointers_untouched(self):
        entry = LexiconEntry({
            "headword": "x", "parent_lexicon": "y", "prev_hw": "p", "next_hw": "n",
            "rid": "R1", "quotes": ["q"], "content": {"a": 1}, "notes": "old notes",
        })
        entry.replace_content_attrs({"content": {"a": 2}})
        assert entry.content == {"a": 2}
        assert not hasattr(entry, "notes")
        assert entry.headword == "x"
        assert entry.prev_hw == "p"
        assert entry.next_hw == "n"
        assert entry.rid == "R1"
        assert entry.quotes == ["q"]


class Test_GetAvailableLexiconHeadword(object):
    PARENT_LEXICON = "Test Lexicon Available Headword"

    def test_no_collision_passthrough(self):
        assert get_available_lexicon_headword(self.PARENT_LEXICON, "brandnew") == "brandnew"

    def test_strips_whitespace(self):
        assert get_available_lexicon_headword(self.PARENT_LEXICON, "  brandnew  ") == "brandnew"

    def test_nfc_normalizes_even_without_collision(self):
        non_nfc = "בַּ"
        nfc = unicodedata.normalize("NFC", non_nfc)
        assert get_available_lexicon_headword(self.PARENT_LEXICON, non_nfc) == nfc

    def test_collision_appends_superscript_two(self, make_lexicon_entry):
        make_lexicon_entry("taken", self.PARENT_LEXICON)
        assert get_available_lexicon_headword(self.PARENT_LEXICON, "taken") == "taken²"

    def test_two_and_three_taken_returns_four(self, make_lexicon_entry):
        make_lexicon_entry("multi", self.PARENT_LEXICON)
        make_lexicon_entry("multi²", self.PARENT_LEXICON)
        make_lexicon_entry("multi³", self.PARENT_LEXICON)
        assert get_available_lexicon_headword(self.PARENT_LEXICON, "multi") == "multi⁴"

    def test_non_contiguous_numbering_returns_first_gap(self, make_lexicon_entry):
        make_lexicon_entry("gap", self.PARENT_LEXICON)
        make_lexicon_entry("gap³", self.PARENT_LEXICON)  # "gap²" is free even though "gap³" is taken
        assert get_available_lexicon_headword(self.PARENT_LEXICON, "gap") == "gap²"

    def test_resubmitted_superscript_is_stripped_and_renumbered_fresh(self, make_lexicon_entry):
        make_lexicon_entry("stack", self.PARENT_LEXICON)
        assert get_available_lexicon_headword(self.PARENT_LEXICON, "stack²²") == "stack²"

    def test_whitespace_only_raises(self):
        with pytest.raises(ValueError):
            get_available_lexicon_headword(self.PARENT_LEXICON, "   ")

    def test_bare_superscript_raises(self):
        # "²" is non-empty as a raw string, but stripping it as a superscript suffix leaves
        # nothing -- must raise, not silently return "".
        with pytest.raises(ValueError):
            get_available_lexicon_headword(self.PARENT_LEXICON, "²")

    # Two byte orderings of the same combining marks (sheva U+05B0 + dagesh U+05BC on the same
    # base letter) that normalize to the identical NFC string despite being unequal as raw
    # strings -- built from explicit codepoints, not typed literals, since two Hebrew strings
    # that render identically can still differ in combining-mark byte order (the exact class
    # of bug this fix addresses).
    _ORDER_SHEVA_THEN_DAGESH = "\u05d1\u05b0\u05bc"
    _ORDER_DAGESH_THEN_SHEVA = "\u05d1\u05bc\u05b0"

    def test_without_exclude_headword_resubmitting_own_word_differently_encoded_gets_bumped(self, make_lexicon_entry):
        # documents the bug this fixes: without telling the function which entry is being
        # renamed, it finds the entry's own current headword via the DB query and treats it
        # as an unrelated collision.
        assert self._ORDER_SHEVA_THEN_DAGESH != self._ORDER_DAGESH_THEN_SHEVA
        assert unicodedata.normalize("NFC", self._ORDER_SHEVA_THEN_DAGESH) == unicodedata.normalize("NFC", self._ORDER_DAGESH_THEN_SHEVA)
        current = unicodedata.normalize("NFC", self._ORDER_SHEVA_THEN_DAGESH)
        make_lexicon_entry(current, self.PARENT_LEXICON)
        assert get_available_lexicon_headword(self.PARENT_LEXICON, self._ORDER_DAGESH_THEN_SHEVA) == current + "\u00b2"

    def test_exclude_headword_resolves_own_word_differently_encoded_back_to_itself(self, make_lexicon_entry):
        current = unicodedata.normalize("NFC", self._ORDER_SHEVA_THEN_DAGESH)
        make_lexicon_entry(current, self.PARENT_LEXICON)
        assert get_available_lexicon_headword(self.PARENT_LEXICON, self._ORDER_DAGESH_THEN_SHEVA, exclude_headword=current) == current


class Test_ChangeLexiconHeadword(object):
    PARENT_LEXICON = "Test Lexicon Change Headword"

    def test_rebuild_library_flag_false_skips_rebuild(self, make_lexicon_entry):
        make_lexicon_entry("old-a", self.PARENT_LEXICON)
        with patch("sefaria.helper.schema.library") as mock_library:
            change_lexicon_headword(self.PARENT_LEXICON, "old-a", "new-a", rebuild_library=False)
            mock_library.rebuild.assert_not_called()

    def test_rebuild_library_defaults_true(self, make_lexicon_entry):
        make_lexicon_entry("old-b", self.PARENT_LEXICON)
        with patch("sefaria.helper.schema.library") as mock_library:
            change_lexicon_headword(self.PARENT_LEXICON, "old-b", "new-b")
            mock_library.rebuild.assert_called_once()

    def test_bad_prev_hw_pointer_raises_before_any_write(self, make_lexicon_entry):
        make_lexicon_entry("broken-ptr", self.PARENT_LEXICON, prev_hw="does-not-exist-anywhere")
        with pytest.raises(ValueError):
            change_lexicon_headword(self.PARENT_LEXICON, "broken-ptr", "renamed-ptr")
        assert LexiconEntry().load({"parent_lexicon": self.PARENT_LEXICON, "headword": "broken-ptr"}) is not None
        assert LexiconEntry().load({"parent_lexicon": self.PARENT_LEXICON, "headword": "renamed-ptr"}) is None

    def test_new_headword_collision_raises(self, make_lexicon_entry):
        make_lexicon_entry("existing-a", self.PARENT_LEXICON)
        make_lexicon_entry("existing-b", self.PARENT_LEXICON)
        with pytest.raises(ValueError):
            change_lexicon_headword(self.PARENT_LEXICON, "existing-b", "existing-a")


class Test_LexiconEntry_ValidateUniqueness(object):
    """headword uniqueness is enforced only for lexicons rendered as text (an Index record
    exists), and only when headword is actually changing -- see LexiconEntry._validate()."""

    PARENT_LEXICON = "Test Lexicon Uniqueness"

    def _with_index(self):
        return patch("sefaria.model.lexicon.Lexicon.load",
                     return_value=types.SimpleNamespace(index_title="Some Index Title"))

    def _without_index(self):
        return patch("sefaria.model.lexicon.Lexicon.load", return_value=None)

    def test_new_entry_colliding_headword_raises_when_index_exists(self, make_lexicon_entry):
        with self._with_index():
            make_lexicon_entry("dupe", self.PARENT_LEXICON)
            with pytest.raises(InputError):
                make_lexicon_entry("dupe", self.PARENT_LEXICON)

    def test_existing_entry_renamed_to_colliding_headword_raises(self, make_lexicon_entry):
        with self._with_index():
            make_lexicon_entry("dupe_a", self.PARENT_LEXICON)
            make_lexicon_entry("dupe_b", self.PARENT_LEXICON)
            loaded = LexiconEntry().load({"parent_lexicon": self.PARENT_LEXICON, "headword": "dupe_b"})
            loaded.headword = "dupe_a"
            with pytest.raises(InputError):
                loaded.save()

    def test_existing_entry_unchanged_headword_does_not_raise_even_if_duplicated(self, make_lexicon_entry):
        # Two documents directly constructed to share a headword (bypassing the check, as
        # real pre-existing duplicates like Klein Dictionary's did) -- a content-only resave
        # of either must still succeed once an Index exists.
        with self._without_index():
            make_lexicon_entry("preexisting_dupe", self.PARENT_LEXICON)
            make_lexicon_entry("preexisting_dupe", self.PARENT_LEXICON)
        with self._with_index():
            loaded = LexiconEntry().load({"parent_lexicon": self.PARENT_LEXICON, "headword": "preexisting_dupe"})
            loaded.notes = "content-only edit"
            loaded.save()
            assert loaded.notes == "content-only edit"

    def test_colliding_headword_change_does_not_raise_when_no_index(self, make_lexicon_entry):
        with self._without_index():
            make_lexicon_entry("nodupe_a", self.PARENT_LEXICON)
            make_lexicon_entry("nodupe_b", self.PARENT_LEXICON)
            loaded = LexiconEntry().load({"parent_lexicon": self.PARENT_LEXICON, "headword": "nodupe_b"})
            loaded.headword = "nodupe_a"
            loaded.save()


class Test_DeepMapAndPrune(object):
    def test_deep_map_leaf_transform(self):
        data = {"a": [1, 2, {"b": 3}]}
        result = deep_map(data, leaf_fn=lambda v: v * 10 if isinstance(v, int) else v)
        assert result == {"a": [10, 20, {"b": 30}]}

    def test_deep_map_after_hook_runs_post_order(self):
        seen = []

        def after(container):
            seen.append(container)
            return container

        deep_map({"a": {"b": 1}}, after=after)
        assert seen == [{"b": 1}, {"a": {"b": 1}}]

    def test_deep_prune_removes_empty_leaves_and_collapsed_containers(self):
        data = {"a": {"b": ""}, "c": [1, "", {}], "d": "keep"}
        assert deep_prune(data) == {"c": [1], "d": "keep"}

    def test_deep_prune_leaves_non_empty_untouched(self):
        data = {"a": 1, "b": [1, 2, 3]}
        assert deep_prune(data) == data

