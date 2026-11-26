"""URLconf of the developers host (developers.sefaria.org), selected by sefaria/hosts.py.

Module quarantine, rule Q1 (PLAN.md §2.2): this file includes no main-site view. It serves the
`devportal` app, the existing powered-by API, and the health checks, and has its own error handlers.
It does not include `shared_patterns`, `site_urlpatterns` or the reader catch-all, so the React 16
app, templates/base.html and every reader/sourcesheets view are unreachable on this host.
devportal/tests/module_quarantine_test.py enforces that.

The health views are wrapped so that importing this URLconf does not import `reader.views` (which
loads the library and so needs MongoDB); they import it on first call, as they would on any host.
"""

from django.urls import include, re_path

from powered_by.views import powered_by_api

handler404 = "devportal.views.errors.page_not_found"
handler500 = "devportal.views.errors.server_error"


def application_health(request):
    from reader.views import application_health_api  # noqa: PLC0415 - see the module docstring

    return application_health_api(request)


def rollout_health(request):
    from reader.views import rollout_health_api  # noqa: PLC0415 - see the module docstring

    return rollout_health_api(request)


urlpatterns = [
    re_path(r"^healthz/?$", application_health),
    re_path(r"^health-check/?$", application_health),
    re_path(r"^healthz-rollout/?$", rollout_health),
    re_path(r"^api/powered-by/?$", powered_by_api, name="powered_by_api"),  # as in sefaria/urls_shared.py
    # Last: devportal.urls ends with the portal's fallback route, which answers every other path.
    re_path(r"", include("devportal.urls")),
]
