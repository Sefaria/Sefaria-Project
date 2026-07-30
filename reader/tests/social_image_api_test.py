"""
Tests for the social_image_api view.

These tests describe the routing decisions made before an image is generated:
text refs render only for the Library module, static pages use the shared
static fallback image, and unsupported module pages use the module fallback.
They also cover lang parameter normalization so missing, empty, bilingual, or
unrecognized lang values still produce an image in the expected language.
"""
from django.test import RequestFactory, override_settings

from reader import views
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE

DOMAIN_MODULES = {
    "en": {
        "library": "http://localsefaria.xyz:8000",
        "voices": "http://voices.localsefaria.xyz:8000",
    },
    "he": {
        "library": "http://localsefaria-il.xyz:8000",
        "voices": "http://chiburim.localsefaria-il.xyz:8000",
    },
}


class DummyRef:
    def __init__(self, tref="Genesis.1.1", book_level=None):
        self.tref = tref
        self.index = DummyIndex()
        # Real Ref.is_book_level() inspects section structure, not string shape.
        # The dot heuristic holds for standard refs but breaks for Talmud-style refs like "Sukkah 2a" (space, no dot).
        # Pass book_level explicitly for those cases via _capture_social_image_call(book_level=...).
        self._book_level = ("." not in tref) if book_level is None else book_level

    def normal(self):
        return "Genesis 1:1"

    def he_normal(self):
        # Stub — tests assert against this exact string to verify the view
        # picks ref.he_normal() when lang="he".
        return "בראשית א׳:א׳"

    def is_book_level(self):
        return self._book_level


class DummyIndex:
    categories = ["Tanakh", "Torah"]
    enShortDesc = "Creation and the stories of the patriarchs."
    heShortDesc = "בריאת העולם וסיפורי האבות."

    def get_title(self, lang="en"):
        return "בראשית" if lang == "he" else "Genesis"

    def get_primary_category(self):
        return "Tanakh"


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


def _request(path, active_module=None, host=None):
    request = RequestFactory().get(path, HTTP_HOST=host or "localsefaria.xyz:8000")
    if active_module:
        request.active_module = active_module
    return request


def _capture_social_image_call(
    monkeypatch,
    path,
    active_module=None,
    host=None,
    tref="Genesis.1.1",
    book_level=None,
):
    # Replace the image builders with small recorders. These tests care about
    # which kind of image the view chooses, not about Pillow drawing pixels.
    captured = {}
    DummyTextFamily.captured_kwargs = {}

    def fake_response(text, category, ref_str, lang, platform, module):
        captured.update(
            {
                "kind": "ref",
                "text": text,
                "category": category,
                "ref_str": ref_str,
                "lang": lang,
                "platform": platform,
                "module": module,
            }
        )
        captured["text_family_kwargs"] = DummyTextFamily.captured_kwargs
        return captured

    def fake_module_fallback(lang, platform, module):
        captured.update(
            {
                "kind": "module_fallback",
                "text": None,
                "category": None,
                "ref_str": None,
                "lang": lang,
                "platform": platform,
                "module": module,
            }
        )
        return captured

    def fake_static(platform):
        captured.update(
            {
                "kind": "static",
                "text": None,
                "category": "Static",
                "ref_str": None,
                "platform": platform,
            }
        )
        return captured

    def fake_toc(title, subtitle, category, lang, platform, module,
                category_path=(), desc=None, is_primary_category=False):
        captured.update(
            {
                "kind": "toc",
                "title": title,
                "subtitle": subtitle,
                "category": category,
                "lang": lang,
                "platform": platform,
                "module": module,
                "category_path": category_path,
                "desc": desc,
                "is_primary_category": is_primary_category,
            }
        )
        return captured

    def fake_ref(tref):
        if not tref:
            raise ValueError("empty tref")
        return DummyRef(tref, book_level=book_level)

    monkeypatch.setattr(views, "Ref", fake_ref)
    monkeypatch.setattr(views, "TextFamily", DummyTextFamily)
    monkeypatch.setattr(views, "make_img_http_response", fake_response)
    monkeypatch.setattr(
        views, "make_module_fallback_img_http_response", fake_module_fallback
    )
    monkeypatch.setattr(views, "make_static_img_http_response", fake_static)
    monkeypatch.setattr(views, "make_toc_img_http_response", fake_toc)

    return views.social_image_api(_request(path, active_module, host), tref)


def test_social_image_path_classification_caches_common_paths(monkeypatch):
    views._classify_social_image_path.cache_clear()
    resolve_calls = []
    real_resolve = views.resolve

    def counting_resolve(*args, **kwargs):
        resolve_calls.append(args[0])
        return real_resolve(*args, **kwargs)

    monkeypatch.setattr(views, "resolve", counting_resolve)

    assert isinstance(
        views._classify_social_image_path("jobs", LIBRARY_MODULE), views.StaticTarget
    )
    assert isinstance(
        views._classify_social_image_path("jobs", LIBRARY_MODULE), views.StaticTarget
    )
    assert len(resolve_calls) == 1
    assert views._classify_social_image_path.cache_info().maxsize == 512
    views._classify_social_image_path.cache_clear()


def test_social_image_api_defaults_missing_lang_to_english(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1")

    assert result["kind"] == "ref"
    assert result["lang"] == "en"
    assert result["platform"] == "facebook"
    assert result["text"] == "In the beginning"
    assert result["ref_str"] == "Genesis 1:1"


def test_social_image_api_empty_path_uses_host_fallback_image(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/?lang=en", tref="")

    assert result["kind"] == "module_fallback"
    assert result["lang"] == "en"
    assert result["text"] is None
    assert result["category"] is None
    assert result["ref_str"] is None


@override_settings(DOMAIN_MODULES=DOMAIN_MODULES)
def test_social_image_api_defaults_missing_lang_to_host_language(monkeypatch):
    result = _capture_social_image_call(
        monkeypatch,
        "/api/img-gen/Genesis.1.1",
        active_module=VOICES_MODULE,
        host="chiburim.localsefaria-il.xyz:8000",
    )

    assert result["kind"] == "module_fallback"
    assert result["lang"] == "he"
    assert result["module"] == VOICES_MODULE


@override_settings(DOMAIN_MODULES=DOMAIN_MODULES)
def test_social_image_api_lang_param_overrides_host_language(monkeypatch):
    result = _capture_social_image_call(
        monkeypatch,
        "/api/img-gen/Genesis.1.1?lang=en",
        active_module=VOICES_MODULE,
        host="chiburim.localsefaria-il.xyz:8000",
    )

    assert result["kind"] == "module_fallback"
    assert result["lang"] == "en"
    assert result["module"] == VOICES_MODULE


@override_settings(DOMAIN_MODULES=DOMAIN_MODULES)
def test_social_image_api_hebrew_lang_param_overrides_english_voices_host(monkeypatch):
    result = _capture_social_image_call(
        monkeypatch,
        "/api/img-gen/Genesis.1.1?lang=he",
        active_module=VOICES_MODULE,
        host="voices.localsefaria.xyz:8000",
    )

    assert result["kind"] == "module_fallback"
    assert result["lang"] == "he"
    assert result["module"] == VOICES_MODULE


@override_settings(DOMAIN_MODULES=DOMAIN_MODULES)
def test_social_image_api_english_lang_param_overrides_hebrew_library_host(monkeypatch):
    result = _capture_social_image_call(
        monkeypatch,
        "/api/img-gen/Genesis.1.1?lang=en",
        active_module=LIBRARY_MODULE,
        host="localsefaria-il.xyz:8000",
    )

    assert result["lang"] == "en"
    assert result["text"] == "In the beginning"
    assert result["ref_str"] == "Genesis 1:1"


def test_social_image_api_defaults_empty_lang_to_english(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1?lang=")

    assert result["lang"] == "en"
    assert result["text"] == "In the beginning"
    assert result["ref_str"] == "Genesis 1:1"


def test_social_image_api_defaults_invalid_lang_to_host_language(monkeypatch):
    result = _capture_social_image_call(
        monkeypatch, "/api/img-gen/Genesis.1.1?lang=english"
    )

    assert result["lang"] == "en"
    assert result["text"] == "In the beginning"
    assert result["ref_str"] == "Genesis 1:1"


@override_settings(DOMAIN_MODULES=DOMAIN_MODULES)
def test_social_image_api_uses_host_language_for_bilingual_lang_param(monkeypatch):
    result = _capture_social_image_call(
        monkeypatch,
        "/api/img-gen/Genesis.1.1?lang=bi",
        active_module=VOICES_MODULE,
        host="chiburim.localsefaria-il.xyz:8000",
    )

    assert result["kind"] == "module_fallback"
    assert result["lang"] == "he"
    assert result["module"] == VOICES_MODULE


def test_social_image_api_preserves_hebrew_lang(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1?lang=he")

    assert result["lang"] == "he"
    assert result["text"] == "בראשית"
    assert result["ref_str"] == "בראשית א׳:א׳"


def test_social_image_api_defaults_empty_platform_to_facebook(monkeypatch):
    result = _capture_social_image_call(
        monkeypatch, "/api/img-gen/Genesis.1.1?platform="
    )

    assert result["platform"] == "facebook"


def test_social_image_api_defaults_invalid_platform_to_facebook(monkeypatch):
    result = _capture_social_image_call(
        monkeypatch, "/api/img-gen/Genesis.1.1?platform=linkedin"
    )

    assert result["platform"] == "facebook"


def test_social_image_api_preserves_facebook_platform(monkeypatch):
    result = _capture_social_image_call(
        monkeypatch, "/api/img-gen/Genesis.1.1?platform=facebook"
    )

    assert result["platform"] == "facebook"


def test_social_image_api_preserves_twitter_platform(monkeypatch):
    result = _capture_social_image_call(
        monkeypatch, "/api/img-gen/Genesis.1.1?platform=twitter"
    )

    assert result["platform"] == "twitter"


def test_social_image_api_defaults_missing_module_to_library(monkeypatch):
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/Genesis.1.1")

    assert result["module"] == LIBRARY_MODULE


def test_social_image_api_uses_request_active_module(monkeypatch):
    result = _capture_social_image_call(
        monkeypatch, "/api/img-gen/Genesis.1.1", active_module=VOICES_MODULE
    )

    assert result["kind"] == "module_fallback"
    assert result["module"] == VOICES_MODULE


def test_social_image_api_defaults_invalid_active_module_to_library(monkeypatch):
    result = _capture_social_image_call(
        monkeypatch, "/api/img-gen/Genesis.1.1", active_module="something-else"
    )

    assert result["kind"] == "ref"
    assert result["module"] == LIBRARY_MODULE


def test_social_image_api_static_page_uses_static_image_on_library(monkeypatch):
    # Static pages are not module-specific, so they use the shared static image
    # even when requested from the Library host.
    result = _capture_social_image_call(monkeypatch, "/api/img-gen/jobs", tref="jobs")

    assert result["kind"] == "static"
    assert result["category"] == "Static"


def test_social_image_api_static_page_uses_static_image_on_voices(monkeypatch):
    # Static pages are not module-specific, so they use the shared static image
    # even when requested from the Voices host.
    result = _capture_social_image_call(
        monkeypatch,
        "/api/img-gen/jobs",
        active_module=VOICES_MODULE,
        tref="jobs",
    )

    assert result["kind"] == "static"
    assert result["category"] == "Static"


def test_social_image_api_book_level_ref_uses_toc_image_on_library(monkeypatch):
    # A whole-book path like /Genesis is a valid ReaderApp TOC page, but it is not a segment ref with preview text.
    # Render the title/category instead.
    views._classify_social_image_path.cache_clear()
    result = _capture_social_image_call(
        monkeypatch, "/api/img-gen/Genesis", tref="Genesis"
    )

    assert result["kind"] == "toc"
    assert result["title"] == "Genesis"
    assert result["subtitle"] == "Tanakh / Torah"   # full breadcrumb, not primary category
    assert result["category"] == "Tanakh"
    assert result["desc"] == "Creation and the stories of the patriarchs."
    assert result["is_primary_category"] is False
    assert result["module"] == LIBRARY_MODULE


def test_single_category_book_is_not_primary(monkeypatch):
    # A book whose index has a single category must NOT be treated as a top-level category landing page (the old len(category_path)==1 heuristic false-positived here).
    class OneCatIndex(DummyIndex):
        categories = ["Reference"]

        def get_primary_category(self):
            return "Reference"

    def fake_ref(tref):
        r = DummyRef(tref, book_level=True)
        r.index = OneCatIndex()
        return r

    monkeypatch.setattr(views, "Ref", fake_ref)
    target = views._social_image_text_target("Some Dictionary")
    assert isinstance(target, views.TocTarget)
    assert target.is_primary_category is False
    assert target.subtitle_en == "Reference"
    assert target.desc_en == "Creation and the stories of the patriarchs."


def test_social_image_api_book_level_ref_uses_hebrew_title_when_requested(monkeypatch):
    views._classify_social_image_path.cache_clear()
    result = _capture_social_image_call(
        monkeypatch, "/api/img-gen/Genesis?lang=he", tref="Genesis"
    )

    assert result["kind"] == "toc"
    assert result["title"] == "בראשית"
    assert result["lang"] == "he"


def test_social_image_api_category_toc_path_uses_toc_image(monkeypatch):
    views._classify_social_image_path.cache_clear()

    class DummyTocNode:
        def primary_title(self, lang="en"):
            return "תלמוד" if lang == "he" else "Talmud"

    class DummyTocTree:
        def lookup(self, category_path):
            assert category_path == ("Talmud",)
            return DummyTocNode()

    monkeypatch.setattr(views.library, "get_toc_tree", lambda: DummyTocTree())
    result = _capture_social_image_call(
        monkeypatch, "/api/img-gen/texts/Talmud", tref="texts/Talmud"
    )

    assert result["kind"] == "toc"
    assert result["title"] == "Talmud"
    assert result["subtitle"] is None
    assert result["category"] == "Talmud"


def test_social_image_api_nested_category_toc_path_uses_specific_category_color(
    monkeypatch,
):
    views._classify_social_image_path.cache_clear()

    class DummyTocNode:
        def primary_title(self, lang="en"):
            return "תרגום" if lang == "he" else "Targum"

    class DummyTocTree:
        def lookup(self, category_path):
            assert category_path == ("Tanakh", "Targum")
            return DummyTocNode()

    monkeypatch.setattr(views.library, "get_toc_tree", lambda: DummyTocTree())
    monkeypatch.setattr(views, "hebrew_term", lambda category: f"he:{category}")
    result = _capture_social_image_call(
        monkeypatch,
        "/api/img-gen/texts/Tanakh/Targum",
        tref="texts/Tanakh/Targum",
    )

    assert result["kind"] == "toc"
    assert result["title"] == "Targum"
    assert result["subtitle"] == "Tanakh"
    assert result["category"] == "Targum"


def test_social_image_api_nested_category_toc_uses_hebrew_subtitle_when_requested(
    monkeypatch,
):
    views._classify_social_image_path.cache_clear()

    class DummyTocNode:
        def primary_title(self, lang="en"):
            return "תרגום" if lang == "he" else "Targum"

    class DummyTocTree:
        def lookup(self, category_path):
            return DummyTocNode()

    monkeypatch.setattr(views.library, "get_toc_tree", lambda: DummyTocTree())
    monkeypatch.setattr(views, "hebrew_term", lambda category: f"he:{category}")
    result = _capture_social_image_call(
        monkeypatch,
        "/api/img-gen/texts/Tanakh/Targum?lang=he",
        tref="texts/Tanakh/Targum",
    )

    assert result["kind"] == "toc"
    assert result["title"] == "תרגום"
    assert result["subtitle"] == "he:Tanakh"
    assert result["lang"] == "he"


def test_social_image_api_category_toc_path_decodes_url_encoded_spaces(monkeypatch):
    views._classify_social_image_path.cache_clear()

    class DummyTocNode:
        def primary_title(self, lang="en"):
            return "Aramaic Targum"

    class DummyTocTree:
        def lookup(self, category_path):
            assert category_path == ("Tanakh", "Targum", "Aramaic Targum")
            return DummyTocNode()

    monkeypatch.setattr(views.library, "get_toc_tree", lambda: DummyTocTree())
    result = _capture_social_image_call(
        monkeypatch,
        "/api/img-gen/texts/Tanakh/Targum/Aramaic%20Targum",
        tref="texts/Tanakh/Targum/Aramaic%20Targum",
    )

    assert result["kind"] == "toc"
    assert result["title"] == "Aramaic Targum"
    assert result["category"] == "Targum"


def test_social_image_api_topics_page_uses_module_fallback(monkeypatch):
    # Topic pages have module-specific branding, but they do not have a custom
    # image renderer yet. They should fall back to the module image.
    result = _capture_social_image_call(
        monkeypatch, "/api/img-gen/topics", tref="topics"
    )

    assert result["kind"] == "module_fallback"
    assert result["module"] == LIBRARY_MODULE


def test_social_image_api_voices_topic_page_uses_voices_fallback(monkeypatch):
    # Voices topic pages should not be treated as Library refs. They use the
    # Voices fallback until a custom topic/social image renderer exists.
    result = _capture_social_image_call(
        monkeypatch,
        "/api/img-gen/topics/shabbat",
        active_module=VOICES_MODULE,
        tref="topics/shabbat",
    )

    assert result["kind"] == "module_fallback"
    assert result["module"] == VOICES_MODULE


def test_social_image_api_extracts_translation_version_title_from_ven(monkeypatch):
    path = (
        "/api/img-gen/Genesis.1.1?"
        "lang=en&ven=english%7CThe_Contemporary_Torah,_Jewish_Publication_Society,_2006"
    )
    result = _capture_social_image_call(monkeypatch, path)

    assert (
        result["text_family_kwargs"]["version"]
        == "The Contemporary Torah, Jewish Publication Society, 2006"
    )


def test_social_image_api_extracts_hebrew_version_title_from_vhe(monkeypatch):
    path = "/api/img-gen/Genesis.1.1?lang=he&vhe=hebrew%7CTanach_with_Ta%27amei_Hamikra"
    result = _capture_social_image_call(monkeypatch, path)

    assert result["text_family_kwargs"]["version"] == "Tanach with Ta'amei Hamikra"


def test_social_image_api_accepts_legacy_version_title_without_language_prefix(
    monkeypatch,
):
    path = "/api/img-gen/Genesis.1.1?lang=en&ven=The_Contemporary_Torah,_Jewish_Publication_Society,_2006"
    result = _capture_social_image_call(monkeypatch, path)

    assert (
        result["text_family_kwargs"]["version"]
        == "The Contemporary Torah, Jewish Publication Society, 2006"
    )


# --- make_social_image_response dispatcher (match/case) unit tests ---


class _StubRef:
    def normal(self):
        return "Genesis 1:1"


def test_dispatch_static_target_calls_static(monkeypatch):
    seen = {}
    monkeypatch.setattr(
        views,
        "make_static_img_http_response",
        lambda platform: seen.update(platform=platform) or "STATIC",
    )
    result = views.make_social_image_response(
        views.StaticTarget(), "en", "facebook", "library", None
    )
    assert result == "STATIC"
    assert seen["platform"] == "facebook"


def test_dispatch_module_fallback_target_calls_fallback(monkeypatch):
    seen = {}
    monkeypatch.setattr(
        views,
        "make_module_fallback_img_http_response",
        lambda lang, platform, module: seen.update(args=(lang, platform, module))
        or "FALLBACK",
    )
    result = views.make_social_image_response(
        views.ModuleFallbackTarget(), "he", "twitter", "voices", None
    )
    assert result == "FALLBACK"
    assert seen["args"] == ("he", "twitter", "voices")


def test_dispatch_toc_target_picks_hebrew_title(monkeypatch):
    seen = {}
    monkeypatch.setattr(
        views,
        "make_toc_img_http_response",
        lambda title, subtitle, category, lang, platform, module, category_path, desc=None, is_primary_category=False: seen.update(
            title=title, subtitle=subtitle, category=category, path=category_path,
            desc=desc, is_primary_category=is_primary_category,
        )
        or "TOC",
    )
    target = views.TocTarget(
        title_en="Genesis",
        title_he="בראשית",
        category="Tanakh",
        category_path=("Tanakh",),
        subtitle_en="Tanakh",
        subtitle_he="תנ״ך",
    )
    result = views.make_social_image_response(target, "he", "facebook", "library", None)
    assert result == "TOC"
    assert seen["title"] == "בראשית" and seen["subtitle"] == "תנ״ך"
    assert seen["category"] == "Tanakh" and seen["path"] == ("Tanakh",)


def test_dispatch_passage_any_failure_falls_back(monkeypatch):
    # Broad catch: ANY exception during resolve -> module fallback (never 500).
    def _boom(*args, **kwargs):
        raise RuntimeError("unexpected fetch failure")

    monkeypatch.setattr(views, "resolve_passage", _boom)
    seen = {}
    monkeypatch.setattr(
        views,
        "make_module_fallback_img_http_response",
        lambda lang, platform, module: seen.update(hit=True) or "FALLBACK",
    )
    target = views.PassageTarget(oref=_StubRef())
    result = views.make_social_image_response(target, "en", "facebook", "library", None)
    assert result == "FALLBACK"
    assert seen["hit"] is True


def test_dispatch_passage_success_calls_img_response(monkeypatch):
    monkeypatch.setattr(
        views,
        "resolve_passage",
        lambda p, lang, version: ("the text", "Genesis 1:1", "Tanakh"),
    )
    seen = {}
    monkeypatch.setattr(
        views,
        "make_img_http_response",
        lambda text, cat, ref_str, lang, platform, module: seen.update(
            text=text, cat=cat, ref_str=ref_str
        )
        or "IMG",
    )
    target = views.PassageTarget(oref=_StubRef())
    result = views.make_social_image_response(target, "en", "facebook", "library", None)
    assert result == "IMG"
    assert seen == {"text": "the text", "cat": "Tanakh", "ref_str": "Genesis 1:1"}
