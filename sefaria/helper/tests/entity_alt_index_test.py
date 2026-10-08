# -*- coding: utf-8 -*-
"""
build_entity_alt_index() runs against stand-ins for IndexSet/TopicSet/AuthorTopicSet, not Mongo.
"""
from sefaria.helper.entity_alt_index import (
    MIN_TOPIC_SOURCES,
    NAMED_ENTITY_BONUS,
    _entity_tie_break_score,
    _normalize_phrase,
    _add_entry,
    build_entity_alt_index,
)


# --------------------------------------------------------------------------- #
#  _entity_tie_break_score                                                    #
# --------------------------------------------------------------------------- #

def test_entity_tie_break_score_damps_like_the_top_n_grams_scale():
    assert _entity_tie_break_score(0) == 0
    assert _entity_tie_break_score(9) < _entity_tie_break_score(99)


def test_entity_tie_break_score_adds_named_entity_bonus():
    plain = _entity_tie_break_score(50)
    with_bonus = _entity_tie_break_score(50, bonus=True)
    assert with_bonus == plain + NAMED_ENTITY_BONUS


def test_entity_tie_break_score_bonus_applies_even_at_zero_weight():
    # Books/authors are included regardless of their own popularity signal (mirrors
    # AutoCompleter for authors) -- the bonus must still land at weight 0.
    assert _entity_tie_break_score(0, bonus=True) == NAMED_ENTITY_BONUS


# --------------------------------------------------------------------------- #
#  _normalize_phrase / _add_entry                                             #
# --------------------------------------------------------------------------- #

def test_normalize_phrase_matches_word_by_word_normalization():
    assert _normalize_phrase("Mishneh Torah", "en") == "mishneh torah"
    assert _normalize_phrase("", "en") == ""
    assert _normalize_phrase(None, "en") == ""


def test_normalize_phrase_applies_the_linker_normalizer_by_language():
    # Hebrew: nikud/cantillation and maqaf handled like the top-n-grams table; geresh -> apostrophe.
    assert _normalize_phrase("בְּרֵאשִׁית־בָּרָא", "he") == "בראשית ברא"
    assert _normalize_phrase("רמב״ם", "he") == 'רמב"ם'
    assert _normalize_phrase("  Rashi’s   Commentary ", "en") == "rashi’s commentary".replace("’", "'")


def test_add_entry_keeps_the_higher_score_on_collision():
    index = {}
    _add_entry(index, "shared title", 1.0)
    _add_entry(index, "shared title", 5.0)
    assert index["shared title"] == 5.0
    _add_entry(index, "shared title", 2.0)  # lower score must not overwrite
    assert index["shared title"] == 5.0


def test_add_entry_ignores_empty_phrase():
    index = {}
    _add_entry(index, "", 10.0)
    assert index == {}


# --------------------------------------------------------------------------- #
#  build_entity_alt_index (stubbed IndexSet / TopicSet / AuthorTopicSet)      #
# --------------------------------------------------------------------------- #

class _FakeTitleGroup:
    def __init__(self, titles_by_lang):
        self._titles_by_lang = titles_by_lang

    def all_titles(self, lang):
        return self._titles_by_lang.get(lang, [])


class _FakeNodes:
    def __init__(self, titles_by_lang):
        self.title_group = _FakeTitleGroup(titles_by_lang)


class _FakeIndex:
    def __init__(self, titles_by_lang):
        self.nodes = _FakeNodes(titles_by_lang)


class _FakeIndexNoNodes:
    """A stub/malformed Index with no schema tree -- build_entity_alt_index must skip it,
    not crash (mirrors top_n_grams_for_search_autocorrect.build_top_n_grams's own
    `if not index.nodes` guard)."""
    nodes = None


class _FakeTopic:
    def __init__(self, titles_by_lang, num_sources):
        self._titles_by_lang = titles_by_lang
        self.numSources = num_sources

    def get_titles(self, lang, with_disambiguation=False):
        return self._titles_by_lang.get(lang, [])


def test_build_entity_alt_index_indexes_books_authors_and_topics(monkeypatch):
    books = [_FakeIndex({"en": ["Mishneh Torah"], "he": ["משנה תורה"]}), _FakeIndexNoNodes()]
    topics = [_FakeTopic({"en": ["Prayer", "Tefillah"]}, num_sources=50)]
    authors = [_FakeTopic({"en": ["Rashi"]}, num_sources=500)]

    import sefaria.model as sefaria_model
    import sefaria.model.topic as sefaria_topic
    monkeypatch.setattr(sefaria_model, "IndexSet", lambda *a, **k: books, raising=False)
    monkeypatch.setattr(sefaria_topic, "TopicSet", lambda *a, **k: topics)
    monkeypatch.setattr(sefaria_topic, "AuthorTopicSet", lambda *a, **k: authors)

    index = build_entity_alt_index(langs=("en", "he"))

    assert index["mishneh torah"] == NAMED_ENTITY_BONUS  # no book popularity signal -> bonus alone
    assert index["משנה תורה"] == NAMED_ENTITY_BONUS
    assert index["prayer"] == _entity_tie_break_score(50)
    assert index["tefillah"] == _entity_tie_break_score(50)
    assert index["rashi"] == _entity_tie_break_score(500, bonus=True)
    # The no-nodes stub index contributed nothing and didn't raise.
    assert len(index) == 5


def test_build_entity_alt_index_author_outscores_equally_sourced_topic(monkeypatch):
    topics = [_FakeTopic({"en": ["Same Name"]}, num_sources=50)]
    authors = []

    import sefaria.model as sefaria_model
    import sefaria.model.topic as sefaria_topic
    monkeypatch.setattr(sefaria_model, "IndexSet", lambda *a, **k: [], raising=False)
    monkeypatch.setattr(sefaria_topic, "TopicSet", lambda *a, **k: topics)
    monkeypatch.setattr(sefaria_topic, "AuthorTopicSet", lambda *a, **k: authors)
    topic_only = build_entity_alt_index(langs=("en",))

    authors = [_FakeTopic({"en": ["Same Name"]}, num_sources=50)]
    topics = []
    monkeypatch.setattr(sefaria_topic, "TopicSet", lambda *a, **k: topics)
    monkeypatch.setattr(sefaria_topic, "AuthorTopicSet", lambda *a, **k: authors)
    author_only = build_entity_alt_index(langs=("en",))

    assert author_only["same name"] == topic_only["same name"] + NAMED_ENTITY_BONUS


def test_build_entity_alt_index_min_topic_sources_excludes_low_signal_topics(monkeypatch):
    topics = []  # TopicSet's own query does the >= filtering in real Mongo; here we assert
                 # the parameter is actually threaded through to the query, not hard-coded.
    captured = {}

    def fake_topic_set(query):
        captured["query"] = query
        return topics

    import sefaria.model as sefaria_model
    import sefaria.model.topic as sefaria_topic
    monkeypatch.setattr(sefaria_model, "IndexSet", lambda *a, **k: [], raising=False)
    monkeypatch.setattr(sefaria_topic, "TopicSet", fake_topic_set)
    monkeypatch.setattr(sefaria_topic, "AuthorTopicSet", lambda *a, **k: [])

    build_entity_alt_index(langs=("en",), min_topic_sources=25)
    assert captured["query"]["numSources"] == {"$gte": 25}


def test_build_entity_alt_index_books_get_the_same_bonus_as_a_zero_sourced_author(monkeypatch):
    books = [_FakeIndex({"en": ["Some Book"]})]
    authors = [_FakeTopic({"en": ["Some Author"]}, num_sources=0)]

    import sefaria.model as sefaria_model
    import sefaria.model.topic as sefaria_topic
    monkeypatch.setattr(sefaria_model, "IndexSet", lambda *a, **k: books, raising=False)
    monkeypatch.setattr(sefaria_topic, "TopicSet", lambda *a, **k: [])
    monkeypatch.setattr(sefaria_topic, "AuthorTopicSet", lambda *a, **k: authors)

    index = build_entity_alt_index(langs=("en",))
    assert index["some book"] == index["some author"] == NAMED_ENTITY_BONUS


def test_min_topic_sources_default_matches_autocompleter_threshold():
    # sefaria/model/autospell.py's AutoCompleter already made this call (min_topics=10) for
    # the same "keep low-signal topics out of anything query-facing" reason; this index
    # mirrors it rather than picking its own number.
    assert MIN_TOPIC_SOURCES == 10
