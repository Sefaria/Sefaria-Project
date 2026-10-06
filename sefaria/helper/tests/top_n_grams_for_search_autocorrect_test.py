# -*- coding: utf-8 -*-
"""
Unit tests for sefaria.helper.top_n_grams_for_search_autocorrect (search-query
auto-correction, sc-47189).

`tokenize()` and `build_top_n_grams()` route through the linker's normalizer and the full
library (IndexSet, Version.walk_thru_contents) respectively -- that normalizer is already
covered by linker_test.py / normalization_tests.py, and re-exercising it here would make
this a library-build integration test rather than a unit test of this module's own logic.
These tests instead take tokenized word lists and top-n-grams dicts as given and cover what's
actually local to this module: phrase generation from a token list, the edit-distance-1
search, the phrase-vs-single-word correction policy, and the Mongo load/save round trip
(faked, so no real Mongo is required).
"""
import pytest

from sefaria.helper.top_n_grams_for_search_autocorrect import (
    MAX_PHRASE_WORDS,
    AMBIGUITY_LOG_GAP,
    _META_ID,
    normalize_word,
    _segment_phrases,
    _one_edit_candidates,
    _ranked_candidates,
    _best_match,
    _tie_break_score,
    _try_window,
    AmbiguousCandidates,
    AutocorrectResult,
    autocorrect_query,
    save_top_n_grams,
    build_phrase_trie,
    load_top_n_grams,
)
import sefaria.helper.top_n_grams_for_search_autocorrect as top_n_grams_for_search_autocorrect


# --------------------------------------------------------------------------- #
#  normalize_word                                                             #
# --------------------------------------------------------------------------- #

def test_normalize_word_strips_edge_punctuation_and_lowercases():
    assert normalize_word("Bereishit,") == "bereishit"
    assert normalize_word('"Rabbah"') == "rabbah"


def test_normalize_word_keeps_internal_punctuation():
    # An abbreviation's internal gershayim must survive -- only edge punctuation is stripped.
    assert normalize_word('רמב"ם') == 'רמב"ם'
    assert normalize_word('(רמב"ם)') == 'רמב"ם'


# --------------------------------------------------------------------------- #
#  _segment_phrases                                                          #
# --------------------------------------------------------------------------- #

def test_segment_phrases_generates_every_contiguous_run_up_to_max_n():
    tokens = ["in", "the", "beginning"]
    assert _segment_phrases(tokens, max_n=3) == {
        "in", "the", "beginning",
        "in the", "the beginning",
        "in the beginning",
    }


def test_segment_phrases_respects_max_n():
    tokens = ["a", "b", "c", "d"]
    phrases = _segment_phrases(tokens, max_n=2)
    assert "a b c" not in phrases
    assert "a b" in phrases and "c d" in phrases
    assert "a" in phrases and "d" in phrases


def test_segment_phrases_handles_fewer_tokens_than_max_n():
    # A segment shorter than MAX_PHRASE_WORDS must not crash or fabricate out-of-range runs.
    assert _segment_phrases(["lone"], max_n=3) == {"lone"}
    assert _segment_phrases([], max_n=3) == set()


def test_segment_phrases_dedupes_repeats_within_one_segment():
    # A phrase recurring in the same segment counts once per doc -- see build_top_n_grams's
    # doc-counting contract.
    assert _segment_phrases(["echo", "echo"], max_n=2) == {"echo", "echo echo"}


# --------------------------------------------------------------------------- #
#  _one_edit_candidates / _best_match                                        #
# --------------------------------------------------------------------------- #

def test_one_edit_candidates_includes_known_single_edits():
    candidates = _one_edit_candidates("cat")
    assert "at" in candidates     # delete
    assert "cats" in candidates   # insert
    assert "cot" in candidates    # replace
    assert "act" in candidates    # transpose


def test_best_match_picks_higher_doc_count_on_tie_distance():
    # "cot" and "cap" (both one-character replacements of "cat") are equally valid fixes;
    # the one with the higher doc count wins.
    top_n_grams = {"cot": 5, "cap": 50}
    assert _best_match("cat", top_n_grams) == "cap"


def test_best_match_returns_none_when_nothing_in_top_n_grams_is_one_edit_away():
    assert _best_match("cat", {"elephant": 10}) is None


def test_tie_break_score_is_damped_and_monotonic():
    # Large counts stop mattering in direct proportion to their size.
    assert _tie_break_score(0) == 0
    assert _tie_break_score(9) < _tie_break_score(99) < _tie_break_score(999)
    # A 100x bigger count is nowhere near a 100x bigger score.
    assert _tie_break_score(10000) < _tie_break_score(100) * 10


def test_best_match_considers_entity_alt_index_and_picks_the_higher_score():
    # "cap" (top-n-grams, raw count 5 -> a small tie-break score) vs "cot" (entity-alt index,
    # already pre-scored high) -- the entity-alt candidate must win despite the top-n-grams
    # table having a candidate too, because its score is higher, not because of source priority.
    top_n_grams = {"cap": 5}
    entity_alt_index = {"cot": 100.0}
    assert _best_match("cat", top_n_grams, entity_alt_index) == "cot"


def test_best_match_prefers_the_higher_scoring_source_when_a_candidate_is_in_both():
    top_n_grams = {"cot": 100000}           # huge raw count, but still log-damped
    entity_alt_index = {"cot": 1000.0}      # deliberately-inflated score, wins anyway
    assert _best_match("cat", top_n_grams, entity_alt_index) == "cot"
    assert entity_alt_index["cot"] > _tie_break_score(top_n_grams["cot"])


# --------------------------------------------------------------------------- #
#  _ranked_candidates                                                        #
# --------------------------------------------------------------------------- #

def test_ranked_candidates_sorted_by_score_descending():
    top_n_grams = {"cap": 5, "cot": 50}
    ranked = _ranked_candidates("cat", top_n_grams)
    assert [c for c, _ in ranked] == ["cot", "cap"]
    assert ranked[0][1] > ranked[1][1]


def test_ranked_candidates_breaks_score_ties_alphabetically():
    # Same raw count -> same score; order must be deterministic, not set-iteration-order luck.
    top_n_grams = {"cap": 10, "cot": 10}
    ranked = _ranked_candidates("cat", top_n_grams)
    assert [c for c, _ in ranked] == ["cap", "cot"]


def test_ranked_candidates_merges_a_candidate_found_in_both_sources_at_its_higher_score():
    top_n_grams = {"cot": 5}
    entity_alt_index = {"cot": 100.0}
    ranked = _ranked_candidates("cat", top_n_grams, entity_alt_index)
    assert dict(ranked)["cot"] == 100.0


def test_ranked_candidates_empty_when_nothing_matches():
    assert _ranked_candidates("cat", {"elephant": 10}) == []


# --------------------------------------------------------------------------- #
#  _try_window                                                                #
# --------------------------------------------------------------------------- #

def test_try_window_returns_none_for_an_already_attested_phrase():
    top_n_grams = {"bereishit rabbah": 10}
    words = ["Bereishit", "Rabbah"]
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 0, 2, top_n_grams) is None


def test_try_window_corrects_only_the_changed_word_and_keeps_original_casing():
    top_n_grams = {"bereishit rabbah": 10}
    words = ["Bereshit", "Rabbah"]  # "Rabbah" is already correct, just capitalized
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 0, 2, top_n_grams) == "bereishit Rabbah"


def test_try_window_returns_none_when_no_fix_exists():
    top_n_grams = {"bereishit rabbah": 10}
    words = ["completely", "different"]
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 0, 2, top_n_grams) is None


def test_try_window_only_touches_the_requested_slice():
    # The surrounding words (outside [start:end)) must survive untouched in the returned
    # full query, whatever happens inside the window.
    top_n_grams = {"bereishit rabbah": 10}
    words = ["The", "Bereshit", "Rabbah", "edition"]
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 1, 3, top_n_grams) == "The bereishit Rabbah edition"


def test_try_window_corrects_from_entity_alt_index_alone():
    words = ["Rasih"]
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 0, 1, {}, {"rashi": 4.0}) == "rashi"


def test_try_window_already_attested_in_entity_alt_index_is_noop():
    words = ["Rashi"]
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 0, 1, {}, {"rashi": 4.0}) is None


def test_try_window_returns_ambiguous_candidates_when_scores_are_close():
    # "cot" (log10(51)=1.71) and "cap" (log10(41)=1.61): gap 0.1, well under AMBIGUITY_LOG_GAP
    # -- neither is a confident winner, so both come back rather than a guessed single fix.
    top_n_grams = {"cot": 50, "cap": 40}
    words = ["Cat"]
    normalized = [normalize_word(w) for w in words]
    result = _try_window(words, normalized, 0, 1, top_n_grams)
    assert isinstance(result, AmbiguousCandidates)
    assert result.queries == ["cap", "cot"]  # sorted A-Z


def test_try_window_confident_when_disparity_is_large():
    # Same candidate pair, but now "cot" dominates by many orders of magnitude -- a clear
    # winner, not a guess, so the single-candidate fix applies as it always did.
    top_n_grams = {"cot": 100000, "cap": 2}
    words = ["Cat"]
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 0, 1, top_n_grams) == "cot"


def test_try_window_ambiguous_includes_every_candidate_within_the_gap_not_just_top_two():
    # A third candidate equally close to the top must also be offered, not silently dropped.
    top_n_grams = {"cot": 50, "cap": 48, "cut": 45}
    words = ["Cat"]
    normalized = [normalize_word(w) for w in words]
    result = _try_window(words, normalized, 0, 1, top_n_grams)
    assert isinstance(result, AmbiguousCandidates)
    assert result.queries == ["cap", "cot", "cut"]


def test_try_window_ambiguous_preserves_surrounding_words_per_suggestion():
    top_n_grams = {"cot": 50, "cap": 40}
    words = ["The", "Cat", "sat"]
    normalized = [normalize_word(w) for w in words]
    result = _try_window(words, normalized, 1, 2, top_n_grams)
    assert isinstance(result, AmbiguousCandidates)
    assert result.queries == ["The cap sat", "The cot sat"]


# --------------------------------------------------------------------------- #
#  autocorrect_query                                                          #
# --------------------------------------------------------------------------- #

def test_autocorrect_query_short_phrase_one_off_match():
    top_n_grams = {"bereishit rabbah": 10}
    assert autocorrect_query("bereshit rabbah", top_n_grams) == AutocorrectResult(
        original_query="bereshit rabbah", corrected_query="bereishit rabbah")


def test_autocorrect_query_short_phrase_already_attested_is_noop():
    top_n_grams = {"bereishit rabbah": 10}
    assert autocorrect_query("bereishit rabbah", top_n_grams) is None


def test_autocorrect_query_does_not_correct_a_lone_word_into_an_unattested_phrase():
    # The product fix this module exists for: "bereshit" alone is one edit from "bereishit",
    # and "rabbati" is a real top-n-grams word too -- but the combined phrase "bereishit
    # rabbati" was never seen in the corpus, so it must NOT be offered, unlike the
    # single-word-correction POC this replaced.
    top_n_grams = {"bereishit": 50, "rabbati": 20}  # no "bereishit rabbati" entry
    assert autocorrect_query("bereshit rabbati", top_n_grams) is None


def test_autocorrect_query_three_word_phrase():
    top_n_grams = {"shir hashirim rabbah": 8}
    assert autocorrect_query("shir hashirim rabah", top_n_grams) == AutocorrectResult(
        original_query="shir hashirim rabah", corrected_query="shir hashirim rabbah")


def test_autocorrect_query_long_query_fixes_longest_window_first():
    # "quick bereshit rabbah fox" (a 3-word window) is NOT attested, but "bereshit rabbah"
    # (the 2-word window inside it) is one edit from an attested phrase -- the 2-word fix
    # must win, and every other word in the query is left exactly as typed.
    top_n_grams = {"bereishit rabbah": 10}
    result = autocorrect_query("The quick bereshit rabbah fox jumps", top_n_grams)
    assert result == AutocorrectResult(
        original_query="The quick bereshit rabbah fox jumps",
        corrected_query="The quick bereishit rabbah fox jumps")


def test_autocorrect_query_long_query_falls_back_to_single_word_window():
    # No 3- or 2-word window is fixable here; only the lone word "teh" needs a fix.
    top_n_grams = {"the": 100}
    result = autocorrect_query("in teh beginning of everything", top_n_grams)
    assert result == AutocorrectResult(
        original_query="in teh beginning of everything",
        corrected_query="in the beginning of everything")


def test_autocorrect_query_long_query_prefers_leftmost_window_of_the_same_size():
    top_n_grams = {"aaa bbb": 10, "xxx yyy": 10}
    result = autocorrect_query("aab bbb ccc xxy yyy", top_n_grams)
    # Both "aab bbb" and "xxy yyy" are one-edit 2-word fixes; the leftmost one wins.
    assert result == AutocorrectResult(
        original_query="aab bbb ccc xxy yyy", corrected_query="aaa bbb ccc xxy yyy")


def test_autocorrect_query_long_query_unfixable_returns_none():
    top_n_grams = {"bereishit rabbah": 10}
    assert autocorrect_query("completely unrelated gibberish text here", top_n_grams) is None


def test_autocorrect_query_empty_inputs():
    assert autocorrect_query("", {"a": 1}) is None
    assert autocorrect_query("query", {}) is None
    assert autocorrect_query(None, {"a": 1}) is None


def test_max_phrase_words_is_three():
    # The spec this module implements: phrases of up to 3 words. If this ever changes, the
    # window-size tests above need to change with it.
    assert MAX_PHRASE_WORDS == 3


# --------------------------------------------------------------------------- #
#  autocorrect_query + entity_alt_index                                       #
# --------------------------------------------------------------------------- #

def test_autocorrect_query_short_query_corrects_from_entity_alt_index():
    assert autocorrect_query("rasih", {}, {"rashi": 4.0}) == AutocorrectResult(
        original_query="rasih", corrected_query="rashi")


def test_autocorrect_query_short_query_already_attested_in_entity_alt_index_is_noop():
    assert autocorrect_query("rashi", {}, {"rashi": 4.0}) is None


def test_autocorrect_query_short_query_picks_higher_scoring_source():
    # Both sources offer a fix; the entity-alt index's precomputed score wins here.
    top_n_grams = {"cap": 1}
    entity_alt_index = {"cot": 100.0}
    assert autocorrect_query("cat", top_n_grams, entity_alt_index) == AutocorrectResult(
        original_query="cat", corrected_query="cot")


def test_autocorrect_query_long_query_whole_phrase_entity_match_beats_windowed_top_n_grams():
    # "mishneh torah" is only 2 words -- well under MAX_PHRASE_WORDS -- but the full query is
    # 5 words, long enough that the capped top-n-grams scan alone could only ever propose a
    # partial (<=3-word) fix. The entity index holds the complete, uncapped title, so the
    # whole-query entity pass must fire and win outright.
    entity_alt_index = {"the mishneh torah book": 0.0}
    result = autocorrect_query("the mishne torah book", {}, entity_alt_index)
    assert result == AutocorrectResult(
        original_query="the mishne torah book", corrected_query="the mishneh torah book")


def test_autocorrect_query_long_query_falls_through_to_windowed_scan_when_no_whole_match():
    top_n_grams = {"quick brown fox": 10}
    entity_alt_index = {"some unrelated title": 5.0}
    result = autocorrect_query("a quick brown fax jumps", top_n_grams, entity_alt_index)
    assert result == AutocorrectResult(
        original_query="a quick brown fax jumps", corrected_query="a quick brown fox jumps")


def test_autocorrect_query_entity_alt_index_is_optional():
    # Omitting entity_alt_index entirely (e.g. DISABLE_AUTOCOMPLETER) must behave exactly
    # like the top-n-grams-only signature this replaced.
    top_n_grams = {"bereishit rabbah": 10}
    assert autocorrect_query("bereshit rabbah", top_n_grams) == AutocorrectResult(
        original_query="bereshit rabbah", corrected_query="bereishit rabbah")


# --------------------------------------------------------------------------- #
#  autocorrect_query + ambiguity (AMBIGUITY_LOG_GAP)                          #
# --------------------------------------------------------------------------- #

def test_autocorrect_query_ambiguous_returns_suggestions_not_a_correction():
    top_n_grams = {"cot": 50, "cap": 40}
    result = autocorrect_query("cat", top_n_grams)
    assert result == AutocorrectResult(
        original_query="cat", corrected_query=None, suggested_queries=["cap", "cot"])


def test_autocorrect_query_confident_when_disparity_is_large():
    # Same pair, but now one dominates by orders of magnitude -- the mari/maariv example in
    # the module docstring: not really competing, so the dominant one still auto-corrects.
    top_n_grams = {"cot": 100000, "cap": 2}
    assert autocorrect_query("cat", top_n_grams) == AutocorrectResult(
        original_query="cat", corrected_query="cot")


def test_autocorrect_query_ambiguous_in_a_long_query_keeps_surrounding_words():
    top_n_grams = {"cot": 50, "cap": 40}
    result = autocorrect_query("The cat sat down", top_n_grams)
    assert result == AutocorrectResult(
        original_query="The cat sat down",
        corrected_query=None,
        suggested_queries=["The cap sat down", "The cot sat down"])


def test_autocorrect_query_ambiguous_between_top_n_grams_and_entity_alt_candidates():
    # entity_alt_index scores are already final (pre-damped) scores, not raw counts -- pick
    # one close to top_n_grams' log-damped score for "cap" (log10(41)=1.61), not a raw count.
    top_n_grams = {"cap": 40}
    entity_alt_index = {"cot": 1.7}
    result = autocorrect_query("cat", top_n_grams, entity_alt_index)
    assert result == AutocorrectResult(
        original_query="cat", corrected_query=None, suggested_queries=["cap", "cot"])


def test_ambiguity_log_gap_is_one_order_of_magnitude():
    # Documents the threshold the tests above assume: roughly a 10x raw-weight gap.
    assert AMBIGUITY_LOG_GAP == 1.0


# --------------------------------------------------------------------------- #
#  save_top_n_grams / load_top_n_grams (faked Mongo)                         #
# --------------------------------------------------------------------------- #

class _FakeCollection:
    """
    Stands in for db[TOP_N_GRAMS_COLLECTION]: just enough of the pymongo collection API
    (bulk_write, delete_many, update_one, find) for save_top_n_grams/load_top_n_grams to run
    against, backed by a plain dict instead of a real Mongo server.
    """
    def __init__(self):
        self.docs = {}
        self.bulk_write_calls = 0

    def bulk_write(self, ops, ordered=False):
        self.bulk_write_calls += 1
        for op in ops:
            doc = self.docs.setdefault(op._filter["_id"], {"_id": op._filter["_id"]})
            doc.update(op._doc["$set"])

    def delete_many(self, filt):
        keep_id = filt["_id"]["$ne"]
        keep_batch = filt["batch"]["$ne"]
        for _id in [k for k, d in self.docs.items() if k != keep_id and d.get("batch") != keep_batch]:
            del self.docs[_id]

    def update_one(self, filt, update, upsert=True):
        doc = self.docs.setdefault(filt["_id"], {"_id": filt["_id"]})
        doc.update(update["$set"])

    def find(self, filt, projection=None):
        exclude_id = filt["_id"]["$ne"]
        return [dict(d) for _id, d in self.docs.items() if _id != exclude_id]


class _FakeDb:
    def __init__(self, collection):
        self._collection = collection

    def __getitem__(self, name):
        return self._collection


@pytest.fixture
def fake_mongo(monkeypatch):
    collection = _FakeCollection()
    monkeypatch.setattr(top_n_grams_for_search_autocorrect, "db", _FakeDb(collection))
    return collection


def test_save_then_load_top_n_grams_round_trips(fake_mongo):
    top_n_grams = {"bereishit rabbah": 10, "the": 100}
    save_top_n_grams(top_n_grams, min_doc_count=3)
    assert dict(load_top_n_grams().items()) == top_n_grams


def test_save_top_n_grams_removes_phrases_dropped_from_a_later_batch(fake_mongo, monkeypatch):
    # Batch ids are a timestamp with 1-second resolution; force two distinct ones rather
    # than relying on this test spanning a real wall-clock second boundary.
    batches = iter(["batch-1", "batch-2"])
    monkeypatch.setattr(top_n_grams_for_search_autocorrect.time, "strftime", lambda *a, **k: next(batches))
    save_top_n_grams({"old phrase": 5}, min_doc_count=3)
    save_top_n_grams({"new phrase": 5}, min_doc_count=3)
    assert dict(load_top_n_grams().items()) == {"new phrase": 5}


def test_save_top_n_grams_writes_meta_document(fake_mongo):
    save_top_n_grams({"a": 10}, min_doc_count=3)
    meta = fake_mongo.docs[_META_ID]
    assert meta["min_doc_count"] == 3
    assert meta["num_words"] == 1
    assert "generated" in meta


def test_save_top_n_grams_chunks_bulk_writes(fake_mongo, monkeypatch):
    monkeypatch.setattr(top_n_grams_for_search_autocorrect, "_BULK_WRITE_CHUNK_SIZE", 2)
    save_top_n_grams({"a": 1, "b": 1, "c": 1, "d": 1, "e": 1}, min_doc_count=0)
    assert fake_mongo.bulk_write_calls == 3  # ceil(5 / 2)
    assert dict(load_top_n_grams().items()) == {"a": 1, "b": 1, "c": 1, "d": 1, "e": 1}


def test_load_top_n_grams_returns_empty_trie_on_error(monkeypatch):
    class _BrokenCollection:
        def find(self, *args, **kwargs):
            raise RuntimeError("no connection")

    monkeypatch.setattr(top_n_grams_for_search_autocorrect, "db", _FakeDb(_BrokenCollection()))
    assert len(load_top_n_grams()) == 0


# --------------------------------------------------------------------------- #
#  build_top_n_grams: level-wise (low-memory) counting                        #
# --------------------------------------------------------------------------- #

# One int for every length, or one per phrase length (falling, rising and mixed).
@pytest.mark.parametrize("min_doc_count", [0, 1, 2, 3, [3, 2, 1], [1, 2, 3], [2, 0, 2], [3], (2, 1, 0)])
def test_build_top_n_grams_matches_brute_force_count(monkeypatch, min_doc_count):
    from collections import Counter
    segments = [
        "a b c a b", "a b c d", "b c d", "a b", "x y z", "x y", "a b c", "c d a b", "q",
    ]

    def fake_spool(spool, langs, categories):
        counts = Counter()
        for seg in segments:
            spool.write(seg + "\n")
            counts.update(set(seg.split()))
        return counts

    monkeypatch.setattr(top_n_grams_for_search_autocorrect, "_spool_tokenized_segments", fake_spool)

    thresholds = top_n_grams_for_search_autocorrect.thresholds_by_length(min_doc_count)
    brute = Counter()
    for seg in segments:
        brute.update(_segment_phrases(seg.split()))
    expected = {p: c for p, c in brute.items() if c > thresholds[len(p.split()) - 1]}

    assert top_n_grams_for_search_autocorrect.build_top_n_grams(min_doc_count) == expected
    # Sharding the counting passes must not change the result either.
    assert top_n_grams_for_search_autocorrect.build_top_n_grams(min_doc_count, num_shards=3) == expected


def test_lower_threshold_for_longer_phrases_keeps_a_trigram_whose_words_are_below_the_word_bar(monkeypatch):
    # "x y z" is in 2 segments, so its words and bigrams are only carried at the low bar; they
    # must still be counted (not pruned) for the trigram to survive, yet not appear in the
    # output at the higher word/bigram threshold.
    from collections import Counter
    segments = ["x y z", "x y z", "m", "m", "m"]

    def fake_spool(spool, langs, categories):
        counts = Counter()
        for seg in segments:
            spool.write(seg + "\n")
            counts.update(set(seg.split()))
        return counts

    monkeypatch.setattr(top_n_grams_for_search_autocorrect, "_spool_tokenized_segments", fake_spool)
    assert top_n_grams_for_search_autocorrect.build_top_n_grams([2, 2, 1]) == {"m": 3, "x y z": 2}


def test_thresholds_by_length_broadcasts_a_single_value():
    assert top_n_grams_for_search_autocorrect.thresholds_by_length(7) == [7] * MAX_PHRASE_WORDS
    assert top_n_grams_for_search_autocorrect.thresholds_by_length([7]) == [7] * MAX_PHRASE_WORDS
    assert top_n_grams_for_search_autocorrect.thresholds_by_length([9, 5, 1]) == [9, 5, 1]


def test_thresholds_by_length_rejects_the_wrong_number_of_values():
    with pytest.raises(ValueError):
        top_n_grams_for_search_autocorrect.thresholds_by_length([1, 2])
    with pytest.raises(ValueError):
        top_n_grams_for_search_autocorrect.thresholds_by_length([1, 2, 3, 4])


# --------------------------------------------------------------------------- #
#  build_phrase_trie / trie-backed autocorrect                                #
# --------------------------------------------------------------------------- #

def test_build_phrase_trie_normalizes_keys_and_keeps_the_higher_value_on_collision():
    # "moshé" and "moshe" collide once accents are unidecoded; apostrophes are dropped.
    trie = build_phrase_trie([("moshé", 3), ("moshe", 9), ("don't", 4)])
    assert trie["moshe"] == 9
    assert trie["dont"] == 4
    assert len(trie) == 2


def test_build_phrase_trie_skips_keys_outside_the_alphabet():
    # "@" survives normalization but isn't in letter_scope; datrie would silently drop it.
    trie = build_phrase_trie([("a@b", 1), ("ab", 2), ("", 3)])
    assert dict(trie.items()) == {"ab": 2}


def test_build_phrase_trie_holds_float_values_when_asked():
    trie = build_phrase_trie([("rashi", 2.5)], int_values=False)
    assert trie["rashi"] == 2.5


def test_autocorrect_query_against_tries_matches_dicts():
    table = {"bereishit rabbah": 10, "mishneh torah": 40, "moshe": 7}
    entities = {"shulchan arukh": 3.0}
    for query in ["bereshit rabbah", "mishne torah", "moshé", "shulchan aruch", "unrelated words here"]:
        expected = autocorrect_query(query, table, entities)
        actual = autocorrect_query(query, build_phrase_trie(table.items()),
                                   build_phrase_trie(entities.items(), int_values=False))
        assert actual == expected, query


def test_autocorrect_query_normalizes_the_query_like_the_table_keys():
    # An accented query word must not fall outside the trie alphabet: it normalizes to the
    # known phrase, so there is nothing to correct -- and the user's spelling is left alone.
    trie = build_phrase_trie([("moshe rabbeinu", 10)])
    assert autocorrect_query("moshé rabbeinu", trie) is None
    result = autocorrect_query("moshé rabbenu", trie)
    assert result.corrected_query == "moshé rabbeinu"
