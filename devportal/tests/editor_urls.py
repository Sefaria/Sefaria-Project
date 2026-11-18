"""Test URLconf: the editor routes in front of the standalone URLconf (see editor_helpers.py).

Mirrors where devportal/urls.py must include them: before `^_portal/` (the JSON 404) and the page fallback.
"""

from devportal.dev import urls_standalone
from devportal.views.editor_api import urlpatterns as editor_urlpatterns

handler404 = urls_standalone.handler404
handler500 = urls_standalone.handler500

urlpatterns = [*editor_urlpatterns, *urls_standalone.urlpatterns]
