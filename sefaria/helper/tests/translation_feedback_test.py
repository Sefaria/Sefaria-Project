"""
Translation feedback POC: LLM response parsing (pure) and the create/accept flow against a
synthetic text (needs Mongo, like the other helper tests).
"""
from unittest.mock import patch

import pytest

from sefaria.model import Index, Ref, Version, VersionSet, TextChunk
from sefaria.model.translation_feedback import (
    TranslationFeedback, TranslationFeedbackSet, STATUS_ACCEPTED, STATUS_REJECTED, STATUS_NEW,
)
from sefaria.helper.llm.translation_feedback import parse_response, assess, build_prompt
from sefaria.helper.translation_feedback import (
    create_feedback, accept_feedback, reject_feedback, reopen_feedback, get_segment_texts, segment_marks,
)
from sefaria.system.database import db
from sefaria.system.exceptions import InputError

TITLE = "Translation Feedback Test Book"
EN_VTITLE = "Translation Feedback Test [en]"
HE_VTITLE = "Translation Feedback Test Source"
SEGMENT_EN = "And God saw the light, that it was <b>good</b>; and the light was good."
SEGMENT_EN_PLAIN = "And God saw the light, that it was good; and the light was good."
SUGGESTION = "And God saw the light, that it was good; and the radiance was good & bright."
SEGMENT_HE = "וַיַּרְא אֱלֹהִים אֶת־הָאוֹר כִּי־טוֹב"


class TestParseResponse:
    @pytest.mark.parametrize("text,has_suggestion,expected", [
        ('{"assessment": "2", "note": "Plausible."}', True, ("2", "Plausible.")),
        ('```json\n{"assessment": "1", "note": "Clearly better."}\n```', True, ("1", "Clearly better.")),
        ('Sure! {"assessment": "c", "note": "Fair point."}', False, ("C", "Fair point.")),
        ('assessment: 4 -- this is spam', True, ("4", "assessment: 4 -- this is spam")),
    ])
    def test_parses(self, text, has_suggestion, expected):
        assert parse_response(text, has_suggestion) == expected

    def test_comment_only_is_always_c(self):
        assert parse_response('{"assessment": "2", "note": "x"}', False)[0] == "C"

    def test_c_with_suggestion_is_flagged(self):
        assessment, note = parse_response('{"assessment": "C", "note": "x"}', True)
        assert assessment == "?" and "suggestion" in note

    def test_garbage(self):
        assessment, note = parse_response("I cannot help with that.", True)
        assert assessment == "?" and note.startswith("Could not parse")


def _setup_text():
    try:
        Index().load({"title": TITLE}).delete()
    except Exception:
        pass
    idx = Index({
        "title": TITLE,
        "categories": ["Liturgy"],
        "schema": {
            "titles": [
                {"lang": "en", "text": TITLE, "primary": True},
                {"lang": "he", "text": "ספר בדיקת משוב תרגום", "primary": True},
            ],
            "nodeType": "JaggedArrayNode",
            "depth": 2,
            "sectionNames": ["Chapter", "Paragraph"],
            "addressTypes": ["Integer", "Integer"],
            "key": TITLE,
        },
    }).save()
    Version({"language": "he", "actualLanguage": "he", "direction": "rtl", "title": TITLE, "versionTitle": HE_VTITLE,
             "versionSource": "http://example.com", "isPrimary": True, "isSource": True,
             "chapter": [[SEGMENT_HE]]}).save()
    Version({"language": "en", "actualLanguage": "en", "direction": "ltr", "title": TITLE, "versionTitle": EN_VTITLE,
             "versionSource": "http://example.com", "isPrimary": False, "isSource": False,
             "chapter": [[SEGMENT_EN]]}).save()
    return idx


def _teardown_text(idx):
    TranslationFeedbackSet({"ref": {"$regex": "^" + TITLE}}).delete()
    for v in VersionSet({"title": TITLE}):
        v.delete()
    idx.delete()
    db.history.delete_many({"ref": {"$regex": "^" + TITLE}})


@pytest.fixture
def synthetic_text():
    idx = _setup_text()
    yield idx
    _teardown_text(idx)


def _payload(**overrides):
    data = {"ref": f"{TITLE} 1:1", "versionTitle": EN_VTITLE, "actualLanguage": "en",
            "suggestion": SUGGESTION, "comment": "Reads better."}
    data.update(overrides)
    return data


def test_get_segment_texts(synthetic_text):
    texts = get_segment_texts(f"{TITLE} 1:1", EN_VTITLE, "en")
    assert texts == {"ref": f"{TITLE} 1:1", "he": SEGMENT_HE, "translation": SEGMENT_EN_PLAIN}
    with pytest.raises(InputError):
        get_segment_texts(f"{TITLE} 1", EN_VTITLE)
    with pytest.raises(InputError):
        get_segment_texts(f"{TITLE} 1:1", "No Such Version")


def test_create_validates(synthetic_text):
    with pytest.raises(InputError):
        create_feedback(_payload(suggestion="", comment=""), run_assessment=False)
    with pytest.raises(InputError):  # unchanged "Start with existing" text and no comment
        create_feedback(_payload(suggestion="  " + SEGMENT_EN_PLAIN.replace(" ", "\n", 1), comment=""), run_assessment=False)
    with pytest.raises(InputError):  # primary version
        create_feedback(_payload(versionTitle=HE_VTITLE, actualLanguage="he"), run_assessment=False)
    with pytest.raises(InputError):
        create_feedback(_payload(ref=f"{TITLE} 1"), run_assessment=False)


def test_create_stores_segment_snapshot(synthetic_text):
    fb = create_feedback(_payload(), user_id=None, run_assessment=False)
    assert fb.user_id is None
    assert fb.segment_text == SEGMENT_EN
    assert fb.suggestion == SUGGESTION
    assert not fb.is_word_level()


def test_unchanged_suggestion_with_comment_is_comment_only(synthetic_text):
    fb = create_feedback(_payload(suggestion=SEGMENT_EN_PLAIN), run_assessment=False)
    assert fb.suggestion is None and fb.comment == "Reads better."


def test_accept_replaces_segment_and_logs_history(synthetic_text):
    fb = create_feedback(_payload(), user_id=None, run_assessment=False)
    with patch("sefaria.tracker.USE_VARNISH", False):
        _, new_text = accept_feedback(str(fb._id), 1)
    expected = "And God saw the light, that it was good; and the radiance was good &amp; bright."
    assert new_text == expected
    oref = Ref(f"{TITLE} 1:1")
    assert TextChunk(oref, vtitle=EN_VTITLE, actual_lang="en").text == expected
    hist = db.history.find_one({"ref": oref.normal(), "version": EN_VTITLE})
    assert hist is not None and hist["user"] == 1 and hist["method"] == "Translation Feedback"
    loaded = TranslationFeedback().load_by_id(fb._id)
    assert loaded.status == STATUS_ACCEPTED and loaded.status_label() == "accepted"
    assert loaded.decided_by == 1 and loaded.decided_at and loaded.accepted_by == 1
    with pytest.raises(InputError):  # can't accept twice
        accept_feedback(str(fb._id), 1)
    with pytest.raises(InputError):  # nor reject (or reopen) once the text changed
        reject_feedback(str(fb._id), 1)
    with pytest.raises(InputError):
        reopen_feedback(str(fb._id))


def test_accept_fails_when_text_changed(synthetic_text):
    fb = create_feedback(_payload(), user_id=None, run_assessment=False)
    v = Version().load({"title": TITLE, "versionTitle": EN_VTITLE})
    v.chapter = [["The light was good."]]
    v.save()
    with pytest.raises(InputError, match="has changed"):
        accept_feedback(str(fb._id), 1)


def test_accept_legacy_word_level_record(synthetic_text):
    fb = TranslationFeedback({
        "ref": f"{TITLE} 1:1", "version_title": EN_VTITLE, "language": "en", "actual_language": "en",
        "word": "light", "occurrence": 1, "suggestion": "radiance", "segment_text": SEGMENT_EN,
        "created": 0, "status": "new",
    }).save()
    with patch("sefaria.tracker.USE_VARNISH", False):
        _, new_text = accept_feedback(str(fb._id), 1)
    assert new_text == "And God saw the light, that it was <b>good</b>; and the radiance was good."


def _en_text():
    return TextChunk(Ref(f"{TITLE} 1:1"), vtitle=EN_VTITLE, actual_lang="en").text


def test_reject_records_decision_and_leaves_text(synthetic_text):
    fb = create_feedback(_payload(), user_id=None, run_assessment=False)
    history_before = db.history.count_documents({"ref": f"{TITLE} 1:1"})
    rejected = reject_feedback(str(fb._id), 7)
    assert rejected.status == STATUS_REJECTED
    loaded = TranslationFeedback().load_by_id(fb._id)
    assert loaded.status == STATUS_REJECTED and loaded.status_label() == "rejected"
    assert loaded.decided_by == 7 and loaded.decided_at
    assert loaded.decider() == (7, loaded.decided_at)
    assert _en_text() == SEGMENT_EN
    assert db.history.count_documents({"ref": f"{TITLE} 1:1"}) == history_before
    with pytest.raises(InputError):  # already rejected
        reject_feedback(str(fb._id), 7)
    with pytest.raises(InputError, match="reopen"):  # must reopen before accepting
        accept_feedback(str(fb._id), 7)


def test_reject_comment_only(synthetic_text):
    fb = create_feedback(_payload(suggestion=None), run_assessment=False)
    assert not fb.has_suggestion()
    assert reject_feedback(str(fb._id), 7).status == STATUS_REJECTED
    assert _en_text() == SEGMENT_EN


def test_reopen_returns_to_undecided(synthetic_text):
    fb = create_feedback(_payload(), run_assessment=False)
    with pytest.raises(InputError):  # only rejected feedback can be reopened
        reopen_feedback(str(fb._id))
    reject_feedback(str(fb._id), 7)
    reopened = reopen_feedback(str(fb._id))
    loaded = TranslationFeedback().load_by_id(fb._id)
    assert reopened.status == loaded.status == STATUS_NEW
    assert loaded.status_label() == "undecided"
    assert loaded.decider() == (None, None)
    with patch("sefaria.tracker.USE_VARNISH", False):  # and can then be accepted
        accept_feedback(str(fb._id), 7)
    assert TranslationFeedback().load_by_id(fb._id).status == STATUS_ACCEPTED


def test_reject_unknown_id(synthetic_text):
    with pytest.raises(InputError, match="not found"):
        reject_feedback("0" * 24, 7)


def test_record_without_status_is_undecided_and_rejectable(synthetic_text):
    fb = create_feedback(_payload(), run_assessment=False)
    db.translation_feedback.update_one({"_id": fb._id}, {"$unset": {"status": ""}})
    loaded = TranslationFeedback().load_by_id(fb._id)
    assert loaded.status_label() == "undecided"
    assert reject_feedback(str(fb._id), 7).status == STATUS_REJECTED


def test_assess_without_api_key(synthetic_text):
    fb = create_feedback(_payload(), run_assessment=False)
    prompt = build_prompt(fb)
    assert "<suggested_translation>\n" + SUGGESTION in prompt
    assert "<current_translation>\n" + SEGMENT_EN_PLAIN in prompt
    assert "וַיַּרְא" in prompt
    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": ""}), \
         patch("django.conf.settings.ANTHROPIC_API_KEY", None, create=True):
        assessment, note = assess(fb)
    assert assessment == "?"
    assert note.startswith("LLM unavailable")


def test_segment_marks(synthetic_text):
    seg = f"{TITLE} 1:1"
    assert segment_marks(f"{TITLE} 1") == {"ref": f"{TITLE} 1", "segments": {}}
    comment_only = create_feedback(_payload(suggestion=None), run_assessment=False)
    pending = create_feedback(_payload(), user_id=5, run_assessment=False)
    marks = segment_marks(f"{TITLE} 1")["segments"]
    assert list(marks) == [seg]  # comment-only feedback adds no mark
    assert marks[seg]["changed"] == []
    assert marks[seg]["pending"] == [{"id": str(pending._id), "versionTitle": EN_VTITLE,
                                      "suggestion": SUGGESTION, "created": pending.created}]
    assert "user_id" not in str(marks)  # never exposes who suggested
    reject_feedback(str(comment_only._id), 7)
    with patch("sefaria.tracker.USE_VARNISH", False):
        accept_feedback(str(pending._id), 7)
    marks = segment_marks(seg)["segments"]  # a segment ref works too
    assert marks[seg]["pending"] == []
    assert marks[seg]["changed"] == [{"versionTitle": EN_VTITLE, "at": TranslationFeedback().load_by_id(pending._id).decided_at}]
    with pytest.raises(InputError):
        segment_marks("Not A Real Book 1")

