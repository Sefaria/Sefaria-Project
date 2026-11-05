# -*- coding: utf-8 -*-
"""
Utility functions for views and request/response handling.
"""
from fnmatch import fnmatch
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from django.conf import settings


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
    f"/{settings.ADMIN_PATH.strip('/')}/*",  # Django admin; path is deployment-configurable
]


def is_aasa_excluded(url):
    """True if url's path is statically excluded from Universal Links, so marking it no_applink would be redundant."""
    path = urlparse(url).path
    return any(fnmatch(path, pattern) for pattern in AASA_EXCLUDED_PATHS)


# Marks a redirect as "stay on web". Read by apple_app_site_association's AASA rule, stripped in client.jsx.
NO_APPLINK_PARAM = "no_applink"
NO_APPLINK_VALUE = "1"


def mark_no_applink(url):
    """
    Return url carrying no_applink with a non-empty value. The AASA rule matches the
    value with "?*" (at least one character), so a bare or blank no_applink would not
    be excluded; such a marker is replaced with no_applink=1.
    """
    parsed = urlparse(url)
    pairs = parse_qsl(parsed.query, keep_blank_values=True)
    if any(key == NO_APPLINK_PARAM and value for key, value in pairs):
        return url
    pairs = [(key, value) for key, value in pairs if key != NO_APPLINK_PARAM]
    pairs.append((NO_APPLINK_PARAM, NO_APPLINK_VALUE))
    return urlunparse(parsed._replace(query=urlencode(pairs)))
