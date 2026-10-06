# -*- coding: utf-8 -*-
"""
Runtime-only entity alt-title/name index for search-query auto-correction (sc-47189).

Unlike sefaria/helper/top_n_grams_for_search_autocorrect.py's corpus phrase table -- built by
a weekly CronJob and persisted to Mongo (`db.top_n_grams_for_search_autocorrect`) -- this
index is built fresh in-process at startup from already-live Mongo collections
(Index / Topic / AuthorTopic) and is NEVER written back to Mongo. There is no
`db.entity_alt_index` collection, and there must never be one: every web pod rebuilds this
from the same source data it already has to load anyway, the same way the autocompleters do
(see `Library.build_full_auto_completer`).

It holds every Book title/variant, Author name/variant, and sufficiently-sourced Topic
title/variant, each mapped to a precomputed tie-break score so it can be ranked against a
top-n-grams candidate on one scale (see
`sefaria.helper.top_n_grams_for_search_autocorrect._tie_break_score` and
`_entity_tie_break_score` below) -- letting `autocorrect_query` offer a fix like
"Mishne Torah" -> "Mishneh Torah" even though that phrase never clears the top-n-grams
table's doc-count threshold, or exceeds its MAX_PHRASE_WORDS cap.

`Library.build_entity_alt_index()` (sefaria/model/text.py) builds this once per process, from
`init_library_cache()` (reader/startup.py), onto `Library._entity_alt_index`. Normalization
deliberately reuses top_n_grams_for_search_autocorrect.py's own (`normalize_word`, simple
whitespace split) -- not the separate ES-analyzer-mirroring tokenizer in
sefaria/helper/search.py -- because this index feeds the same edit-distance phrase matching
the top-n-grams table already does, and the two sides of that comparison have to agree on
what a "phrase" looks like.
"""
import math
from typing import Dict, Sequence

import structlog

from sefaria.helper.top_n_grams_for_search_autocorrect import build_phrase_trie, normalize_word

logger = structlog.get_logger(__name__)

# Topics below this numSources are excluded -- the same threshold AutoCompleter already uses
# (sefaria/model/autospell.py's `min_topics=10`) to keep low-signal/auto-generated topics out
# of anything query-facing. Books and authors are exempt (see build_entity_alt_index): each is
# a specifically-named, curated entity worth correcting toward on its own identity, regardless
# of source count -- the same call AutoCompleter already makes for authors, for the same
# reason. A generic Topic has no such identity of its own, so it still has to earn its place
# via numSources.
MIN_TOPIC_SOURCES = 10

# Flat score bonus for a Book or Author candidate, added on top of its own log-damped
# popularity score (numSources for an author; 0 for a book -- see build_entity_alt_index,
# neither has a *better* signal than "it's a specifically-named entity at all"). Mirrors
# AutoCompleter's own `sub_order -= 100` "authors shouldn't get drowned out" rule
# (autospell.py), extended to books for the same reason: both are a single curated title/name,
# not a generic topic string. Strong, but not absolute: an overwhelmingly-attested corpus
# phrase can in principle still outrank a sparse book/author -- the same "gentle tie-breaker,
# never a dominant signal" policy the team already chose for entity-search relevance (see
# get_entity_query_obj's popularity script_score).
NAMED_ENTITY_BONUS = 2.0


def _entity_tie_break_score(weight: float, bonus: bool = False) -> float:
    """
    Damps a raw popularity count (numSources, or 0 for an entity with no such signal) onto the
    same log scale sefaria.helper.top_n_grams_for_search_autocorrect._tie_break_score uses for a
    phrase's doc count, so a candidate from this index and a candidate from the top-n-grams
    table can be ranked against each other at query time without one source's naturally
    larger raw numbers (corpus doc counts are typically far bigger than a topic's numSources)
    automatically winning. `bonus=True` (books, authors) adds NAMED_ENTITY_BONUS on top --
    see that constant.
    """
    score = math.log10(1 + max(weight, 0))
    return score + NAMED_ENTITY_BONUS if bonus else score


def _normalize_phrase(title: str) -> str:
    return " ".join(normalize_word(w) for w in (title or "").split())


def _add_entry(index: Dict[str, float], phrase: str, score: float) -> None:
    """
    A phrase can belong to more than one entity (title collisions happen, e.g. a book and a
    topic sharing a name) -- keep whichever owner scores higher rather than whichever was
    indexed last.
    """
    if phrase and (phrase not in index or score > index[phrase]):
        index[phrase] = score


def build_entity_alt_index(langs: Sequence[str] = ('en', 'he'),
                            min_topic_sources: int = MIN_TOPIC_SOURCES) -> Dict[str, float]:
    """
    Build the runtime entity-alt index: {normalized_phrase: tie_break_score}, covering every
    Book title/variant, Author name/variant, and sufficiently-sourced Topic title/variant, in
    every language in `langs`. One bulk Mongo query per entity type -- `IndexSet()`,
    `TopicSet(...)`, `AuthorTopicSet()` -- no per-record round trips, mirroring
    `top_n_grams_for_search_autocorrect.build_top_n_grams()`'s own `IndexSet()` walk.
    """
    from sefaria.model import IndexSet
    from sefaria.model.topic import TopicSet, AuthorTopicSet

    index: Dict[str, float] = {}

    book_score = _entity_tie_break_score(0, bonus=True)  # no per-book popularity signal exists
    for book in IndexSet():
        if not book.nodes:
            continue
        # Book-level title + titleVariants only (the root node's own title group) -- NOT
        # Index.all_titles(), which walks the whole schema tree and on a complex text
        # produces noise like "Moreh Nevukhim, Prefatory Remarks" that is not a book title.
        for lang in langs:
            for title in (book.nodes.title_group.all_titles(lang) or []):
                _add_entry(index, _normalize_phrase(title), book_score)

    topics = TopicSet({"shouldDisplay": {"$ne": False}, "numSources": {"$gte": min_topic_sources},
                        "subclass": {"$ne": "author"}})
    for t in topics:
        score = _entity_tie_break_score(getattr(t, "numSources", 0))
        for lang in langs:
            for title in t.get_titles(lang, with_disambiguation=False):
                _add_entry(index, _normalize_phrase(title), score)

    for author in AuthorTopicSet():
        score = _entity_tie_break_score(getattr(author, "numSources", 0), bonus=True)
        for lang in langs:
            for title in author.get_titles(lang, with_disambiguation=False):
                _add_entry(index, _normalize_phrase(title), score)

    return index


def build_entity_alt_trie(langs: Sequence[str] = ('en', 'he'),
                           min_topic_sources: int = MIN_TOPIC_SOURCES):
    """
    `build_entity_alt_index`, as the trie `autocorrect_query` looks phrases up in at runtime
    (see `build_phrase_trie`) -- what `Library.build_entity_alt_index` holds. Scores are floats,
    so this is a `datrie.Trie` rather than the int-valued `BaseTrie` the corpus table uses.
    """
    return build_phrase_trie(build_entity_alt_index(langs, min_topic_sources).items(), int_values=False)
