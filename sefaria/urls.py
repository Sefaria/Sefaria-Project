from django.conf.urls import patterns, include, url
from django.conf.urls.defaults import *


# Reader and texts API
urlpatterns = patterns('reader.views',
    (r'^$', 'reader'),
	(r'^demo/(?P<ref>.*)', 'reader'),
    (r'^texts/(?P<ref>.*)', 'texts_api'),
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
)

# Registration
urlpatterns += patterns('',
    (r'^accounts/login/?$', 'django.contrib.auth.views.login'),
    (r'^accounts/logout/?$', 'django.contrib.auth.views.logout'),
    (r'^accounts/register/?', 'sefaria.views.register')
)


# Static Content 
urlpatterns += patterns('reader.views', 
    (r'^contribute$', 'contribute_page'))

# Catch all to send to Reader
urlpatterns += patterns('reader.views', (r'^(?P<ref>.+)$', 'reader'))