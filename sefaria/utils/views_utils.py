# -*- coding: utf-8 -*-
"""
Utility functions for views and request/response handling.
"""
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse


def add_query_param(url, param, value=""):
    """
    Add a query parameter to the provided URL.

    The parameter will be added even if it already exists (allowing duplicates).
    Other query parameters (including duplicates) are preserved.

    :param url: URL string
    :param param: Query parameter name
    :param value: Query parameter value (defaults to empty string)
    :return: URL string with updated query parameters
    """
    parsed = urlparse(url)
    pairs = parse_qsl(parsed.query, keep_blank_values=True)
    pairs.append((param, value))
    new_query = urlencode(pairs, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


# Referer is always external here (google/apple), so referer_is_sefaria_domain can't catch these.
# /api/auth/google/redirect (sso/urls.py, sso/views.py) is Google One Tap's redirect-mode
# login_uri -- accounts.google.com POSTs the credential straight to it, same as the
# /accounts/* allauth callbacks.
AASA_EXCLUDED_PATHS = [
    "/accounts/*",
    "/_allauth/*",
    "/api/auth/google/redirect",
]

# Marks a redirect as "stay on web". Read by apple_app_site_association's AASA rule, stripped in client.jsx.
NO_APPLINK_PARAM = "no_applink"


def mark_no_applink(url):
    return add_query_param(url, NO_APPLINK_PARAM, "1")
