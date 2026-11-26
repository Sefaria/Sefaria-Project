"""Host wiring (PLAN.md §2.2 step 2, §5.3): each configured host resolves to its URLconf, and a
language without a voices (or developers) module no longer breaks sefaria/hosts.py.

The host table is built by `sefaria.hosts.build_host_patterns`, tested here with explicit
configurations so the test runs under the standalone settings too. Under sefaria.settings the module's
own `host_patterns` is also checked against the configured DOMAIN_MODULES.
"""

import importlib

import pytest
from django.conf import settings

from sefaria.constants.model import DEVELOPERS_MODULE, LIBRARY_MODULE, VOICES_MODULE
from sefaria.hosts import build_host_patterns, module_host_regexes

PRODUCTION = {
    "en": {
        "library": "https://www.sefaria.org",
        "voices": "https://voices.sefaria.org",
        "developers": "https://developers.sefaria.org",
    },
    "he": {
        "library": "https://www.sefaria.org.il",
        "voices": "https://chiburim.sefaria.org.il",
    },
}
LOCAL = {
    "en": {
        "library": "http://localhost:8000",
        "voices": "http://voices.localhost:8000",
        "developers": "http://developers.localhost:8000",
    },
    "he": {"library": "http://localhost:8000", "voices": "http://voices.localhost:8000"},
}
URLCONFS = {
    LIBRARY_MODULE: "sefaria.urls_library",
    VOICES_MODULE: "sefaria.urls_sheets",
    DEVELOPERS_MODULE: "sefaria.urls_developers",
}


def resolve_host(host_patterns, request_host):
    """What django_hosts' HostsRequestMiddleware does: the first host whose regex matches."""
    for candidate in host_patterns:
        if candidate.compiled_regex.match(request_host):
            return candidate.name, candidate.urlconf
    return None, None


@pytest.mark.parametrize(
    ("config", "request_host", "module"),
    [
        (PRODUCTION, "www.sefaria.org", LIBRARY_MODULE),
        (PRODUCTION, "voices.sefaria.org", VOICES_MODULE),
        (PRODUCTION, "developers.sefaria.org", DEVELOPERS_MODULE),
        (PRODUCTION, "www.sefaria.org.il", LIBRARY_MODULE),
        (PRODUCTION, "chiburim.sefaria.org.il", VOICES_MODULE),
        (LOCAL, "localhost:8000", LIBRARY_MODULE),
        (LOCAL, "voices.localhost:8000", VOICES_MODULE),
        (LOCAL, "developers.localhost:8000", DEVELOPERS_MODULE),
    ],
)
def test_each_configured_host_resolves_to_its_urlconf(config, request_host, module):
    assert resolve_host(build_host_patterns(config), request_host) == (module, URLCONFS[module])


def test_library_comes_first_and_developers_only_where_configured():
    regexes = module_host_regexes(PRODUCTION)
    assert list(regexes) == [LIBRARY_MODULE, VOICES_MODULE, DEVELOPERS_MODULE]
    assert regexes[DEVELOPERS_MODULE] == r"developers\.sefaria\.org"
    assert regexes[LIBRARY_MODULE] == r"www\.sefaria\.org|www\.sefaria\.org\.il"


def test_hostnames_shared_by_languages_appear_once():
    assert module_host_regexes(LOCAL)[LIBRARY_MODULE] == "localhost:8000"


def test_a_language_without_voices_or_developers_does_not_break_the_host_table():
    config = {"en": {"library": "https://www.sefaria.org"}, "he": {"library": "https://www.sefaria.org.il"}}
    patterns = build_host_patterns(config)
    assert [h.name for h in patterns] == [LIBRARY_MODULE]


def test_a_module_no_language_configures_gets_no_host():
    config = {"en": {"library": "https://www.sefaria.org", "voices": "https://voices.sefaria.org"}}
    assert DEVELOPERS_MODULE not in module_host_regexes(config)


@pytest.mark.parametrize("module_name", ["sefaria.local_settings_example", "sefaria.local_settings_ci"])
def test_local_settings_configure_developers_under_en_only(module_name):
    local = importlib.import_module(module_name)
    assert local.DOMAIN_MODULES["en"][DEVELOPERS_MODULE] == "http://developers.localhost:8000"
    for lang, modules in local.DOMAIN_MODULES.items():
        if lang != "en":
            assert DEVELOPERS_MODULE not in modules, f"{module_name}: never add developers under {lang!r}"
    assert "developers.localhost" in local.ALLOWED_HOSTS
    patterns = build_host_patterns(local.DOMAIN_MODULES)
    assert resolve_host(patterns, "developers.localhost:8000")[1] == "sefaria.urls_developers"


@pytest.mark.skipif(not getattr(settings, "DOMAIN_MODULES", None), reason="sefaria.settings only")
def test_the_configured_host_table_routes_the_developers_host():
    from sefaria import hosts  # noqa: PLC0415

    assert settings.DEFAULT_HOST == LIBRARY_MODULE
    assert hosts.host_patterns[0].name == LIBRARY_MODULE
    developers = settings.DOMAIN_MODULES["en"].get(DEVELOPERS_MODULE)
    if developers:
        from urllib.parse import urlparse  # noqa: PLC0415

        assert resolve_host(hosts.host_patterns, urlparse(developers).netloc)[1] == "sefaria.urls_developers"
