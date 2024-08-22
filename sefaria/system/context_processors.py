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
from django.utils import translation

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

def language_font_class(request):
    languages = {
      'english': 'int-en',
      'hebrew': 'int-he',
      'chinese': 'int-zh'
    }
    current_language = translation.get_language()
    language_font_class = languages[request.interfaceLang]
    return {'language_font_class': language_font_class}

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


HEADER = {
    'logged_in': {'english': None, 'hebrew': None},
    'logged_out': {'english': None, 'hebrew': None},
    'logged_in_mobile': {'english': None, 'hebrew': None},
    'logged_out_mobile': {'english': None, 'hebrew': None},
}
@user_only
def header_html(request):
    """
    Uses React to prerender a logged in and and logged out header for use in pages that extend `base.html`.
    Cached in memory -- restarting Django is necessary for catch any HTML changes to header.
    """
    global HEADER
    if USE_NODE:
        lang = request.interfaceLang
        LOGGED_OUT_HEADER = HEADER['logged_out'][lang] or \
            render_react_component("ReaderApp", {"headerMode": True,
                                                 "_uid": None,
                                                 "interfaceLang": lang,
                                                 "_siteSettings": SITE_SETTINGS})

        LOGGED_IN_HEADER = HEADER['logged_in'][lang] or \
            render_react_component("ReaderApp", {"headerMode": True,
                                                 "_uid": True,
                                                 "interfaceLang": lang,
                                                 "notificationCount": 0,
                                                 "profile_pic_url": "",
                                                 "full_name": "",
                                                 "_siteSettings": SITE_SETTINGS})

        MOBILE_LOGGED_OUT_HEADER = HEADER["logged_out_mobile"][lang] or \
            render_react_component("ReaderApp", {"headerMode": True,
                                                 "_uid": None,
                                                 "interfaceLang": lang,
                                                 "multiPanel": False,
                                                 "_siteSettings": SITE_SETTINGS})

        MOBILE_LOGGED_IN_HEADER = HEADER["logged_in_mobile"][lang] or \
            render_react_component("ReaderApp", {"headerMode": True,
                                                 "_uid": True,
                                                 "interfaceLang": lang,
                                                 "notificationCount": 0,
                                                 "profile_pic_url": "",
                                                 "full_name": "",
                                                 "multiPanel": False,
                                                 "_siteSettings": SITE_SETTINGS})



        LOGGED_OUT_HEADER = "" if "appLoading" in LOGGED_OUT_HEADER else LOGGED_OUT_HEADER
        LOGGED_IN_HEADER = "" if "appLoading" in LOGGED_IN_HEADER else LOGGED_IN_HEADER
        MOBILE_LOGGED_OUT_HEADER = "" if "appLoading" in MOBILE_LOGGED_OUT_HEADER else MOBILE_LOGGED_OUT_HEADER
        MOBILE_LOGGED_IN_HEADER = "" if "appLoading" in MOBILE_LOGGED_IN_HEADER else MOBILE_LOGGED_IN_HEADER
        HEADER['logged_out'][lang] = LOGGED_OUT_HEADER
        HEADER['logged_in'][lang] = LOGGED_IN_HEADER
        HEADER['logged_out_mobile'][lang] = MOBILE_LOGGED_OUT_HEADER
        HEADER['logged_in_mobile'][lang] = MOBILE_LOGGED_IN_HEADER
    else:
        LOGGED_OUT_HEADER = ""
        LOGGED_IN_HEADER = ""
        MOBILE_LOGGED_OUT_HEADER = ""
        MOBILE_LOGGED_IN_HEADER = ""
    
    return {
        "logged_in_header":  LOGGED_IN_HEADER,
        "logged_out_header": LOGGED_OUT_HEADER,
        "logged_in_mobile_header":     MOBILE_LOGGED_IN_HEADER,
        "logged_out_mobile_header": MOBILE_LOGGED_OUT_HEADER,
    }


FOOTER = {'english': None, 'hebrew': None}
@user_only
def footer_html(request):
    global FOOTER
    lang = request.interfaceLang
    if USE_NODE:
        FOOTER[lang] = FOOTER[lang] or render_react_component("Footer", {"interfaceLang": request.interfaceLang, "_siteSettings": SITE_SETTINGS})
        FOOTER[lang] = "" if "appLoading" in FOOTER[lang] else FOOTER[lang]
    else:
        FOOTER[lang] = ""
    return {
        "footer": FOOTER[lang]
    }


@user_only
def body_flags(request):
    return {"EMBED": "embed" in request.GET}
