# -*- coding: utf-8 -*-

"""
Djagno Context Processors, for decorating all HTTP requests with common data.
"""
import json
from datetime import datetime

from django.template.loader import render_to_string

from sefaria.settings import *
from sefaria.model import library
from sefaria.model.user_profile import UserProfile
from sefaria.utils import calendars
from sefaria.utils.util import short_to_long_lang_code
from sefaria.utils.hebrew import hebrew_parasha_name
from reader.views import render_react_component


def global_settings(request):
    return {
        "SEARCH_URL":             SEARCH_HOST,
        "SEARCH_INDEX_NAME":      SEARCH_INDEX_NAME,
        "GOOGLE_ANALYTICS_CODE":  GOOGLE_ANALYTICS_CODE,
        "MIXPANEL_CODE":          MIXPANEL_CODE,
        "DEBUG":                  DEBUG,
        "OFFLINE":                OFFLINE,
        "GLOBAL_WARNING":         GLOBAL_WARNING,
        "GLOBAL_WARNING_MESSAGE": GLOBAL_WARNING_MESSAGE,
        "S2":                     not request.COOKIES.get('s1', False),
        #"USE_VARNISH":            USE_VARNISH,
        #"VARNISH_ADDR":           VARNISH_ADDR,
        #"USE_VARNISH_ESI":        USE_VARNISH_ESI
        }


def titles_json(request):
    return {"titlesJSON": library.get_text_titles_json()}


def toc(request):
    return {"toc": library.get_toc(), "toc_json": library.get_toc_json()}


def embed_page(request):
    return {"EMBED": "embed" in request.GET}


def language_settings(request):
    # INTERFACE
    interface = None
    if request.user.is_authenticated():
        profile = UserProfile(id=request.user.id)
        interface = profile.settings["interface_language"] if "interface_language" in profile.settings else None 
    if not interface: 
        # Pull language setting from cookie or Accept-Lanugage header or default to english
        interface = request.COOKIES.get('interfaceLang') or request.LANGUAGE_CODE or 'english'
        interface = 'hebrew' if interface in ('he', 'he-il') else interface
        # Don't allow languages other than what we currently handle
        interface = 'english' if interface not in ('english', 'hebrew') else interface

    # CONTENT
    default_content_lang = 'hebrew' if interface == 'hebrew' else 'bilingual'
    # Pull language setting from cookie or Accept-Lanugage header or default to english
    content = request.COOKIES.get('contentLang') or default_content_lang
    content = short_to_long_lang_code(content)
    # Don't allow languages other than what we currently handle
    content = default_content_lang if content not in ('english', 'hebrew', 'bilingual') else content
    # Note: URL parameters may override values set her, handled in reader view.

    return {"contentLang": content, "interfaceLang": interface}


def user_and_notifications(request):
    if not request.user.is_authenticated():
        import urlparse
        return {
            "recentlyViewed": json.loads(urlparse.unquote(request.COOKIES.get("recentlyViewed", '[]')))
        }
    
    profile = UserProfile(id=request.user.id)
    notifications = profile.recent_notifications()
    notifications_json = "[" + ",".join([n.to_JSON() for n in notifications]) + "]"
    interrupting_message = profile.interrupting_message()
    if interrupting_message:
        interrupting_message_json = json.dumps({"name": interrupting_message, "html": render_to_string("messages/%s.html" % interrupting_message)})
    else:
        interrupting_message_json = "null"
    mock_recent = [{"ref":"Orot, Lights from Darkness, Land of Israel 5","heRef":"אורות, אורות מאופל, ארץ ישראל ה׳","book":"Orot","version":None,"versionLanguage":None,"position":0},{"ref":"Genesis 1","heRef":"בראשית א׳","book":"Genesis","version":None,"versionLanguage":None,"position":0},{"ref":"Berakhot 2a","heRef":"ברכות ב׳ א","book":"Berakhot","version":None,"versionLanguage":None,"position":0}]
    return {
        "notifications": notifications,
        "notifications_json": notifications_json,
        "notifications_html": notifications.to_HTML(),
        "notifications_count": profile.unread_notification_count(),
        "recentlyViewed": profile.recentlyViewed,
        "interrupting_message_json": interrupting_message_json,
        "partner_group": profile.partner_group,
        "partner_role": profile.partner_role
    }


LOGGED_OUT_HEADER = None
LOGGED_IN_HEADER  = None
def header_html(request):
    """
    Uses React to prerender a logged in and and logged out header for use in pages that extend `base.html`.
    Cached in memory -- restarting Django is necessary for catch any HTML changes to header.
    """
    if request.path == "/data.js":
        return {}
    global LOGGED_OUT_HEADER, LOGGED_IN_HEADER
    if USE_NODE:
        LOGGED_OUT_HEADER = LOGGED_OUT_HEADER or render_react_component("ReaderApp", {"headerMode": True, "loggedIn": False})
        LOGGED_IN_HEADER = LOGGED_IN_HEADER or render_react_component("ReaderApp", {"headerMode": True, "loggedIn": True})
    else:
        LOGGED_OUT_HEADER = ""
        LOGGED_IN_HEADER = ""
    return {
        "logged_in_header": LOGGED_IN_HEADER,
        "logged_out_header": LOGGED_OUT_HEADER,
    }


FOOTER = None
def footer_html(request):
    if request.path == "/data.js":
        return {}
    global FOOTER
    if USE_NODE:
        FOOTER = FOOTER or render_react_component("Footer", {})
    else:
        FOOTER = ""
    return {
        "footer": FOOTER
    }


def calendar_links(request):
    parasha  = calendars.this_weeks_parasha(datetime.now())
    daf      = calendars.daf_yomi(datetime.now())
    
    parasha_link  = "<a href='/%s'>%s: %s</a>" % (parasha["ref"], parasha["parasha"], parasha["ref"])
    haftara_link  = " ".join(["<a href='/%s'>%s</a>" % (h, h) for h in parasha["haftara"]])
    daf_yomi_link = "<a href='/%s'>%s</a>" % (daf["url"], daf["name"])

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
