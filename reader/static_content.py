"""
Content-only rendering of the static information pages: the new reader renders its own header and
footer and asks Django for a page's content only.

    GET /<static page>?format=json[&lang=en|he]

answers, instead of the page,

    {
      "path":        "/about",
      "lang":        "en" | "he",          the interface language it was rendered in
      "title":       "About Sefaria",      the page's <title> text ("" when the page sets none)
      "description": "...",                its meta description ("" when none)
      "html":        "<div ...>...</div>", the page's {% block content %}; put it inside
                                           <div id="staticContentWrapper"><div id="content" class="interface-<english|hebrew>">
                                           as base.html does (static.css selects on those ids)
      "css":         ["/static/css/static.css?v=..."],   stylesheets the page itself asks for (static.css, its head links)
      "inlineCss":   "...",                its {% block css %} (base.html puts it in a <style>), "" when none
      "baseCss":     [...],                the stylesheets base.html loads on every legacy page, for what the content may lean on
      "bodyClass":   "interface-english",  the classes base.html gives <body> (the interface language + the page's own)
      "hasScript":   false                 true when the page has a {% block js %}: it mounts a legacy React component or runs
                                           jQuery, so the html alone is incomplete (e.g. /team shows "Loading...")
    }

A page that is a whole document of its own (it does not extend base.html, so it has no content block) answers 404
{"error": ..., "standalone": true}: show the page itself. /metrics is not a static page (reader/views.py metrics) and has
no content answer.

Why a query parameter and not a request header: Varnish hashes on the URL alone (helm-chart varnish-config.yaml vcl_hash) and
Cloudflare ignores Vary for HTML/JSON, so a header-switched answer at the page's own URL could be cached and served as the
page, or the page as JSON. A distinct URL keeps the two apart in every cache without relying on Vary.

Why `lang`: the content differs by interface language ({% trans %} titles, the /about and /ways-to-give templates, a few
`request.interfaceLang` tests). With `lang` the URL fully decides the answer, which is then the same for everyone and
`Cache-Control: public`; without it the answer follows the request's language (domain or cookie) and is `private`.

Library host only: on the Voices host ?format=json is ignored and the page is served as before.

The answer never depends on the visitor: the page is rendered for an anonymous desktop visitor (no user, no session, no
CSRF cookie). Only GET; anything else gets the page as before.
"""

import html as html_lib
import re
from types import SimpleNamespace

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.http import HttpResponseBadRequest
from django.template import Context
from django.template.loader import get_template
from django.template.loader_tags import BlockNode
from django.utils import translation
from django.utils.cache import patch_cache_control

from reader.templatetags.sefaria_tags import static as static_url
from sefaria.client.util import jsonResponse
from sefaria.system.context_processors import global_settings

FORMAT_PARAM = "format"
FORMAT_VALUE = "json"
LANGS = {"en": "english", "he": "hebrew"}
PUBLIC_MAX_AGE = 60 * 60

# The stylesheets templates/base.html links on every page (in its order; print-only and page-conditional ones left out).
# static_content_test.py checks each is still linked there.
BASE_CSS = [
    "css/common.css",
    "font-awesome/css/font-awesome.css",
    "css/fonts.css",
    "css/header.css",
    "css/popover.css",
    "css/breakpoints.css",
    "css/keyboard.css",
    "css/font-faces.css",
    "css/color-palette.css",
    "css/themes/library-theme.css",
    "css/themes/sheets-theme.css",
    "css/common-components.css",
    "css/common-component.css",
    "css/auth.css",
    "css/s2.css",
    "css/cookies-notification.css",
    "css/library-assistant.css",
    "css/lexicon-edit.css",
    "css/unbounce-banner.css",
]
# base.html's {% block static_css %} for a static page (renderStatic), unless the page overrides the block
DEFAULT_STATIC_CSS = ["css/static.css"]

_STYLESHEET = re.compile(r"<link\b[^>]*\brel=[\"']stylesheet[\"'][^>]*>", re.I)
_HREF = re.compile(r"\bhref=[\"']([^\"']+)[\"']", re.I)
_TITLE = re.compile(r"<title>(.*?)</title>", re.S | re.I)
_DESCRIPTION = re.compile(r"<meta\s+name=\"description\"\s+content=\"(.*?)\"\s*/?>", re.S | re.I)


def requested(request):
    """
    A content-only request: GET with ?format=json, on the Library host only. On the Voices host nothing changes (owner rule:
    Voices is untouched), so a Voices request with ?format=json gets the page as before.
    """
    from sefaria.constants.model import LIBRARY_MODULE

    return (
        request.method == "GET"
        and request.GET.get(FORMAT_PARAM) == FORMAT_VALUE
        and getattr(request, "active_module", None) == LIBRARY_MODULE
    )


class _Visitor:
    """The request as a template sees it, for an anonymous desktop visitor in the chosen interface language."""

    def __init__(self, request, interface_lang, lang_code):
        self._request = request
        self.interfaceLang = interface_lang
        self.LANGUAGE_CODE = lang_code
        self.user = AnonymousUser()
        self.user_agent = SimpleNamespace(
            is_mobile=False, is_tablet=False, is_touch_capable=False, is_pc=True, is_bot=False
        )
        self.COOKIES = {}

    def __getattr__(self, name):
        return getattr(self._request, name)


def _blocks(template):
    """The page template's own blocks by name (the outermost of each name; nested blocks render inside their parent)."""
    blocks = {}
    for node in template.nodelist.get_nodes_by_type(BlockNode):
        blocks.setdefault(node.name, node)
    return blocks


def _render(node, context, template):
    if node is None:
        return ""
    with context.render_context.push_state(template), context.bind_template(template):
        return node.render(context)


def _stylesheets(markup):
    return [m.group(1) for link in _STYLESHEET.findall(markup or "") if (m := _HREF.search(link))]


def respond(request, template_for_lang, extra_context=None):
    """
    The content-only answer for a static page. ``template_for_lang(lang_code)`` names the template ("en" / "he"), e.g.
    ``static/en/about.html`` for the pages by language.
    """
    lang_param = request.GET.get("lang")
    if lang_param is not None and lang_param not in LANGS:
        return HttpResponseBadRequest('lang must be "en" or "he"')
    if lang_param:
        lang_code, interface_lang = lang_param, LANGS[lang_param]
    else:
        interface_lang = getattr(request, "interfaceLang", None) or "english"
        lang_code = "he" if interface_lang == "hebrew" else "en"

    template = get_template(template_for_lang(lang_code)).template
    blocks = _blocks(template)
    if "content" not in blocks:
        # a whole document of its own (e.g. /random-walk-through-torah, /cloudflare_site_is_down_en): nothing to put in a shell
        response = jsonResponse(
            {
                "error": "This page is a standalone document with no content block; load the page itself.",
                "standalone": True,
            },
            status=404,
        )
        patch_cache_control(response, public=True, max_age=PUBLIC_MAX_AGE)
        return response
    visitor = _Visitor(request, interface_lang, lang_code)
    context = Context(
        {
            **global_settings(request),
            "request": visitor,
            "user": visitor.user,
            "LANGUAGE_CODE": lang_code,
            "active_module": getattr(request, "active_module", None),
            # module_context gives base.html every language's domains, so {{ domain_modules.library }} renders "" there and
            # such links come out relative (fine inside the legacy page, wrong in another shell). Here: this language's
            # domains, so the links are absolute to the right module (e.g. about.html's /visualizations and Voices link).
            "domain_modules": settings.DOMAIN_MODULES.get(lang_code, {}),
            "renderStatic": True,
            **(extra_context or {}),
        },
        autoescape=True,
    )
    with translation.override(lang_code):
        content = _render(blocks.get("content"), context, template)
        head = _render(blocks.get("meta_title"), context, template)
        description = _render(blocks.get("meta_description"), context, template)
        page_css = _stylesheets(_render(blocks.get("head"), context, template))
        if "static_css" in blocks:
            page_css = _stylesheets(_render(blocks["static_css"], context, template)) + page_css
        else:
            page_css = [static_url(p) for p in DEFAULT_STATIC_CSS] + page_css
        inline_css = _render(blocks.get("css"), context, template).strip()
        body_classes = _render(blocks.get("bodyclasses"), context, template).strip()

    title = _TITLE.search(head)
    desc = _DESCRIPTION.search(description)
    response = jsonResponse(
        {
            "path": request.path.rstrip("/") or "/",
            "lang": lang_code,
            "title": html_lib.unescape(title.group(1)).strip() if title else "",
            "description": html_lib.unescape(desc.group(1)).strip() if desc else "",
            "html": content.strip(),
            "css": page_css,
            "inlineCss": inline_css,
            "baseCss": [static_url(p) for p in BASE_CSS],
            "bodyClass": " ".join(c for c in (f"interface-{interface_lang}", body_classes) if c),
            "hasScript": "js" in blocks,
        }
    )
    if lang_param:
        patch_cache_control(response, public=True, max_age=PUBLIC_MAX_AGE)
    else:
        patch_cache_control(response, private=True, max_age=0)
    return response
