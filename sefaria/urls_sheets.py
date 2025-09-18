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
    url(r'^$', reader_views.community_page),
    url(r'^community/?$', reader_views.community_page),
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
    url(r'^profile/(?P<username>[^/]+)/?$', reader_views.user_profile),
    url(r'^settings/profile?$', reader_views.edit_profile),

    url(fr'^login/?$', sefaria_views.CustomLoginView.as_view(), name='sheets_login'),
    url(fr'^register/?$', sefaria_views.register, name='sheets_register'),
    url(fr'logout/?$', sefaria_views.CustomLogoutView.as_view(), name='sheets_logout'),
    url(fr'password/reset/?$', sefaria_views.CustomPasswordResetView.as_view(), name='sheets_password_reset'),
    url(fr'password/reset/confirm/(?P<uidb64>[0-9A-Za-z_\-]+)/(?P<token>[0-9A-Za-z]{{1,13}}-[0-9A-Za-z]{{1,20}})/$',
        sefaria_views.CustomPasswordResetConfirmView.as_view(), name='sheets_password_reset_confirm'),
    url(fr'password/reset/complete/$', sefaria_views.CustomPasswordResetCompleteView.as_view(),
        name='sheets_password_reset_complete'),
    url(fr'password/reset/done/$', sefaria_views.CustomPasswordResetDoneView.as_view(),
        name='sheets_password_reset_done'),

    url(fr'api/login/$', TokenObtainPairView.as_view(), name='sheets_token_obtain_pair'),
    url(fr'api/login/refresh/$', TokenRefreshView.as_view(), name='sheets_token_refresh'),
]

urlpatterns += shared_patterns
if DOWN_FOR_MAINTENANCE:
    urlpatterns = maintenance_patterns
