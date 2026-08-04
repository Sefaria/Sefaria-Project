"""
Tests for the linker editor backend (sefaria/helper/linker_editor.py and
sefaria/model/linker/nonuniqueterm_index.py).

Pure-logic and Redis-cache tests run anywhere. DB-backed tests are read-only.
The write round-trip (add/remove MatchTemplate with index.save()) is exercised by
manual/E2E verification rather than here, to avoid mutating shared index data.
"""
import pytest

from sefaria.helper import linker_editor as le
from sefaria.model import schema
import sefaria.model.linker.nonuniqueterm_index as ni
from sefaria.system.exceptions import InputError


# ---------------------------------------------------------------------------
# Pure logic
# ---------------------------------------------------------------------------

def test_parse_node_key_path():
    assert le.parse_node_key_path("Berakhot.Intro") == ["Berakhot", "Intro"]
    assert le.parse_node_key_path("Berakhot") == ["Berakhot"]
    assert le.parse_node_key_path("") == []
    assert le.parse_node_key_path("A..B") == ["A", "B"]


def test_all_address_type_names():
    names = le.all_address_type_names()
    # A few known, currently-defined address types.
    for expected in ["Integer", "Talmud", "Perek", "Pasuk", "Amud"]:
        assert expected in names
    # 'Year' is commented out in schema.py and must not appear.
    assert "Year" not in names
    assert names == sorted(set(names))  # sorted + de-duped


def test_match_templates_equal():
    assert le._match_templates_equal({"term_slugs": ["a"]}, {"term_slugs": ["a"], "scope": "combined"})
    assert not le._match_templates_equal({"term_slugs": ["a"]}, {"term_slugs": ["a"], "scope": "alone"})
    assert not le._match_templates_equal({"term_slugs": ["a"]}, {"term_slugs": ["a", "b"]})


def test_normalize_scope():
    assert le._normalize_scope(None) == "combined"
    assert le._normalize_scope("alone") == "alone"
    with pytest.raises(InputError):
        le._normalize_scope("bogus")


def test_replace_match_template_saves_index_once_and_updates_usage(monkeypatch):
    class FakeNode:
        match_templates = [
            {"term_slugs": ["old"], "scope": "combined"},
            {"term_slugs": ["keep"], "scope": "alone"},
        ]

    class FakeIndex:
        title = "Fake"
        saves = 0

        def save(self):
            self.saves += 1

    node = FakeNode()
    index = FakeIndex()
    calls = []

    monkeypatch.setattr(le, "_validate_slugs", lambda slugs: None)
    monkeypatch.setattr(schema.NonUniqueTerm, "init", staticmethod(lambda slug: type("FakeTerm", (), {"slug": slug})()))
    monkeypatch.setattr(le.library, "get_index", lambda title: index)
    monkeypatch.setattr(le, "get_node_by_editor_path", lambda index_arg, key_path: (node, None))
    monkeypatch.setattr(le.nut_index, "remove_template_usage", lambda *args, **kwargs: calls.append(("remove", args[2].serialize())))
    monkeypatch.setattr(le.nut_index, "add_template_usage", lambda *args, **kwargs: calls.append(("add", args[2].serialize())))

    serialized = le.replace_match_template(
        "Fake",
        "Fake",
        {"term_slugs": ["old"], "scope": "combined"},
        {"term_slugs": ["old", "new"], "scope": "combined"},
    )

    assert serialized == {"term_slugs": ["old", "new"]}
    assert index.saves == 1
    assert node.match_templates == [
        {"term_slugs": ["old", "new"]},
        {"term_slugs": ["keep"], "scope": "alone"},
    ]
    assert calls == [
        ("remove", {"term_slugs": ["old"]}),
        ("add", {"term_slugs": ["old", "new"]}),
    ]


def test_replace_match_template_does_not_update_usage_when_save_fails(monkeypatch):
    class FakeNode:
        match_templates = [{"term_slugs": ["old"], "scope": "combined"}]

    class FakeIndex:
        def save(self):
            raise RuntimeError("save failed")

    calls = []
    monkeypatch.setattr(le, "_validate_slugs", lambda slugs: None)
    monkeypatch.setattr(schema.NonUniqueTerm, "init", staticmethod(lambda slug: type("FakeTerm", (), {"slug": slug})()))
    monkeypatch.setattr(le.library, "get_index", lambda title: FakeIndex())
    monkeypatch.setattr(le, "get_node_by_editor_path", lambda index_arg, key_path: (FakeNode(), None))
    monkeypatch.setattr(le.nut_index, "remove_template_usage", lambda *args, **kwargs: calls.append("remove"))
    monkeypatch.setattr(le.nut_index, "add_template_usage", lambda *args, **kwargs: calls.append("add"))

    with pytest.raises(RuntimeError):
        le.replace_match_template(
            "Fake",
            "Fake",
            {"term_slugs": ["old"], "scope": "combined"},
            {"term_slugs": ["old", "new"], "scope": "combined"},
        )

    assert calls == []


def test_alt_struct_editor_path():
    class FakeNode:
        def __init__(self, children=None):
            self.children = children or []
            self.parent = None
            for child in self.children:
                child.parent = self

    leaf = FakeNode()
    root = FakeNode([leaf])
    wrapper = FakeNode([root])

    assert ni._alt_struct_editor_path(leaf, "Parasha") == ["__alt__", "Parasha", "0", "0"]
    assert ni._alt_struct_editor_path(root, "Parasha") == ["__alt__", "Parasha", "0"]


def test_add_non_unique_term_titles(monkeypatch):
    class FakeTerm:
        slug = "__le_test_term__"

        def __init__(self):
            self.titles = [{"text": "Primary", "lang": "en", "primary": True}]
            self.saved = False

        def add_title(self, text, lang):
            self.titles.append({"text": text, "lang": lang})

        def save(self):
            self.saved = True

        def get_titles_object(self):
            return self.titles

    term = FakeTerm()

    class FakeNonUniqueTerm:
        @staticmethod
        def init(slug):
            return term if slug == term.slug else None

    monkeypatch.setattr(le, "NonUniqueTerm", FakeNonUniqueTerm)
    monkeypatch.setattr(le.nut_index, "get_term_usages", lambda slug: [])

    detail = le.add_non_unique_term_titles(term.slug, [
        {"text": "Alt", "lang": "en"},
        {"text": "חלופה", "lang": "he"},
    ])

    assert term.saved
    assert {"text": "Alt", "lang": "en"} in detail["titles"]
    assert {"text": "חלופה", "lang": "he"} in detail["titles"]
    assert detail["usages"] == []


def test_add_non_unique_term_titles_normalizes_with_linker_normalizer(monkeypatch):
    """Titles are stored normalized the same way the linker normalizes input text."""
    class FakeTerm:
        slug = "__le_test_term__"

        def __init__(self):
            self.titles = []

        def add_title(self, text, lang):
            self.titles.append({"text": text, "lang": lang})

        def save(self):
            pass

        def get_titles_object(self):
            return self.titles

    term = FakeTerm()

    class FakeNonUniqueTerm:
        @staticmethod
        def init(slug):
            return term if slug == term.slug else None

    monkeypatch.setattr(le, "NonUniqueTerm", FakeNonUniqueTerm)
    monkeypatch.setattr(le.nut_index, "get_term_usages", lambda slug: [])

    detail = le.add_non_unique_term_titles(term.slug, [
        # unidecode diacritic + collapsed double space + surrounding whitespace
        {"text": "  Ḥagigah   ha  ", "lang": "en"},
        # vowel/cantillation marks stripped for Hebrew (the linker's "cantillation"
        # normalizer range covers nikud too): בְּרֵאשִׁ֑ית -> בראשית
        {"text": "בְּרֵאשִׁ֑ית", "lang": "he"},
    ])

    stored = {t["text"] for t in detail["titles"]}
    assert "Hagigah ha" in stored
    assert "בראשית" in stored


def test_add_non_unique_term_titles_validation(monkeypatch):
    class FakeNonUniqueTerm:
        @staticmethod
        def init(slug):
            return None

    monkeypatch.setattr(le, "NonUniqueTerm", FakeNonUniqueTerm)

    with pytest.raises(InputError):
        le.add_non_unique_term_titles("__no_such_slug__", [{"text": "Alt", "lang": "en"}])

    class ExistingFakeNonUniqueTerm:
        @staticmethod
        def init(slug):
            return object()

    monkeypatch.setattr(le, "NonUniqueTerm", ExistingFakeNonUniqueTerm)

    with pytest.raises(InputError):
        le.add_non_unique_term_titles("__le_test_term__", [])
    with pytest.raises(InputError):
        le.add_non_unique_term_titles("__le_test_term__", [{"text": "Alt", "lang": "fr"}])
    with pytest.raises(InputError):
        le.add_non_unique_term_titles("__le_test_term__", [{"text": "   ", "lang": "en"}])


def test_delete_non_unique_term_rejects_terms_with_usages(monkeypatch):
    class FakeTerm:
        deleted = False

        def delete(self):
            self.deleted = True

    term = FakeTerm()

    class FakeNonUniqueTerm:
        @staticmethod
        def init(slug):
            return term if slug == "__le_test_term__" else None

    monkeypatch.setattr(le, "NonUniqueTerm", FakeNonUniqueTerm)
    monkeypatch.setattr(le.nut_index, "get_term_usages", lambda slug: [{"index_title": "Fake"}])

    with pytest.raises(InputError) as e:
        le.delete_non_unique_term("__le_test_term__")

    assert "use Swap" in str(e.value)
    assert not term.deleted


def test_delete_non_unique_term_deletes_unused_term_and_clears_usage_cache(monkeypatch):
    calls = []

    class FakeTerm:
        def delete(self):
            calls.append("delete")

    class FakeNonUniqueTerm:
        @staticmethod
        def init(slug):
            return FakeTerm() if slug == "__le_test_term__" else None

    monkeypatch.setattr(le, "NonUniqueTerm", FakeNonUniqueTerm)
    monkeypatch.setattr(le.nut_index, "get_term_usages", lambda slug: [])
    monkeypatch.setattr(le.nut_index, "set_term_usages", lambda slug, usages: calls.append(("set", slug, usages)))

    le.delete_non_unique_term("__le_test_term__")

    assert calls == ["delete", ("set", "__le_test_term__", [])]


def test_swap_non_unique_term_usages_replaces_each_usage(monkeypatch):
    class FakeNonUniqueTerm:
        @staticmethod
        def init(slug):
            if slug in {"old", "new"}:
                return object()
            return None

    usages = [
        {
            "index_title": "Fake",
            "node_key_path": ["Fake"],
            "term_slugs": ["old", "keep"],
            "scope": "combined",
        },
        {
            "index_title": "Other",
            "node_key_path": ["__alt__", "Parasha", "0"],
            "term_slugs": ["prefix", "old"],
            "scope": "alone",
        },
    ]
    replacements = []

    monkeypatch.setattr(le, "NonUniqueTerm", FakeNonUniqueTerm)
    monkeypatch.setattr(le.nut_index, "get_term_usages", lambda slug: usages)
    monkeypatch.setattr(le, "replace_match_template", lambda title, path, old, new: replacements.append((title, path, old, new)))
    monkeypatch.setattr(le, "get_non_unique_term_detail", lambda slug: {"slug": slug, "usages": []})

    result = le.swap_non_unique_term_usages("old", "new")

    assert result["updated_usages"] == 2
    assert replacements == [
        (
            "Fake",
            "Fake",
            {"term_slugs": ["old", "keep"], "scope": "combined"},
            {"term_slugs": ["new", "keep"], "scope": "combined"},
        ),
        (
            "Other",
            "__alt__.Parasha.0",
            {"term_slugs": ["prefix", "old"], "scope": "alone"},
            {"term_slugs": ["prefix", "new"], "scope": "alone"},
        ),
    ]


def test_swap_non_unique_term_usages_validation(monkeypatch):
    class FakeNonUniqueTerm:
        @staticmethod
        def init(slug):
            return object() if slug == "old" else None

    monkeypatch.setattr(le, "NonUniqueTerm", FakeNonUniqueTerm)

    with pytest.raises(InputError):
        le.swap_non_unique_term_usages("old", "old")
    with pytest.raises(InputError):
        le.swap_non_unique_term_usages("old", "missing")
    with pytest.raises(InputError):
        le.swap_non_unique_term_usages("missing", "old")


# ---------------------------------------------------------------------------
# Node property editing — pure logic (no index.save())
# ---------------------------------------------------------------------------

class _FakeNode:
    """Minimal stand-in for a schema node: class-level optional_param_keys + attrs."""
    optional_param_keys = []

    def __init__(self, **attrs):
        for k, v in attrs.items():
            setattr(self, k, v)


class _FakeJaggedArrayNode(_FakeNode):
    optional_param_keys = ["referenceable", "numeric_equivalent", "referenceableSections",
                           "isSegmentLevelDiburHamatchil", "diburHamatchilRegexes"]


class _FakeArrayMapNode(_FakeNode):
    optional_param_keys = _FakeJaggedArrayNode.optional_param_keys + ["skipped_addresses", "isMapReferenceable"]


class _FakeAltStructNode(_FakeNode):
    optional_param_keys = ["referenceable", "numeric_equivalent"]


def test_node_supports_property():
    ja, amap, alt = _FakeJaggedArrayNode(), _FakeArrayMapNode(), _FakeAltStructNode()
    assert le._node_supports_property(amap, "skipped_addresses")
    assert le._node_supports_property(amap, "isMapReferenceable")
    assert not le._node_supports_property(ja, "skipped_addresses")
    assert not le._node_supports_property(alt, "referenceableSections")
    for prop in ("referenceable", "numeric_equivalent"):
        assert le._node_supports_property(alt, prop)


def test_apply_referenceable():
    node = _FakeAltStructNode()
    le._apply_node_property(node, "referenceable", "optional")
    assert node.referenceable == "optional"
    le._apply_node_property(node, "referenceable", False)
    assert node.referenceable is False
    le._apply_node_property(node, "referenceable", None)  # None removes -> default
    assert not hasattr(node, "referenceable")
    with pytest.raises(InputError):
        le._apply_node_property(node, "referenceable", "bogus")


def test_apply_numeric_equivalent():
    node = _FakeAltStructNode()
    le._apply_node_property(node, "numeric_equivalent", "5")  # coerced from string
    assert node.numeric_equivalent == 5
    le._apply_node_property(node, "numeric_equivalent", None)
    assert not hasattr(node, "numeric_equivalent")
    with pytest.raises(InputError):
        le._apply_node_property(node, "numeric_equivalent", "abc")


def test_apply_referenceable_sections():
    node = _FakeJaggedArrayNode(depth=2)
    le._apply_node_property(node, "referenceableSections", [False, True])
    assert node.referenceableSections == [False, True]
    # All-true equals the default, so it is removed rather than stored.
    le._apply_node_property(node, "referenceableSections", [True, True])
    assert not hasattr(node, "referenceableSections")
    # Length must match node depth.
    with pytest.raises(InputError):
        le._apply_node_property(node, "referenceableSections", [True])
    with pytest.raises(InputError):
        le._apply_node_property(node, "referenceableSections", [1, 0])  # not booleans


def test_apply_dibur_hamatchil_regexes():
    node = _FakeArrayMapNode()
    le._apply_node_property(node, "diburHamatchilRegexes", ["^(<b>.*?</b>)"])
    assert node.diburHamatchilRegexes == ["^(<b>.*?</b>)"]
    le._apply_node_property(node, "diburHamatchilRegexes", [])  # empty removes
    assert not hasattr(node, "diburHamatchilRegexes")
    with pytest.raises(InputError):
        le._apply_node_property(node, "diburHamatchilRegexes", ["(unterminated"])  # invalid regex


def test_apply_skipped_addresses():
    node = _FakeArrayMapNode()
    le._apply_node_property(node, "skipped_addresses", ["245", 246])
    assert node.skipped_addresses == [245, 246]
    le._apply_node_property(node, "skipped_addresses", [])
    assert not hasattr(node, "skipped_addresses")
    with pytest.raises(InputError):
        le._apply_node_property(node, "skipped_addresses", ["nope"])


def test_apply_boolean_defaults_are_removed():
    node = _FakeArrayMapNode()
    # isSegmentLevelDiburHamatchil default is False -> storing False removes it.
    le._apply_node_property(node, "isSegmentLevelDiburHamatchil", True)
    assert node.isSegmentLevelDiburHamatchil is True
    le._apply_node_property(node, "isSegmentLevelDiburHamatchil", False)
    assert not hasattr(node, "isSegmentLevelDiburHamatchil")
    # isMapReferenceable default is True -> storing True removes it.
    le._apply_node_property(node, "isMapReferenceable", False)
    assert node.isMapReferenceable is False
    le._apply_node_property(node, "isMapReferenceable", True)
    assert not hasattr(node, "isMapReferenceable")


def test_serialize_node_properties():
    node = _FakeArrayMapNode(referenceable="optional", skipped_addresses=[3])
    props = le.serialize_node_properties(node)
    # Only editable props that apply to an ArrayMapNode appear.
    assert set(props) == set(le.EDITABLE_NODE_PROPERTIES)
    assert props["referenceable"] == "optional"
    assert props["skipped_addresses"] == [3]
    assert props["isMapReferenceable"] is None  # unset

    alt_props = le.serialize_node_properties(_FakeAltStructNode())
    assert set(alt_props) == {"referenceable", "numeric_equivalent"}


# ---------------------------------------------------------------------------
# Redis usage index — surgical add/remove (cache only)
# ---------------------------------------------------------------------------

def test_usage_index_surgical_add_remove():
    entry = {
        "index_title": "__LE_TEST__",
        "node_key_path": ["__LE_TEST__"],
        "node_title": "Test",
        "struct_name": None,
        "term_slugs": ["__le_test_slug_a__", "__le_test_slug_b__"],
        "scope": "combined",
    }
    try:
        ni.add_usage_entry(entry)
        for slug in entry["term_slugs"]:
            usages = ni.get_term_usages(slug)
            assert any(u["index_title"] == "__LE_TEST__" for u in usages)

        # Idempotent: adding again does not duplicate.
        ni.add_usage_entry(entry)
        count = sum(1 for u in ni.get_term_usages("__le_test_slug_a__") if u["index_title"] == "__LE_TEST__")
        assert count == 1
    finally:
        ni.remove_usage_entry(entry)

    for slug in entry["term_slugs"]:
        assert not any(u["index_title"] == "__LE_TEST__" for u in ni.get_term_usages(slug))


# ---------------------------------------------------------------------------
# DB-backed, read-only
# ---------------------------------------------------------------------------

def test_get_node_by_key_path():
    from sefaria.model import library
    idx = library.get_index("Berakhot")
    root = le.get_node_by_key_path(idx, ["Berakhot"])
    assert root is not None and root.key == "Berakhot"
    # Tolerates omission of the leading root key.
    assert le.get_node_by_key_path(idx, []).key == "Berakhot"
    # Unknown key resolves to None.
    assert le.get_node_by_key_path(idx, ["Berakhot", "NoSuchChild"]) is None


def test_get_node_by_editor_path_alt_struct():
    class FakeNode:
        def __init__(self, key=None, children=None):
            self.key = key
            self.children = children or []

        def get_child_by_key(self, key):
            for child in self.children:
                if child.key == key:
                    return child

    alt_leaf = FakeNode("alt-leaf")
    alt_root = FakeNode("alt-root", [alt_leaf])

    class FakeIndex:
        nodes = FakeNode("Default")

        def get_alt_structure(self, name):
            return FakeNode(children=[alt_root]) if name == "Parasha" else None

    node, struct_name = le.get_node_by_editor_path(FakeIndex(), ["__alt__", "Parasha", "0", "0"])
    assert node is alt_leaf
    assert struct_name == "Parasha"

    node, struct_name = le.get_node_by_editor_path(FakeIndex(), ["__alt__", "Parasha", "99"])
    assert node is None
    assert struct_name == "Parasha"


def test_search_and_detail_non_unique_terms():
    results = le.search_non_unique_terms("bavli", 5)
    slugs = [t["slug"] for t in results]
    assert "bavli" in slugs

    detail = le.get_non_unique_term_detail("bavli")
    assert detail["slug"] == "bavli"
    assert len(detail["titles"]) > 0
    assert "usages" in detail

    with pytest.raises(InputError):
        le.get_non_unique_term_detail("__no_such_slug__")


def test_search_non_unique_terms_by_slug():
    # The hyphenated slug does not appear in the term's titles (which use spaces),
    # so a hit here can only come from matching the slug itself.
    results = le.search_non_unique_terms("a-collection-on-prophets", 5)
    assert "a-collection-on-prophets" in [t["slug"] for t in results]


def test_search_non_unique_terms_normalizes_query(monkeypatch):
    captured = []

    class FakeTerm:
        slug = "__le_test_term__"

        def get_primary_title(self, lang):
            return "Primary" if lang == "en" else "עיקרי"

    class FakeNonUniqueTermSet:
        def __init__(self, query, limit=None):
            captured.append((query, limit))

        def __iter__(self):
            return iter([FakeTerm()])

    monkeypatch.setattr(le, "NonUniqueTermSet", FakeNonUniqueTermSet)

    assert le.search_non_unique_terms("  Ḥagigah   ha  ", 7) == [{
        "slug": "__le_test_term__",
        "primary_en": "Primary",
        "primary_he": "עיקרי",
    }]
    regex = {"$regex": le.re.escape("Hagigah ha"), "$options": "i"}
    assert captured[0] == (
        {"$or": [{"titles.text": regex}, {"slug": regex}]},
        7,
    )

    le.search_non_unique_terms("בְּרֵאשִׁ֑ית", 5)
    regex = {"$regex": le.re.escape("בראשית"), "$options": "i"}
    assert captured[1] == (
        {"$or": [{"titles.text": regex}, {"slug": regex}]},
        5,
    )


def test_create_non_unique_term():
    from sefaria.model.schema import NonUniqueTerm
    detail = None
    try:
        detail = le.create_non_unique_term([
            {"lang": "en", "text": "Zzz Editor Test Term"},
            {"lang": "he", "text": "זזז מונח בדיקה"},
        ])
        assert detail["slug"] == "zzz-editor-test-term"
        langs = {(t["lang"], t.get("primary")) for t in detail["titles"]}
        assert ("en", True) in langs and ("he", True) in langs
        assert detail["usages"] == []
    finally:
        if detail:
            NonUniqueTerm.init(detail["slug"]).delete()


def test_create_non_unique_term_normalizes_titles_with_linker_normalizer():
    from sefaria.model.schema import NonUniqueTerm
    detail = None
    try:
        detail = le.create_non_unique_term([
            {"lang": "en", "text": "  Ḥagigah   Editor Test Term  "},
            {"lang": "he", "text": "בְּרֵאשִׁ֑ית בדיקה"},
        ])
        stored = {t["text"] for t in detail["titles"]}
        assert "Hagigah Editor Test Term" in stored
        assert "בראשית בדיקה" in stored
    finally:
        if detail:
            NonUniqueTerm.init(detail["slug"]).delete()


def test_create_non_unique_term_requires_a_title():
    with pytest.raises(InputError):
        le.create_non_unique_term([])
    with pytest.raises(InputError):
        le.create_non_unique_term([{"lang": "en", "text": "   "}])


def test_search_empty_query_returns_empty():
    assert le.search_non_unique_terms("", 5) == []
    assert le.search_non_unique_terms("   ", 5) == []


def test_get_non_unique_term_titles():
    titles = le.get_non_unique_term_titles(["bavli"])
    assert "bavli" in titles
    assert titles["bavli"]["primary_en"]
    assert "primary_he" in titles["bavli"]

    # Unknown/blank slugs are silently skipped; empty input returns {}.
    assert le.get_non_unique_term_titles([]) == {}
    assert le.get_non_unique_term_titles(["", "__no_such_slug__"]) == {}
