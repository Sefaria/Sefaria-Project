"""
Content-only rendering of the static information pages (reader/static_content.py, LAUNCH_PLAN T-B06): `?format=json` answers the
page's content block, title and stylesheets instead of the page, for the new reader's own shell. Three kinds of page: one from
sites/sefaria/urls.py static_pages (/terms), one by language (/about), and one with its own view (/digitized-by-sefaria).

The full pages need the webpack build (render_template), the content answer does not, so all of this runs locally.
"""

import re
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.http import HttpResponse
from django.test import TestCase

from reader import static_content
from reader.conftest import create_test_user, purge_test_profiles


class StaticContentTest(TestCase):
    databases = "__all__"

    def get(self, path, **params):
        return self.client.get(path, {"format": "json", **params})

    def test_a_static_page_answers_its_content_title_and_css(self):
        res = self.get("/terms", lang="en")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res["Content-Type"].startswith("application/json"))
        body = res.json()
        self.assertEqual(body["path"], "/terms")
        self.assertEqual(body["lang"], "en")
        self.assertEqual(body["title"], "Terms of Use | Sefaria")
        self.assertIn('id="aboutSidebar"', body["html"])  # rendered as for a desktop visitor
        self.assertNotIn("<html", body["html"])
        self.assertNotIn('id="s2"', body["html"])  # no legacy header
        self.assertNotIn("<title>", body["html"])
        self.assertTrue(any(href.startswith("/static/css/static.css") for href in body["css"]))
        self.assertEqual(body["bodyClass"], "interface-english")
        self.assertFalse(body["hasScript"])
        self.assertEqual(len(body["baseCss"]), len(static_content.BASE_CSS))

    def test_a_page_by_language_follows_lang(self):
        en = self.get("/about", lang="en").json()
        he = self.get("/about", lang="he").json()
        self.assertEqual(en["title"], "About Sefaria")
        self.assertEqual(he["lang"], "he")
        self.assertEqual(he["bodyClass"], "interface-hebrew")
        self.assertNotEqual(en["html"], he["html"])  # templates/static/en/about.html vs he/about.html
        self.assertIn("#aboutPage a", en["inlineCss"])  # its {% block css %}

    def test_links_to_other_modules_are_absolute(self):
        # about.html links {{ domain_modules.library }}/visualizations and a {{ domain_modules.voices }} collection
        library, voices = settings.DOMAIN_MODULES["en"]["library"], settings.DOMAIN_MODULES["en"]["voices"]
        html = self.get("/about", lang="en").json()["html"]
        self.assertIn(f'href="{library}/visualizations"', html)
        self.assertIn(f'href="{voices}/collections/', html)
        self.assertNotIn('href="/visualizations"', html)

    def test_digitized_by_sefaria_renders_its_list(self):
        texts = [{"title": "Rashi on Genesis", "versionTitle": "On Your Way", "language": "en"}]
        with mock.patch("reader.views.VersionSet", return_value=texts):
            body = self.get("/digitized-by-sefaria", lang="en").json()
        self.assertEqual(body["title"], "Texts Digitized by Sefaria")
        self.assertIn('id="digitizedBySefaria"', body["html"])
        self.assertIn("Rashi on Genesis", body["html"])

    def test_with_lang_the_answer_is_the_same_for_everyone_and_public(self):
        user = create_test_user("static-content")
        try:
            anonymous = self.get("/terms", lang="he")
            self.client.force_login(user)
            signed_in = self.get("/terms", lang="he")
            self.assertEqual(anonymous.json(), signed_in.json())
        finally:
            purge_test_profiles(user)
        cache_control = anonymous["Cache-Control"]
        self.assertIn("public", cache_control)
        self.assertIn(f"max-age={static_content.PUBLIC_MAX_AGE}", cache_control)
        self.assertEqual(
            dict(anonymous.cookies), {}
        )  # no csrftoken (the page's @ensure_csrf_cookie is not in this path)

    def test_without_lang_it_follows_the_request_and_is_private(self):
        res = self.get("/terms")
        self.assertEqual(res.json()["lang"], "en")
        self.assertIn("private", res["Cache-Control"])
        self.assertEqual(self.get("/terms", lang="fr").status_code, 400)

    def test_only_get_with_format_json_answers_content(self):
        with mock.patch("reader.views.render_template", return_value=HttpResponse("page")) as page:
            self.client.get("/terms")
            self.client.get("/terms", {"format": "html"})
            self.client.head("/terms", {"format": "json"})
        self.assertEqual(page.call_count, 3)

    def test_a_page_with_a_script_says_so(self):
        self.assertTrue(self.get("/team", lang="en").json()["hasScript"])

    def test_base_css_is_what_base_html_links(self):
        base = Path(settings.BASE_DIR, "templates", "base.html").read_text()
        linked = re.findall(r"static\s+'([^']+\.css)'", base)
        for path in static_content.BASE_CSS:
            self.assertIn(path, linked)
        self.assertIn(static_content.DEFAULT_STATIC_CSS[0], linked)


class EveryStaticPageTest(TestCase):
    """Every page the static routes serve answers content in both languages (a template the content path cannot render fails here)."""

    databases = "__all__"

    def test_every_static_page(self):
        from sites.sefaria.urls import static_pages, static_pages_by_lang

        standalone = {"random-walk-through-torah", "cloudflare_site_is_down_en", "cloudflare_site_is_down_he"}
        own_view = {"metrics"}  # routed to reader/views.py metrics before the static pages
        failures = []
        for page in [*static_pages, *static_pages_by_lang]:
            if page in standalone | own_view:
                continue
            for lang in ("en", "he"):
                try:
                    res = self.client.get(f"/{page}", {"format": "json", "lang": lang})
                except Exception as e:  # noqa: BLE001 -- collect them all
                    failures.append(f"/{page} {lang}: {type(e).__name__}")
                    continue
                if res.status_code != 200 or not res.json().get("html"):
                    failures.append(f"/{page} {lang}: {res.status_code}")
        self.assertEqual(failures, [])

    def test_a_standalone_document_says_so(self):
        res = self.client.get("/random-walk-through-torah", {"format": "json", "lang": "en"})
        self.assertEqual(res.status_code, 404)
        self.assertTrue(res.json()["standalone"])


VOICES = {"HTTP_HOST": "voices.localhost:8000"}


class VoicesUnchangedTest(TestCase):
    """Owner rule: on the Voices host ?format=json changes nothing; the page is served exactly as before."""

    databases = "__all__"

    def page_calls(self, path):
        with mock.patch("reader.views.render_template", return_value=HttpResponse("page")) as page:
            res = self.client.get(path, {"format": "json", "lang": "en"}, **VOICES)
        return res, page

    def test_a_voices_static_page_is_the_page(self):
        res, page = self.page_calls("/getstarted")  # urls_sheets: serve_static with page "sheets"
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, b"page")
        self.assertEqual(page.call_args.args[1], "static/sheets.html")

    def test_a_shared_static_page_on_voices_is_the_page(self):
        res, page = self.page_calls("/linker")
        self.assertEqual(res.content, b"page")
        self.assertEqual(page.call_args.args[1], "static/linker.html")

    def test_an_about_page_on_voices_still_redirects_to_the_library(self):
        for path in ("/about", "/terms"):
            res, page = self.page_calls(path)
            self.assertIn(res.status_code, (301, 302), path)
            self.assertIn(settings.DOMAIN_MODULES["en"]["library"], res["Location"])
            page.assert_not_called()
