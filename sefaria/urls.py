from django.conf.urls import patterns, include, url
from django.conf.urls.defaults import *
from django.contrib import admin
from emailusernames.forms import EmailAuthenticationForm
from sefaria.forms import HTMLPasswordResetForm

admin.autodiscover()

# Texts API
urlpatterns = patterns('reader.views',
    (r'^texts/(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.*)$', 'texts_api'),
    (r'^texts/(?P<ref>.+)$', 'texts_api'),
    (r'^index/$', 'table_of_contents_api'),
    (r'^index/titles/$', 'text_titles_api'),
    (r'^index/(?P<title>.*)$', 'index_api'),
    (r'^links/(?P<link_id>.*)$', 'links_api'),
    (r'^notes/(?P<note_id>.*)$', 'notes_api'),
)


# Source Sheets
urlpatterns += patterns('sheets.views',
    (r'^sheets$', 'new_sheet'),
    (r'^sheets/(?P<sheet_id>.*)$', 'view_sheet'),
    (r'^api/sheets/$', 'sheet_list_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/add$', 'add_to_sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)$', 'sheet_api'),
    (r'^api/sheets/user/(?P<user_id>\d+)$', 'user_sheet_list_api'),
)

# Activity 
urlpatterns += patterns('reader.views',
    (r'^activity/?$', 'global_activity'),
    (r'^activity/(?P<page>\d+)$', 'global_activity'),
    (r'^activity/(?P<ref>.*)/(?P<lang>.*)/(?P<version>.*)$', 'segment_history'),
    (r'^api/revert/(?P<ref>.*)/(?P<lang>.*)/(?P<version>.*)/(?P<revision>\d+)$', 'revert_api'),
)

# Registration
urlpatterns += patterns('',
    url(r'^accounts/?$', 'sefaria.views.accounts', name='accounts'),
    url(r'^login/?$', 'django.contrib.auth.views.login', 
        {'authentication_form': EmailAuthenticationForm}, name='login'),
    url(r'^logout/?$', 'django.contrib.auth.views.logout', name='logout'),
    url(r'^register/?$', 'sefaria.views.register', name='register'),
    url(r'^password/reset/?$', 'django.contrib.auth.views.password_reset', {'password_reset_form': HTMLPasswordResetForm}, name='password_reset'),
    url(r'^password/reset/confirm/(?P<uidb36>[0-9A-Za-z]+)-(?P<token>.+)/$', 'django.contrib.auth.views.password_reset_confirm', name='password_reset_confirm'),
    url(r'^password/reset/complete/$', 'django.contrib.auth.views.password_reset_complete', name='password_reset_complete'),
    url(r'^password/reset/done/$', 'django.contrib.auth.views.password_reset_done', name='password_reset_done'),
)

# Static Content 
urlpatterns += patterns('reader.views', 
    (r'^$', 'splash'),
    (r'^forum/?$', 'forum'),
    (r'^contribute/?$', 'contribute_page')
)

# Admin 
urlpatterns += patterns('', 
    (r'^admin/', include(admin.site.urls)),
)

# Catch all to send to Reader
urlpatterns += patterns('reader.views', 
    (r'^(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.*)$', 'reader'),
    (r'^(?P<ref>.+)$', 'reader')
)