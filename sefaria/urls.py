from django.conf.urls import patterns, include, url
from django.conf.urls.defaults import *
from django.contrib import admin
from django.http import HttpResponseRedirect
from emailusernames.forms import EmailAuthenticationForm
from sefaria.forms import HTMLPasswordResetForm
from sefaria.settings import DOWN_FOR_MAINTENANCE

admin.autodiscover()

# Texts API
urlpatterns = patterns('reader.views',
    (r'^api/texts/versions/(?P<ref>.+)$', 'versions_api'),
    (r'^api/texts/(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'texts_api'),
    (r'^api/texts/(?P<ref>.+)$', 'texts_api'),
    (r'^api/index/?$', 'table_of_contents_api'),
    (r'^api/index/list/?$', 'table_of_contents_list_api'),
    (r'^api/index/titles/?$', 'text_titles_api'),
    (r'^api/counts/(?P<title>.+)$', 'counts_api'),
    (r'^api/index/(?P<title>.+)$', 'index_api'),
    (r'^api/links/(?P<link_id>.*)$', 'links_api'),
    (r'^api/notes/(?P<note_id>.+)$', 'notes_api'),
    (r'^api/history/(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'texts_history_api'),
    (r'^api/history/(?P<ref>.+)$', 'texts_history_api'),
)

# Locks API
urlpatterns += patterns('reader.views',
    (r'^api/locks/set/(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'set_lock_api'),
    (r'^api/locks/release/(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'release_lock_api'),
    (r'^api/locks/check/(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'check_lock_api'),
)

# Campaigns 
urlpatterns += patterns('reader.views',
    (r'^translate/(?P<ref>.+)$', 'translation_flow'),
    (r'^contests/(?P<slug>.+)$', 'contest_splash'),
    (r'^mishnah-contest-2013/?$', lambda x: HttpResponseRedirect('/contests/mishnah-contest-2013')),
)

# Texts Add / Edit / Translate
urlpatterns += patterns('reader.views',
    (r'^add/new/?$', 'edit_text'),
    (r'^add/new/(?P<new_name>.+)$', 'edit_text'),
    (r'^add/(?P<ref>.+)$', 'edit_text'),
    (r'^translate/(?P<ref>.+)$', 'edit_text'),
    (r'^edit/(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'edit_text'),
)

# Texts Page
urlpatterns += patterns('reader.views',
    (r'^texts/?$', 'texts_list'),
)

# Search Page
urlpatterns += patterns('reader.views',
    (r'^search/?$', 'search'),
)

# Source Sheets & Topics
urlpatterns += patterns('sheets.views',
    (r'^sheets/?$', 'sheets_list'),
    (r'^sheets/new?$', 'new_sheet'),
    (r'^sheets/(?P<type>(public|private|allz))/?$', 'sheets_list'),
    (r'^sheets/(?P<sheet_id>\d+)$', 'view_sheet'),
    (r'^topics/?$', 'topics_list'),
    (r'^topics/(?P<topic>.+)$', 'topic_view'),
    (r'^api/sheets/$', 'sheet_list_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/delete$', 'delete_sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/add$', 'add_source_to_sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/add_ref$', 'add_ref_to_sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/copy_source$', 'copy_source_to_sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)$', 'sheet_api'),
    (r'^api/sheets/user/(?P<user_id>\d+)$', 'user_sheet_list_api'),
    (r'^api/sheets/modified/(?P<sheet_id>\d+)/(?P<timestamp>.+)$', 'check_sheet_modified_api'),

)

# Activity 
urlpatterns += patterns('reader.views',
    (r'^activity/?$', 'global_activity'),
    (r'^activity/(?P<page>\d+)$', 'global_activity'),
    (r'^activity/(?P<ref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)$', 'segment_history'),
    (r'^api/revert/(?P<ref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)/(?P<revision>\d+)$', 'revert_api'),
)

# Profiles 
urlpatterns += patterns('reader.views',
    (r'^contributors/(?P<username>[^/]+)(/(?P<page>\d+))?$', 'user_profile'),
    (r'^acapi/profile$', 'profile_api'),
)

# Partners 
urlpatterns += patterns('sheets.views',
    (r'^partners/(?P<partner>.+)$', 'partner_page'),
)

# Registration
urlpatterns += patterns('',
    url(r'^login/?$', 'sefaria.views.login', {'authentication_form': EmailAuthenticationForm}, name='login'),
    url(r'^logout/?$', 'django.contrib.auth.views.logout', {'next_page': '/', 'redirect_field_name': 'next'}, name='logout'),
    url(r'^register/?$', 'sefaria.views.register', name='register'),
    url(r'^password/reset/?$', 'django.contrib.auth.views.password_reset', {'password_reset_form': HTMLPasswordResetForm}, name='password_reset'),
    url(r'^password/reset/confirm/(?P<uidb36>[0-9A-Za-z]+)-(?P<token>.+)/$', 'django.contrib.auth.views.password_reset_confirm', name='password_reset_confirm'),
    url(r'^password/reset/complete/$', 'django.contrib.auth.views.password_reset_complete', name='password_reset_complete'),
    url(r'^password/reset/done/$', 'django.contrib.auth.views.password_reset_done', name='password_reset_done'),
)

# Static Content 
urlpatterns += patterns('reader.views', 
    url(r'^$', 'splash', name="home"),
    (r'^splash/?$', 'splash'),
    (r'^metrics/?$', 'metrics'),
    (r'^(contribute|educators|developers|faq|donate|translation-guidelines|transliteration-guidelines|even-haezer-guidelines|related-projects|jobs|terms|privacy-policy|meetup1|meetup2)/?$', 'serve_static'),
)

# Redirect to Forum
urlpatterns += patterns('',
    (r'^forum/?$', lambda x: HttpResponseRedirect('https://groups.google.com/forum/?fromgroups#!forum/sefaria'))
)

# Email Subscribe 
urlpatterns += patterns('sefaria.views', 
    (r'^api/subscribe/(?P<email>.+)$', 'subscribe'),
)


# Admin 
urlpatterns += patterns('', 
    (r'^admin/reset/cache', 'sefaria.views.reset_cache'),
    (r'^admin/reset/counts', 'sefaria.views.reset_counts'),
    (r'^admin/?', include(admin.site.urls)),
)

# Catch all to send to Reader
urlpatterns += patterns('reader.views', 
    (r'^(?P<ref>[^/]+)/(?P<lang>\w\w)/(?P<version>.*)$', 'reader'),
    (r'^(?P<ref>[^/]+)(/)?$', 'reader')
)

if DOWN_FOR_MAINTENANCE:
    # Keep admin accessible
    urlpatterns = patterns('', 
        (r'^admin/reset/cache', 'sefaria.views.reset_cache'),
        (r'^admin/?', include(admin.site.urls)),
    )
    # Everything else gets maintenance message
    urlpatterns += patterns('sefaria.views',
        (r'.*', 'maintenance_message')
    )


