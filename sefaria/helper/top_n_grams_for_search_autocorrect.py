# -*- coding: utf-8 -*-
"""
Search-query auto-correction against a table of frequent corpus phrases.

The table maps every normalized phrase of 1-MAX_PHRASE_WORDS words that appears in more than
a threshold number of segments to that segment count. A query that isn't in the table (or in
the entity alt-title index, see entity_alt_index.py) but is one edit away from an entry gets
rewritten to it. Whole phrases are corrected, never lone words: a word can be a fine one-edit
fix on its own and still produce a phrase the corpus never contains.

When several candidates score within AMBIGUITY_LOG_GAP of each other, nothing is corrected and
they are returned as suggestions instead -- picking one would be a guess.

Lifecycle: a weekly CronJob runs scripts/build_top_n_grams_for_search_autocorrect.py, which
saves the table as a datrie file and uploads it to a public GCS object. The name service
downloads it at startup (`load_top_n_grams`) and serves /api/search-autocorrect from it.
"""
import math
import re
import tempfile
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple, Union

import datrie
import requests
import structlog

from sefaria.model.autospell import SpellChecker, letter_scope, normalize_chars, strip_apostrophes

logger = structlog.get_logger(__name__)

# Public-read: the table is derived from public text, so the name service downloads it without
# credentials; only the CronJob's upload authenticates. Replacing a GCS object is atomic.
# TOP_N_GRAMS_TRIE_SOURCE in local_settings overrides this with another URL or a local path.
TRIE_BUCKET = "sefaria-search-autocorrect"
TRIE_BLOB = "top_n_grams_for_search_autocorrect.trie"
TRIE_URL = f"https://storage.googleapis.com/{TRIE_BUCKET}/{TRIE_BLOB}"
_DOWNLOAD_TIMEOUT_SECONDS = 120
_DEFAULT_NUM_SHARDS = 16

# Longer phrases would make the build superlinear in segment length for little gain.
MAX_PHRASE_WORDS = 3

# Scores are log10 of popularity, so a gap of 1.0 means the leader is ~10x more attested than
# the runner-up. Under that, the candidates are treated as competing (e.g. "mari" vs "maariv").
AMBIGUITY_LOG_GAP = 1.0

# Longer queries are searched as typed. Candidate generation is pure-Python CPU on the
# single-worker name service: a 5,000-char query took seconds.
MAX_QUERY_CHARS = 100
MAX_QUERY_WORDS = 10

# Strips edge punctuation only, so an abbreviation's internal gershayim (רמב"ם) survives.
_EDGE_STRIP_RE = re.compile(r'^\W+|\W+$', re.UNICODE)
_HEBREW_RE = re.compile('[א-ת]')
_DIGIT_RE = re.compile(r'\d')


def _linker_normalize(text: str, lang: str) -> str:
    # Same normalizer as the linker: strips cantillation/maqaf/HTML, unidecodes quote marks.
    from sefaria.model.linker.linker_entity_recognizer import get_linker_normalizer
    return get_linker_normalizer(lang).normalize(text or '')


def normalize_word(word: str) -> str:
    return _EDGE_STRIP_RE.sub('', word).lower()


def tokenize(text: str, lang: str) -> List[str]:
    return [w for w in (normalize_word(tok) for tok in _linker_normalize(text, lang).split()) if w]


def normalize_query(query: str) -> str:
    """
    Normalize the query the way the table was built, up front, so the original/corrected pair
    shown in the banner differs only by the correction.
    """
    lang = 'he' if _HEBREW_RE.search(query or '') else 'en'
    return " ".join(strip_apostrophes(_linker_normalize(query, lang)).split())


# --- Build -----------------------------------------------------------------------------

def thresholds_by_length(min_doc_count: Union[int, Sequence[int]]) -> List[int]:
    """One threshold per phrase length; a single value applies to every length."""
    values = [min_doc_count] if isinstance(min_doc_count, int) else list(min_doc_count)
    if len(values) == 1:
        values = values * MAX_PHRASE_WORDS
    if len(values) != MAX_PHRASE_WORDS:
        raise ValueError(f"min_doc_count needs 1 or {MAX_PHRASE_WORDS} values (one per phrase length), got {len(values)}")
    return values


def _frequent_ngrams(tokens: List[str], n: int, frequent_prev: Dict[str, int],
                     shard: int = 0, num_shards: int = 1) -> set:
    """
    The distinct n-word runs in `tokens` whose two (n-1)-word sub-runs are both in
    `frequent_prev` -- a phrase can't clear a threshold its sub-phrases don't. With
    `num_shards` > 1, only runs hashing to `shard`.
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
    Write each tokenized segment to `spool` as one line; return single-word doc counts.

    Each tref is counted once per (index, lang). Versions are walked in priority order, so
    that's the top version's text, falling back to a lower one only where the top one lacks
    the segment (partial translations).
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

            def action(segment_str, tref, _he_tref, _version, _lang=lang, _seen=seen_trefs_by_lang[lang]):
                if tref in _seen:
                    return
                _seen.add(tref)
                tokens = tokenize(segment_str, _lang) if segment_str else []
                if tokens:
                    spool.write(" ".join(tokens) + "\n")
                    unigram_counts.update(set(tokens))

            try:
                version.walk_thru_contents(action)
            except Exception as e:
                logger.warning(f"Failed walking {index.title} ({version.versionTitle}, {lang}): {e}")
    return unigram_counts


def build_top_n_grams(min_doc_count: Union[int, Sequence[int]], langs=('he', 'en'), categories: Optional[List[str]] = None,
                      num_shards: int = _DEFAULT_NUM_SHARDS) -> Dict[str, int]:
    """
    {phrase: number of segments containing it} for every phrase whose count exceeds the
    threshold for its length (see `thresholds_by_length`).

    Counting every n-gram at once needs hundreds of millions of counter entries, so this counts
    level by level (Apriori): words first, then only the n-grams whose (n-1)-word sub-runs
    survived. Segments are tokenized once into a temp-file spool that each level re-reads. A
    level is carried forward at the lowest threshold of it and every longer length (a kept
    trigram's bigrams must be counted even if they're below the bigram threshold), so the
    result is exact. Each level is further split into `num_shards` hash passes, since a
    bigram counter alone can reach tens of GB.
    """
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as spool:
        thresholds = thresholds_by_length(min_doc_count)
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


# --- Trie storage ----------------------------------------------------------------------

_TRIE_ALPHABET = frozenset(letter_scope)

# Lookups only use `in` and `[]`, so tests can pass plain dicts.
PhraseTable = Union[Dict[str, Union[int, float]], datrie.BaseTrie]


def build_phrase_trie(items: Iterable[Tuple[str, Union[int, float]]], int_values: bool = True) -> datrie.BaseTrie:
    """
    Keys go through autospell's `normalize_chars` to fit the trie alphabet. datrie silently
    drops keys outside its alphabet, so those are skipped and counted here instead. Keys that
    collide after normalizing keep the higher value.

    `int_values` picks `BaseTrie` (C ints; what makes the multi-million-phrase table fit) over
    `Trie` (Python objects, needed for the entity index's float scores).
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


def save_top_n_grams_trie(top_n_grams: Dict[str, int], path: str) -> int:
    """Save as a datrie file; returns the phrase count. Sorted inserts build much faster."""
    trie = build_phrase_trie(sorted(top_n_grams.items()))
    trie.save(path)
    return len(trie)


def upload_top_n_grams_trie(path: str, num_phrases: int, min_doc_count: Union[int, Sequence[int]]) -> None:
    """
    Needs GoogleStorageManager's write credentials. Build info goes in object metadata, which
    the loader reads from the download's response headers. `no-cache` stops GCS's edge cache
    (on by default for public objects) serving the previous table for up to an hour.
    """
    from sefaria.google_storage_manager import GoogleStorageManager
    blob = GoogleStorageManager.get_bucket(TRIE_BUCKET).blob(TRIE_BLOB)
    blob.metadata = {
        "generated": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "num-phrases": str(num_phrases),
        "min-doc-count": " ".join(str(v) for v in thresholds_by_length(min_doc_count)),
    }
    blob.cache_control = "no-cache"
    blob.upload_from_filename(path, content_type="application/octet-stream")


def _trie_source() -> str:
    from django.conf import settings
    return getattr(settings, "TOP_N_GRAMS_TRIE_SOURCE", None) or TRIE_URL


def _download(url: str, dest) -> dict:
    with requests.get(url, stream=True, timeout=_DOWNLOAD_TIMEOUT_SECONDS) as resp:
        resp.raise_for_status()
        for chunk in resp.iter_content(chunk_size=1 << 20):
            dest.write(chunk)
        return dict(resp.headers)


def load_top_n_grams() -> datrie.BaseTrie:
    """
    Never fails startup: a missing, unreadable or empty table returns an empty trie, which
    turns auto-correction off. That case logs `top_n_grams_for_search_autocorrect_unavailable`
    at ERROR for alerting, since otherwise it looks exactly like a working table.
    """
    source = _trie_source()
    generated, num_phrases = None, None
    try:
        if source.startswith(("http://", "https://")):
            with tempfile.NamedTemporaryFile(suffix=".trie") as f:
                headers = _download(source, f)
                f.flush()
                trie = datrie.BaseTrie.load(f.name)
            generated = headers.get("x-goog-meta-generated")
            num_phrases = headers.get("x-goog-meta-num-phrases")
        else:
            trie = datrie.BaseTrie.load(source)
        if num_phrases is None:
            num_phrases = len(trie)  # walks every key (~1s)
        num_phrases = int(num_phrases)
    except Exception as e:
        logger.error("top_n_grams_for_search_autocorrect_unavailable", source=source,
                     reason=f"{type(e).__name__}: {e}")
        return build_phrase_trie(())
    if num_phrases == 0:
        logger.error("top_n_grams_for_search_autocorrect_unavailable", source=source, reason="empty table",
                     generated=generated)
    else:
        logger.info("top_n_grams_for_search_autocorrect_loaded", source=source, num_phrases=num_phrases,
                    generated=generated)
    return trie


# --- Autocorrect -----------------------------------------------------------------------

# Edit alphabet. No space, so a candidate only changes word boundaries by deleting one. No
# apostrophe, since `normalize_chars` strips it from every key.
_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789\"" + ''.join(chr(c) for c in range(0x05d0, 0x05eb))


class _PhraseSpellChecker(SpellChecker):
    """autospell's edit generator over a mixed Hebrew/Latin alphabet; the table isn't split by language."""
    def __init__(self):
        super().__init__("en")
        self.letters = _ALPHABET


_phrase_spell_checker = _PhraseSpellChecker()


def _one_edit_candidates(phrase: str) -> set:
    # Unlike prefix completion, a typo in the first letter is as likely as anywhere else.
    return _phrase_spell_checker.single_edits(phrase, hold_first_letter=False)


def _is_empty(table: Optional[PhraseTable]) -> bool:
    # Not len()/bool(): datrie stores no size, so those walk every key (~1s on the corpus table).
    if table is None:
        return True
    if isinstance(table, dict):
        return not table
    return next(iter(table), None) is None


def _tie_break_score(count: float) -> float:
    """
    Log-damped popularity, so 50,000 hits isn't 500x "more correct" than 100. The entity
    index scores on this same scale, which is what makes the two sources comparable.
    """
    return math.log10(1 + max(count, 0))


def _keep_max(scores: Dict[str, float], key: str, score: float) -> None:
    if key not in scores or score > scores[key]:
        scores[key] = score


def _by_score(scores: Dict[str, float]) -> List[Tuple[str, float]]:
    """Highest first; ties A-Z so results don't depend on set iteration order."""
    return sorted(scores.items(), key=lambda pair: (-pair[1], pair[0]))


def _keeps_numbers(phrase_words: List[str], candidate: str) -> bool:
    """
    A word with a digit is almost always a citation ("berakhot 2a"), where a one-character
    change lands on a different valid page rather than fixing a typo.
    """
    candidate_words = candidate.split()
    if len(candidate_words) != len(phrase_words):
        return False  # a deleted space merged a word into or out of a number
    return all(cw == pw for pw, cw in zip(phrase_words, candidate_words) if _DIGIT_RE.search(pw))


def _ranked_candidates(phrase: str, top_n_grams: PhraseTable,
                        entity_alt_index: Optional[PhraseTable] = None) -> List[Tuple[str, float]]:
    """One-edit candidates found in either source, at the higher of their scores, best first."""
    candidates = _one_edit_candidates(phrase)
    if _DIGIT_RE.search(phrase):
        words = phrase.split()
        candidates = {c for c in candidates if _keeps_numbers(words, c)}
    scores: Dict[str, float] = {}
    for c in candidates:
        if c in top_n_grams:
            _keep_max(scores, c, _tie_break_score(top_n_grams[c]))
        if entity_alt_index is not None and c in entity_alt_index:
            _keep_max(scores, c, entity_alt_index[c])  # stored pre-scored
    return _by_score(scores)


def _substitute_window(words: List[str], normalized: List[str], start: int, end: int, candidate: str) -> str:
    """
    The full query with `[start:end)` replaced by `candidate`. Only changed words are swapped,
    so correctly typed words keep their casing; an edit that merged or split words replaces the
    whole window.
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
    """Full queries for each competing candidate, with scores, best first."""
    scored_queries: List[Tuple[str, float]] = field(default_factory=list)


def _try_window(words: List[str], normalized: List[str], start: int, end: int,
                 top_n_grams: PhraseTable,
                 entity_alt_index: Optional[PhraseTable] = None) -> Union[str, AmbiguousCandidates, None]:
    """
    Correct `normalized[start:end]` as one phrase. Returns the full corrected query,
    AmbiguousCandidates if every candidate within AMBIGUITY_LOG_GAP of the best (not just the
    top two) is competing, or None if the window is already attested or has no candidate.
    """
    phrase = " ".join(normalized[start:end])
    if phrase in top_n_grams or (entity_alt_index is not None and phrase in entity_alt_index):
        return None

    ranked = _ranked_candidates(phrase, top_n_grams, entity_alt_index)
    if not ranked:
        return None

    top_score = ranked[0][1]
    if len(ranked) > 1 and (top_score - ranked[1][1]) < AMBIGUITY_LOG_GAP:
        scored = {}
        for c, score in ranked:
            if top_score - score < AMBIGUITY_LOG_GAP:
                _keep_max(scored, _substitute_window(words, normalized, start, end, c), score)
        return AmbiguousCandidates(scored_queries=_by_score(scored))

    return _substitute_window(words, normalized, start, end, ranked[0][0])


@dataclass(frozen=True)
class AutocorrectResult:
    """
    Exactly one of `corrected_query` (search it instead) or `suggested_queries` (search the
    original, offer these best first) is set.
    """
    original_query: str
    corrected_query: Optional[str] = None
    suggested_queries: Optional[List[str]] = None


def autocorrect_query(query: str, top_n_grams: PhraseTable,
                       entity_alt_index: Optional[PhraseTable] = None) -> Optional[AutocorrectResult]:
    """
    None means search `query` as typed.

    - Up to MAX_PHRASE_WORDS words: the whole query is one phrase.
    - Longer: first try the whole query against entity titles only (titles aren't capped at
      MAX_PHRASE_WORDS), then `_correct_long_query_by_trigrams`.
    - Never corrects queries over MAX_QUERY_CHARS / MAX_QUERY_WORDS, or words with digits.
    """
    if len(query or '') > MAX_QUERY_CHARS:
        return None
    query = normalize_query(query)
    if entity_alt_index is not None and _is_empty(entity_alt_index):
        entity_alt_index = None
    if not query or (_is_empty(top_n_grams) and entity_alt_index is None):
        return None
    words = query.split()
    if len(words) > MAX_QUERY_WORDS:
        return None
    normalized = [normalize_chars(normalize_word(w)) for w in words]  # the table's key form
    n = len(normalized)

    def finish(result: Union[str, AmbiguousCandidates, None]) -> Optional[AutocorrectResult]:
        if result is None:
            return None
        if isinstance(result, AmbiguousCandidates):
            return AutocorrectResult(original_query=query, suggested_queries=[q for q, _ in result.scored_queries])
        return AutocorrectResult(original_query=query, corrected_query=result)

    if n <= MAX_PHRASE_WORDS:
        return finish(_try_window(words, normalized, 0, n, top_n_grams, entity_alt_index))

    if entity_alt_index is not None:
        whole = finish(_try_window(words, normalized, 0, n, {}, entity_alt_index))
        if whole:
            return whole

    return _correct_long_query_by_trigrams(query, words, normalized, top_n_grams, entity_alt_index)


def _correct_long_query_by_trigrams(query: str, words: List[str], normalized: List[str], top_n_grams: PhraseTable,
                                     entity_alt_index: Optional[PhraseTable]) -> Optional[AutocorrectResult]:
    """
    Tries every MAX_PHRASE_WORDS-word window -- never shorter ones, whose one-edit "fixes" too
    often turn a rare real word into a common one -- and allows one edit in the whole query.

    One typo sits in up to MAX_PHRASE_WORDS overlapping windows, which should all propose the
    same corrected query; that agreement is the evidence. Windows proposing different queries
    (two typos, or a rare-but-valid trigram near a common one) mean no correction. If the only
    fixable windows are ambiguous, their suggestions are returned together.
    """
    confident, ambiguous = set(), {}
    for start in range(len(normalized) - MAX_PHRASE_WORDS + 1):
        result = _try_window(words, normalized, start, start + MAX_PHRASE_WORDS, top_n_grams, entity_alt_index)
        if isinstance(result, AmbiguousCandidates):
            for q, score in result.scored_queries:
                _keep_max(ambiguous, q, score)
        elif result:
            confident.add(result)
    if len(confident) == 1 and not ambiguous:
        return AutocorrectResult(original_query=query, corrected_query=next(iter(confident)))
    if ambiguous and not confident:
        return AutocorrectResult(original_query=query, suggested_queries=[q for q, _ in _by_score(ambiguous)])
    return None
