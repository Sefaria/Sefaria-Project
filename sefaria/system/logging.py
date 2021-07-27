
from structlog.processors import _figure_out_exc_info
from structlog._frames import _format_exception


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
        event_dict["httpRequest"] = {
            "requestUrl": req_obj.get_full_path(),
            "requestMethod": req_obj.method
        }
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
