import json
from unittest import mock
from unittest.mock import patch, MagicMock

import pytest
import requests

from sefaria.helper.crm.tasks import (
    dispatch_chatbot_opt_in_webhook,
    send_chatbot_opt_in_webhook,
    extract_error_detail,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_mock_response(status_code=200, json_body=None, text=""):
    resp = MagicMock(spec=requests.Response)
    resp.status_code = status_code
    resp.text = text
    if json_body is not None:
        resp.json.return_value = json_body
    else:
        resp.json.side_effect = ValueError("No JSON")
    resp.raise_for_status.return_value = None
    return resp


def make_http_error(status_code=500, json_body=None, text=""):
    resp = make_mock_response(status_code, json_body, text)
    resp.raise_for_status.side_effect = requests.HTTPError(response=resp)
    err = requests.HTTPError(response=resp)
    return resp, err


# ---------------------------------------------------------------------------
# extract_error_detail
# ---------------------------------------------------------------------------

def test_extract_error_detail_json_error_key():
    _, err = make_http_error(422, json_body={"success": False, "error": "Bad email"})
    assert extract_error_detail(err) == "Bad email"


def test_extract_error_detail_plain_text_body():
    _, err = make_http_error(500, text="FlowException: something broke")
    assert "FlowException" in extract_error_detail(err)


def test_extract_error_detail_generic_exception():
    err = ConnectionError("connection refused")
    assert extract_error_detail(err) == "connection refused"


# ---------------------------------------------------------------------------
# send_chatbot_opt_in_webhook
# ---------------------------------------------------------------------------

@patch("sefaria.helper.crm.tasks.requests.post")
def test_webhook_success(mock_post):
    mock_post.return_value = make_mock_response(200, json_body={"success": True})

    result = send_chatbot_opt_in_webhook.apply(args=["user@example.com", True, "english"])

    assert result.successful()
    mock_post.assert_called_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["data"]["email"] == "user@example.com"
    assert payload["data"]["optIn"] is True
    assert payload["data"]["interfaceLanguage"] == "english"
    assert "id" in payload


@patch("sefaria.helper.crm.tasks.requests.post")
def test_webhook_success_false_triggers_retry(mock_post):
    mock_post.return_value = make_mock_response(
        200, json_body={"success": False, "error": "invalid email"}
    )

    send_chatbot_opt_in_webhook.apply(args=["user@example.com", True, "english"])

    # initial attempt + 1 retry = 2 calls
    assert mock_post.call_count == 2


@patch("sefaria.helper.crm.tasks.sentry_sdk.capture_exception")
@patch("sefaria.helper.crm.tasks.requests.post")
def test_webhook_final_failure_reports_to_sentry(mock_post, mock_capture):
    mock_post.side_effect = ConnectionError("connection refused")

    send_chatbot_opt_in_webhook.apply(args=["user@example.com", True, "english"])

    assert mock_post.call_count == 2
    mock_capture.assert_called_once()


@patch("sefaria.helper.crm.tasks.sentry_sdk.capture_exception")
@patch("sefaria.helper.crm.tasks.requests.post")
def test_webhook_http_500_flow_exception(mock_post, mock_capture):
    resp = make_mock_response(500, text="FlowException: bad input")
    resp.raise_for_status.side_effect = requests.HTTPError(response=resp)
    mock_post.return_value = resp

    send_chatbot_opt_in_webhook.apply(args=["user@example.com", True, "english"])

    assert mock_post.call_count == 2
    mock_capture.assert_called_once()


@patch("sefaria.helper.crm.tasks.requests.post")
def test_webhook_first_fail_second_succeeds(mock_post):
    fail_resp = make_mock_response(500, text="error")
    fail_resp.raise_for_status.side_effect = requests.HTTPError(response=fail_resp)
    ok_resp = make_mock_response(200, json_body={"success": True})

    mock_post.side_effect = [fail_resp, ok_resp]

    result = send_chatbot_opt_in_webhook.apply(args=["user@example.com", True, "english"])

    assert mock_post.call_count == 2
    assert result.successful()


@patch("sefaria.helper.crm.tasks.requests.post")
def test_webhook_opt_out_sends_false(mock_post):
    mock_post.return_value = make_mock_response(200, json_body={"success": True})

    send_chatbot_opt_in_webhook.apply(args=["user@example.com", False, "hebrew"])

    payload = mock_post.call_args.kwargs["json"]
    assert payload["data"]["optIn"] is False
    assert payload["data"]["interfaceLanguage"] == "hebrew"


@patch("sefaria.helper.crm.tasks.sentry_sdk.capture_exception")
@patch("sefaria.helper.crm.tasks.requests.post")
def test_webhook_rejects_get_with_400(mock_post, mock_capture):
    """Salesforce returns 400 Bad Request on GET — verify error handling path."""
    resp = make_mock_response(
        400, json_body={"success": False, "error": "GET not supported"}
    )
    resp.raise_for_status.side_effect = requests.HTTPError(response=resp)
    mock_post.return_value = resp

    send_chatbot_opt_in_webhook.apply(args=["user@example.com", True, "english"])

    assert mock_post.call_count == 2
    mock_capture.assert_called_once()


# ---------------------------------------------------------------------------
# dispatch_chatbot_opt_in_webhook
# ---------------------------------------------------------------------------

@patch("sefaria.helper.crm.tasks.send_chatbot_opt_in_webhook")
@patch("sefaria.helper.crm.tasks.requests.post")
def test_dispatch_is_deactivated(mock_post, mock_task):
    # The webhook is deactivated while comms has no use for the opt-in signal —
    # nothing may reach Salesforce through either the Celery or the sync path.
    for celery_enabled in (True, False):
        with patch("sefaria.helper.crm.tasks.CELERY_ENABLED", celery_enabled):
            dispatch_chatbot_opt_in_webhook("user@example.com", True, "english")

    mock_task.apply_async.assert_not_called()
    mock_post.assert_not_called()


# The tests below flip the deactivation flag off: the machinery is kept as a working
# reference, and these prove it still works for the next experiment that needs it.

@patch("sefaria.helper.crm.tasks.CHATBOT_OPT_IN_WEBHOOK_DEACTIVATED", False)
@patch("sefaria.helper.crm.tasks.send_chatbot_opt_in_webhook")
def test_dispatch_celery_enabled_uses_apply_async(mock_task):
    with patch("sefaria.helper.crm.tasks.CELERY_ENABLED", True):
        dispatch_chatbot_opt_in_webhook("user@example.com", True, "english")

    mock_task.apply_async.assert_called_once()


@patch("sefaria.helper.crm.tasks.CHATBOT_OPT_IN_WEBHOOK_DEACTIVATED", False)
@patch("sefaria.helper.crm.tasks.requests.post")
def test_dispatch_celery_disabled_calls_synchronously(mock_post):
    mock_post.return_value = make_mock_response(200, json_body={"success": True})

    with patch("sefaria.helper.crm.tasks.CELERY_ENABLED", False):
        dispatch_chatbot_opt_in_webhook("user@example.com", True, "hebrew")

    mock_post.assert_called_once()


@patch("sefaria.helper.crm.tasks.CHATBOT_OPT_IN_WEBHOOK_DEACTIVATED", False)
def test_dispatch_empty_email_is_noop():
    with patch("sefaria.helper.crm.tasks.requests.post") as mock_post:
        dispatch_chatbot_opt_in_webhook("", True)
        dispatch_chatbot_opt_in_webhook(None, True)  # type: ignore[arg-type]  # intentionally testing runtime guard against out-of-contract callers

    mock_post.assert_not_called()
