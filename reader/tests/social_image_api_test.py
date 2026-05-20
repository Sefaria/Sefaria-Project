"""
Tests for the social_image_api view.

Covers the lang parameter normalization added to fix cases where a missing,
empty, or unrecognized lang value caused the wrong language to be used when
generating social share images.
"""
from django.test import RequestFactory

from reader import views


class DummyRef:
    def normal(self):
        return "Genesis 1:1"

    def he_normal(self):
        # Stub — tests assert against this exact string to verify the view
        # picks ref.he_normal() when lang="he".
        return "בראשית א׳:א׳"


class DummyTextFamily:
    captured_kwargs = {}

    def __init__(self, *args, **kwargs):
        self.__class__.captured_kwargs = kwargs

    def contents(self):
        return {
            "text": "In the beginning",
            "he": "בראשית",
            "primary_category": "Tanakh",
        }


def _request(path):
    return RequestFactory().get(path)


def _capture_social_image_call(monkeypatch, path):
    captured = {}
    DummyTextFamily.captured_kwargs = {}

    def fake_response(text, category, ref_str, lang, platform):
        captured.update(
            {
                "text": text,
                "category": category,
                "ref_str": ref_str,
                "lang": lang,
                "platform": platform,
            }
        )
        captured["text_family_kwargs"] = DummyTextFamily.captured_kwargs
        return captured

    monkeypatch.setattr(views, "Ref", lambda tref: DummyRef())
    monkeypatch.setattr(views, "TextFamily", DummyTextFamily)
    monkeypatch.setattr(views, "make_img_http_response", fake_response)

    return views.social_image_api(_request(path), "Genesis.1.1")


def test_social_image_api_defaults_missing_lang_to_english(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1")

    assert result["lang"] == "en"
    assert result["platform"] == "facebook"
    assert result["text"] == "In the beginning"
    assert result["ref_str"] == "Genesis 1:1"


def test_social_image_api_defaults_empty_lang_to_english(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1?lang=")

    assert result["lang"] == "en"
    assert result["text"] == "In the beginning"
    assert result["ref_str"] == "Genesis 1:1"


def test_social_image_api_defaults_invalid_lang_to_english(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1?lang=english")

    assert result["lang"] == "en"
    assert result["text"] == "In the beginning"
    assert result["ref_str"] == "Genesis 1:1"


def test_social_image_api_maps_bilingual_lang_to_english(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1?lang=bi")

    assert result["lang"] == "en"
    assert result["text"] == "In the beginning"
    assert result["ref_str"] == "Genesis 1:1"


def test_social_image_api_preserves_hebrew_lang(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1?lang=he")

    assert result["lang"] == "he"
    assert result["text"] == "בראשית"
    assert result["ref_str"] == "בראשית א׳:א׳"


def test_social_image_api_defaults_empty_platform_to_facebook(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1?platform=")

    assert result["platform"] == "facebook"


def test_social_image_api_defaults_invalid_platform_to_facebook(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1?platform=linkedin")

    assert result["platform"] == "facebook"


def test_social_image_api_preserves_facebook_platform(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1?platform=facebook")

    assert result["platform"] == "facebook"


def test_social_image_api_preserves_twitter_platform(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1?platform=twitter")

    assert result["platform"] == "twitter"


def test_social_image_api_extracts_translation_version_title_from_ven(monkeypatch):
    path = (
        "/api/img-gen/Genesis.1.1?"
        "lang=en&ven=english%7CThe_Contemporary_Torah,_Jewish_Publication_Society,_2006"
    )
    result = _capture_social_image_call(monkeypatch, path)

    assert result["text_family_kwargs"]["version"] == "The Contemporary Torah, Jewish Publication Society, 2006"


def test_social_image_api_extracts_hebrew_version_title_from_vhe(monkeypatch):
    path = "/api/img-gen/Genesis.1.1?lang=he&vhe=hebrew%7CTanach_with_Ta%27amei_Hamikra"
    result = _capture_social_image_call(monkeypatch, path)

    assert result["text_family_kwargs"]["version"] == "Tanach with Ta'amei Hamikra"


def test_social_image_api_accepts_legacy_version_title_without_language_prefix(monkeypatch):
    path = "/api/img-gen/Genesis.1.1?lang=en&ven=The_Contemporary_Torah,_Jewish_Publication_Society,_2006"
    result = _capture_social_image_call(monkeypatch, path)

    assert result["text_family_kwargs"]["version"] == "The Contemporary Torah, Jewish Publication Society, 2006"
