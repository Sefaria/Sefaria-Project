# -*- coding: utf-8 -*-

"""
Djagno Context Processors, for decorating all HTTP requests with common data.
"""
import json
from datetime import datetime
from functools import wraps

from django.template.loader import render_to_string

from sefaria.settings import *
from sefaria.model import library
from sefaria.model.user_profile import UserProfile
from sefaria.model.interrupting_message import InterruptingMessage
from sefaria.utils import calendars
from sefaria.utils.util import short_to_long_lang_code
from sefaria.utils.hebrew import hebrew_parasha_name
from reader.views import render_react_component

import logging
logger = logging.getLogger(__name__)


def data_only(view):
    """
    Marks processors only need when setting the data JS.
    Passed in Source Sheets which rely on S1 JS.
    """
    @wraps(view)
    def wrapper(request):
        if (request.path in ("/data.js", "/sefaria.js", "/texts") or 
              request.path.startswith("/sheets/")):
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
        exclude = ('/data.js', '/linker.js')
        if request.path in exclude or request.path.startswith("/api/"):
            return {}
        else:
            return view(request)
    return wrapper


def global_settings(request):
    return {
        "SEARCH_URL":             SEARCH_HOST,
        "SEARCH_INDEX_NAME":      SEARCH_INDEX_NAME,
        "GOOGLE_ANALYTICS_CODE":  GOOGLE_ANALYTICS_CODE,
        "DEBUG":                  DEBUG,
        "OFFLINE":                OFFLINE,
        "GLOBAL_WARNING":         GLOBAL_WARNING,
        "GLOBAL_WARNING_MESSAGE": GLOBAL_WARNING_MESSAGE,
        #"USE_VARNISH":            USE_VARNISH,
        #"VARNISH_ADDR":           VARNISH_ADDR,
        #"USE_VARNISH_ESI":        USE_VARNISH_ESI
        }


@data_only
def titles_json(request):
    return {"titlesJSON": library.get_text_titles_json()}


@data_only
def toc(request):
    return {"toc": library.get_toc(), "toc_json": library.get_toc_json(), "search_toc_json": library.get_search_filter_toc_json()}


@data_only
def terms(request):
    return {"terms_json": json.dumps(library.get_simple_term_mapping())}


@user_only
def embed_page(request):
    return {"EMBED": "embed" in request.GET}


@data_only
def user_and_notifications(request):
    """
    Load data that comes from a user profile.
    Most of this data is currently only needed view /data.js
    /texts requires `recentlyViewed` which is used for server side rendering of recent section
    (currently Node does not get access to logged in version of /data.js)
    """
    if not request.user.is_authenticated():
        import urlparse
        recent = json.loads(urlparse.unquote(request.COOKIES.get("recentlyViewed", '[]')))
        recent = [] if len(recent) and isinstance(recent[0], dict) else recent # ignore old style cookies
        return {
            "recentlyViewed": recent,
            "interrupting_message_json": InterruptingMessage(attrs=GLOBAL_INTERRUPTING_MESSAGE, request=request).json()
        }
    
    profile = UserProfile(id=request.user.id)
    if request.path == "/texts":
        return {
            "recentlyViewed": profile.recentlyViewed,
        }

    notifications = profile.recent_notifications()
    notifications_json = "[" + ",".join([n.to_JSON() for n in notifications]) + "]"
    
    interrupting_message_dict = GLOBAL_INTERRUPTING_MESSAGE or {"name": profile.interrupting_message()}
    interrupting_message      = InterruptingMessage(attrs=interrupting_message_dict, request=request)
    interrupting_message_json = interrupting_message.json()

    return {
        "notifications": notifications,
        "notifications_json": notifications_json,
        "notifications_html": notifications.to_HTML(),
        "notifications_count": profile.unread_notification_count(),
        "recentlyViewed": profile.recentlyViewed,
        "interrupting_message_json": interrupting_message_json,
        "partner_group": profile.partner_group,
        "partner_role": profile.partner_role,
    }


HEADER = {
    'logged_in': {'english': None, 'hebrew': None},
    'logged_out': {'english': None, 'hebrew': None}
}
@user_only
def header_html(request):
    """
    Uses React to prerender a logged in and and logged out header for use in pages that extend `base.html`.
    Cached in memory -- restarting Django is necessary for catch any HTML changes to header.
    """
    if request.path == "/data.js":
        return {}
    global HEADER
    if USE_NODE:
        lang = request.interfaceLang
        LOGGED_OUT_HEADER = HEADER['logged_out'][lang] or render_react_component("ReaderApp", {"headerMode": True, "loggedIn": False, "interfaceLang": lang})
        LOGGED_IN_HEADER = HEADER['logged_in'][lang] or render_react_component("ReaderApp", {"headerMode": True, "loggedIn": True, "interfaceLang": lang})
        LOGGED_OUT_HEADER = "" if "appLoading" in LOGGED_OUT_HEADER else LOGGED_OUT_HEADER
        LOGGED_IN_HEADER = "" if "appLoading" in LOGGED_IN_HEADER else LOGGED_IN_HEADER
        HEADER['logged_out'][lang] = LOGGED_OUT_HEADER
        HEADER['logged_in'][lang] = LOGGED_IN_HEADER
    else:
        LOGGED_OUT_HEADER = ""
        LOGGED_IN_HEADER = ""
    return {
        "logged_in_header": LOGGED_IN_HEADER,
        "logged_out_header": LOGGED_OUT_HEADER,
    }


FOOTER = None
@user_only
def footer_html(request):
    if request.path == "/data.js":
        return {}
    global FOOTER
    if USE_NODE:
        FOOTER = FOOTER or render_react_component("Footer", {})
        FOOTER = "" if "appLoading" in FOOTER else FOOTER
    else:
        FOOTER = ""
    return {
        "footer": FOOTER
    }


@data_only
def calendar_links(request):
    loc = request.META.get("HTTP_CF_IPCOUNTRY", None)
    if not loc:
        try:
            from sefaria.settings import PINNED_IPCOUNTRY
            loc = PINNED_IPCOUNTRY
        except:
            loc = "us"
    diaspora = False if loc in ("il", "IL", "Il") else True
    return {"calendars": json.dumps(calendars.get_todays_calendar_items(diaspora=diaspora))}

    """
    return {
                "parasha_link":  parasha_link, 
                "haftara_link":  haftara_link,
                "daf_yomi_link": daf_yomi_link,
                "parasha_ref":   parasha["ref"],
                "parasha_name":  parasha["parasha"],
                "he_parasha_name":hebrew_parasha_name(parasha["parasha"]),
                "haftara_ref":   parasha["haftara"][0],
                "daf_yomi_ref":  daf["url"]
            }
    """
