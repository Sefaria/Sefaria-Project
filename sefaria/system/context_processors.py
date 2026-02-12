# -*- coding: utf-8 -*-

"""
Djagno Context Processors, for decorating all HTTP requests with common data.
"""
import json
from functools import wraps

from reader.models import UserExperimentSettings, user_has_experiments
from sefaria.settings import *
from django.conf import settings
from sefaria.site.site_settings import SITE_SETTINGS
from sefaria.model import library
from sefaria.model.user_profile import UserProfile

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
        "STRAPI_LOCATION":        STRAPI_LOCATION,
        "STRAPI_PORT":            STRAPI_PORT,
        "GOOGLE_TAG_MANAGER_CODE":GOOGLE_TAG_MANAGER_CODE,
        "GOOGLE_GTAG":            GOOGLE_GTAG,
        "HOTJAR_ID":              HOTJAR_ID,
        "DEBUG":                  DEBUG,
        "OFFLINE":                OFFLINE,
        "SITE_SETTINGS":          SITE_SETTINGS,
        "CLIENT_SENTRY_DSN":      CLIENT_SENTRY_DSN,
        "CHATBOT_USE_LOCAL_SCRIPT": CHATBOT_USE_LOCAL_SCRIPT,
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
            f"https://{chatbot_version}.ai-client.coolifydev.sefaria.org/lc-chatbot.umd.cjs",
            None,
        )
    if settings.CHATBOT_USE_LOCAL_SCRIPT:
        return ("http://localhost:5173/src/main.js", "module")
    return (
        "https://chat-dev.sefaria.org/static/js/lc-chatbot.umd.cjs",
        None,
    )

def _is_user_in_experiment(request):
    if not user_has_experiments(request.user):
        return False
    profile = UserProfile(user_obj=request.user)
    if not getattr(profile, "experiments", False):
        return False
    return True

@user_only
def chatbot_user_token(request):
    chatbot_version = request.GET.get("chatbot_version", "").strip()

    if not _is_user_in_experiment(request):
        return {
            "chatbot_script_url": None,
            "chatbot_script_type": None,
        }

    script_url, script_type = _chatbot_script_url_and_type(chatbot_version)
    return {
        "chatbot_script_url": script_url,
        "chatbot_script_type": script_type,
    }
