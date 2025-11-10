from django.conf.urls import url
from django.conf.urls import handler404, handler500
from django.contrib import admin
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
import sourcesheets.views as sheets_views
import reader.views as reader_views
import sefaria.views as sefaria_views
from sefaria.urls_shared import shared_patterns, maintenance_patterns
from sefaria.settings import DOWN_FOR_MAINTENANCE

admin.autodiscover()
handler500 = 'reader.views.custom_server_error'
handler404 = 'reader.views.custom_page_not_found'

urlpatterns = [
    url(r'^$', sheets_views.sheets_home_page, name='home'),
    url(r'sheets-with-ref/(?P<tref>.+)$', sheets_views.sheets_with_ref),
    url(r'^collections/?$', reader_views.public_collections),
    url(r'^collections/new$', reader_views.edit_collection_page),
    url(r'^collections/(?P<slug>[^.]+)/settings$', reader_views.edit_collection_page),
    url(r'^collections/(?P<slug>[^.]+)$', reader_views.collection_page),

    url(r'^sheets/?$', sheets_views.sheets_home_page, name='sheets'),
    url(r'^sheets/new/?$', sheets_views.new_sheet),
    url(r'^sheets/(?P<sheet_id>\d+)$', sheets_views.view_sheet),
    url(r'^sheets/visual/(?P<sheet_id>\d+)$', sheets_views.view_visual_sheet),
    url(r'^sheets/(?P<tref>[\d.]+)$', reader_views.catchall, {'sheet': True}),

    url(r'^my/profile', reader_views.my_profile),
    url(r'^profile/?$', reader_views.my_profile),
    url(r'^profile/(?P<username>[^/]+)/?$', reader_views.user_profile),
    url(r'^settings/profile/?$', reader_views.edit_profile),

]

urlpatterns += shared_patterns
if DOWN_FOR_MAINTENANCE:
    urlpatterns = maintenance_patterns
