import base64
import json

import pytest
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.http import Http404, HttpResponse
from django.test import RequestFactory

import sefaria.system.decorators as d
import sefaria.system.exceptions as e
from sefaria.decorators import webhook_auth_or_staff_required
from sefaria.system.middleware import ErrorBoundaryMiddleware

### Test Error Contract (classifier, decorators, error boundary) ###

INPUT_ERRORS = (
    e.InputError("You really shouldn't do that"),
    e.BookNameError("Unknown book"),
    e.PartialRefInputError("Ambiguous ref", "Genesis", ["Genesis 1", "Genesis 2"]),
    e.MissingKeyError("title"),
    e.SluggedMongoRecordMissingError("no sheet with that title"),
)

SYSTEM_FAULTS = (Exception("System Error!"), TypeError("'NoneType' is not subscriptable"), KeyError("title"))


def _view_raising(exception, decorator=None):
    def view(request):
        raise exception

    return decorator(view) if decorator else view


def _dispatch_through_error_boundary(request, exception):
    """Run `exception` from an undecorated view through the middleware's exception hook."""
    return ErrorBoundaryMiddleware(get_response=lambda req: None).process_exception(request, exception)


@pytest.mark.parametrize("exception", INPUT_ERRORS)
def test_error_boundary_answers_an_undecorated_api_view_with_the_json_error(request_factory, exception):
    response = _dispatch_through_error_boundary(request_factory.get("/api/search-path-filter/"), exception)
    assert isinstance(response, HttpResponse)
    assert response.status_code == 200
    assert json.loads(response.content) == {"error": str(exception)}


@pytest.mark.parametrize("exception", INPUT_ERRORS)
def test_error_boundary_answers_an_undecorated_page_with_404(request_factory, exception):
    with pytest.raises(Http404):
        _dispatch_through_error_boundary(request_factory.get("/sheets/54292"), exception)


@pytest.mark.parametrize("exception", [Http404("No such ref"), Http404()])
def test_error_boundary_leaves_http404_to_django(request_factory, exception):
    assert _dispatch_through_error_boundary(request_factory.get("/api/texts/"), exception) is None


@pytest.mark.parametrize("exception", SYSTEM_FAULTS)
def test_error_boundary_does_not_hide_a_system_fault(request_factory, exception):
    for path in ("/api/texts/", "/sheets/54292"):
        assert _dispatch_through_error_boundary(request_factory.get(path), exception) is None


def test_error_boundary_is_registered_inside_structlog():
    middleware = settings.MIDDLEWARE
    boundary = middleware.index("sefaria.system.middleware.ErrorBoundaryMiddleware")
    assert middleware.index("django_structlog.middlewares.RequestMiddleware") < boundary


@pytest.mark.parametrize("exception", INPUT_ERRORS)
def test_catch_error_as_json_answers_every_documented_input_error(request_factory, exception):
    response = _view_raising(exception, d.catch_error_as_json)(request_factory.get("/api/texts/"))
    assert response.status_code == 200
    assert json.loads(response.content) == {"error": str(exception)}


def test_catch_error_as_json_keeps_the_jsonp_callback(request_factory):
    response = _view_raising(e.InputError("bad"), d.catch_error_as_json)(
        request_factory.get("/api/texts/", {"callback": "cb"})
    )
    assert response.content == b'cb({"error": "bad"})'


@pytest.mark.parametrize("exception", (Http404("No such ref"),) + SYSTEM_FAULTS)
def test_catch_error_as_json_leaves_other_exceptions_to_django(request_factory, exception):
    with pytest.raises(type(exception)):
        _view_raising(exception, d.catch_error_as_json)(request_factory.get("/api/texts/"))


@pytest.mark.parametrize("exception", INPUT_ERRORS)
def test_catch_error_as_http_answers_input_error_with_404(request_factory, exception):
    with pytest.raises(Http404):
        _view_raising(exception, d.catch_error_as_http)(request_factory.get("/sheets/54292"))


def test_catch_error_as_http_re_raises_http404(request_factory):
    with pytest.raises(Http404):
        _view_raising(Http404("No such ref"), d.catch_error_as_http)(request_factory.get("/sheets/54292"))


def test_catch_error_as_http_still_sends_a_system_fault_to_the_generic_page(request_factory, monkeypatch):
    calls = {}

    def fake_render(request, template_name, context):
        calls["template_name"] = template_name
        calls["context"] = context
        return HttpResponse(status=200)

    monkeypatch.setattr(d, "render", fake_render)
    response = _view_raising(Exception("System Error!"), d.catch_error_as_http)(request_factory.get("/sheets/54292"))
    assert response.status_code == 200
    assert calls["template_name"] == "static/generic.html"
    assert "System Error!" in calls["context"]["content"]


### Test Decorator for Webhook Auth ###

# Constants for testing
VALID_USERNAME = "webhookuser1"
VALID_PASSWORD = "supersecret"


@pytest.fixture
def request_factory():
    return RequestFactory()


@pytest.fixture
def rf(request_factory):
    return request_factory


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
    assert response.status_code == 302


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
