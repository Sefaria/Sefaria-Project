import base64
import pytest
import json

import sefaria.system.decorators as d
import sefaria.system.exceptions as e
from django.http import HttpResponse
from django.test import RequestFactory
from django.contrib.auth.models import AnonymousUser
from sefaria.decorators import webhook_auth_or_staff_required
from django.conf import settings

@d.catch_error_as_json
def call_user_error():
    return raise_user_error()


def raise_user_error():
    raise e.InputError("You really shouldn't do that")


@d.catch_error_as_json
def call_exception():
    return raise_exception()


def raise_exception():
    raise Exception("System Error!")

@pytest.mark.xfail(reason="unknown")
def test_catch_error():
    httpr = call_user_error()
    assert getattr(httpr, "content")
    r = json.loads(httpr.content)
    assert "error" in r
    assert r["error"] == "You really shouldn't do that"


def test_pass_exception():
    with pytest.raises(Exception):
        r = call_exception()

### Test Decorator for Webhook Auth ###

# Constants for testing
VALID_USERNAME = "webhookuser1"
VALID_PASSWORD = "supersecret"

@pytest.fixture
def rf():
    return RequestFactory()

@pytest.fixture(autouse=True)
def patch_credentials():
    settings.WEBHOOK_USERNAME = VALID_USERNAME
    settings.WEBHOOK_PASSWORD = VALID_PASSWORD

def dummy_view(request, *args, **kwargs):
    return HttpResponse("Success")

def get_basic_auth_header(username: str, password: str) -> dict:
    credentials = f"{username}:{password}"
    # Encode credentials to base64, b64encode expects bytes so we encode the string first
    encoded = base64.b64encode(credentials.encode()).decode()
    return {"HTTP_AUTHORIZATION": f"Basic {encoded}"}


def test_valid_basic_auth(rf):
    request = rf.get("/fake-endpoint/")
    request.META.update(get_basic_auth_header(VALID_USERNAME, VALID_PASSWORD))
    request.user = AnonymousUser()

    wrapped = webhook_auth_or_staff_required(dummy_view)
    response = wrapped(request)
    assert response.status_code == 200
    assert response.content == b"Success"


def test_invalid_basic_auth(rf):
    request = rf.get("/fake-endpoint/")
    request.META.update(get_basic_auth_header("wrong", "creds"))
    request.user = AnonymousUser()

    wrapped = webhook_auth_or_staff_required(dummy_view)
    response = wrapped(request)
    assert response.status_code == 401
    assert b"Invalid credentials" in response.content


def test_missing_auth_header_anonymous_user(rf):
    request = rf.get("/fake-endpoint/")
    request.user = AnonymousUser()

    wrapped = webhook_auth_or_staff_required(dummy_view)
    response = wrapped(request)
    assert response.status_code  == 302


def test_valid_staff_user(rf, django_user_model):
    user = django_user_model.objects.create_user(username="staff", password="pass", is_staff=True)
    request = rf.get("/fake-endpoint/")
    request.user = user

    wrapped = webhook_auth_or_staff_required(dummy_view)
    response = wrapped(request)
    assert response.status_code == 200
    assert response.content == b"Success"


def test_nonstaff_user_without_auth(rf, django_user_model):
    user = django_user_model.objects.create_user(username="nonstaff", password="pass", is_staff=False)
    request = rf.get("/fake-endpoint/")
    request.user = user

    wrapped = webhook_auth_or_staff_required(dummy_view)
    response = wrapped(request)
    assert response.status_code == 302
