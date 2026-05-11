from django.urls import path, re_path
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
    path('', sheets_views.sheets_home_page, name='home'),
    path('sheets-with-ref/<path:tref>', sheets_views.sheets_with_ref),
    re_path(r'^collections/?$', reader_views.public_collections),
    path('collections/new', reader_views.edit_collection_page),
    re_path(r'^collections/(?P<slug>[^.]+)/settings$', reader_views.edit_collection_page),
    re_path(r'^collections/(?P<slug>[^.]+)$', reader_views.collection_page),

    re_path(r'^getstarted/?$', reader_views.serve_static, {'page': 'sheets'}, name='sheets'),
    re_path(r'^sheets/?$', reader_views.sheets_redirect_to_getstarted),
    re_path(r'^sheets/new/?$', sheets_views.new_sheet),
    path('sheets/<int:sheet_id>', sheets_views.view_sheet),
    path('sheets/visual/<int:sheet_id>', sheets_views.view_visual_sheet),
    re_path(r'^sheets/(?P<tref>[\d.]+)$', reader_views.catchall, {'sheet': True}),

    re_path(r'^my/profile', reader_views.my_profile),
    re_path(r'^profile/?$', reader_views.my_profile),
    re_path(r'^profile/(?P<username>[^/]+)/?$', reader_views.user_profile),
    re_path(r'^settings/profile/?$', reader_views.edit_profile),

]

urlpatterns += shared_patterns
if DOWN_FOR_MAINTENANCE:
    urlpatterns = maintenance_patterns
