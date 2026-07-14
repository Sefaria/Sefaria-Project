from django.urls import path, re_path
from django.http import HttpResponseRedirect
import reader.views as reader_views


static_pages = [];

site_urlpatterns = [
    path('', reader_views.home, name="home"),
    re_path(r'^healthz/?$', reader_views.application_health_api_nonlibrary),
    re_path(r'^health-check/?$', reader_views.application_health_api_nonlibrary),
    re_path(r'^healthz-rollout/?$', reader_views.rollout_health_api),
    # url(r'^(%s)/?$' % "|".join(static_pages), reader_views.serve_static),
]

