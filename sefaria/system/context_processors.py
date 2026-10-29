# -*- coding: utf-8 -*-

"""
Djagno Context Processors, for decorating all HTTP requests with common data.
"""
import time
import json
from functools import wraps

from django_recaptcha.constants import TEST_PUBLIC_KEY as TEST_RECAPTCHA_PUBLIC_KEY
from reader.models import user_has_experiments
from sefaria.helper import library_assistant
from sefaria.settings import *
from django.conf import settings
from sefaria.site.site_settings import SITE_SETTINGS
from sefaria.model import library

import structlog

from sefaria.utils.util import is_int
logger = structlog.get_logger(__name__)


def builtin_only(view):
    """
    Marks processors only needed when using on Django builtin auth views.
    """
    @wraps(view)
    def wrapper(request):
        if request.path == "/login" or request.path.startswith("/password"):
            return view(request)
        else:
            return {}
    return wrapper


def data_only(view):
    """
    Marks processors only needed when setting the data JS.
    Passed in Source Sheets which rely on S1 JS.
    """
    @wraps(view)
    def wrapper(request):
        if request.path == "/sefaria.js" or request.path.startswith("/data.") or request.path.startswith("/sheets/"):
            return view(request)
        else:
            return {}
    return wrapper


def user_only(view):
    """
    Marks processors only needed on user visible pages.
    """
    @wraps(view)
    def wrapper(request):
        #exclude = ('/linker.js')
        if request.path == '/linker.js' or request.path.startswith("/api/") or request.path.startswith("/data."):
            return {}
        else:
            return view(request)
    return wrapper


def global_settings(request):
    return {
        "SEARCH_INDEX_NAME_TEXT": SEARCH_INDEX_NAME_TEXT,
        "SEARCH_INDEX_NAME_SHEET":SEARCH_INDEX_NAME_SHEET,
        "SEARCH_INDEX_NAME_TOPIC":SEARCH_INDEX_NAME_TOPIC,
        "SEARCH_INDEX_NAME_BOOK":SEARCH_INDEX_NAME_BOOK,
        "SEARCH_INDEX_NAME_CATEGORY":SEARCH_INDEX_NAME_CATEGORY,
        "STRAPI_LOCATION":        STRAPI_LOCATION,
        "STRAPI_PORT":            STRAPI_PORT,
        "GOOGLE_TAG_MANAGER_CODE":GOOGLE_TAG_MANAGER_CODE,
        "GOOGLE_GTAG":            GOOGLE_GTAG,
        "HOTJAR_ID":              HOTJAR_ID,
        "DEBUG":                  DEBUG,
        "OFFLINE":                OFFLINE,
        "SITE_SETTINGS":          SITE_SETTINGS,
        "CLIENT_SENTRY_DSN":      CLIENT_SENTRY_DSN,
        "GOOGLE_SSO_CLIENT_ID":   getattr(settings, "GOOGLE_SSO_CLIENT_ID", ""),
        "APPLE_SSO_CLIENT_ID":    getattr(settings, "APPLE_SSO_CLIENT_ID", ""),
        "RECAPTCHA_PUBLIC_KEY":   getattr(settings, "RECAPTCHA_PUBLIC_KEY", TEST_RECAPTCHA_PUBLIC_KEY if settings.DEBUG else None),
    }


@builtin_only
def base_props(request):
    from reader.views import base_props
    return {"propsJSON": json.dumps(base_props(request), ensure_ascii=False)}


@user_only
def module_context(request):
    return {
        'active_module': request.active_module,
        'domain_modules': DOMAIN_MODULES
    }

@user_only
def cache_timestamp(request):
    return {
        "last_cached": library.get_last_cached_time(),
        "last_cached_short": round(library.get_last_cached_time())
    }


@data_only
def large_data(request):
    return {
        "toc": library.get_toc(),
        "toc_json": library.get_toc_json(),
        "topic_toc": library.get_topic_toc(),
        "topic_toc_json": library.get_topic_toc_json(),
        "titles_json": library.get_text_titles_json(),
        "terms_json": library.get_simple_term_mapping_json(),
        'virtual_books': library.get_virtual_books()
    }

A2HS_MINCHA_TITLES = (
    "Siddur Ashkenaz, Weekday, Minchah",
    "Siddur Sefard, Weekday Mincha",
    "Siddur Edot HaMizrach, Weekday Mincha",
)
A2HS_TORAH_BOOKS = ("Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy")


@user_only
def add_to_home_screen(request):
    """
    Add-to-home-screen POC: on Weekday Mincha and this week's parashah, point the page's
    manifest at a mini-app for that page. iOS reads the manifest as the page first loads,
    so it has to be in the server-rendered HTML.
    """
    from urllib.parse import unquote, urlencode
    path = unquote(request.path).strip("/").replace("_", " ")
    if not path or "/" in path:
        return {}
    target = None
    for title in A2HS_MINCHA_TITLES:
        if path == title or path.startswith(title + ","):
            target = {"start": "/" + title.replace(" ", "_"), "name": "Mincha", "id": "mincha"}
            break
    if target is None and path.startswith(A2HS_TORAH_BOOKS):
        try:
            from sefaria.model import Ref
            from sefaria.utils.calendars import get_todays_parasha
            parasha_ref = Ref(get_todays_parasha()["ref"])
            if parasha_ref.contains(Ref(path)):
                target = {"start": "/parashat-hashavua", "name": "Weekly Parashah", "id": "parashah"}
        except Exception:
            target = None
    if target is None:
        return {}
    return {"a2hs_manifest_query": "&" + urlencode(target), "a2hs_name": target["name"]}


@user_only
def body_flags(request):
    return {"EMBED": "embed" in request.GET}


def _chatbot_script_url_and_type(chatbot_version):
    """Return (url, type) for the chatbot script. type is None for classic, 'module' for ES module."""
    if chatbot_version:
        # is_int check is a safeguard to ensure chatbot_version is a valid integer before using it,
        # as it is used for a script insersion and we want to avoid any potential security issues with malicious input.
        if not is_int(chatbot_version):
            return None, None
        return (
            f"https://{chatbot_version}.ai-server.coolifydev.sefaria.org/static/js/lc-chatbot.umd.cjs?rand={int(time.time())}",
            None,
        )
    if settings.CHATBOT_USE_LOCAL_SCRIPT:
        return ("http://localhost:5173/src/main.js", "module")
    
    if settings.CHATBOT_API_BASE_URL:
        chatbot_base = settings.CHATBOT_API_BASE_URL.replace("/api", "")
    else:
        chatbot_base = "https://chat-dev.sefaria.org"
    return (
        f"{chatbot_base}/static/js/lc-chatbot.umd.cjs",
        None,
    )

@user_only
def chatbot_user_token(request):
    chatbot_version = request.GET.get("chatbot_version", "").strip()
    # if chatbot_version add it to cookies so it can be used in subsequent requests
    if chatbot_version:
        if chatbot_version == "clear":
            if "chatbot_version" in request.session:
                del request.session["chatbot_version"]
        else:
            request.session["chatbot_version"] = chatbot_version
    # if chatbot_version is not in request.GET, check if it's in session (from previous requests)
    elif "chatbot_version" in request.session:
        chatbot_version = request.session["chatbot_version"]

    if not library_assistant.is_enabled_for_user(request.user):
        return {
            "chatbot_script_url": None,
            "chatbot_script_type": None,
        }

    script_url, script_type = _chatbot_script_url_and_type(chatbot_version)
    return {
        "chatbot_script_url": script_url,
        "chatbot_script_type": script_type,
    }
