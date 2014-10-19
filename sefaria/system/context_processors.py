"""
Djagno Context Processors, for decorating all HTTP request with common data.
"""

from sefaria.model.user_profile import unread_notifications_count_for_user
from sefaria.settings import *
from sefaria.model import get_text_titles_json
from sefaria.model.notification import NotificationSet
from sefaria.summaries import get_toc

def offline(request):
	return {"OFFLINE": OFFLINE}


def google_analytics(request):
	return {"GOOGLE_ANALYTICS_CODE": GOOGLE_ANALYTICS_CODE}


def search_url(request):
	return {
		"SEARCH_URL":    SEARCH_HOST,
		"SEARCH_INDEX_NAME": SEARCH_INDEX_NAME,
		}


def titles_json(request):
	return {"titlesJSON": get_text_titles_json()}


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
