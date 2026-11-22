import pytest
from django.contrib.sessions.backends.signed_cookies import SessionStore
from django.test import RequestFactory, override_settings

from sefaria.system.context_processors import design_system
from sefaria.utils.design_system import SESSION_KEY, design_system_preview, is_preview_ref, preview_allowed

HOSTS = ["localhost", "127.0.0.1", ".cauldron.sefaria.org", "sefariastaging.org", ".sefariastaging.org"]


def request_for(host, query="", path="/texts"):
    request = RequestFactory().get(f"{path}{query}", HTTP_HOST=host)
    request.session = SessionStore()
    return request


@pytest.mark.parametrize(
    "ref", ["main", "penina/new-colors", "48a1b6a", "48a1b6a0f2d1c9e8b7a6f5e4d3c2b1a098765432", "v1.2.0"]
)
def test_branch_names_and_commits_are_refs(ref):
    assert is_preview_ref(ref)


@pytest.mark.parametrize(
    "ref", ["", "../evil", "a/../b", "/main", "main/", "a//b", 'main"><script>', "a b", "x" * 101, None, "main\n"]
)
def test_anything_else_is_not(ref):
    assert not is_preview_ref(ref)


@override_settings(DESIGN_SYSTEM_PREVIEW_HOSTS=HOSTS, ALLOWED_HOSTS=["*"])
@pytest.mark.parametrize(
    "host,allowed",
    [
        ("localhost:8000", True),
        ("127.0.0.1:8000", True),
        ("LOCALHOST", True),
        ("WWW.SefariaStaging.org:443", True),
        ("sandbox-63f2029.cauldron.sefaria.org", True),
        ("www.sefariastaging.org", True),
        ("sefariastaging.org", True),
        ("www.sefaria.org", False),
        ("sefaria.org.il", False),
        ("cauldron.sefaria.org.evil.com", False),
        ("evilsefariastaging.org", False),
    ],
)
def test_only_listed_hosts_allow_previews(host, allowed):
    assert preview_allowed(host) is allowed


@override_settings(DESIGN_SYSTEM_PREVIEW_HOSTS=HOSTS, ALLOWED_HOSTS=["*"])
def test_the_preview_stays_in_the_session_until_cleared():
    request = request_for("localhost", "?design_system=penina/new-colors")
    assert design_system_preview(request) == "penina/new-colors"

    later = request_for("localhost")
    later.session = request.session
    assert design_system_preview(later) == "penina/new-colors"

    cleared = request_for("localhost", "?design_system=clear")
    cleared.session = request.session
    assert design_system_preview(cleared) is None
    assert SESSION_KEY not in cleared.session


@override_settings(DESIGN_SYSTEM_PREVIEW_HOSTS=HOSTS, ALLOWED_HOSTS=["*"])
def test_production_ignores_the_parameter():
    request = request_for("www.sefaria.org", "?design_system=main")
    assert design_system_preview(request) is None
    assert SESSION_KEY not in request.session


@override_settings(DESIGN_SYSTEM_PREVIEW_HOSTS=HOSTS, ALLOWED_HOSTS=["*"])
def test_an_invalid_ref_is_ignored():
    request = request_for("localhost", "?design_system=../evil")
    assert design_system_preview(request) is None


@override_settings(DESIGN_SYSTEM_PREVIEW_HOSTS=HOSTS, ALLOWED_HOSTS=["*"])
def test_a_stored_preview_is_ignored_on_production():
    request = request_for("www.sefaria.org")
    request.session[SESSION_KEY] = "main"
    assert design_system_preview(request) is None


@override_settings(DESIGN_SYSTEM_PREVIEW_HOSTS=HOSTS, ALLOWED_HOSTS=["*"])
def test_the_context_processor_runs_on_pages_but_not_the_api():
    assert design_system(request_for("localhost", "?design_system=main")) == {"design_system_preview": "main"}
    assert design_system(request_for("localhost", "?design_system=main", path="/api/texts/Genesis")) == {}


@override_settings(ALLOWED_HOSTS=["*"])
@pytest.mark.parametrize("host", ["www.sefaria.org", "sefaria.org", "www.sefaria.org.il", "sefaria.org.il"])
def test_the_real_settings_list_no_production_host(host):
    assert not preview_allowed(host)
