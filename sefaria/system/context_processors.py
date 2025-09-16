# -*- coding: utf-8 -*-

"""
Djagno Context Processors, for decorating all HTTP requests with common data.
"""
import json
from datetime import datetime
from functools import wraps

from django.template.loader import render_to_string

from sefaria.settings import *
from sefaria.site.site_settings import SITE_SETTINGS
from sefaria.model import library
from sefaria.model.user_profile import UserProfile, UserHistorySet, UserWrapper
from sefaria.utils import calendars
from sefaria.utils.util import short_to_long_lang_code
from sefaria.utils.hebrew import hebrew_parasha_name
from reader.views import render_react_component, _get_user_calendar_params

import structlog
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
    }


@builtin_only
def base_props(request):
    from reader.views import base_props
    return {"propsJSON": json.dumps(base_props(request), ensure_ascii=False)}


@user_only
def module_context(request):
    from sefaria.utils.util import get_language_specific_domain_modules
    return {
        'active_module': request.active_module,
        'domain_modules': get_language_specific_domain_modules(request.interfaceLang)
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
