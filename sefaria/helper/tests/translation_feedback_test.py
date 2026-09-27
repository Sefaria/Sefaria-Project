"""
Translation feedback POC: LLM response parsing (pure) and the create/accept flow against a
synthetic text (needs Mongo, like the other helper tests).
"""
from unittest.mock import patch

import pytest

from sefaria.model import Index, Ref, Version, VersionSet, TextChunk
from sefaria.model.translation_feedback import TranslationFeedback, TranslationFeedbackSet, STATUS_ACCEPTED
from sefaria.helper.llm.translation_feedback import parse_response, assess, build_prompt
from sefaria.helper.translation_feedback import create_feedback, accept_feedback
from sefaria.system.database import db
from sefaria.system.exceptions import InputError

TITLE = "Translation Feedback Test Book"
EN_VTITLE = "Translation Feedback Test [en]"
HE_VTITLE = "Translation Feedback Test Source"
SEGMENT_EN = "And God saw the light, that it was <b>good</b>; and the light was good."
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
            "word": "light", "occurrence": 1, "suggestion": "radiance", "comment": "Reads better."}
    data.update(overrides)
    return data


def test_create_validates(synthetic_text):
    with pytest.raises(InputError):
        create_feedback(_payload(suggestion="", comment=""), run_assessment=False)
    with pytest.raises(InputError):
        create_feedback(_payload(word="two words"), run_assessment=False)
    with pytest.raises(InputError):
        create_feedback(_payload(word="darkness"), run_assessment=False)
    with pytest.raises(InputError):  # primary version
        create_feedback(_payload(versionTitle=HE_VTITLE, actualLanguage="he", word="טוֹב", occurrence=0), run_assessment=False)
    with pytest.raises(InputError):
        create_feedback(_payload(ref=f"{TITLE} 1"), run_assessment=False)


def test_create_recovers_occurrence_from_offset(synthetic_text):
    offset = SEGMENT_EN.replace("<b>", "").replace("</b>", "").rindex("light")
    fb = create_feedback(_payload(occurrence=7, charOffset=offset), user_id=None, run_assessment=False)
    assert fb.occurrence == 1
    assert fb.user_id is None
    assert fb.segment_text == SEGMENT_EN


def test_accept_replaces_selected_instance_and_logs_history(synthetic_text):
    fb = create_feedback(_payload(), user_id=None, run_assessment=False)
    with patch("sefaria.tracker.USE_VARNISH", False):
        _, new_text = accept_feedback(str(fb._id), 1)
    expected = "And God saw the light, that it was <b>good</b>; and the radiance was good."
    assert new_text == expected
    oref = Ref(f"{TITLE} 1:1")
    assert TextChunk(oref, vtitle=EN_VTITLE, actual_lang="en").text == expected
    hist = db.history.find_one({"ref": oref.normal(), "version": EN_VTITLE})
    assert hist is not None and hist["user"] == 1 and hist["method"] == "Translation Feedback"
    assert TranslationFeedback().load_by_id(fb._id).status == STATUS_ACCEPTED
    with pytest.raises(InputError):  # can't accept twice
        accept_feedback(str(fb._id), 1)


def test_accept_fails_when_text_changed(synthetic_text):
    fb = create_feedback(_payload(), user_id=None, run_assessment=False)
    v = Version().load({"title": TITLE, "versionTitle": EN_VTITLE})
    v.chapter = [["The light was good."]]
    v.save()
    with pytest.raises(InputError, match="no longer contains"):
        accept_feedback(str(fb._id), 1)


def test_assess_without_api_key(synthetic_text):
    fb = create_feedback(_payload(), run_assessment=False)
    assert "Selected word: \"light\" (occurrence #2" in build_prompt(fb)
    assert "וַיַּרְא" in build_prompt(fb)
    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": ""}), \
         patch("django.conf.settings.ANTHROPIC_API_KEY", None, create=True):
        assessment, note = assess(fb)
    assert assessment == "?"
    assert note.startswith("LLM unavailable")
