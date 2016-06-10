"""
Djagno Context Processors, for decorating all HTTP request with common data.
"""
from datetime import datetime

from django.template.loader import render_to_string

from sefaria.settings import *
from sefaria.model import library, NotificationSet
from sefaria.model.user_profile import UserProfile, unread_notifications_count_for_user
from sefaria.utils import calendars


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
        "S2":                     "s2" in request.GET or request.COOKIES.get('s2'),
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

    # CONTENT
    # Pull language setting from cookie or Accept-Lanugage header or default to english
    content = request.COOKIES.get('contentLang') or request.LANGUAGE_CODE or 'english'
    # URL parameter trumps cookie
    content = request.GET.get("lang", content)
    content = "bilingual" if content in ("bi", "he-en", "en-he") else content
    content = 'hebrew' if content in ('he', 'he-il') else content
    content = "english" if content in ('en') else content
    # Don't allow languages other than what we currently handle
    content = 'english' if content not in ('english', 'hebrew', 'bilingual') else content

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

    return {"contentLang": content, "interfaceLang": interface}


def notifications(request):
    if not request.user.is_authenticated():
        if request.COOKIES.get("_ga", None) and not request.COOKIES.get("welcomeToS2", None):
            # Welcome returning visitors only to the new Sefaria. TODO this should be removed after some time.
            return {
                "interruptingMessage": {
                        "name": "welcomeToS2",
                        "html": render_to_string("messages/welcomeToS2LoggedOut.html")
                    }
            }
        return {}
    
    profile = UserProfile(id=request.user.id)
    notifications = profile.recent_notifications()
    notifications_json = "[" + ",".join([n.to_JSON() for n in notifications]) + "]"
    return {
            "notifications": notifications, 
            "notifications_json": notifications_json,
            "notifications_html": notifications.to_HTML(),
            "notifications_count": profile.unread_notifications_count(),
            "interrupting_message": profile.interrupting_message()
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
            "parasha_name": parasha["parasha"],
            "haftara_ref":   parasha["haftara"][0],
            "daf_yomi_ref":  daf["url"]
        }
