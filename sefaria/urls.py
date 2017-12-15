from django.conf.urls import patterns, include, url
from django.conf.urls.defaults import *
from django.contrib import admin
from django.http import HttpResponseRedirect

from emailusernames.forms import EmailAuthenticationForm

from sefaria.forms import HTMLPasswordResetForm, SefariaLoginForm
from sefaria.settings import DOWN_FOR_MAINTENANCE

admin.autodiscover()
handler500 = 'reader.views.custom_server_error'

# Texts API
urlpatterns = patterns('reader.views',
    (r'^api/texts/versions/(?P<tref>.+)$', 'versions_api'),
    (r'^api/texts/version-status/tree/?(?P<lang>.*)?/?$', 'version_status_tree_api'),
    (r'^api/texts/version-status/?$', 'version_status_api'),
    (r'^api/texts/parashat_hashavua$', 'parashat_hashavua_api'),
    (r'^api/texts/random?$', 'random_text_api'),
    (r'^api/texts/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'old_text_versions_api_redirect'),
    (r'^api/texts/(?P<tref>.+)$', 'texts_api'),
    (r'^api/index/?$', 'table_of_contents_api'),
    (r'^api/search-filter-index/?$', 'search_filter_table_of_contents_api'),
    (r'^api/index/titles/?$', 'text_titles_api'),
    (r'^api/v2/raw/index/(?P<title>.+)$', 'index_api', {'v2': True, 'raw': True}),
    (r'^api/v2/index/(?P<title>.+)$', 'index_api', {'v2': True}),
    (r'^api/index/(?P<title>.+)$', 'index_api'),
    (r'^api/links/bare/(?P<book>.+)/(?P<cat>.+)$', 'bare_link_api'),
    (r'^api/links/(?P<link_id_or_ref>.*)$', 'links_api'),
    (r'^api/link-summary/(?P<ref>.+)$', 'link_summary_api'),
    (r'^api/notes/all$', 'all_notes_api'),
    (r'^api/notes/(?P<note_id_or_ref>.*)$', 'notes_api'),
    (r'^api/related/(?P<tref>.*)$', 'related_api'),
    (r'^api/counts/links/(?P<cat1>.+)/(?P<cat2>.+)$', 'link_count_api'),
    (r'^api/counts/words/(?P<title>.+)/(?P<version>.+)/(?P<language>.+)$', 'word_count_api'),
    (r'^api/counts/(?P<title>.+)$', 'counts_api'),
    (r'^api/shape/(?P<title>.+)$', 'shape_api'),
    (r'^api/preview/(?P<title>.+)$', 'text_preview_api'),
    (r'^api/terms/(?P<name>.+)$', 'terms_api'),
    (r'^api/calendars/?$', 'calendars_api'),
    (r'^api/name/(?P<name>.+)$', 'name_api'),
    (r'^api/category/?(?P<path>.+)?$', 'category_api')
)

# Reviews API
urlpatterns += patterns('reader.views',
    (r'^api/reviews/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'reviews_api'),
    (r'^api/reviews/(?P<review_id>.+)$', 'reviews_api'),
)

# History API
urlpatterns += patterns('reader.views',
    (r'^api/history/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'texts_history_api'),
    (r'^api/history/(?P<tref>.+)$', 'texts_history_api'),
)

# Translation Request API
urlpatterns += patterns('reader.views',
    (r'^api/translation-request/(?P<tref>.+)$', 'translation_request_api'),
)

# Edit Locks API (temporary locks on segments during editing)
urlpatterns += patterns('reader.views',
    (r'^api/locks/set/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'set_lock_api'),
    (r'^api/locks/release/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'release_lock_api'),
    (r'^api/locks/check/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'check_lock_api'),
)

# Lock Text API (permament locking of an entire text)
urlpatterns += patterns('reader.views',
    (r'^api/locktext/(?P<title>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'lock_text_api'),
    (r'^api/version/flags/(?P<title>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'flag_text_api'),
)

# Dictionary API
urlpatterns += patterns('reader.views',
    (r'^api/words/(?P<word>.+)$', 'dictionary_api'),
)

# ESI
urlpatterns += patterns('reader.views',
    (r'^esi/account_box/?$', 'esi_account_box'),
)

# Campaigns
urlpatterns += patterns('reader.views',
    (r'^translate/(?P<tref>.+)$', 'translation_flow'),
    (r'^translation-requests/completed?', 'completed_translation_requests'),
    (r'^translation-requests/featured-completed?', 'completed_featured_translation_requests'),
    (r'^translation-requests/?', 'translation_requests'),
    (r'^contests/(?P<slug>.+)$', 'contest_splash'),
    (r'^mishnah-contest-2013/?$', lambda x: HttpResponseRedirect('/contests/mishnah-contest-2013')),
)

# JSON Editors
urlpatterns += patterns('reader.views',
    (r'^edit/terms/(?P<term>.+)$', 'terms_editor'),
    (r'^add/terms/(?P<term>.+)$', 'terms_editor'),
)

# Texts Add / Edit / Translate
urlpatterns += patterns('reader.views',
    (r'^edit/textinfo/(?P<title>.+)$', 'edit_text_info'),
    (r'^add/textinfo/(?P<new_title>.+)$', 'edit_text_info'),
    (r'^add/new/?$', 'edit_text'),
    (r'^add/(?P<ref>.+)$', 'edit_text'),
    (r'^translate/(?P<ref>.+)$', 'edit_text'),
    (r'^edit/(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', 'edit_text'),
    (r'^edit/(?P<ref>.+)$', 'edit_text'),
)

# Texts Page
urlpatterns += patterns('reader.views',
    (r'^texts/?$', 'texts_list'),
    (r'^texts/(?P<cats>.+)?$', 'texts_category_list'),
)

# Search Page
urlpatterns += patterns('reader.views',
    (r'^search/?$', 'search'),
)

# Discussions
urlpatterns += patterns('reader.views',
    (r'^discussions/?$', 'discussions'),
    (r'^api/discussions/new$', 'new_discussion_api'),
)

# Dashboard Page
urlpatterns += patterns('reader.views',
    (r'^dashboard/?$', 'dashboard'),
)

# Source Sheets
urlpatterns += patterns('sheets.views',
    (r'^sheets/?$', 'sheets_list'),
    (r'^sheets/new/?$', 'new_sheet'),
    (r'^sheets/tags/?$', 'sheets_tags_list'),
    (r'^sheets/tags/(?P<tag>.+)$', 'sheets_tag'),
    (r'^sheets/(?P<type>(public|private))/?$', 'sheets_list'),
    (r'^sheets/visual/(?P<sheet_id>\d+)$', 'view_visual_sheet'),
)

# Source Sheets API
urlpatterns += patterns('sheets.views',
    (r'^api/sheets/?$',                                            'save_sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/delete$',                     'delete_sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/add$',                        'add_source_to_sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/add_ref$',                    'add_ref_to_sheet_api'),
    (r'^api/sheets/(?P<parasha>.+)/get_aliyot$',                   'get_aliyot_by_parasha_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/copy_source$',                'copy_source_to_sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/tags$',                       'update_sheet_tags_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)$',                            'sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/like$',                       'like_sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/visualize$',                  'visual_sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/unlike$',                     'unlike_sheet_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/likers$',                     'sheet_likers_api'),
    (r'^api/sheets/user/(?P<user_id>\d+)$',                        'user_sheet_list_api'),
    (r'^api/sheets/user/(?P<user_id>\d+)/(?P<sort_by>\w+)/(?P<limiter>\d+)/(?P<offset>\d+)$',       'user_sheet_list_api_with_sort'),
    (r'^api/sheets/modified/(?P<sheet_id>\d+)/(?P<timestamp>.+)$', 'check_sheet_modified_api'),
    (r'^api/sheets/create/(?P<ref>[^/]+)(/(?P<sources>.+))?$',     'make_sheet_from_text_api'),
    (r'^api/sheets/tag/(?P<tag>[^/]+)?$',                          'sheets_by_tag_api'),
    (r'^api/sheets/trending-tags/?$',                              'trending_tags_api'),
    (r'^api/sheets/tag-list/?$',                                   'tag_list_api'),
    (r'^api/sheets/tag-list/user/(?P<user_id>\d+)?$',              'user_tag_list_api'),
    (r'^api/sheets/tag-list/(?P<sort_by>[a-zA-Z\-]+)$',                    'tag_list_api'),
    (r'^api/sheets/all-sheets/(?P<limiter>\d+)/(?P<offset>\d+)$',  'all_sheets_api'),
    (r'^api/sheets/(?P<sheet_id>\d+)/export_to_drive$',            'export_to_drive'),
)

# Activity
urlpatterns += patterns('reader.views',
    (r'^activity/?$', 'global_activity'),
    (r'^activity/leaderboard?$', 'leaderboard'),
    (r'^activity/(?P<page>\d+)$', 'global_activity'),
    (r'^activity/(?P<slug>[^/]+)/(?P<page>\d+)?$', 'user_activity'),
    (r'^activity/(?P<tref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)/(?P<page>\d+)$', 'segment_history'),
    (r'^activity/(?P<tref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)$', 'segment_history'),
    (r'^api/revert/(?P<tref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)/(?P<revision>\d+)$', 'revert_api'),
)

# Profiles & Settings
urlpatterns += patterns('reader.views',
    (r'^my/profile', 'my_profile'),
    (r'^profile/(?P<username>[^/]+)(/(?P<page>\d+))?$', 'user_profile'),
    (r'^contributors/(?P<username>[^/]+)(/(?P<page>\d+))?$', 'profile_redirect'),
    (r'^settings/account?$', 'account_settings'),
    (r'^settings/profile?$', 'edit_profile'),
    (r'^interface/(?P<language>english|hebrew)$', 'interface_language_redirect'),
    (r'^api/profile$', 'profile_api'),
    (r'^api/interrupting-messages/read/(?P<message>.+)$', 'interrupting_messages_read_api'),
)

# Random Text
urlpatterns += patterns('reader.views',
    (r'^random/link$',        'random_redirect'),
    (r'^random/?$',           'random_text_page'),
)

# Notifications API
urlpatterns += patterns('reader.views',
    (r'^api/notifications/?$', 'notifications_api'),
    (r'^api/notifications/read', 'notifications_read_api'),
    (r'^api/updates/?(?P<gid>.+)?$', 'updates_api'),
)

# Messages API
urlpatterns += patterns('reader.views',
    (r'^api/messages/?$', 'messages_api'),
)

# Following API
urlpatterns += patterns('reader.views',
    (r'^api/(?P<action>(follow|unfollow))/(?P<uid>\d+)$', 'follow_api'),
    (r'^api/(?P<kind>(followers|followees))/(?P<uid>\d+)$', 'follow_list_api'),
)

# Groups
urlpatterns += patterns('sheets.views',
    (r'^groups/?$', 'groups_page'),
    (r'^groups/allz$', 'groups_admin_page'),
    (r'^groups/new$', 'edit_group_page'),
    (r'^groups/(?P<group>[^/]+)/settings$', 'edit_group_page'),
    (r'^groups/(?P<group>[^/]+)$', 'group_page'),
    (r'^my/groups$', 'my_groups_page'),
    (r'^partners/(?P<group>[^/]+)$', 'group_page'),
    (r'^api/groups(/(?P<group>[^/]+))?$', 'groups_api'),
    (r'^api/groups/(?P<group_name>[^/]+)/set-role/(?P<uid>\d+)/(?P<role>[^/]+)$', 'groups_role_api'),
    (r'^api/groups/(?P<group_name>[^/]+)/invite/(?P<uid_or_email>[^/]+)(?P<uninvite>\/uninvite)?$', 'groups_invite_api'),
    (r'^api/groups/(?P<group_name>[^/]+)/pin-sheet/(?P<sheet_id>\d+)', 'groups_pin_sheet_api'),
)

# Topics
urlpatterns += patterns('reader.views',
    (r'^topics$', 's2_topics_page'),
    (r'^topics/(?P<topic>.+)$', 's2_topic_page'),
)

# Topics API
urlpatterns += patterns('reader.views',
    (r'^api/topics$', 'topics_list_api'),
    (r'^api/topics/(?P<topic>.+)$', 'topics_api'),
    (r'^api/recommend/topics(/(?P<ref_list>.+))?', 'recommend_topics_api'),
)

# Registration
urlpatterns += patterns('',
    url(r'^login/?$', 'sefaria.views.login', {'authentication_form': SefariaLoginForm}, name='login'),
    url(r'^logout/?$', 'django.contrib.auth.views.logout', {'next_page': '/', 'redirect_field_name': 'next'}, name='logout'),
    url(r'^register/?$', 'sefaria.views.register', name='register'),
    url(r'^password/reset/?$', 'django.contrib.auth.views.password_reset', {'password_reset_form': HTMLPasswordResetForm}, name='password_reset'),
    url(r'^password/reset/confirm/(?P<uidb36>[0-9A-Za-z]+)-(?P<token>.+)/$', 'django.contrib.auth.views.password_reset_confirm', name='password_reset_confirm'),
    url(r'^password/reset/complete/$', 'django.contrib.auth.views.password_reset_complete', name='password_reset_complete'),
    url(r'^password/reset/done/$', 'django.contrib.auth.views.password_reset_done', name='password_reset_done'),
)

# Compare Page
urlpatterns += patterns('sefaria.views',
    url(r'^compare/?((?P<secRef>[^/]+)/)?((?P<lang>en|he)/)?((?P<v1>[^/]+)/)?(?P<v2>[^/]+)?$', 'compare')
)

static_pages = [
    "about",
    "donate",
    "strategy",
    "supporters",
    "team",
    "help",
    "connect",
    "visualizations",
    "jobs",
    "terms",
    "privacy-policy",
    "coming-soon",
    "shraga-silverstein",
    "adin-even-israel-steinsaltz",
    "william-davidson-talmud",
    "linker",
    "ios",
    "mobile",
    "sefaria-edition",
    "sefaria-community-translation",
    "contributed-to-sefaria",
    "translation-guidelines",
    "transliteration-guidelines",
    "even-haezer-guidelines",
    "random-walk-through-torah",
    "educators",
    "the-sefaria-story",
]

# Static and Semi Static Content
urlpatterns += patterns('reader.views',
    url(r'^$', 'home', name="home"),
    (r'^metrics/?$', 'metrics'),
    (r'^digitized-by-sefaria/?$', 'digitized_by_sefaria'),
    (r'^(%s)/?$' % "|".join(static_pages), 'serve_static'),
)

# Explore
urlpatterns += patterns('reader.views',
    (r'^explore(/(?P<book1>[A-Za-z-]+))?(/(?P<book2>[A-Za-z-]+))?/(?P<lang>\w\w)/?$', 'explore'),
    (r'^explore(/(?P<book1>[A-Za-z-]+))?(/(?P<book2>[A-Za-z-]+))?/?$', 'explore')
)

# Features under Development (not generally linked publicly yet)
urlpatterns += patterns('reader.views',
    (r'^s1/?$', 'switch_to_s1'),
    (r'^s2/?$', 'switch_to_s2'),
    (r'^account/?$', 's2_account'),
    (r'^notifications/?$', 's2_notifications'),
    (r'^my/notes/?$', 's2_my_notes'),
    (r'^updates/?$', 's2_updates'),
    (r'^modtools/?$', 's2_modtools'),
    (r'^person/(?P<name>.+)$', 'person_page'),
    (r'^people/Talmud/?$', 'talmud_person_index'),
    (r'^people/?$', 'person_index'),
    #(r'^garden/sheets/(?P<key>.+)$', 'sheet_tag_garden_page'),
    (r'^garden/(?P<key>.+)$', 'custom_visual_garden_page'),
    (r'^garden/sheets/(?P<key>.+)$', 'sheet_tag_visual_garden_page'),
    (r'^garden/search/(?P<q>.+)$', 'search_query_visual_garden_page'),
    (r'^vgarden/custom/(?P<key>.*)$', 'custom_visual_garden_page'),  # legacy.  Used for "maggid" and "ecology"
    (r'^visualize/library/(?P<lang>[enh]*)/?(?P<cats>.*)/?$', 'visualize_library'),
    (r'^visualize/library/?(?P<cats>.*)/?$', 'visualize_library'),
    (r'^visualize/toc$', 'visualize_toc'),
    (r'^visualize/parasha-colors$', 'visualize_parasha_colors'),
    (r'^visualize/links-through-rashi$', 'visualize_links_through_rashi'),
)

# Redirects to Forum, Wiki, etc
urlpatterns += patterns('',
    (r'^forum/?$', lambda x: HttpResponseRedirect('https://groups.google.com/forum/?fromgroups#!forum/sefaria')),
    (r'^wiki/?$', lambda x: HttpResponseRedirect('https://github.com/Sefaria/Sefaria-Project/wiki')),
    (r'^developers/?$', lambda x: HttpResponseRedirect('https://github.com/Sefaria/Sefaria-Project/wiki#developers')),
    (r'^request-a-text/?$', lambda x: HttpResponseRedirect('https://goo.gl/forms/ru33ivawo7EllQxa2')),
    (r'^contribute/?$', lambda x: HttpResponseRedirect('https://github.com/Sefaria/Sefaria-Project/wiki/Guide-to-Contributing')),
    (r'^faq/?$', lambda x: HttpResponseRedirect('https://github.com/Sefaria/Sefaria-Project/wiki#frequently-asked-questions')),
    (r'^textmap/?$', lambda x: HttpResponseRedirect('/static/files/Sefaria-Text-Map-June-2016.pdf')),
    (r'^workshop/?$', lambda x: HttpResponseRedirect('/static/files/Sefaria_SummerMeeting_2016.pdf')),
    (r'^ideasforteaching/?$', lambda x: HttpResponseRedirect('/static/files/Sefaria_Teacher_Generated_Ideas_for_Your_Classroom.pdf')),
    (r'^gala/?$', lambda x: HttpResponseRedirect('https://www.501auctions.com/sefaria')),
    (r'^jfn?$', lambda x: HttpResponseRedirect('https://www.sefaria.org/sheets/60494')),
)

# Packaged JavaScript
urlpatterns += patterns('sefaria.views',
    (r'^data\.js$', 'data_js'),
    (r'^sefaria\.js$', 'sefaria_js'),
)

# Linker js, text upload & download
urlpatterns += patterns('sefaria.views',
    (r'^linker\.js$', 'linker_js'),
    (r'^api/regexs/(?P<titles>.+)$', 'title_regex_api'),
    (r'^api/bulktext/(?P<refs>.+)$', 'bulktext_api'),
    (r'^download/version/(?P<title>.+) - (?P<lang>[he][en]) - (?P<versionTitle>.+)\.(?P<format>plain\.txt)', 'text_download_api'),
    (r'^download/version/(?P<title>.+) - (?P<lang>[he][en]) - (?P<versionTitle>.+)\.(?P<format>json|csv|txt)','text_download_api'),
    (r'^download/bulk/versions/', 'bulk_download_versions_api'),
    (r'^api/text-upload$', 'text_upload_api')
)

# File Uploads
urlpatterns += patterns('sefaria.views',
    (r'^api/file/upload$', 'file_upload'),
)

# Email Subscribe
urlpatterns += patterns('sefaria.views',
    (r'^api/subscribe/(?P<email>.+)$', 'subscribe'),
)

# Admin
urlpatterns += patterns('',
    (r'^admin/reset/varnish/(?P<tref>.+)$', 'sefaria.views.reset_varnish'),
    (r'^admin/reset/cache$', 'sefaria.views.reset_cache'),
    (r'^admin/reset/cache/(?P<title>.+)$', 'sefaria.views.reset_index_cache_for_text'),
    (r'^admin/reset/counts/all$', 'sefaria.views.reset_counts'),
    (r'^admin/reset/counts/(?P<title>.+)$', 'sefaria.views.reset_counts'),
    (r'^admin/reset/toc$', 'sefaria.views.rebuild_toc'),
    (r'^admin/reset/ac$', 'sefaria.views.rebuild_auto_completer'),
    (r'^admin/reset/topics$', 'sefaria.views.rebuild_topics'),
    (r'^admin/reset/(?P<tref>.+)$', 'sefaria.views.reset_ref'),
    (r'^admin/delete/orphaned-counts', 'sefaria.views.delete_orphaned_counts'),
    (r'^admin/rebuild/auto-links/(?P<title>.+)$', 'sefaria.views.rebuild_auto_links'),
    (r'^admin/rebuild/citation-links/(?P<title>.+)$', 'sefaria.views.rebuild_citation_links'),
    (r'^admin/delete/citation-links/(?P<title>.+)$', 'sefaria.views.delete_citation_links'),
    (r'^admin/cache/stats', 'sefaria.views.cache_stats'),
    (r'^admin/cache/dump', 'sefaria.views.cache_dump'),
    (r'^admin/run/tests', 'sefaria.views.run_tests'),
    (r'^admin/export/all', 'sefaria.views.export_all'),
    (r'^admin/error', 'sefaria.views.cause_error'),
    (r'^admin/contest-results', 'sefaria.views.list_contest_results'),
    (r'^admin/translation-requests-stats', 'sefaria.views.translation_requests_stats'),
    (r'^admin/sheet-stats', 'sefaria.views.sheet_stats'),
    (r'^admin/untagged-sheets', 'sefaria.views.untagged_sheets'),
    (r'^admin/versions-csv', 'sefaria.views.versions_csv'),
    (r'^admin/?', include(admin.site.urls)),
    (r'^admin/index-sheets-by-timestamp', 'sefaria.views.index_sheets_by_timestamp'),
    #(r'^admin/view/template_cache/(?P<title>.+)$', 'sefaria.views.view_cached_elem'),
    #(r'^admin/delete/template_cache/(?P<title>.+)$', 'sefaria.views.del_cached_elem'),
    #(r'^admin/rebuild/counts-toc', 'sefaria.views.rebuild_counts_and_toc'),
    #(r'^admin/save/toc', 'sefaria.views.save_toc'),
)

# Stats API - return CSV
urlpatterns += patterns('',
    (r'^api/stats/library-stats', 'sefaria.views.library_stats'),
    (r'^api/stats/core-link-stats', 'sefaria.views.core_link_stats'),
)

# Google API OAuth 2.0
urlpatterns += patterns('sefaria.gauth.views',
    (r'^gauth$', 'index', {}, 'gauth_index'),
    (r'^gauth/callback$', 'auth_return', {}, 'gauth_callback'),
)

# Sheets in a reader panel
urlpatterns += patterns('reader.views',
    (r'^sheets/(?P<tref>\d+)$', 'reader', {'sheet': True}),
)

# Catch all to send to Reader
urlpatterns += patterns('reader.views',
    (r'^(?P<tref>[^/]+)/(?P<lang>\w\w)/(?P<version>.*)$', 'old_versions_redirect'),
    (r'^(?P<tref>[^/]+)(/)?$', 'reader')
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
