
import re

from structlog.processors import _figure_out_exc_info
from structlog._frames import _format_exception

# Query parameters that carry an API key: api_key or apikey, every letter and the underscore written literally (any
# case) or percent-encoded (any hex case). A name counts only at the start of the query or right after an "&".
# The value runs to the next "&" or the end, a "#" included (Django keeps it in get_full_path()). Values never reach a log line.
API_KEY_QUERY_RE = re.compile(
    r"(?i)((?:^|&)(?:a|%61|%41)(?:p|%70|%50)(?:i|%69|%49)(?:_|%5f)?(?:k|%6b|%4b)(?:e|%65|%45)(?:y|%79|%59)=)[^&]*"
)


def scrub_api_key_query(url):
    """Replaces the value of every API key query parameter in url with [REDACTED]; the rest of the URL is kept.
    Only the query part (after the first "?") is scrubbed: an "&" in the path is not a parameter separator."""
    head, sep, query = url.partition("?")
    if not sep:
        return url
    return head + sep + API_KEY_QUERY_RE.sub(r"\1[REDACTED]", query)


def log_exception_info(logger, method_name, event_dict):
    """
    Replace an ``exc_info`` field by a ``message`` string field:
    """
    exc_info = event_dict.pop("exc_info", None)
    if exc_info:
        event_dict["message"] = _format_exception(
            _figure_out_exc_info(exc_info)
        )

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
