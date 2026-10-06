# -*- coding: utf-8 -*-
"""
Unit tests for sefaria.helper.string_warehouse (search-query auto-correction, sc-47189).

`tokenize()` and `build_warehouse()` route through the linker's normalizer and the full
library (IndexSet, Version.walk_thru_contents) respectively -- that normalizer is already
covered by linker_test.py / normalization_tests.py, and re-exercising it here would make
this a library-build integration test rather than a unit test of this module's own logic.
These tests instead take tokenized word lists and warehouse dicts as given and cover what's
actually local to this module: phrase generation from a token list, the edit-distance-1
search, the phrase-vs-single-word correction policy, and the Mongo load/save round trip
(faked, so no real Mongo is required).
"""
import pytest

from sefaria.helper.string_warehouse import (
    MAX_PHRASE_WORDS,
    _META_ID,
    normalize_word,
    _segment_phrases,
    _one_edit_candidates,
    _best_match,
    _tie_break_score,
    _try_window,
    autocorrect_query,
    save_warehouse,
    load_warehouse,
)
import sefaria.helper.string_warehouse as string_warehouse


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
    # A phrase recurring in the same segment counts once per doc -- see build_warehouse's
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
    warehouse = {"cot": 5, "cap": 50}
    assert _best_match("cat", warehouse) == "cap"


def test_best_match_returns_none_when_nothing_in_warehouse_is_one_edit_away():
    assert _best_match("cat", {"elephant": 10}) is None


def test_tie_break_score_is_damped_and_monotonic():
    # Large counts stop mattering in direct proportion to their size.
    assert _tie_break_score(0) == 0
    assert _tie_break_score(9) < _tie_break_score(99) < _tie_break_score(999)
    # A 100x bigger count is nowhere near a 100x bigger score.
    assert _tie_break_score(10000) < _tie_break_score(100) * 10


def test_best_match_considers_entity_alt_index_and_picks_the_higher_score():
    # "cap" (warehouse, raw count 5 -> a small tie-break score) vs "cot" (entity-alt index,
    # already pre-scored high) -- the entity-alt candidate must win despite the warehouse
    # having a candidate too, because its score is higher, not because of source priority.
    warehouse = {"cap": 5}
    entity_alt_index = {"cot": 100.0}
    assert _best_match("cat", warehouse, entity_alt_index) == "cot"


def test_best_match_prefers_the_higher_scoring_source_when_a_candidate_is_in_both():
    warehouse = {"cot": 100000}             # huge raw count, but still log-damped
    entity_alt_index = {"cot": 1000.0}      # deliberately-inflated score, wins anyway
    assert _best_match("cat", warehouse, entity_alt_index) == "cot"
    assert entity_alt_index["cot"] > _tie_break_score(warehouse["cot"])


# --------------------------------------------------------------------------- #
#  _try_window                                                                #
# --------------------------------------------------------------------------- #

def test_try_window_returns_none_for_an_already_attested_phrase():
    warehouse = {"bereishit rabbah": 10}
    words = ["Bereishit", "Rabbah"]
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 0, 2, warehouse) is None


def test_try_window_corrects_only_the_changed_word_and_keeps_original_casing():
    warehouse = {"bereishit rabbah": 10}
    words = ["Bereshit", "Rabbah"]  # "Rabbah" is already correct, just capitalized
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 0, 2, warehouse) == "bereishit Rabbah"


def test_try_window_returns_none_when_no_fix_exists():
    warehouse = {"bereishit rabbah": 10}
    words = ["completely", "different"]
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 0, 2, warehouse) is None


def test_try_window_only_touches_the_requested_slice():
    # The surrounding words (outside [start:end)) must survive untouched in the returned
    # full query, whatever happens inside the window.
    warehouse = {"bereishit rabbah": 10}
    words = ["The", "Bereshit", "Rabbah", "edition"]
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 1, 3, warehouse) == "The bereishit Rabbah edition"


def test_try_window_corrects_from_entity_alt_index_alone():
    words = ["Rasih"]
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 0, 1, {}, {"rashi": 4.0}) == "rashi"


def test_try_window_already_attested_in_entity_alt_index_is_noop():
    words = ["Rashi"]
    normalized = [normalize_word(w) for w in words]
    assert _try_window(words, normalized, 0, 1, {}, {"rashi": 4.0}) is None


# --------------------------------------------------------------------------- #
#  autocorrect_query                                                          #
# --------------------------------------------------------------------------- #

def test_autocorrect_query_short_phrase_one_off_match():
    warehouse = {"bereishit rabbah": 10}
    assert autocorrect_query("bereshit rabbah", warehouse) == ("bereishit rabbah", "bereshit rabbah")


def test_autocorrect_query_short_phrase_already_attested_is_noop():
    warehouse = {"bereishit rabbah": 10}
    assert autocorrect_query("bereishit rabbah", warehouse) is None


def test_autocorrect_query_does_not_correct_a_lone_word_into_an_unattested_phrase():
    # The product fix this module exists for: "bereshit" alone is one edit from "bereishit",
    # and "rabbati" is a real warehouse word too -- but the combined phrase "bereishit
    # rabbati" was never seen in the corpus, so it must NOT be offered, unlike the
    # single-word-correction POC this replaced.
    warehouse = {"bereishit": 50, "rabbati": 20}  # no "bereishit rabbati" entry
    assert autocorrect_query("bereshit rabbati", warehouse) is None


def test_autocorrect_query_three_word_phrase():
    warehouse = {"shir hashirim rabbah": 8}
    assert autocorrect_query("shir hashirim rabah", warehouse) == (
        "shir hashirim rabbah", "shir hashirim rabah")


def test_autocorrect_query_long_query_fixes_longest_window_first():
    # "quick bereshit rabbah fox" (a 3-word window) is NOT attested, but "bereshit rabbah"
    # (the 2-word window inside it) is one edit from an attested phrase -- the 2-word fix
    # must win, and every other word in the query is left exactly as typed.
    warehouse = {"bereishit rabbah": 10}
    result = autocorrect_query("The quick bereshit rabbah fox jumps", warehouse)
    assert result == ("The quick bereishit rabbah fox jumps", "The quick bereshit rabbah fox jumps")


def test_autocorrect_query_long_query_falls_back_to_single_word_window():
    # No 3- or 2-word window is fixable here; only the lone word "teh" needs a fix.
    warehouse = {"the": 100}
    result = autocorrect_query("in teh beginning of everything", warehouse)
    assert result == ("in the beginning of everything", "in teh beginning of everything")


def test_autocorrect_query_long_query_prefers_leftmost_window_of_the_same_size():
    warehouse = {"aaa bbb": 10, "xxx yyy": 10}
    result = autocorrect_query("aab bbb ccc xxy yyy", warehouse)
    # Both "aab bbb" and "xxy yyy" are one-edit 2-word fixes; the leftmost one wins.
    assert result == ("aaa bbb ccc xxy yyy", "aab bbb ccc xxy yyy")


def test_autocorrect_query_long_query_unfixable_returns_none():
    warehouse = {"bereishit rabbah": 10}
    assert autocorrect_query("completely unrelated gibberish text here", warehouse) is None


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
    assert autocorrect_query("rasih", {}, {"rashi": 4.0}) == ("rashi", "rasih")


def test_autocorrect_query_short_query_already_attested_in_entity_alt_index_is_noop():
    assert autocorrect_query("rashi", {}, {"rashi": 4.0}) is None


def test_autocorrect_query_short_query_picks_higher_scoring_source():
    # Both sources offer a fix; the entity-alt index's precomputed score wins here.
    warehouse = {"cap": 1}
    entity_alt_index = {"cot": 100.0}
    assert autocorrect_query("cat", warehouse, entity_alt_index) == ("cot", "cat")


def test_autocorrect_query_long_query_whole_phrase_entity_match_beats_windowed_warehouse():
    # "mishneh torah" is only 2 words -- well under MAX_PHRASE_WORDS -- but the full query is
    # 5 words, long enough that the capped warehouse scan alone could only ever propose a
    # partial (<=3-word) fix. The entity index holds the complete, uncapped title, so the
    # whole-query entity pass must fire and win outright.
    entity_alt_index = {"the mishneh torah book": 0.0}
    result = autocorrect_query("the mishne torah book", {}, entity_alt_index)
    assert result == ("the mishneh torah book", "the mishne torah book")


def test_autocorrect_query_long_query_falls_through_to_windowed_scan_when_no_whole_match():
    warehouse = {"quick brown fox": 10}
    entity_alt_index = {"some unrelated title": 5.0}
    result = autocorrect_query("a quick brown fax jumps", warehouse, entity_alt_index)
    assert result == ("a quick brown fox jumps", "a quick brown fax jumps")


def test_autocorrect_query_entity_alt_index_is_optional():
    # Omitting entity_alt_index entirely (e.g. DISABLE_ENTITY_ALT_INDEX) must behave exactly
    # like the warehouse-only signature this replaced.
    warehouse = {"bereishit rabbah": 10}
    assert autocorrect_query("bereshit rabbah", warehouse) == ("bereishit rabbah", "bereshit rabbah")


# --------------------------------------------------------------------------- #
#  save_warehouse / load_warehouse (faked Mongo)                             #
# --------------------------------------------------------------------------- #

class _FakeCollection:
    """
    Stands in for db[WAREHOUSE_COLLECTION]: just enough of the pymongo collection API
    (bulk_write, delete_many, update_one, find) for save_warehouse/load_warehouse to run
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
    monkeypatch.setattr(string_warehouse, "db", _FakeDb(collection))
    return collection


def test_save_then_load_warehouse_round_trips(fake_mongo):
    warehouse = {"bereishit rabbah": 10, "the": 100}
    save_warehouse(warehouse, min_doc_count=3)
    assert load_warehouse() == warehouse


def test_save_warehouse_removes_phrases_dropped_from_a_later_batch(fake_mongo, monkeypatch):
    # Batch ids are a timestamp with 1-second resolution; force two distinct ones rather
    # than relying on this test spanning a real wall-clock second boundary.
    batches = iter(["batch-1", "batch-2"])
    monkeypatch.setattr(string_warehouse.time, "strftime", lambda *a, **k: next(batches))
    save_warehouse({"old phrase": 5}, min_doc_count=3)
    save_warehouse({"new phrase": 5}, min_doc_count=3)
    assert load_warehouse() == {"new phrase": 5}


def test_save_warehouse_writes_meta_document(fake_mongo):
    save_warehouse({"a": 10}, min_doc_count=3)
    meta = fake_mongo.docs[_META_ID]
    assert meta["min_doc_count"] == 3
    assert meta["num_words"] == 1
    assert "generated" in meta


def test_save_warehouse_chunks_bulk_writes(fake_mongo, monkeypatch):
    monkeypatch.setattr(string_warehouse, "_BULK_WRITE_CHUNK_SIZE", 2)
    save_warehouse({"a": 1, "b": 1, "c": 1, "d": 1, "e": 1}, min_doc_count=0)
    assert fake_mongo.bulk_write_calls == 3  # ceil(5 / 2)
    assert load_warehouse() == {"a": 1, "b": 1, "c": 1, "d": 1, "e": 1}


def test_load_warehouse_returns_empty_dict_on_error(monkeypatch):
    class _BrokenCollection:
        def find(self, *args, **kwargs):
            raise RuntimeError("no connection")

    monkeypatch.setattr(string_warehouse, "db", _FakeDb(_BrokenCollection()))
    assert load_warehouse() == {}
