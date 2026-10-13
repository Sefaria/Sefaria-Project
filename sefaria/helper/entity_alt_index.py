# -*- coding: utf-8 -*-
"""
Book, author and topic titles as a second source of auto-correction targets, so a query like
"Mishne Torah" can be fixed even when the corpus table doesn't hold that phrase.

Unlike the corpus table this is cheap to build, so each process builds it at startup from
Index/Topic data rather than persisting it. Titles are normalized with the corpus table's
`tokenize` (not the ES-analyzer tokenizer in helper/search.py) because both sources feed the
same edit-distance comparison against the query.
"""
from typing import Callable, Dict, FrozenSet, Hashable, Iterable, Sequence, Set, Tuple

from sefaria.helper.top_n_grams_for_search_autocorrect import _keep_max, _tie_break_score, build_phrase_trie, tokenize

# Same cutoff AutoCompleter uses to keep low-signal topics out of anything query-facing.
# Books and authors are exempt: each is a curated name worth correcting toward regardless.
MIN_TOPIC_SOURCES = 10

# Added to books and authors (as AutoCompleter favors authors), since a curated name beats a
# generic topic string. Not absolute: a very common corpus phrase can still outrank it.
NAMED_ENTITY_BONUS = 2.0


def _entity_tie_break_score(weight: float, bonus: bool = False) -> float:
    score = _tie_break_score(weight)
    return score + NAMED_ENTITY_BONUS if bonus else score


def _normalize_phrase(title: str, lang: str) -> str:
    return " ".join(tokenize(title, lang))


def _add_entry(index: Dict[str, float], phrase: str, score: float) -> None:
    # A title shared by several entities (e.g. a book and a topic) keeps the higher score.
    if phrase:
        _keep_max(index, phrase, score)


def _entity_key(kind: str, entity) -> Hashable:
    return kind, getattr(entity, "slug", None) or getattr(entity, "title", None) or id(entity)


def _add_titles(index: Dict[str, float], titles_for: Callable[[str], Iterable[str]], score: float,
                langs: Sequence[str], owners: Dict[str, Set[Hashable]] = None, entity: Hashable = None) -> None:
    for lang in langs:
        for title in titles_for(lang) or []:
            phrase = _normalize_phrase(title, lang)
            _add_entry(index, phrase, score)
            if owners is not None and phrase:
                owners.setdefault(phrase, set()).add(entity)


def build_entity_alt_tables(langs: Sequence[str] = ('en', 'he'), min_topic_sources: int = MIN_TOPIC_SOURCES
                            ) -> Tuple[Dict[str, float], Dict[str, FrozenSet[Hashable]]]:
    """({normalized title: score on the corpus table's scale}, {normalized title: entities carrying it})."""
    from sefaria.model import IndexSet
    from sefaria.model.topic import TopicSet, AuthorTopicSet

    index: Dict[str, float] = {}
    owners: Dict[str, Set[Hashable]] = {}

    book_score = _entity_tie_break_score(0, bonus=True)  # books have no popularity signal
    for book in IndexSet():
        if book.nodes:
            # Root titles only: Index.all_titles() also yields section titles like
            # "Moreh Nevukhim, Prefatory Remarks".
            _add_titles(index, book.nodes.title_group.all_titles, book_score, langs,
                        owners, _entity_key("book", book))

    topics = TopicSet({"shouldDisplay": {"$ne": False}, "numSources": {"$gte": min_topic_sources},
                        "subclass": {"$ne": "author"}})
    for t in topics:
        _add_titles(index, lambda lang, t=t: t.get_titles(lang, with_disambiguation=False),
                    _entity_tie_break_score(getattr(t, "numSources", 0)), langs, owners, _entity_key("topic", t))

    for author in AuthorTopicSet():
        _add_titles(index, lambda lang, a=author: a.get_titles(lang, with_disambiguation=False),
                    _entity_tie_break_score(getattr(author, "numSources", 0), bonus=True), langs,
                    owners, _entity_key("topic", author))

    return index, {phrase: frozenset(keys) for phrase, keys in owners.items()}


def build_entity_alt_index(langs: Sequence[str] = ('en', 'he'),
                            min_topic_sources: int = MIN_TOPIC_SOURCES) -> Dict[str, float]:
    return build_entity_alt_tables(langs, min_topic_sources)[0]


def build_entity_alt_trie(langs: Sequence[str] = ('en', 'he'), min_topic_sources: int = MIN_TOPIC_SOURCES):
    """(score trie, {title: owning entities}). Float scores need datrie.Trie; the index is small
    enough that its per-value cost doesn't matter."""
    index, owners = build_entity_alt_tables(langs, min_topic_sources)
    return build_phrase_trie(index.items(), int_values=False), owners
