from django.conf.urls import url
from django.http import HttpResponseRedirect
import reader.views as reader_views


static_pages = ["about"]

site_urlpatterns = [
    url(r'^$', reader_views.home, name="home"),
    url(r'^healthz/?$', reader_views.application_health_api_nonlibrary),
    url(r'^health-check/?$', reader_views.application_health_api_nonlibrary),
    url(r'^healthz-rollout/?$', reader_views.rollout_health_api),
    url(r'^(%s)/?$' % "|".join(static_pages), reader_views.serve_static),
    url(r'^enable_new_editor/?$', reader_views.enable_new_editor),
    url(r'^disable_new_editor/?$', reader_views.disable_new_editor),
]

