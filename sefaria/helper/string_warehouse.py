# -*- coding: utf-8 -*-
"""
String warehouse for search-query auto-correction (sc-47189).

The "string warehouse" is a precomputed set of normalized words that occur in more than
some threshold of Sefaria segments ("documents"), each mapped to the number of documents
it appears in. It powers query auto-correction: a search query that isn't itself a known
string, but is exactly one edit (insert/delete/replace/transpose) away from one, gets
silently rewritten to that known string before hitting Elasticsearch (see
`autocorrect_query` below and its caller, `search_wrapper_api` in reader/views.py).

The warehouse is built by `scripts/build_string_warehouse.py`, run on a schedule by the
`build-string-warehouse` CronJob (helm-chart/sefaria/templates/cronjob/), and persisted to
Mongo (`db.string_warehouse`) rather than a local file -- every web pod reads the same
collection at startup with no artifact-shipping step of its own (see `save_warehouse` /
`load_warehouse` below). `Library.build_string_warehouse()` (sefaria/model/text.py) loads it
once, from `init_library_cache()` (reader/startup.py), onto `Library._string_warehouse`. This
module holds the tokenizer the builder and the search-time lookup share, plus the
edit-distance-1 candidate generation and the Mongo load/save helpers.
"""
import re
import time
from collections import Counter
from typing import Dict, List, Optional, Tuple

import structlog
from pymongo import UpdateOne

from sefaria.system.database import db

logger = structlog.get_logger(__name__)

# Mongo collection the built warehouse lives in: one document per word ({"_id": word, "count":
# doc_count, "batch": <build timestamp>}), plus one "__meta__" document carrying build info.
WAREHOUSE_COLLECTION = "string_warehouse"
_META_ID = "__meta__"
# Mongo bulk_write payloads are chunked at this size so a full-library build (potentially
# hundreds of thousands of words) doesn't assemble one enormous in-memory request.
_BULK_WRITE_CHUNK_SIZE = 5000

# Strip every leading/trailing non-word character (regular punctuation, ASCII/Hebrew quote
# marks, etc) but leave the interior of the word untouched -- this is what keeps an
# abbreviation's internal gershayim intact, e.g. 'רמב"ם' / 'רמב״ם' survive as one token.
_EDGE_STRIP_RE = re.compile(r'^\W+|\W+$', re.UNICODE)


def normalize_word(word: str) -> str:
    """
    Normalize a single already-whitespace-split token for the string warehouse: strip
    leading/trailing punctuation (keeping internal punctuation, e.g. internal quotation
    marks, untouched) and lowercase the result. No lemmatization is attempted (POC).
    """
    return _EDGE_STRIP_RE.sub('', word).lower()


def tokenize(text: str, lang: str) -> List[str]:
    """
    Split a segment of text into normalized warehouse words. Runs the same normalizer the
    linker applies server-side (get_linker_normalizer) first, so warehouse words are
    tokenized consistently with the rest of the NLP pipeline -- cantillation/maqaf/HTML/
    footnote-markers stripped, quote characters unidecoded to ASCII -- then splits on
    whitespace and strips edge punctuation per word.
    """
    from sefaria.model.linker.linker_entity_recognizer import get_linker_normalizer
    normalized = get_linker_normalizer(lang).normalize(text or '')
    return [w for w in (normalize_word(tok) for tok in normalized.split()) if w]


# --- Build / persist / load ----------------------------------------------------------

def build_warehouse(min_doc_count: int, langs=('he', 'en'), categories: Optional[List[str]] = None) -> Dict[str, int]:
    """
    Walk every segment in the library (optionally scoped to `categories`, e.g. ["Tanakh"])
    and count, per normalized word, the number of distinct segments ("documents") it
    appears in at least once. A word that occurs 5 times in one segment and never again
    still has a doc count of 1. Returns only words whose doc count is > `min_doc_count`.

    Uses Version.walk_thru_contents, which bulk-fetches a whole version's content in one
    query, instead of one ref.text() call per segment -- far fewer round trips to Mongo.

    Every version of a requested language is walked (not just the top-priority one), but
    each tref is only ever counted once per (index, lang): `index.versionSet()` sorts by
    priority descending (VersionSet's default sort), and a `seen_trefs` set shared across
    all of an index's versions of a language -- not reset per version -- skips a tref the
    moment it's been counted once. Walking in priority order means that's normally the
    top-priority version's wording; a tref only falls through to a lower-priority version
    when the higher-priority one doesn't have it at all (a partial translation, a stub,
    etc.), so a partial top version can't silently drop that segment from the warehouse.
    The same set is what prevents two versions that both cover a tref from counting its
    words twice -- there is no other version-counting logic here.
    """
    from sefaria.model import IndexSet

    doc_counts = Counter()
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
                # A word counts once per document, no matter how many times it recurs in it.
                doc_counts.update(set(tokenize(segment_str, _lang)))

            try:
                version.walk_thru_contents(action)
            except Exception as e:
                logger.warning(f"Failed walking {index.title} ({version.versionTitle}, {lang}): {e}")

    return {word: count for word, count in doc_counts.items() if count > min_doc_count}


def save_warehouse(warehouse: Dict[str, int], min_doc_count: int) -> None:
    """
    Persist a freshly built warehouse to `db.string_warehouse`, one document per word, so
    every web pod can load it at startup with a single query and no file/bucket to ship.

    Writes are tagged with a fresh `batch` id (a timestamp); once every word of the new batch
    has been upserted, documents left over from the previous batch (an old word that no longer
    clears `min_doc_count`, or was dropped from the library) are deleted. Readers never see a
    half-written warehouse -- concurrently, they see the previous complete batch until this
    finishes, then the new one.
    """
    batch = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    items = list(warehouse.items())
    for i in range(0, len(items), _BULK_WRITE_CHUNK_SIZE):
        chunk = items[i:i + _BULK_WRITE_CHUNK_SIZE]
        db[WAREHOUSE_COLLECTION].bulk_write(
            [UpdateOne({"_id": word}, {"$set": {"count": count, "batch": batch}}, upsert=True)
             for word, count in chunk],
            ordered=False,
        )
    db[WAREHOUSE_COLLECTION].delete_many({"_id": {"$ne": _META_ID}, "batch": {"$ne": batch}})
    db[WAREHOUSE_COLLECTION].update_one(
        {"_id": _META_ID},
        {"$set": {"min_doc_count": min_doc_count, "generated": batch, "num_words": len(warehouse)}},
        upsert=True,
    )


def load_warehouse() -> Dict[str, int]:
    """
    Load the warehouse built by the most recent `scripts/build_string_warehouse.py` run from
    Mongo. Returns {} (which silently disables auto-correction -- `autocorrect_query` always
    returns None against an empty warehouse) if it hasn't been built yet in this environment,
    or on any read error -- that must not be a startup error.
    """
    try:
        return {
            doc["_id"]: doc["count"]
            for doc in db[WAREHOUSE_COLLECTION].find({"_id": {"$ne": _META_ID}}, {"count": 1})
        }
    except Exception as e:
        logger.warning(f"Could not load string warehouse from Mongo: {e}")
        return {}


# --- Autocorrect -----------------------------------------------------------------------

# Alphabet used to generate edit candidates: Hebrew letters, English letters, digits, and
# the quote characters a warehouse word can legitimately contain internally (e.g. רמב"ם).
_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789'\"" + ''.join(chr(c) for c in range(0x05d0, 0x05eb))


def _one_edit_candidates(word: str) -> set:
    """
    Every string exactly one edit (delete, transpose, replace, or insert) away from `word`.
    Same brute-force approach as the Norvig-style corrector in
    sefaria/model/autospell.py's SpellChecker.single_edits, reimplemented locally so the
    warehouse's own alphabet (Hebrew + Latin + digits + quotes) is used instead of the
    lexicon's, and so this module has no dependency on the lexicon/autocomplete stack.
    """
    splits = [(word[:i], word[i:]) for i in range(len(word) + 1)]
    deletes = [L + R[1:] for L, R in splits if R]
    transposes = [L + R[1] + R[0] + R[2:] for L, R in splits if len(R) > 1]
    replaces = [L + c + R[1:] for L, R in splits if R for c in _ALPHABET]
    inserts = [L + c + R for L, R in splits for c in _ALPHABET]
    return set(deletes + transposes + replaces + inserts)


def _best_match(word: str, warehouse: Dict[str, int]) -> Optional[str]:
    """One-edit-distance correction for a single word. Ties broken by higher doc count."""
    candidates = [c for c in _one_edit_candidates(word) if c in warehouse]
    if not candidates:
        return None
    return max(candidates, key=lambda c: warehouse[c])


def autocorrect_query(query: str, warehouse: Dict[str, int]) -> Optional[Tuple[str, str]]:
    """
    Product spec sc-47189. If every word of `query` already normalizes to a warehouse
    entry, returns None -- the query is "in the warehouse", so it should just be searched
    normally, uncorrected. Otherwise, if *exactly one* word fails to match *and* that word
    is exactly one edit away from some warehouse word, substitutes it and returns
    `(corrected_query, original_query)`. Every other case (more than one unmatched word, or
    an unmatched word with no 1-edit match) also returns None: the query still just runs as
    typed, with no correction and no banner.

    A multi-word query shares a single edit-distance budget of 1 across the whole query,
    not one per word -- two words each one edit off does not qualify.

    :param query: the raw query text as typed/submitted.
    :param warehouse: {normalized_word: doc_count}, e.g. `library._string_warehouse`.
    :return: (corrected_query, original_query) if a correction applies, else None.
    """
    if not warehouse or not query:
        return None
    words = query.split()
    if not words:
        return None

    normalized = [normalize_word(w) for w in words]
    unmatched = [i for i, w in enumerate(normalized) if w not in warehouse]
    if len(unmatched) != 1:
        # Either fully known already (search normally) or too far off to fix within
        # a total edit-distance budget of 1 (also just search normally, uncorrected).
        return None

    idx = unmatched[0]
    correction = _best_match(normalized[idx], warehouse)
    if correction is None:
        return None

    # Only the unmatched word is replaced; every other word keeps exactly what the user typed.
    corrected_words = list(words)
    corrected_words[idx] = correction
    return " ".join(corrected_words), query
