"""Root URLconf of the standalone dev server (devportal/dev/settings_standalone.py).

It mirrors what sefaria/urls_developers.py serves on the developers host, minus the main-site
health views, plus the Django admin (which deployed environments serve on the library host).
`/api/powered-by` is answered from the gallery's API snapshot instead of `powered_by.views`:
that view imports `sefaria.settings`, and the `powered_by` app's user signals import
`sefaria.model`, neither of which the standalone mode may load.
"""

import json
import logging
from pathlib import Path

from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse, JsonResponse
from django.urls import include, path
from django.views.decorators.http import require_GET

logger = logging.getLogger("devportal")

handler404 = "devportal.views.errors.page_not_found"
handler500 = "devportal.views.errors.server_error"


@require_GET
def powered_by_fixture(request):
    fixture = Path(settings.DEVPORTAL_STANDALONE_POWERED_BY_FIXTURE)
    try:
        data = json.loads(fixture.read_text(encoding="utf-8"))
    except FileNotFoundError:
        logger.warning("Powered-by fixture %s not found; answering with no projects", fixture)
        data = {"projects": []}
    return JsonResponse(data)


@require_GET
def healthz(request):
    return HttpResponse("ok", content_type="text/plain")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/powered-by", powered_by_fixture, name="powered_by_api"),
    path("healthz", healthz, name="healthz"),
    path("health-check", healthz, name="health_check"),
    path("", include("devportal.urls")),
]
