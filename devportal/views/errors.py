"""Error handlers of the developers host (handler404 and handler500 of sefaria/urls_developers.py).

The fallback route (devportal.views.pages.portal_page) already answers unknown paths with the
Redirect table and then the 404 page; these handlers cover an Http404 raised by a view and an
unhandled exception. The 500 page touches no database and renders without a request (rule Q4).
"""

import logging

from django.http import HttpResponseServerError
from django.template.loader import render_to_string

from .pages import response_for_path

logger = logging.getLogger("devportal")


def page_not_found(request, exception=None):
    return response_for_path(request, request.path)


def server_error(request):
    try:
        body = render_to_string("devportal/500.html", {})
    except Exception:  # noqa: BLE001 - the error page itself must not fail
        logger.exception("devportal: could not render the 500 page")
        body = "<!doctype html><title>Server Error</title><h1>Server Error</h1>"
    return HttpResponseServerError(body, content_type="text/html; charset=utf-8")
