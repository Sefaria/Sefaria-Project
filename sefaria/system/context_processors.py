"""
Djagno Context Processors, for decorating all HTTP request with common data.
"""
from datetime import datetime

from sefaria.settings import *
from sefaria.model import get_text_titles_json
from sefaria.model.notification import NotificationSet
from sefaria.model.user_profile import unread_notifications_count_for_user
from sefaria.summaries import get_toc, get_toc_json
from sefaria.utils import calendars


def global_settings(request):
    return {
        "SEARCH_URL":             SEARCH_HOST,
        "SEARCH_INDEX_NAME":      SEARCH_INDEX_NAME,
        "GOOGLE_ANALYTICS_CODE":  GOOGLE_ANALYTICS_CODE,
        "OFFLINE":                OFFLINE,
        "GLOBAL_WARNING":         GLOBAL_WARNING,
        "GLOBAL_WARNING_MESSAGE": GLOBAL_WARNING_MESSAGE,
        }


def titles_json(request):
    return {"titlesJSON": get_text_titles_json()}


def toc(request):
    return {"toc": get_toc(), "toc_json": get_toc_json()}


def embed_page(request):
    return {"EMBED": "embed" in request.GET}


def notifications(request):
    if not request.user.is_authenticated():
        return {}
    notifications = NotificationSet().recent_for_user(request.user.id)
    unread_count  = unread_notifications_count_for_user(request.user.id)
    return {"notifications": notifications, "notifications_count": unread_count }


def calendar_links(request):
    parasha  = calendars.this_weeks_parasha(datetime.now())
    daf      = calendars.daf_yomi(datetime.now())
    
    parasha_link  = "<a href='/%s'>%s: %s</a>" % (parasha["ref"], parasha["parasha"], parasha["ref"])
    haftara_link  = " ".join(["<a href='/%s'>%s</a>" % (h, h) for h in parasha["haftara"]])
    daf_yomi_link = "<a href='/%s'>%s</a>" % (daf["url"], daf["name"])

    return {
        "parasha_link": parasha_link, 
        "haftara_link": haftara_link,
        "daf_yomi_link": daf_yomi_link
        }