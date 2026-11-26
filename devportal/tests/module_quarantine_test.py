"""The module quarantine (PLAN.md §2.2 rules Q1-Q5, §5.3, Appendix A).

- Q1: every route of sefaria/urls_developers.py is a devportal view, powered_by.views.powered_by_api or
  a health check; no main-site URLconf or view is reachable on the developers host.
- Q2: the React app's domainModules keeps exactly the library and voices keys; developersURL and
  poweredByURL are new props, and sefaria.js unpacks them.
- Q3: _known_domain_hostnames() excludes the developers host.
- Q5: DevportalMiddleware runs after LanguageSettingsMiddleware, does nothing for other modules, and
  a portal response says Content-Language: en whatever the visitor's language signals.
"""

import ast
import json
import os
import re
import subprocess
import sys

import pytest
from django.http import HttpResponse
from django.test import RequestFactory, override_settings

from devportal.middleware import DevportalMiddleware
from sefaria.constants.model import DEVELOPERS_MODULE, LIBRARY_MODULE, VOICES_MODULE
from sefaria.utils import domains_and_languages as dl

from .portal_helpers import REPO_ROOT, portal_client

PRODUCTION = {
    "en": {
        "library": "https://www.sefaria.org",
        "voices": "https://voices.sefaria.org",
        "developers": "https://developers.sefaria.org",
    },
    "he": {"library": "https://www.sefaria.org.il", "voices": "https://chiburim.sefaria.org.il"},
}

# Q1, walked in a fresh interpreter with sefaria.settings (the real URLconf imports powered_by, which
# the standalone settings do not install). `reader.views` is replaced by a stub so the health
# wrappers can be called without MongoDB.
URLCONF_PROBE = r"""
import json, sys, types
import django
django.setup()
from django.http import HttpResponse
from django.urls import URLPattern, URLResolver
from django.test import RequestFactory

import sefaria.urls_developers as conf

loaded_at_import = sorted(m for m in sys.modules if m in ("reader.views", "sefaria.urls_shared",
    "sefaria.urls_library", "sefaria.urls_sheets", "sourcesheets.views", "sites.sefaria.urls"))

def walk(patterns, prefix=""):
    for p in patterns:
        if isinstance(p, URLResolver):
            yield from walk(p.url_patterns, prefix + str(p.pattern))
        else:
            cb = p.callback
            yield {"pattern": prefix + str(p.pattern), "module": cb.__module__, "name": cb.__qualname__}

stub = types.ModuleType("reader.views")
stub.application_health_api = lambda request: HttpResponse("health")
stub.rollout_health_api = lambda request: HttpResponse("rollout")
sys.modules["reader.views"] = stub
rf = RequestFactory()
print(json.dumps({
    "routes": list(walk(conf.urlpatterns)),
    "handler404": conf.handler404,
    "handler500": conf.handler500,
    "loaded_at_import": loaded_at_import,
    "health": conf.application_health(rf.get("/healthz")).content.decode(),
    "rollout": conf.rollout_health(rf.get("/healthz-rollout")).content.decode(),
}))
"""

ALLOWED_HEALTH = {("sefaria.urls_developers", "application_health"), ("sefaria.urls_developers", "rollout_health")}


@pytest.fixture(scope="module")
def urlconf_report(tmp_path_factory):
    env = {k: v for k, v in os.environ.items() if k not in ("DJANGO_SETTINGS_MODULE", "PYTHONPATH")}
    env.update({"DJANGO_SETTINGS_MODULE": "sefaria.settings", "PYTHONPATH": str(REPO_ROOT)})
    result = subprocess.run(
        [sys.executable, "-c", URLCONF_PROBE],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert result.returncode == 0, result.stderr[-4000:]
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_q1_every_developers_route_is_a_portal_powered_by_or_health_view(urlconf_report):
    routes = urlconf_report["routes"]
    assert routes, "sefaria/urls_developers.py has no routes"
    for route in routes:
        module, name = route["module"], route["name"]
        allowed = (
            module == "devportal"
            or module.startswith("devportal.")
            or (module, name) == ("powered_by.views", "powered_by_api")
            or (module, name) in ALLOWED_HEALTH
        )
        assert allowed, f"{route['pattern']!r} reaches {module}.{name}, which is not quarantine-safe"


def test_q1_the_developers_urlconf_serves_powered_by_health_mcp_and_the_portal(urlconf_report):
    by_view = {(r["module"], r["name"]): r["pattern"] for r in urlconf_report["routes"]}
    assert ("powered_by.views", "powered_by_api") in by_view
    assert ("devportal.mcp.django_view", "mcp_view") in by_view
    assert set(by_view) >= ALLOWED_HEALTH
    # The portal's fallback is the last route, so nothing after it can be reached.
    assert urlconf_report["routes"][-1]["module"] == "devportal.views.pages"


def test_q1_no_main_site_urlconf_or_reader_view_is_imported(urlconf_report):
    assert urlconf_report["loaded_at_import"] == []
    assert urlconf_report["handler404"] == "devportal.views.errors.page_not_found"
    assert urlconf_report["handler500"] == "devportal.views.errors.server_error"


def test_q1_health_wrappers_call_the_existing_health_views(urlconf_report):
    assert urlconf_report["health"] == "health"
    assert urlconf_report["rollout"] == "rollout"


# Q2 ------------------------------------------------------------------------------------------------


@override_settings(DOMAIN_MODULES=PRODUCTION, DEVPORTAL_CUTOVER_DONE=False)
def test_q2_client_domain_modules_keep_exactly_library_and_voices():
    modules = dl.client_domain_modules()
    assert set(modules) == {"en", "he"}
    for lang, keys in modules.items():
        assert set(keys) == {LIBRARY_MODULE, VOICES_MODULE}, lang
    assert modules["en"] == {"library": "https://www.sefaria.org", "voices": "https://voices.sefaria.org"}
    assert dl.developers_url() == "https://developers.sefaria.org"
    assert dl.powered_by_url() == "https://powered-by.sefaria.org"


@override_settings(DOMAIN_MODULES=PRODUCTION, DEVPORTAL_CUTOVER_DONE=True)
def test_q2_powered_by_url_moves_to_the_portal_at_cutover():
    assert dl.powered_by_url() == "https://developers.sefaria.org/powered-by"


@override_settings(
    DOMAIN_MODULES={
        "en": {
            "library": "https://www.rebuild.cauldron.sefaria.org",
            "developers": "https://developers.rebuild.cauldron.sefaria.org",
        }
    },
    DEVPORTAL_CUTOVER_DONE=False,
)
def test_q2_an_environment_with_its_own_portal_links_its_gallery_before_cutover():
    assert dl.has_own_developer_portal()
    assert dl.powered_by_url() == "https://developers.rebuild.cauldron.sefaria.org/powered-by"


@override_settings(DOMAIN_MODULES={"en": {"library": "http://localhost:8000"}}, DEVPORTAL_CUTOVER_DONE=True)
def test_q2_developers_url_defaults_to_production_when_not_configured():
    assert dl.developers_url() == "https://developers.sefaria.org"
    assert dl.powered_by_url() == "https://developers.sefaria.org/powered-by"


def _base_props_dict():
    tree = ast.parse((REPO_ROOT / "reader" / "views.py").read_text(encoding="utf-8"))
    func = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "base_props")
    for node in ast.walk(func):
        if isinstance(node, ast.Dict):
            keys = [k.value for k in node.keys if isinstance(k, ast.Constant)]
            if "domainModules" in keys:
                return dict(zip(keys, node.values, strict=False))
    raise AssertionError("base_props no longer sets domainModules")


def test_q2_base_props_passes_the_filtered_modules_and_the_two_new_urls():
    # base_props needs MongoDB to run, so its source is checked instead.
    props = _base_props_dict()
    expected = {
        "domainModules": "client_domain_modules",
        "developersURL": "developers_url",
        "poweredByURL": "powered_by_url",
    }
    for key, function in expected.items():
        value = props[key]
        assert isinstance(value, ast.Call) and getattr(value.func, "id", None) == function, key
    assert "DOMAIN_MODULES" not in ast.unparse(props["domainModules"])


def test_q2_sefaria_js_unpacks_the_new_props():
    source = (REPO_ROOT / "static" / "js" / "sefaria" / "sefaria.js").read_text(encoding="utf-8")
    block = re.search(r"Sefaria\.unpackBaseProps = function.*?const dataPassedAsProps = \[(.*?)\];", source, re.S)
    assert block, "unpackBaseProps not found"
    names = re.findall(r"'([^']+)'", block.group(1))
    assert {"domainModules", "developersURL", "poweredByURL"} <= set(names)


# Q3 ------------------------------------------------------------------------------------------------


@override_settings(DOMAIN_MODULES=PRODUCTION)
def test_q3_known_domain_hostnames_exclude_the_developers_host():
    hostnames = dl._known_domain_hostnames()
    assert "developers.sefaria.org" not in hostnames
    assert {"www.sefaria.org", "voices.sefaria.org", "www.sefaria.org.il", "chiburim.sefaria.org.il"} <= hostnames
    # So /wiki -> developers keeps no no_applink (sefaria/system/tests/test_middleware.py:975-979).
    assert dl.redirect_target_is_sefaria_domain("https://developers.sefaria.org/docs/welcome") is False


# Q5 ------------------------------------------------------------------------------------------------


def _settings_source():
    return (REPO_ROOT / "sefaria" / "settings.py").read_text(encoding="utf-8")


def test_q5_middleware_and_app_are_installed_in_sefaria_settings():
    source = _settings_source()
    language = source.index('"sefaria.system.middleware.LanguageSettingsMiddleware"')
    portal = source.index('"devportal.middleware.DevportalMiddleware"')
    assert language < portal < source.index('"django_hosts.middleware.HostsResponseMiddleware"')
    assert '"devportal.apps.DevportalConfig"' in source


@override_settings(MIDDLEWARE=["sefaria.system.middleware.ModuleMiddleware"])
@pytest.mark.parametrize("module", [LIBRARY_MODULE, VOICES_MODULE])
def test_q5_middleware_leaves_other_modules_alone(module):
    request = RequestFactory().get("/texts")
    request.active_module = module
    response = DevportalMiddleware(lambda r: HttpResponse("main site"))(request)
    for header in ("Content-Security-Policy", "Content-Language", "Link"):
        assert header not in response
    assert not hasattr(request, "devportal_nonce")


@override_settings(MIDDLEWARE=["sefaria.system.middleware.ModuleMiddleware"])
def test_q5_middleware_handles_the_developers_module():
    request = RequestFactory().get("/robots.txt")
    request.active_module = DEVELOPERS_MODULE
    response = DevportalMiddleware(lambda r: HttpResponse("x", content_type="text/plain"))(request)
    assert response["Content-Language"] == "en"
    assert "Content-Security-Policy" in response
    assert request.devportal_nonce


@pytest.mark.django_db
def test_q5_portal_response_is_english_for_a_hebrew_visitor():
    client = portal_client(HTTP_ACCEPT_LANGUAGE="he", HTTP_CF_IPCOUNTRY="IL")
    response = client.get("/robots.txt")
    assert response.status_code == 200
    assert response["Content-Language"] == "en"
