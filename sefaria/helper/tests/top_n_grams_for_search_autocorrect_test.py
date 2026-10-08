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
search, the phrase-vs-single-word correction policy, and the trie file save/load round trip
(local files and a faked download, so no network is required).
"""
import pytest

from sefaria.helper.top_n_grams_for_search_autocorrect import (
    MAX_PHRASE_WORDS,
    AMBIGUITY_LOG_GAP,
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
    save_top_n_grams_trie,
    build_phrase_trie,
    load_top_n_grams,
    MAX_QUERY_CHARS,
    MAX_QUERY_WORDS,
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
    assert [q for q, _ in result.scored_queries] == ["cot", "cap"]  # most likely first


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
    assert [q for q, _ in result.scored_queries] == ["cot", "cap", "cut"]


def test_try_window_ambiguous_preserves_surrounding_words_per_suggestion():
    top_n_grams = {"cot": 50, "cap": 40}
    words = ["The", "Cat", "sat"]
    normalized = [normalize_word(w) for w in words]
    result = _try_window(words, normalized, 1, 2, top_n_grams)
    assert isinstance(result, AmbiguousCandidates)
    assert [q for q, _ in result.scored_queries] == ["The cot sat", "The cap sat"]


# --------------------------------------------------------------------------- #
#  autocorrect_query                                                          #
# --------------------------------------------------------------------------- #

def test_autocorrect_query_short_phrase_one_off_match():
    top_n_grams = {"bereishit rabbah": 10}
    assert autocorrect_query("bereshit rabbah", top_n_grams) == AutocorrectResult(
        original_query="bereshit rabbah", corrected_query="bereishit rabbah")


def test_autocorrect_query_cleans_whitespace_and_apostrophes_in_both_queries():
    top_n_grams = {"bereishit rabbah": 10}
    assert autocorrect_query("  bere\u05f3shit \u2019 rabbah  ", top_n_grams) == AutocorrectResult(
        original_query="bereshit rabbah", corrected_query="bereishit rabbah")
    assert autocorrect_query("bereshit   rabbah", top_n_grams) == AutocorrectResult(
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


def test_autocorrect_query_long_query_fixes_one_typo_seen_by_overlapping_trigrams():
    # "bereshit" sits in three windows; only the ones with an attested one-edit neighbour
    # propose a fix, and they all propose the same query.
    top_n_grams = {"the quick bereishit": 10, "quick bereishit rabbah": 10, "bereishit rabbah fox": 10}
    result = autocorrect_query("The quick bereshit rabbah fox jumps", top_n_grams)
    assert result == AutocorrectResult(
        original_query="The quick bereshit rabbah fox jumps",
        corrected_query="The quick bereishit rabbah fox jumps")


def test_autocorrect_query_long_query_never_falls_back_to_shorter_windows():
    # "teh" is one edit from the attested word "the", and "teh beginning" from nothing -- but
    # no trigram is fixable, and bigrams/single words are not tried for long queries.
    top_n_grams = {"the": 100, "the beginning": 50}
    assert autocorrect_query("in teh beginning of everything", top_n_grams) is None


def test_autocorrect_query_long_query_two_separate_typos_corrects_nothing():
    top_n_grams = {"aaa bbb ccc": 10, "xxx yyy zzz": 10}
    assert autocorrect_query("aab bbb ccc xxy yyy zzz", top_n_grams) is None


def test_autocorrect_query_long_query_ambiguous_trigrams_return_suggestions():
    top_n_grams = {"the cot sat": 50, "the cap sat": 40}
    result = autocorrect_query("the cat sat down", top_n_grams)
    assert result == AutocorrectResult(
        original_query="the cat sat down", suggested_queries=["the cot sat down", "the cap sat down"])


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
        original_query="cat", corrected_query=None, suggested_queries=["cot", "cap"])


def test_autocorrect_query_confident_when_disparity_is_large():
    # Same pair, but now one dominates by orders of magnitude -- the mari/maariv example in
    # the module docstring: not really competing, so the dominant one still auto-corrects.
    top_n_grams = {"cot": 100000, "cap": 2}
    assert autocorrect_query("cat", top_n_grams) == AutocorrectResult(
        original_query="cat", corrected_query="cot")


def test_autocorrect_query_ambiguous_in_a_long_query_keeps_surrounding_words():
    top_n_grams = {"the cot sat": 50, "the cap sat": 40}
    result = autocorrect_query("The cat sat down", top_n_grams)
    assert result == AutocorrectResult(
        original_query="The cat sat down",
        corrected_query=None,
        suggested_queries=["The cot sat down", "The cap sat down"])


def test_autocorrect_query_ambiguous_between_top_n_grams_and_entity_alt_candidates():
    # entity_alt_index scores are already final (pre-damped) scores, not raw counts -- pick
    # one close to top_n_grams' log-damped score for "cap" (log10(41)=1.61), not a raw count.
    top_n_grams = {"cap": 40}
    entity_alt_index = {"cot": 1.7}
    result = autocorrect_query("cat", top_n_grams, entity_alt_index)
    assert result == AutocorrectResult(
        original_query="cat", corrected_query=None, suggested_queries=["cot", "cap"])


def test_ambiguity_log_gap_is_one_order_of_magnitude():
    # Documents the threshold the tests above assume: roughly a 10x raw-weight gap.
    assert AMBIGUITY_LOG_GAP == 1.0


def test_ambiguous_suggestions_equal_scores_fall_back_to_a_z():
    result = autocorrect_query("cat", {"cot": 40, "cap": 40})
    assert result.suggested_queries == ["cap", "cot"]


# --------------------------------------------------------------------------- #
#  Numbers are never edited                                                   #
# --------------------------------------------------------------------------- #

def test_autocorrect_query_never_edits_a_number():
    # "berakhot 2a" is a citation, not a typo of a neighboring daf.
    top_n_grams = {"berakhot 22a": 50, "berakhot 5a": 40, "berakhot 8a": 30}
    assert autocorrect_query("berakhot 2a", top_n_grams) is None


def test_autocorrect_query_still_fixes_words_next_to_a_number():
    top_n_grams = {"berakhot 2a": 50}
    assert autocorrect_query("berakhto 2a", top_n_grams) == AutocorrectResult(
        original_query="berakhto 2a", corrected_query="berakhot 2a")


def test_autocorrect_query_never_merges_a_word_into_a_number():
    # Deleting the space would change the digit-bearing word "2a" into "berakhot2a".
    assert autocorrect_query("berakhot 2a", {"berakhot2a": 50}) is None


# --------------------------------------------------------------------------- #
#  Query length caps                                                          #
# --------------------------------------------------------------------------- #

def test_autocorrect_query_skips_queries_over_the_char_cap():
    top_n_grams = {"bereishit": 100}
    long_query = "bereshit " + "x" * MAX_QUERY_CHARS
    assert autocorrect_query(long_query, top_n_grams) is None


def test_autocorrect_query_skips_queries_over_the_word_cap():
    top_n_grams = {"the cot sat": 50}
    query = "the cat sat " + " ".join(["w"] * (MAX_QUERY_WORDS - 2))
    assert len(query) <= MAX_QUERY_CHARS
    assert autocorrect_query(query, top_n_grams) is None


# --------------------------------------------------------------------------- #
#  save_top_n_grams_trie / load_top_n_grams                                   #
# --------------------------------------------------------------------------- #

@pytest.fixture
def trie_source(monkeypatch):
    def point_at(source):
        monkeypatch.setattr(top_n_grams_for_search_autocorrect, "_trie_source", lambda: source)
    return point_at


def test_save_then_load_trie_round_trips_from_a_local_file(tmp_path, trie_source):
    path = str(tmp_path / "t.trie")
    top_n_grams = {"bereishit rabbah": 10, "the": 100}
    assert save_top_n_grams_trie(top_n_grams, path) == 2
    trie_source(path)
    assert dict(load_top_n_grams().items()) == top_n_grams


def test_load_trie_downloads_from_a_url(tmp_path, trie_source, monkeypatch):
    path = str(tmp_path / "t.trie")
    save_top_n_grams_trie({"the": 100}, path)

    def fake_download(url, dest):
        with open(path, "rb") as f:
            dest.write(f.read())
        return {"x-goog-meta-generated": "2026-10-08T00:00:00Z", "x-goog-meta-num-phrases": "1"}

    monkeypatch.setattr(top_n_grams_for_search_autocorrect, "_download", fake_download)
    trie_source("https://storage.googleapis.com/bucket/t.trie")
    assert dict(load_top_n_grams().items()) == {"the": 100}


def test_load_trie_returns_empty_trie_and_logs_error_on_failure(trie_source, monkeypatch):
    errors = []
    monkeypatch.setattr(top_n_grams_for_search_autocorrect.logger, "error", lambda event, **kw: errors.append(event))
    trie_source("/nonexistent/path.trie")
    assert dict(load_top_n_grams().items()) == {}
    assert errors == ["top_n_grams_for_search_autocorrect_unavailable"]


def test_load_trie_logs_error_when_table_is_empty(tmp_path, trie_source, monkeypatch):
    errors = []
    monkeypatch.setattr(top_n_grams_for_search_autocorrect.logger, "error", lambda event, **kw: errors.append(event))
    path = str(tmp_path / "empty.trie")
    save_top_n_grams_trie({}, path)
    trie_source(path)
    assert dict(load_top_n_grams().items()) == {}
    assert errors == ["top_n_grams_for_search_autocorrect_unavailable"]


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


# --------------------------------------------------------------------------- #
#  Never call len()/bool() on a table: a datrie trie's len() walks every key   #
# --------------------------------------------------------------------------- #

class _NoLenTable:
    """
    Stands in for a `datrie` trie, whose `len()` -- and so truthiness -- is O(number of keys)
    (~1s for the corpus table). Lookups work; any `len()`/`bool()` raises, so a regression
    that checks a table's truthiness fails loudly instead of just getting slow.
    """
    def __init__(self, data):
        self._data = dict(data)

    def __contains__(self, key):
        return key in self._data

    def __getitem__(self, key):
        return self._data[key]

    def __iter__(self):
        return iter(self._data)

    def __len__(self):
        raise AssertionError("len()/bool() on a phrase table is O(n) for a datrie trie")


_NO_LEN_TOP_N_GRAMS = {"shabbat": 500, "mourning": 400, "talmud": 900, "bereishit rabbah": 300}
_NO_LEN_ENTITIES = {"rambam": 3.0, "rashi on bereishit": 2.5}


@pytest.mark.parametrize("query", [
    "shabat",                                              # one word, corpus table
    "bereshit rabbah",                                     # phrase
    "rambam",                                              # already attested in the entity index
    "rashi on bereshit",                                   # short phrase, entity candidate
    "what does the talmud say about mourning on shabat",   # long: windowed scan, one fix
    "nothing here is close to anything at all",            # long: no window fixable
    "",
])
def test_autocorrect_query_never_takes_len_or_truthiness_of_a_table(query):
    expected = autocorrect_query(query, _NO_LEN_TOP_N_GRAMS, _NO_LEN_ENTITIES)
    assert autocorrect_query(query, _NoLenTable(_NO_LEN_TOP_N_GRAMS), _NoLenTable(_NO_LEN_ENTITIES)) == expected
    assert autocorrect_query(query, _NoLenTable(_NO_LEN_TOP_N_GRAMS)) == autocorrect_query(query, _NO_LEN_TOP_N_GRAMS)


def test_autocorrect_query_with_a_long_query_corrects_whole_from_entities_without_len():
    entities = _NoLenTable({"a b c d e": 3.0})
    result = autocorrect_query("a b c d f", _NoLenTable(_NO_LEN_TOP_N_GRAMS), entities)
    assert result is not None and result.corrected_query == "a b c d e"


def test_is_empty_agrees_for_dicts_and_real_tries():
    from sefaria.helper.top_n_grams_for_search_autocorrect import _is_empty, build_phrase_trie
    assert _is_empty(None) and _is_empty({}) and _is_empty(build_phrase_trie(()))
    assert not _is_empty({"a": 1}) and not _is_empty(build_phrase_trie([("a", 1)]))
    assert not _is_empty(build_phrase_trie([("a", 1.5)], int_values=False))
    assert not _is_empty(_NoLenTable({"a": 1}))


def test_autocorrect_query_treats_an_empty_entity_index_as_absent():
    from sefaria.helper.top_n_grams_for_search_autocorrect import build_phrase_trie
    for empty in ({}, build_phrase_trie((), int_values=False), None):
        assert autocorrect_query("shabat", _NO_LEN_TOP_N_GRAMS, empty) == autocorrect_query("shabat", _NO_LEN_TOP_N_GRAMS)
    # Both tables empty: nothing to correct against.
    assert autocorrect_query("shabat", {}, build_phrase_trie((), int_values=False)) is None
