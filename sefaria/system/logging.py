
import re

from structlog.processors import _figure_out_exc_info
from structlog._frames import _format_exception

# Query parameters that carry an API key (api_key, apikey, api%5Fkey in any case). Their values never reach a log line.
API_KEY_QUERY_RE = re.compile(r"(?i)([?&]api(?:_|%5f)?key=)[^&#]*")


def scrub_api_key_query(url):
    """Replaces the value of every API key query parameter in url with [REDACTED]; the rest of the URL is kept."""
    return API_KEY_QUERY_RE.sub(r"\1[REDACTED]", url)


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
