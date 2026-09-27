import pytest

from sefaria.model.translation_feedback import (
    TranslationFeedback, visible_text_with_map, locate_word, occurrence_at_offset, replace_word,
    WordReplacementError, STATUS_NEW, now_epoch,
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
            "ref": "Genesis 1:1", "version_title": "Test Version", "language": "en", "word": "God",
            "occurrence": 0, "created": now_epoch(), "status": STATUS_NEW, "suggestion": "the Lord",
            "comment": None, "user_id": None, "llm_assessment": None,
        }
        attrs.update(overrides)
        return attrs

    def test_save_load_round_trip(self):
        fb = TranslationFeedback(self._attrs(comment="Tom & Jerry <3")).save()
        try:
            loaded = TranslationFeedback().load_by_id(fb._id)
            assert loaded.word == "God"
            # plain-text fields are stored verbatim, not bleached/escaped
            assert loaded.comment == "Tom & Jerry <3"
            assert loaded.has_suggestion()
        finally:
            fb.delete()

    def test_rejects_bad_assessment(self):
        with pytest.raises(InputError):
            TranslationFeedback(self._attrs(llm_assessment="7")).save()

    def test_requires_word(self):
        attrs = self._attrs()
        del attrs["word"]
        with pytest.raises(InputError):
            TranslationFeedback(attrs).save()
