from django.urls import path
from django.http import HttpResponseRedirect
import reader.views as reader_views


static_pages = [];

site_urlpatterns = [
    path('', reader_views.home, name="home"),
    # url(r'^(%s)/?$' % "|".join(static_pages), reader_views.serve_static),
]

