from django.conf.urls import patterns, include, url

urlpatterns = patterns('reader.views',
	(r'^$', 'reader'),
	(r'^demo/(?P<ref>.*)', 'reader'),
    (r'^texts/(?P<ref>.*)', 'texts_api'),
    (r'^index/$', 'table_of_content_api'),
    (r'^index/titles/$', 'text_titles_api'),
    (r'^index/(?P<title>.*)$', 'index_api'),
    (r'^links/(?P<link_id>.*)$', 'links_api'),
    (r'^notes/(?P<note_id>.*)$', 'notes_api'),

)

urlpatterns += patterns('sheets.views',
    (r'^sheets/$', 'new_sheet'),
    (r'^sheets/(?P<sheet_id>.*)$', 'view_sheet'),
    (r'^api/sheets/(?P<sheet_id>\d+)$', 'sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/add$', 'add_to_sheet_api'),

)
