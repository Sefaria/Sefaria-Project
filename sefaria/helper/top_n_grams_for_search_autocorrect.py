# -*- coding: utf-8 -*-
"""
Top n-grams table for search-query auto-correction (sc-47189).

The "top n-grams" table is a precomputed set of normalized *phrases* -- contiguous runs of
1 to `MAX_PHRASE_WORDS` words -- that occur in more than some threshold of Sefaria segments
("documents"), each mapped to the number of documents it appears in. It powers query
auto-correction: a search query (or, for a query longer than `MAX_PHRASE_WORDS` words, the
longest contiguous run of its words) that isn't itself a known phrase, but is exactly one
edit (insert/delete/replace/transpose) away from one, gets silently rewritten to that known
phrase before hitting Elasticsearch (see `autocorrect_query` below and its caller,
`search_wrapper_api` in reader/views.py).

Correcting whole phrases rather than individual words (the original POC) matters because a
lone word can be a perfectly good 1-edit fix in isolation while still producing a corrected
*phrase* that appears nowhere in the corpus -- e.g. a real word substituted into a sequence
that never actually occurs together. Requiring the corrected phrase itself to be a top-n-gram
entry means a correction is only ever offered if the result is something the corpus actually
contains.

The table is built by `scripts/build_top_n_grams_for_search_autocorrect.py`, run on a
schedule by the `build-top-n-grams-for-search-autocorrect` CronJob
(helm-chart/sefaria/templates/cronjob/), and persisted to Mongo
(`db.top_n_grams_for_search_autocorrect`) rather than a local file -- every web pod reads the
same collection at startup with no artifact-shipping step of its own (see `save_top_n_grams` /
`load_top_n_grams` below). `Library.build_top_n_grams_for_search_autocorrect()`
(sefaria/model/text.py) loads it once, from `init_library_cache()` (reader/startup.py), onto
`Library._top_n_grams_for_search_autocorrect`. This module holds the tokenizer the builder and
the search-time lookup share, plus the edit-distance-1 candidate generation and the Mongo
load/save helpers.

At search time both tables live in `datrie` tries (see `build_phrase_trie`), the same
structure the autocompleters in sefaria/model/autospell.py use, rather than Python dicts: a
trie shares common prefixes, which cuts the resident size of a multi-million-phrase table
considerably. Keys are normalized with autospell's `normalize_chars` so every one fits the
trie's `letter_scope` alphabet; `autocorrect_query` normalizes the query the same way.
Lookups are unchanged (`in` / `[]`), so a plain dict works anywhere a trie does -- the
builder, which only ever holds its counts transiently, still produces one.

`autocorrect_query` also optionally takes `entity_alt_index`: the runtime-only (never
persisted to Mongo) index of Book/Author/Topic alternate titles built by
`sefaria/helper/entity_alt_index.py` and held on `Library._entity_alt_index`. A candidate
from either source is ranked by the same damped popularity tie-break (`_tie_break_score`),
so the two can be compared on one scale even though their raw weights (corpus doc counts vs.
a topic's `numSources`) are nothing alike.

When more than one candidate is close in that score (see `AMBIGUITY_LOG_GAP`), picking the
single highest-scoring one would be a guess, not a correction -- two terms close in weight are
genuinely competing for the user's attention (e.g. "mari" vs "maariv"), and silently choosing
between them is as likely to be wrong as right. In that case `autocorrect_query` does not
correct the query at all; it returns the competing terms instead (sorted A-Z), so the caller
can show them as suggestions while the original, uncorrected query is what actually runs. A
large gap between the top two candidates means they are not really competing -- one is so much
more attested than the other that picking it is a correction, not a guess -- so that case still
auto-corrects exactly as before.
"""
import math
import re
import tempfile
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple, Union

import datrie
import structlog
from pymongo import UpdateOne

from sefaria.model.autospell import SpellChecker, letter_scope, normalize_chars
from sefaria.system.database import db

logger = structlog.get_logger(__name__)

# Mongo collection the built table lives in: one document per phrase ({"_id": phrase,
# "count": doc_count, "batch": <build timestamp>}), plus one "__meta__" document carrying
# build info. `phrase` is 1 to MAX_PHRASE_WORDS words, normalized and joined by a single
# space -- the same shape `autocorrect_query` looks phrases up by.
TOP_N_GRAMS_COLLECTION = "top_n_grams_for_search_autocorrect"
_META_ID = "__meta__"
# Mongo bulk_write payloads are chunked at this size so a full-library build (potentially
# millions of phrases, now that every 1-3 word run is counted rather than every word) doesn't
# assemble one enormous in-memory request.
_BULK_WRITE_CHUNK_SIZE = 5000
# build_top_n_grams splits each phrase-length level into this many passes over the spooled
# segments to bound the size of the in-memory counter (see its docstring).
_DEFAULT_NUM_SHARDS = 16

# The longest phrase (in words) the table indexes and autocorrect_query will ever try to
# correct as a unit. Chosen so correction stays scoped to a coherent phrase rather than a
# single word -- see the module docstring -- while keeping the build tractable: a segment of
# length L contributes O(L * MAX_PHRASE_WORDS) phrases rather than O(L^2).
MAX_PHRASE_WORDS = 3

# How close (on the log-damped tie-break scale) the top two candidates have to be before
# they're treated as genuinely competing rather than one being a clear winner. Candidate
# scores are already log10 of a raw weight (doc count / numSources -- see _tie_break_score /
# entity_alt_index's _entity_tie_break_score), so a gap of 1.0 means the leader's underlying
# weight is roughly 10x the runner-up's or more: at that point they are not really competing
# for the user's attention (see the module docstring's "mari" vs "maariv" example), and the
# correction is confident enough to apply automatically, same as a single-candidate fix.
AMBIGUITY_LOG_GAP = 1.0

# Strip every leading/trailing non-word character (regular punctuation, ASCII/Hebrew quote
# marks, etc) but leave the interior of the word untouched -- this is what keeps an
# abbreviation's internal gershayim intact, e.g. 'רמב"ם' / 'רמב״ם' survive as one token.
_EDGE_STRIP_RE = re.compile(r'^\W+|\W+$', re.UNICODE)


def normalize_word(word: str) -> str:
    """
    Normalize a single already-whitespace-split token for the top-n-grams table: strip
    leading/trailing punctuation (keeping internal punctuation, e.g. internal quotation
    marks, untouched) and lowercase the result. No lemmatization is attempted (POC).
    """
    return _EDGE_STRIP_RE.sub('', word).lower()


def tokenize(text: str, lang: str) -> List[str]:
    """
    Split a segment of text into normalized words for the top-n-grams table. Runs the same
    normalizer the linker applies server-side (get_linker_normalizer) first, so words are
    tokenized consistently with the rest of the NLP pipeline -- cantillation/maqaf/HTML/
    footnote-markers stripped, quote characters unidecoded to ASCII -- then splits on
    whitespace and strips edge punctuation per word.
    """
    from sefaria.model.linker.linker_entity_recognizer import get_linker_normalizer
    normalized = get_linker_normalizer(lang).normalize(text or '')
    return [w for w in (normalize_word(tok) for tok in normalized.split()) if w]


def _segment_phrases(tokens: List[str], max_n: int = MAX_PHRASE_WORDS) -> set:
    """
    Every contiguous run of 1 to `max_n` words in `tokens` (a tokenized segment), each
    joined into a single space-separated phrase string. A phrase that recurs within the
    same segment (e.g. a word repeated twice) appears once in the returned set -- doc
    counting, like the original per-word table, counts a segment at most once per phrase.
    """
    phrases = set()
    n_tokens = len(tokens)
    for n in range(1, min(max_n, n_tokens) + 1):
        for start in range(0, n_tokens - n + 1):
            phrases.add(" ".join(tokens[start:start + n]))
    return phrases


# --- Build / persist / load ----------------------------------------------------------

def _frequent_ngrams(tokens: List[str], n: int, frequent_prev: Dict[str, int],
                     shard: int = 0, num_shards: int = 1) -> set:
    """
    Every contiguous run of exactly `n` (>= 2) words in `tokens` whose two (n-1)-word
    sub-runs are both in `frequent_prev` (the surviving phrases of length n-1). A phrase can
    only appear in more than k documents if each of its sub-phrases does too, so a run with a
    non-surviving sub-run can never clear the threshold and isn't worth a counter slot.
    Deduped within the segment, like `_segment_phrases`. With `num_shards` > 1 only phrases
    whose hash falls in `shard` are returned, so a caller can split one level's counting
    across several passes to cap the size of its counter.
    """
    phrases = set()
    for start in range(0, len(tokens) - n + 1):
        if " ".join(tokens[start:start + n - 1]) in frequent_prev and \
                " ".join(tokens[start + 1:start + n]) in frequent_prev:
            phrase = " ".join(tokens[start:start + n])
            if num_shards == 1 or hash(phrase) % num_shards == shard:
                phrases.add(phrase)
    return phrases


def _spool_tokenized_segments(spool, langs, categories: Optional[List[str]]) -> Counter:
    """
    Walk the library once (see `build_top_n_grams` for the version/dedup rules), write every
    non-empty tokenized segment to `spool` as one space-joined line, and return the document
    counts of the single-word phrases.
    """
    from sefaria.model import IndexSet

    unigram_counts = Counter()
    query = {"categories": {"$in": categories}} if categories else {}
    indexes = list(IndexSet(query))
    total = len(indexes)
    for i, index in enumerate(indexes):
        logger.info(f"[{i + 1}/{total}] {index.title}")
        try:
            versions = list(index.versionSet())  # sorted by priority desc
        except Exception as e:
            logger.warning(f"Skipping {index.title}, couldn't get versions: {e}")
            continue

        seen_trefs_by_lang = {lang: set() for lang in langs}

        for version in versions:
            lang = version.language
            if lang not in langs:
                continue
            seen_trefs = seen_trefs_by_lang[lang]

            def action(segment_str, tref, _he_tref, version, _lang=lang, _seen=seen_trefs):
                if tref in _seen:
                    # Already counted from a higher-priority (or, for a tie, earlier)
                    # version of this same (index, lang) -- don't count it again.
                    return
                _seen.add(tref)
                if not segment_str:
                    return
                tokens = tokenize(segment_str, _lang)
                if not tokens:
                    return
                spool.write(" ".join(tokens) + "\n")
                # A phrase counts once per document, no matter how many times it recurs in it.
                unigram_counts.update(set(tokens))

            try:
                version.walk_thru_contents(action)
            except Exception as e:
                logger.warning(f"Failed walking {index.title} ({version.versionTitle}, {lang}): {e}")
    return unigram_counts


def thresholds_by_length(min_doc_count: Union[int, Sequence[int]]) -> List[int]:
    """
    Normalize `min_doc_count` to one threshold per phrase length: a list of MAX_PHRASE_WORDS
    ints, index i being the threshold for (i + 1)-word phrases. A single int (or a one-element
    sequence) applies to every length; otherwise exactly MAX_PHRASE_WORDS values are required.
    """
    values = [min_doc_count] if isinstance(min_doc_count, int) else list(min_doc_count)
    if len(values) == 1:
        values = values * MAX_PHRASE_WORDS
    if len(values) != MAX_PHRASE_WORDS:
        raise ValueError(f"min_doc_count needs 1 or {MAX_PHRASE_WORDS} values (one per phrase length), got {len(values)}")
    return values


def build_top_n_grams(min_doc_count: Union[int, Sequence[int]], langs=('he', 'en'), categories: Optional[List[str]] = None,
                      num_shards: int = _DEFAULT_NUM_SHARDS) -> Dict[str, int]:
    """
    Walk every segment in the library (optionally scoped to `categories`, e.g. ["Tanakh"])
    and count, per normalized phrase (every contiguous run of 1 to MAX_PHRASE_WORDS words),
    the number of distinct segments ("documents") it appears in at least once. A phrase that
    occurs 5 times in one segment and never again still has a doc count of 1. Returns only
    phrases whose doc count is > the threshold for their length: `min_doc_count` is one int
    for every length, or one value per phrase length (see `thresholds_by_length`) -- longer
    phrases are rarer, so they can be kept at a lower bar than single words.

    Memory: counting every 1..MAX_PHRASE_WORDS-gram of the whole library in one Counter holds
    hundreds of millions of mostly-singleton phrases and can exhaust RAM. Instead this counts
    level by level (Apriori): pass 1 tokenizes each segment once, spools it to a temp file on
    disk, and counts single words; each later pass n re-reads the spool and counts only the
    n-word runs whose two (n-1)-word sub-runs survived the previous pass (see
    `_frequent_ngrams`). The result is identical to counting everything, but only phrases that
    can still clear the threshold ever occupy memory. With per-length thresholds, "can still
    clear" means the *lowest* threshold of this length and every longer one: a trigram that
    clears a low bar needs its bigrams and words to clear that same low bar, even when they
    are only kept in the output at a higher one. So each level is counted and carried forward
    down to that floor, then filtered to its own threshold for the result -- still exact.
    Even so, a level's counter (bigrams
    especially) can reach tens of GB, so each level is itself split into `num_shards` passes
    over the spool, each counting only the phrases whose hash falls in that shard -- peak
    memory is roughly 1/num_shards of the level's full counter, at the cost of re-reading the
    spool that many times per level.

    Uses Version.walk_thru_contents, which bulk-fetches a whole version's content in one
    query, instead of one ref.text() call per segment -- far fewer round trips to Mongo.

    Every version of a requested language is walked (not just the top-priority one), but
    each tref is only ever counted once per (index, lang): `index.versionSet()` sorts by
    priority descending (VersionSet's default sort), and a `seen_trefs` set shared across
    all of an index's versions of a language -- not reset per version -- skips a tref the
    moment it's been counted once. Walking in priority order means that's normally the
    top-priority version's wording; a tref only falls through to a lower-priority version
    when the higher-priority one doesn't have it at all (a partial translation, a stub,
    etc.), so a partial top version can't silently drop that segment from the table.
    The same set is what prevents two versions that both cover a tref from counting its
    phrases twice -- there is no other version-counting logic here.
    """
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as spool:
        thresholds = thresholds_by_length(min_doc_count)
        # floors[i]: lowest bar a phrase of length i + 1 must clear to still matter, either
        # as output (thresholds[i]) or as a sub-phrase of a longer kept phrase.
        floors = [min(thresholds[i:]) for i in range(MAX_PHRASE_WORDS)]
        unigram_counts = _spool_tokenized_segments(spool, langs, categories)
        carried = {w: c for w, c in unigram_counts.items() if c > floors[0]}
        del unigram_counts
        result = {w: c for w, c in carried.items() if c > thresholds[0]}
        logger.info(f"1-word phrases: {len(carried)} carried, {len(result)} kept")

        for n in range(2, MAX_PHRASE_WORDS + 1):
            if not carried:
                break
            kept = {}
            for shard in range(num_shards):
                counts = Counter()
                spool.seek(0)
                for line in spool:
                    counts.update(_frequent_ngrams(line.split(), n, carried, shard, num_shards))
                kept.update({p: c for p, c in counts.items() if c > floors[n - 1]})
                del counts
                logger.info(f"{n}-word phrases: shard {shard + 1}/{num_shards} done, {len(kept)} carried so far")
            carried = kept
            level_result = {p: c for p, c in carried.items() if c > thresholds[n - 1]}
            logger.info(f"{n}-word phrases: {len(carried)} carried, {len(level_result)} kept")
            result.update(level_result)
    return result


def save_top_n_grams(top_n_grams: Dict[str, int], min_doc_count: Union[int, Sequence[int]]) -> None:
    """
    Persist a freshly built top-n-grams table to `db.top_n_grams_for_search_autocorrect`, one
    document per phrase, so every web pod can load it at startup with a single query and no
    file/bucket to ship.

    Writes are tagged with a fresh `batch` id (a timestamp); once every phrase of the new
    batch has been upserted, documents left over from the previous batch (an old phrase that
    no longer clears `min_doc_count`, or was dropped from the library) are deleted. Readers
    never see a half-written table -- concurrently, they see the previous complete batch
    until this finishes, then the new one.
    """
    batch = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    items = list(top_n_grams.items())
    for i in range(0, len(items), _BULK_WRITE_CHUNK_SIZE):
        chunk = items[i:i + _BULK_WRITE_CHUNK_SIZE]
        db[TOP_N_GRAMS_COLLECTION].bulk_write(
            [UpdateOne({"_id": phrase}, {"$set": {"count": count, "batch": batch}}, upsert=True)
             for phrase, count in chunk],
            ordered=False,
        )
    db[TOP_N_GRAMS_COLLECTION].delete_many({"_id": {"$ne": _META_ID}, "batch": {"$ne": batch}})
    db[TOP_N_GRAMS_COLLECTION].update_one(
        {"_id": _META_ID},
        {"$set": {"min_doc_count": min_doc_count, "generated": batch, "num_words": len(top_n_grams)}},
        upsert=True,
    )


_TRIE_ALPHABET = frozenset(letter_scope)

# What the lookup functions accept for either table: a datrie trie from `build_phrase_trie`
# at runtime, or a plain dict (the builder's output, and what tests pass) -- they only use
# `in`, `[]` and truthiness.
PhraseTable = Union[Dict[str, Union[int, float]], datrie.BaseTrie]


def build_phrase_trie(items: Iterable[Tuple[str, Union[int, float]]], int_values: bool = True) -> datrie.BaseTrie:
    """
    Build a `datrie` trie of {phrase: value} for `autocorrect_query` to look phrases up in.

    Each key goes through autospell's `normalize_chars` (accents/odd characters unidecoded,
    apostrophes dropped) so it fits the trie's `letter_scope` alphabet -- datrie silently
    discards a key with a character outside its alphabet, so a key that still doesn't fit
    after normalizing is skipped explicitly and counted in a warning instead. Phrases that
    collide once normalized keep the higher value, matching how entity_alt_index resolves a
    shared title.

    `int_values=True` (the corpus doc counts) uses `datrie.BaseTrie`, which stores each value
    as a C int -- compact, and what makes the multi-million-phrase table affordable.
    `int_values=False` (the entity index's float scores) uses `datrie.Trie`, which holds
    arbitrary Python objects; that index is small enough for the extra per-value cost not to matter.

    `items` is consumed once, so a Mongo cursor can be streamed straight in with no
    intermediate dict.
    """
    trie = (datrie.BaseTrie if int_values else datrie.Trie)(letter_scope)
    skipped = 0
    for phrase, value in items:
        key = normalize_chars(phrase)
        if not key or not _TRIE_ALPHABET.issuperset(key):
            skipped += 1
            continue
        if key not in trie or value > trie[key]:
            trie[key] = value
    if skipped:
        logger.warning(f"Skipped {skipped} phrases with characters outside the trie alphabet.")
    return trie


def load_top_n_grams() -> datrie.BaseTrie:
    """
    Load the top-n-grams table built by the most recent
    `scripts/build_top_n_grams_for_search_autocorrect.py` run from Mongo, as a trie (see
    `build_phrase_trie`). Returns an empty trie (which silently disables auto-correction --
    `autocorrect_query` always returns None against an empty table) if it hasn't been built
    yet in this environment, or on any read error -- that must not be a startup error.
    """
    try:
        cursor = db[TOP_N_GRAMS_COLLECTION].find({"_id": {"$ne": _META_ID}}, {"count": 1})
        return build_phrase_trie((doc["_id"], doc["count"]) for doc in cursor)
    except Exception as e:
        logger.warning(f"Could not load top-n-grams table from Mongo: {e}")
        return build_phrase_trie(())


# --- Autocorrect -----------------------------------------------------------------------

# Alphabet used to generate edit candidates: Hebrew letters, English letters, digits, and
# the gershayim a top-n-grams phrase can legitimately contain internally (e.g. רמב"ם). No
# apostrophe: `normalize_chars` strips them from every key, so a candidate with one could
# never match. Deliberately excludes the space character -- replace/insert never introduces a
# new word boundary, so a candidate can only gain or lose one by *deleting* an existing space.
# Every character is within autospell's `letter_scope`, so no candidate can fall outside the
# trie's alphabet.
_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789\"" + ''.join(chr(c) for c in range(0x05d0, 0x05eb))


class _PhraseSpellChecker(SpellChecker):
    """
    autospell's SpellChecker, used only for its `single_edits` (the Norvig-style candidate
    generator the autocompleter already relies on), over this table's own mixed
    Hebrew + Latin + digit alphabet rather than one language's letters -- a top-n-grams
    phrase can be either language, and the table isn't split by one.
    """
    def __init__(self):
        super().__init__("en")
        self.letters = _ALPHABET


_phrase_spell_checker = _PhraseSpellChecker()


def _one_edit_candidates(phrase: str) -> set:
    """
    Every string exactly one edit (delete, transpose, replace, or insert) away from
    `phrase`, which may be a single word or several words joined by spaces -- the edit
    operates on the string as a whole either way. Unlike the autocompleter, the first
    character is editable too (`hold_first_letter=False`): a typo there is as likely as
    anywhere else, and this is a phrase correction, not a prefix completion.
    """
    return _phrase_spell_checker.single_edits(phrase, hold_first_letter=False)


def _is_empty(table: Optional[PhraseTable]) -> bool:
    """
    Whether `table` (a dict, a trie, or None) has no entries -- in O(1). Never use the table's
    truthiness / `len()` for this: a `datrie` trie has no stored size, so `len()` (and so
    `bool()`) walks every key -- about a second for the corpus table, and ~8ms for the entity
    index, which `_ranked_candidates` used to pay once per candidate.
    """
    if table is None:
        return True
    if isinstance(table, dict):
        return not table
    return next(iter(table), None) is None


def _tie_break_score(count: int) -> float:
    """
    Damps a raw doc count onto a log scale: large counts stop mattering in direct proportion
    to their size, so a phrase with 50,000 hits isn't treated as 500x "more correct" than one
    with 100. This is also the scale `sefaria.helper.entity_alt_index` precomputes its own
    candidates' scores on (see that module's `_entity_tie_break_score`), so a top-n-grams
    candidate and an entity-alt candidate can be ranked against each other by this one number
    even though their raw weights (corpus doc counts vs. a topic's `numSources`) are on
    completely different scales. Mirrors the shape (not the exact constants) of the
    popularity tie-break `get_entity_query_obj` already uses for entity-search relevance
    (`1 + log10(1 + numSources) * 0.2`) -- popularity/frequency breaks ties, it never is the
    primary signal.
    """
    return math.log10(1 + max(count, 0))


def _ranked_candidates(phrase: str, top_n_grams: PhraseTable,
                        entity_alt_index: Optional[PhraseTable] = None) -> List[Tuple[str, float]]:
    """
    Every one-edit-distance candidate for `phrase`, found in either source, paired with its
    tie-break score -- the higher of the two sources' scores when a candidate is found in
    both. Sorted by score descending; ties broken by the candidate string itself, so the
    order (and so `autocorrect_query`'s choice among equally-scored candidates) is
    deterministic rather than dependent on set iteration order.
    """
    scores: Dict[str, float] = {}
    for c in _one_edit_candidates(phrase):
        if c in top_n_grams:
            score = _tie_break_score(top_n_grams[c])
            if c not in scores or score > scores[c]:
                scores[c] = score
        if entity_alt_index is not None and c in entity_alt_index:
            score = entity_alt_index[c]  # already precomputed on the same comparable scale
            if c not in scores or score > scores[c]:
                scores[c] = score
    return sorted(scores.items(), key=lambda pair: (-pair[1], pair[0]))


def _best_match(phrase: str, top_n_grams: PhraseTable,
                 entity_alt_index: Optional[PhraseTable] = None) -> Optional[str]:
    """
    One-edit-distance correction for a phrase (one or more words), chosen from both the
    top-n-grams table and the optional runtime entity-alt index: the single
    highest-scoring candidate, with no regard for how close the runner-up is (contrast
    `_try_window`, which uses `_ranked_candidates` directly so it can tell a confident
    winner apart from genuinely competing candidates -- see AMBIGUITY_LOG_GAP). Kept as a
    thin convenience wrapper for callers that only ever want a single best guess.
    """
    ranked = _ranked_candidates(phrase, top_n_grams, entity_alt_index)
    return ranked[0][0] if ranked else None


def _substitute_window(words: List[str], normalized: List[str], start: int, end: int, candidate: str) -> str:
    """
    Build the full query (all of `words`) with just `[start:end)` replaced by `candidate`.
    Same word count as the window: swap in only the word(s) that actually changed, so a word
    the user already typed correctly keeps its original casing instead of being flattened to
    the table's lowercase form. A one-character edit that crossed a word boundary (deleted a
    space, merging two words) leaves old and new words not lined up position-by-position, so
    the whole window is replaced verbatim instead.
    """
    corrected_words = list(words)
    candidate_words = candidate.split()
    if len(candidate_words) == end - start:
        for offset, (orig, corr) in enumerate(zip(normalized[start:end], candidate_words)):
            if orig != corr:
                corrected_words[start + offset] = corr
    else:
        corrected_words[start:end] = candidate_words
    return " ".join(corrected_words)


@dataclass(frozen=True)
class AmbiguousCandidates:
    """
    Signals that a window had more than one candidate correction close enough in score
    (within AMBIGUITY_LOG_GAP of the top one) that picking a single winner would be a guess.
    `queries` holds one full, ready-to-search query per competing candidate -- the same
    window substituted with each candidate in turn -- sorted A-Z.
    """
    queries: List[str] = field(default_factory=list)


def _try_window(words: List[str], normalized: List[str], start: int, end: int,
                 top_n_grams: PhraseTable,
                 entity_alt_index: Optional[PhraseTable] = None) -> Union[str, AmbiguousCandidates, None]:
    """
    Try to correct `normalized[start:end]` (a contiguous run of query words) as a single
    phrase. Returns:
    - None if the window is already a known phrase in either source (nothing to fix), or
      isn't a 1-edit match for anything;
    - an `AmbiguousCandidates` if more than one candidate is close enough in score that none
      of them is a confident winner (see AMBIGUITY_LOG_GAP) -- no correction is applied;
    - otherwise the full corrected query (all of `words`, with just this window fixed up).
    """
    phrase = " ".join(normalized[start:end])
    if phrase in top_n_grams or (entity_alt_index is not None and phrase in entity_alt_index):
        return None  # already an attested phrase/title -- nothing to correct here

    ranked = _ranked_candidates(phrase, top_n_grams, entity_alt_index)
    if not ranked:
        return None

    top_score = ranked[0][1]
    if len(ranked) > 1 and (top_score - ranked[1][1]) < AMBIGUITY_LOG_GAP:
        # More than one candidate is still in play this close to the top score -- every one
        # of them, not just the top two (a third could be just as close), is a genuine
        # competitor. Surface them all rather than guess among them.
        competing = {c for c, score in ranked if top_score - score < AMBIGUITY_LOG_GAP}
        queries = sorted(_substitute_window(words, normalized, start, end, c) for c in competing)
        return AmbiguousCandidates(queries=queries)

    return _substitute_window(words, normalized, start, end, ranked[0][0])


@dataclass(frozen=True)
class AutocorrectResult:
    """
    - `corrected_query` set, `suggested_queries` None: a confident correction -- search
      `corrected_query` instead of what was typed.
    - `corrected_query` None, `suggested_queries` set: too ambiguous to correct -- search
      `original_query` as typed (the "bad"/uncorrected result), but offer `suggested_queries`
      (sorted A-Z) as alternatives the reader can pick instead of guessing for them.
    """
    original_query: str
    corrected_query: Optional[str] = None
    suggested_queries: Optional[List[str]] = None


def autocorrect_query(query: str, top_n_grams: PhraseTable,
                       entity_alt_index: Optional[PhraseTable] = None) -> Optional[AutocorrectResult]:
    """
    Product spec sc-47189. Corrects a *phrase*, never a lone word in isolation, so a fix is
    only ever offered when the resulting phrase is itself something the corpus contains, or a
    known Book/Author/Topic alternate title/name (see the module docstring and
    sefaria/helper/entity_alt_index.py).

    - A query of up to MAX_PHRASE_WORDS words is treated as a single phrase: if it already
      matches a top-n-grams or entity-alt entry, it's searched normally, uncorrected (returns
      None). Otherwise, if the whole phrase is exactly one edit away from some phrase in
      either source, that's the correction -- unless more than one candidate is competing for
      it (see AMBIGUITY_LOG_GAP and the module docstring), in which case nothing is corrected
      and the competing candidates come back as `suggested_queries` instead.
    - A longer query first gets one extra, entity-alt-only chance to be corrected *in its
      entirety*: an entity title/name is a single curated unit, not generated as a sliding
      window over corpus text, so unlike the top-n-grams table it is never capped at
      MAX_PHRASE_WORDS -- explaining the WHOLE query this way beats any partial fix below.
      Failing that, the query is corrected (or found ambiguous) at most once, in its longest
      fixable contiguous run of words: window sizes MAX_PHRASE_WORDS down to 1 are tried
      (against both sources), left to right within each size, and the first window that is
      both not already a known phrase and one edit from one wins -- confidently or
      ambiguously; every other word in the query is left exactly as typed either way. A query
      with no such window anywhere (every window already attested, or too far off to fix
      within a 1-edit budget) also returns None.

    :param query: the raw query text as typed/submitted.
    :param top_n_grams: {normalized_phrase: doc_count}, e.g. `library._top_n_grams_for_search_autocorrect`.
    :param entity_alt_index: {normalized_phrase: tie_break_score}, e.g.
        `library._entity_alt_index` -- see sefaria/helper/entity_alt_index.py. Optional: a
        query corrects against the top-n-grams table alone when omitted.
    :return: an AutocorrectResult if a correction or an ambiguous-suggestions result applies,
        else None (search `query` as typed, with nothing to show about it).
    """
    if entity_alt_index is not None and _is_empty(entity_alt_index):
        entity_alt_index = None  # decide emptiness once per query, in O(1) -- see _is_empty
    if not query or (_is_empty(top_n_grams) and entity_alt_index is None):
        return None
    words = query.split()
    if not words:
        return None
    normalized = [normalize_chars(normalize_word(w)) for w in words]  # same as the table's keys
    n = len(normalized)

    def finish(result: Union[str, AmbiguousCandidates, None]) -> Optional[AutocorrectResult]:
        if result is None:
            return None
        if isinstance(result, AmbiguousCandidates):
            return AutocorrectResult(original_query=query, suggested_queries=result.queries)
        return AutocorrectResult(original_query=query, corrected_query=result)

    if n <= MAX_PHRASE_WORDS:
        return finish(_try_window(words, normalized, 0, n, top_n_grams, entity_alt_index))

    if entity_alt_index is not None:
        whole = finish(_try_window(words, normalized, 0, n, {}, entity_alt_index))
        if whole:
            return whole

    for size in range(MAX_PHRASE_WORDS, 0, -1):
        for start in range(0, n - size + 1):
            result = finish(_try_window(words, normalized, start, start + size, top_n_grams, entity_alt_index))
            if result:
                return result
    return None
