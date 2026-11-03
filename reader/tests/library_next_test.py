"""
Tests for reader/library_next.py: which library page requests get the Library Next shell, the
sticky `library_next` cookie, and the props the shell receives.

reader/library_next.py imports nothing from Django or the model layer, so these tests use small
fakes and run without Django or Mongo:

    pytest --noconftest reader/tests/library_next_test.py
"""
import pytest

from reader.library_next import (
    LIBRARY_COOKIE, LIBRARY_COOKIE_MAX_AGE, LIBRARY_NEXT_PROP_KEYS, apply_library_next_cookie,
    library_next_props, library_next_route, resolve_mode, should_render_library_next,
)


class FakeRequest:
    def __init__(self, path="/texts", GET=None, COOKIES=None, method="GET", active_module="library",
                 interfaceLang="english"):
        self.path = path
        self.GET = GET or {}
        self.COOKIES = COOKIES or {}
        self.method = method
        self.active_module = active_module
        self.interfaceLang = interfaceLang

    def get_full_path(self):
        query = "&".join(f"{k}={v}" for k, v in self.GET.items())
        return self.path + ("?" + query if query else "")


class FakeResponse:
    def __init__(self):
        self.cookies = {}
        self.deleted = []

    def set_cookie(self, key, value, **kwargs):
        self.cookies[key] = (value, kwargs)

    def delete_cookie(self, key, **kwargs):
        self.deleted.append(key)


# resolve_mode

@pytest.mark.parametrize("default", [True, False])
def test_param_beats_everything(default):
    assert resolve_mode(FakeRequest(GET={"library": "next"}, COOKIES={LIBRARY_COOKIE: "0"}), default) is True
    assert resolve_mode(FakeRequest(GET={"library": "classic"}, COOKIES={LIBRARY_COOKIE: "1"}), default) is False


@pytest.mark.parametrize("default", [True, False])
def test_cookie_beats_default(default):
    assert resolve_mode(FakeRequest(COOKIES={LIBRARY_COOKIE: "1"}), default) is True
    assert resolve_mode(FakeRequest(COOKIES={LIBRARY_COOKIE: "0"}), default) is False


@pytest.mark.parametrize("default", [True, False])
def test_default_when_nothing_asked(default):
    assert resolve_mode(FakeRequest(), default) is default
    assert resolve_mode(FakeRequest(GET={"library": "bogus"}, COOKIES={LIBRARY_COOKIE: "x"}), default) is default


@pytest.mark.parametrize("default", [True, False])
def test_auto_ignores_cookie(default):
    assert resolve_mode(FakeRequest(GET={"library": "auto"}, COOKIES={LIBRARY_COOKIE: "0"}), default) is default


# cookie

def test_cookie_is_sticky_for_30_days():
    response = apply_library_next_cookie(FakeRequest(GET={"library": "next"}), FakeResponse())
    value, kwargs = response.cookies[LIBRARY_COOKIE]
    assert value == "1"
    assert kwargs["max_age"] == LIBRARY_COOKIE_MAX_AGE == 60 * 60 * 24 * 30
    assert kwargs["path"] == "/"

    response = apply_library_next_cookie(FakeRequest(GET={"library": "classic"}), FakeResponse())
    assert response.cookies[LIBRARY_COOKIE][0] == "0"


def test_auto_clears_cookie_and_other_requests_leave_it_alone():
    response = apply_library_next_cookie(FakeRequest(GET={"library": "auto"}), FakeResponse())
    assert response.deleted == [LIBRARY_COOKIE] and not response.cookies

    response = apply_library_next_cookie(FakeRequest(), FakeResponse())
    assert not response.deleted and not response.cookies


# should_render_library_next

def test_only_get_library_page_requests():
    assert should_render_library_next(FakeRequest(), True) is True
    assert should_render_library_next(FakeRequest(method="POST"), True) is False
    assert should_render_library_next(FakeRequest(path="/api/texts/Genesis.1"), True) is False
    assert should_render_library_next(FakeRequest(active_module="voices"), True) is False
    assert should_render_library_next(FakeRequest(GET={"library": "classic"}), True) is False


# decorator

def test_decorator_renders_shell_or_falls_through():
    calls = []

    def fake_render(request, route_name):
        calls.append(("shell", route_name))
        return "shell"

    @library_next_route("texts", render=fake_render, default=True)
    def view(request, cats=None):
        calls.append(("view", cats))
        return "classic"

    assert view(FakeRequest()) == "shell"
    assert view(FakeRequest(GET={"library": "classic"}), cats="Tanakh") == "classic"
    assert view(FakeRequest(active_module="voices")) == "classic"
    assert calls == [("shell", "texts"), ("view", "Tanakh"), ("view", None)]
    assert view.__name__ == "view"


def test_decorator_makes_classic_sticky_on_the_classic_path():
    @library_next_route("texts", render=lambda r, n: "shell", default=True)
    def view(request):
        return FakeResponse()

    response = view(FakeRequest(GET={"library": "classic"}))
    assert response.cookies[LIBRARY_COOKIE][0] == "0"


def test_decorator_default_off_needs_opt_in():
    @library_next_route("home", render=lambda r, n: "shell", default=False)
    def view(request):
        return "classic"

    assert view(FakeRequest()) == "classic"
    assert view(FakeRequest(COOKIES={LIBRARY_COOKIE: "1"})) == "shell"


# props

def test_props_are_minimal_and_cheap():
    request = FakeRequest(path="/Genesis.1", GET={"lang": "he"}, interfaceLang="hebrew")
    user = {"id": 7, "email": "a@b.c", "full_name": "Ada", "slug": "ada", "is_moderator": True}
    props = library_next_props(user, request, "ref", last_cached=123, app_version="v1",
                               chatbot={"chatbot_user_token": "tok", "chatbot_api_base_url": "https://x/api"})
    assert props["_uid"] == 7 and props["slug"] == "ada" and props["is_moderator"] is True
    assert props["interfaceLang"] == "hebrew"
    assert props["path"] == "/Genesis.1?lang=he"
    assert props["route"] == "ref" and props["libraryNext"] is True
    assert props["last_cached"] == 123 and props["appVersion"] == "v1"
    assert props["chatbot_user_token"] == "tok"
    for heavy in ("calendars", "notifications", "saved", "last_place", "multiPanel"):
        assert heavy not in props
    assert set(props) <= set(LIBRARY_NEXT_PROP_KEYS)


def test_props_for_anonymous_user():
    props = library_next_props(None, FakeRequest(), "home", last_cached=None, app_version="")
    assert props["_uid"] is None and props["_email"] == "" and props["is_moderator"] is False
