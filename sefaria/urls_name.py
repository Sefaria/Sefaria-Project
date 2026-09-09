# -*- coding: utf-8 -*-
"""
URL configuration for the standalone name (autocomplete) service.

Active when settings.NAME_SERVICE is True: sefaria/hosts.py routes every host
to this URLconf instead of urls_library/urls_sheets, so a pod running with
NAME_SERVICE=true serves only the completion endpoints below.  nginx routes
these paths to the name service; everything else continues to the web stack.

/healthz is the always-200 liveness check: this service's dependencies (the
autocompleters) are guaranteed by the /healthz-rollout startup probe, and the
web /healthz view would fail here because name pods have no NodeJS sidecar.
"""
from django.urls import path, re_path
import reader.views as reader_views
import sefaria.views as sefaria_views
from sefaria.settings import DOWN_FOR_MAINTENANCE

urlpatterns = [
    path('api/name/<path:name>', reader_views.name_api),
    re_path(r'^api/opensearch-suggestions/?$', reader_views.opensearch_suggestions_api),
    path('api/words/completion/<path:word>/<path:lexicon>', reader_views.dictionary_completion_api),
    path('api/words/completion/<path:word>', reader_views.dictionary_completion_api),  # Search all dicts
    re_path(r'^search-autocomplete-redirecter/?$', reader_views.search_autocomplete_redirecter),
    re_path(r'^healthz/?$', reader_views.application_health_api_nonlibrary),
    re_path(r'^healthz-rollout/?$', reader_views.rollout_health_api),
]

if DOWN_FOR_MAINTENANCE:
    # Mirror urls_library: keep pods schedulable via the health routes, serve the
    # maintenance message for everything else.
    urlpatterns = [
        re_path(r'^healthz/?$', reader_views.application_health_api_nonlibrary),
        re_path(r'^healthz-rollout/?$', reader_views.rollout_health_api),
        re_path(r'.*', sefaria_views.maintenance_message),
    ]
