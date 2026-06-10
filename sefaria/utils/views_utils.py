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
