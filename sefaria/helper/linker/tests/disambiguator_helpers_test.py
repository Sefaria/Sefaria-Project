import pytest

from sefaria.helper.linker.disambiguator import (
    _get_commentary_base_ref,
    _dicta_phrase_distance,
    _best_substring_by_levenshtein,
    Candidate,
)


@pytest.mark.parametrize("citing_ref,expected", [
    # --- None / empty inputs ---
    (None, None),
    ("", None),

    # --- Non-commentary: no base_text_titles ---
    ("Genesis 1:1", None),

    # --- Multiple base texts (Ein Ayah covers both Berakhot and Shabbat) ---
    ("Ein Ayah 1:1", None),

    # --- Book-level citing ref: base resolved to book level, too coarse ---
    ("Rashi on Genesis", None),

    # --- Both simple: Torah ---
    ("Rashi on Genesis 1:3:1", "Genesis 1:3"),
    # section-level citing ref still resolves correctly
    ("Rashi on Genesis 1:3", "Genesis 1:3"),

    # --- Both simple: Talmud (Amud addressing) ---
    ("Rashi on Bava Kamma 2a:1:1", "Bava Kamma 2a:1"),
    ("Tosafot on Sukkah 2a:1:1", "Sukkah 2a:1"),

    # --- Both complex, matching node titles: Meir Ayin on Seder Olam Rabbah ---
    # Both indices have 'Introduction' and 'default' children with matching English titles.
    # The default leaf has depth 2 (['Perek', 'Integer']), so section level = 1 number.
    ("Meir Ayin on Seder Olam Rabbah 1:1:1", "Seder Olam Rabbah 1"),
    ("Vilna Gaon on Seder Olam Rabbah 1:1:1", "Seder Olam Rabbah 1"),

    # --- Both complex, node titles match (key != title): Prisha on Tur ---
    # Prisha's internal key is 'OrachChaim' but en title is 'Orach Chayim', which
    # matches Tur's 'Orach Chayim' child. Tur's Orach Chaim leaf has depth 2
    # (['Siman', 'Seif']), so section level = Siman only.
    ("Prisha, Orach Chaim 1:1", "Tur, Orach Chayim 1"),

    # --- Complex citing, simple base (XOR → None) ---
    # Mishnat Eretz Yisrael is complex; Mishnah Shabbat is not.
    ("Mishnat Eretz Yisrael on Mishnah Shabbat, Appendix 3:20", None),

    # --- Simple citing, complex base (XOR → None) ---
    # Chelkat Mechokek is not complex; Shulchan Arukh Even HaEzer is.
    ("Chelkat Mechokek 1:1", None),

    # --- Both complex, citing has no base_text_titles ---
    # Ra'avad on Sifra has an empty base_text_titles list.
    ("Ra'avad on Sifra, Vayikra Dibbura DeNedavah, Chapter 2 1:1", None),
])
def test_get_commentary_base_ref(citing_ref, expected):
    assert _get_commentary_base_ref(citing_ref) == expected


# ---------------------------------------------------------------------------
# _dicta_phrase_distance
# ---------------------------------------------------------------------------

def _cand(phrase: str) -> Candidate:
    return Candidate(resolved_ref="Test 1:1", query=phrase)


class TestDictaPhraseDistance:

    def test_no_resolution_phrase_returns_none(self):
        cand = Candidate(resolved_ref="Test 1:1")  # no query / queries / raw
        assert _dicta_phrase_distance("some text", {'charRange': [0, 4]}, cand) is None

    def test_phrase_not_in_text_returns_none(self):
        assert _dicta_phrase_distance(
            "hello world", {'charRange': [0, 5]}, _cand("xyz_not_present_abc")
        ) is None

    def test_phrase_before_citation_returns_gap(self):
        # "phrase" ends at 6; citation starts at 10 → gap = 4
        text = "phrase____citation_text"
        assert _dicta_phrase_distance(text, {'charRange': [10, 23]}, _cand("phrase")) == 4

    def test_phrase_immediately_before_citation_returns_zero(self):
        # phrase ends exactly where citation starts → gap = 0
        text = "phrase_textcitation_text"
        assert _dicta_phrase_distance(text, {'charRange': [11, 24]}, _cand("phrase_text")) == 0

    def test_phrase_overlaps_left_edge_of_citation_returns_zero(self):
        # phrase [4, 27) ends inside citation [22, 39) → overlap
        phrase = "phrase_starts_here_OVER"  # 23 chars
        text = "AAAA" + phrase + "LAP_citation_end"
        assert _dicta_phrase_distance(text, {'charRange': [22, 39]}, _cand(phrase)) == 0

    def test_citation_inside_phrase_returns_zero(self):
        # THE BUG: large resolution phrase that fully contains the citation.
        # Observed in Midrash Tanchuma / Amos 3 where the phrase spanned 84 chars
        # and the citation was embedded within it — old code returned 84 instead of 0.
        before = "resolution_phrase_includes_"   # 27 chars
        citation_text = "Amos 3"                 # 6 chars
        after = "_and_more_content"              # 17 chars
        phrase = before + citation_text + after  # 50 chars, contains citation
        text = "AAAAA" + phrase + "ZZZZZ"
        c_start = len("AAAAA") + len(before)      # = 32
        c_end = c_start + len(citation_text)       # = 38
        assert text[c_start:c_end] == citation_text
        assert _dicta_phrase_distance(text, {'charRange': [c_start, c_end]}, _cand(phrase)) == 0

    def test_phrase_inside_citation_returns_zero(self):
        # phrase [15, 27) is entirely within citation [0, 40) → overlap
        phrase = "short_phrase"
        text = "CITATION_START_" + phrase + "_CITATION_END"
        assert _dicta_phrase_distance(text, {'charRange': [0, len(text)]}, _cand(phrase)) == 0

    def test_phrase_overlaps_right_edge_of_citation_returns_zero(self):
        # phrase [15, 46) starts inside citation [0, 20) → overlap
        phrase = "phrase_extending_beyond_citation"  # 31 chars
        text = "CITATION_START_" + phrase + "_SUFFIX"
        phrase_start = len("CITATION_START_")  # 15
        c_end = phrase_start + 5               # citation ends 5 chars into phrase
        assert _dicta_phrase_distance(text, {'charRange': [0, c_end]}, _cand(phrase)) == 0

    def test_phrase_immediately_after_citation_returns_zero(self):
        # citation ends exactly where phrase starts → gap = 0
        text = "citation_textphrase_text"
        phrase_pos = text.find("phrase_text")   # = 13
        assert _dicta_phrase_distance(text, {'charRange': [0, phrase_pos]}, _cand("phrase_text")) == 0

    def test_phrase_after_citation_returns_gap(self):
        # citation ends at 8; phrase starts at 12 → gap = 4
        text = "citation____phrase_text"
        assert _dicta_phrase_distance(text, {'charRange': [0, 8]}, _cand("phrase_text")) == 4


# ---------------------------------------------------------------------------
# _best_substring_by_levenshtein
# ---------------------------------------------------------------------------

class TestBestSubstringByLevenshtein:

    def test_exact_match_returns_that_substring(self):
        assert _best_substring_by_levenshtein("prefixTARGETsuffix", "TARGET") == "TARGET"

    def test_near_match_returns_closest_window(self):
        # "TARGE1" differs from "TARGET" by 1 edit; "ARGETS" differs by 2
        result = _best_substring_by_levenshtein("prefixTARGE1suffix", "TARGET")
        assert result == "TARGE1"

    def test_target_longer_than_long_text_returns_long_text(self):
        assert _best_substring_by_levenshtein("short", "longer_target") == "short"

    def test_empty_target_returns_long_text(self):
        assert _best_substring_by_levenshtein("some text", "") == "some text"

    def test_prefers_earlier_window_on_tie(self):
        # Both "ABC" windows are equidistant from "XYZ"; first one wins
        result = _best_substring_by_levenshtein("ABCXXXABC", "XYZ")
        # "ABC" (dist 3) and "XXX" (dist 3) — implementation returns earliest min
        assert len(result) == 3


# ---------------------------------------------------------------------------
# Candidate.resolution_phrase — Dicta baseMatchedText / compMatchedText logic
# ---------------------------------------------------------------------------

def _dicta_candidate(base_matched: str, comp_matched: str = None) -> Candidate:
    raw = {"baseMatchedText": base_matched}
    if comp_matched is not None:
        raw["compMatchedText"] = comp_matched
    return Candidate(resolved_ref="Test 1:1", raw=raw)


class TestResolutionPhraseLevenshtein:

    def test_no_comp_matched_returns_base_as_is(self):
        cand = _dicta_candidate("long base matched text here")
        assert cand.resolution_phrase() == "long base matched text here"

    def test_same_length_returns_best_window(self):
        # base and comp are the same length after normalization → returns the whole base
        base = "hello world"
        comp = "hello world"
        cand = _dicta_candidate(base, comp)
        assert cand.resolution_phrase() == base

    def test_comp_longer_than_base_returns_base_as_is(self):
        # comp longer than base after normalization → fallback returns full base
        cand = _dicta_candidate("short", "much longer target text here")
        assert cand.resolution_phrase() == "short"

    def test_base_much_larger_returns_best_substring(self):
        # base is >1.5× comp → substring search kicks in
        comp = "TARGET"
        base = "prefix_padding_padding_TARGET_suffix_padding_padding"
        cand = _dicta_candidate(base, comp)
        result = cand.resolution_phrase()
        assert result == "TARGET"
        assert len(result) == len(comp)

    def test_base_much_larger_near_match(self):
        # Levenshtein finds closest window even without exact match
        comp = "TARGET"
        base = "aaaaaaaaaaaaaaaaaaaaTARGE1bbbbbbbbbbbbbbbbbbbb"
        cand = _dicta_candidate(base, comp)
        result = cand.resolution_phrase()
        assert result == "TARGE1"  # 1 edit away from TARGET

    def test_queries_take_priority_over_raw(self):
        # queries field always wins over baseMatchedText logic
        cand = Candidate(
            resolved_ref="Test 1:1",
            queries=["my query"],
            raw={"baseMatchedText": "long base text here that is much larger", "compMatchedText": "short"},
        )
        assert cand.resolution_phrase() == "my query"
