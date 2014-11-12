"""
Djagno Context Processors, for decorating all HTTP request with common data.
"""
from sefaria.settings import *
from sefaria.model import library, NotificationSet
from sefaria.model.user_profile import unread_notifications_count_for_user
from sefaria.summaries import get_toc


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
	return {"titlesJSON": library.get_text_titles_json()}


def toc(request):
	return {"toc": get_toc()}


def embed_page(request):
	return {"EMBED": "embed" in request.GET}


def notifications(request):
	if not request.user.is_authenticated():
		return {}
	notifications = NotificationSet().recent_for_user(request.user.id)
	unread_count  = unread_notifications_count_for_user(request.user.id)
	return {"notifications": notifications, "notifications_count": unread_count }
