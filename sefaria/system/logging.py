import re

from structlog._frames import _format_exception
from structlog.processors import _figure_out_exc_info

# Query parameters that carry an API key: api_key or apikey, every letter and the underscore written literally (any
# case) or percent-encoded (any hex case). A name counts only at the start of the query or right after an "&".
# The value runs to the next "&" or the end, a "#" included (Django keeps it in get_full_path()). Values never reach a log line.
API_KEY_QUERY_RE = re.compile(
    r"(?i)((?:^|&)(?:a|%61|%41)(?:p|%70|%50)(?:i|%69|%49)(?:_|%5f)?(?:k|%6b|%4b)(?:e|%65|%45)(?:y|%79|%59)=)[^&]*"
)


# A key itself ("sfr_" + 32 letters and digits, see powered_by.models) wherever it appears in a URL, query string or
# Referer, whatever the parameter name: the admin search box sends a pasted key as ?q=sfr_<secret>. The prefix may be
# percent-encoded. The body is a run of units, a unit being one letter or digit or one percent-encoded byte (% and two
# hex digits), so a key whose body is partly or wholly encoded, even double-encoded, is still caught and the whole run is
# consumed. A token whose body is no longer than 6 units (the 6 characters the admin shows: KEY_DISPLAY_PREFIX of 10,
# with "sfr_") is a display prefix, not a secret, and stays. The two unit alternatives start with different characters,
# so matching is linear. Mirror this regex in the nginx log scrubbing.
API_KEY_TOKEN_RE = re.compile(r"(?i)(?:s|%73)(?:f|%66)(?:r|%72)(?:_|%5f)(?:[A-Za-z0-9]|%[0-9A-Fa-f]{2}){7,}")
API_KEY_TOKEN_REPLACEMENT = "sfr_[REDACTED]"


def scrub_api_key_tokens(text):
    """Replaces every API key value (sfr_ + body longer than the displayed prefix) in text with sfr_[REDACTED]."""
    return API_KEY_TOKEN_RE.sub(API_KEY_TOKEN_REPLACEMENT, text)


def scrub_api_key_query(url):
    """Replaces the value of every API key query parameter in url with [REDACTED] and every sfr_ key token anywhere in
    url with sfr_[REDACTED]; the rest of the URL is kept. Parameters are only looked for in the query part (after the
    first "?"): an "&" in the path is not a parameter separator."""
    head, sep, query = url.partition("?")
    if sep:
        url = head + sep + API_KEY_QUERY_RE.sub(r"\1[REDACTED]", query)
    return scrub_api_key_tokens(url)


def log_exception_info(logger, method_name, event_dict):
    """
    Replace an ``exc_info`` field by a ``message`` string field:
    """
    exc_info = event_dict.pop("exc_info", None)
    if exc_info:
        event_dict["message"] = _format_exception(_figure_out_exc_info(exc_info))

    return event_dict


def decompose_request_info(logger, method_name, event_dict):
    """

    :param logger:
    :param method_name:
    :param event_dict:
    :return:
    """
    req_obj = event_dict.pop("request", None)
    if req_obj is not None:
        # django-structlog 8.x binds the request URL as a string in many
        # contexts; older releases passed the full HttpRequest object.
        if hasattr(req_obj, "get_full_path"):
            event_dict["httpRequest"] = {
                "requestUrl": scrub_api_key_query(req_obj.get_full_path()),
                "requestMethod": req_obj.method,
            }
        else:
            event_dict["httpRequest"] = {"requestUrl": scrub_api_key_query(str(req_obj))}
    return event_dict


def add_severity(logger, method_name, event_dict):
    """

    :param logger:
    :param method_name:
    :param event_dict:
    :return:
    """
    event_dict["severity"] = method_name

    return event_dict
