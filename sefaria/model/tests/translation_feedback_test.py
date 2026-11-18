import pytest

from sefaria.model.translation_feedback import (
    TranslationFeedback, visible_text_with_map, locate_word, occurrence_at_offset, replace_word,
    WordReplacementError, STATUS_NEW, STATUS_ACCEPTED, STATUS_REJECTED, now_epoch, visible_text, has_markup, normalize_space, segment_replacement,
)
from sefaria.system.exceptions import InputError


class TestVisibleText:
    def test_strips_tags_and_decodes_entities(self):
        raw = "In <b>the</b> beginning &amp; <i class=\"footnote\">note</i>&nbsp;end"
        visible, spans = visible_text_with_map(raw)
        assert visible == "In the beginning & note end"
        assert len(spans) == len(visible)
        amp = visible.index("&")
        assert raw[spans[amp][0]:spans[amp][1]] == "&amp;"

    def test_unterminated_angle_bracket_is_literal(self):
        assert visible_text_with_map("a < b")[0] == "a < b"


class TestSegmentHelpers:
    def test_has_markup(self):
        assert has_markup("In <b>the</b> beginning")
        assert has_markup('light<sup class="footnote-marker">1</sup>')
        assert not has_markup("Tom &amp; Jerry &#39;s")
        assert not has_markup("a < b")
        assert not has_markup(None)

    def test_visible_text(self):
        assert visible_text("Tom &amp; <i>Jerry</i>") == "Tom & Jerry"
        assert visible_text(None) == ""

    def test_normalize_space(self):
        assert normalize_space("  a\n b\t c ") == "a b c"
        assert normalize_space(None) == ""

    def test_segment_replacement_escapes(self):
        assert segment_replacement("  Tom & <b>Jerry</b> ") == "Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;"


class TestLocateWord:
    raw = "And God saw that <b>the</b> light was good; the Godly light, the <i>light</i>."

    def test_whole_word_only(self):
        # "God" must not match inside "Godly"
        start, end = locate_word(self.raw, "God", 0)
        assert self.raw[start:end] == "God"
        assert locate_word(self.raw, "God", 1) is None

    def test_nth_occurrence_through_tags(self):
        start, end = locate_word(self.raw, "light", 2)
        assert self.raw[start - 3:end + 4] == "<i>light</i>"

    def test_case_sensitive(self):
        assert locate_word(self.raw, "and", 0) is None
        assert locate_word(self.raw, "And", 0) == (0, 3)

    def test_occurrence_at_offset(self):
        visible = visible_text_with_map(self.raw)[0]
        second_the = visible.index("the", visible.index("the") + 1)
        assert occurrence_at_offset(self.raw, "the", second_the) == 1
        assert occurrence_at_offset(self.raw, "the", second_the + 1) == 1
        assert occurrence_at_offset(self.raw, "the", 0) is None

    def test_non_latin_word(self):
        raw = "the word <b>שלום</b> and שלום again"
        start, end = locate_word(raw, "שלום", 1)
        assert raw[start:end] == "שלום" and start > raw.index("</b>")


class TestReplaceWord:
    def test_replaces_only_the_selected_instance(self):
        raw = "the light and the <b>light</b>"
        assert replace_word(raw, "light", 1, "radiance") == "the light and the <b>radiance</b>"
        assert replace_word(raw, "light", 0, "radiance") == "the radiance and the <b>light</b>"

    def test_escapes_replacement(self):
        assert replace_word("a cat", "cat", 0, "<script>&") == "a &lt;script&gt;&amp;"

    def test_missing_word_raises(self):
        with pytest.raises(WordReplacementError):
            replace_word("the light", "light", 1, "x")
        with pytest.raises(WordReplacementError):
            replace_word("the lights", "light", 0, "x")

    def test_refuses_word_spanning_markup(self):
        with pytest.raises(WordReplacementError):
            replace_word("<b>Go</b>d said", "God", 0, "The Lord")

    def test_entity_inside_word(self):
        raw = "Tom&#39;s house"
        assert replace_word(raw, "Tom's", 0, "Their") == "Their house"


class TestModel:
    def _attrs(self, **overrides):
        attrs = {
            "ref": "Genesis 1:1", "version_title": "Test Version", "language": "en",
            "created": now_epoch(), "status": STATUS_NEW, "suggestion": "In the beginning the Lord created",
            "comment": None, "user_id": None, "llm_assessment": None,
        }
        attrs.update(overrides)
        return attrs

    def test_save_load_round_trip(self):
        fb = TranslationFeedback(self._attrs(comment="Tom & Jerry <3")).save()
        try:
            loaded = TranslationFeedback().load_by_id(fb._id)
            # plain-text fields are stored verbatim, not bleached/escaped
            assert loaded.comment == "Tom & Jerry <3"
            assert loaded.has_suggestion()
            assert not loaded.is_word_level()
        finally:
            fb.delete()

    def test_legacy_word_level_record_still_loads(self):
        fb = TranslationFeedback(self._attrs(word="God", occurrence=0, suggestion="the Lord")).save()
        try:
            assert TranslationFeedback().load_by_id(fb._id).is_word_level()
        finally:
            fb.delete()

    def test_status_labels_and_decider(self):
        assert TranslationFeedback(self._attrs()).status_label() == "undecided"
        attrs = self._attrs()
        del attrs["status"]
        assert TranslationFeedback(attrs).status_label() == "undecided"
        assert TranslationFeedback(self._attrs(status=STATUS_REJECTED, decided_by=3, decided_at=5)).decider() == (3, 5)
        # records accepted before decided_by/decided_at existed
        legacy = TranslationFeedback(self._attrs(status=STATUS_ACCEPTED, accepted_by=4, accepted_at=6))
        assert legacy.status_label() == "accepted" and legacy.decider() == (4, 6)

    def test_rejected_status_saves(self):
        fb = TranslationFeedback(self._attrs(status=STATUS_REJECTED, decided_by=3, decided_at=now_epoch())).save()
        try:
            assert TranslationFeedback().load_by_id(fb._id).status == STATUS_REJECTED
        finally:
            fb.delete()

    def test_rejects_unknown_status(self):
        with pytest.raises(InputError):
            TranslationFeedback(self._attrs(status="maybe")).save()

    def test_rejects_bad_assessment(self):
        with pytest.raises(InputError):
            TranslationFeedback(self._attrs(llm_assessment="7")).save()

    def test_requires_version_title(self):
        attrs = self._attrs()
        del attrs["version_title"]
        with pytest.raises(InputError):
            TranslationFeedback(attrs).save()
