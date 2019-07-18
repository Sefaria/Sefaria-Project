from django.conf.urls import include, url
from django.conf.urls import handler404, handler500
from django.contrib import admin
from django.http import HttpResponseRedirect

from emailusernames.forms import EmailAuthenticationForm

from sefaria.forms import HTMLPasswordResetForm, SefariaLoginForm
from sefaria.settings import DOWN_FOR_MAINTENANCE, STATIC_URL

import reader.views as reader_views
import sefaria.views as sefaria_views
import sourcesheets.views as sheets_views
import sefaria.gauth.views as gauth_views
import django.contrib.auth.views as django_auth_views

from sefaria.site.urls import site_urlpatterns


admin.autodiscover()
handler500 = 'reader.views.custom_server_error'


# App Pages
urlpatterns = [
    url(r'^texts/?$', reader_views.texts_list, name="table_of_contents"),
    url(r'^texts/saved/?$', reader_views.saved),
    url(r'^texts/history/?$', reader_views.user_history),
    url(r'^texts/recent/?$', reader_views.old_recent_redirect),
    url(r'^texts/(?P<cats>.+)?$', reader_views.texts_category_list),
    url(r'^search/?$', reader_views.search),
    url(r'^search-autocomplete-redirecter/?$', reader_views.search_autocomplete_redirecter),
    url(r'^sheets/?$', reader_views.sheets_list),
    url(r'^sheets/tags/?$', reader_views.sheets_tags_list),
    url(r'^sheets/tags/(?P<tag>.+)$', reader_views.sheets_by_tag),
    url(r'^sheets/(?P<type>(public|private))/?$', reader_views.sheets_list),
    url(r'^groups/?$', reader_views.public_groups),
    url(r'^groups/all$', reader_views.groups_admin_page),
    url(r'^groups/new$', reader_views.edit_group_page),
    url(r'^groups/(?P<group>[^/]+)/settings$', reader_views.edit_group_page),
    url(r'^groups/(?P<group>[^/]+)$', reader_views.group_page),
    url(r'^my/groups$', reader_views.my_groups),
    url(r'^partners/(?P<group>[^/]+)$', reader_views.group_page),
    url(r'^account/?$', reader_views.account),
    url(r'^notifications/?$', reader_views.notifications),
    url(r'^my/notes/?$', reader_views.my_notes),
    url(r'^updates/?$', reader_views.updates),
    url(r'^modtools/?$', reader_views.modtools),
    url(r'^new-home/?$', reader_views.new_home),
    url(r'^story_editor/?$', reader_views.story_editor),
    url(r'^user_stats/?$', reader_views.user_stats),

]

# People Pages
urlpatterns += [
    url(r'^person/(?P<name>.+)$', reader_views.person_page),
    url(r'^people/Talmud/?$', reader_views.talmud_person_index),
    url(r'^people/?$', reader_views.person_index),
]

# Visualizations / Link Explorer
urlpatterns += [
    url(r'^explore(-(?P<topCat>[\w-]+)-and-(?P<bottomCat>[\w-]+))?(/(?P<book1>[A-Za-z-,\']+))?(/(?P<book2>[A-Za-z-,\']+))?(/(?P<lang>\w\w)/?)?/?$', reader_views.explore),
    url(r'^visualize/library/(?P<lang>[enh]*)/?(?P<cats>.*)/?$', reader_views.visualize_library),
    url(r'^visualize/library/?(?P<cats>.*)/?$', reader_views.visualize_library),
    url(r'^visualize/toc$', reader_views.visualize_toc),
    url(r'^visualize/parasha-colors$', reader_views.visualize_parasha_colors),
    url(r'^visualize/links-through-rashi$', reader_views.visualize_links_through_rashi),
    url(r'^visualize/talmudic-relationships$', reader_views.talmudic_relationships),
    url(r'^visualize/sefer-hachinukh-mitzvot$', reader_views.sefer_hachinukh_mitzvot),
    url(r'^visualize/timeline$', reader_views.visualize_timeline),
    url(r'^visualize/unique-words-by-commentator', reader_views.unique_words_viz),
]

# Source Sheet Builder
urlpatterns += [
    url(r'^sheets/new/?$', sheets_views.new_sheet),
    url(r'^sheets/(?P<sheet_id>\d+)$', sheets_views.view_sheet),
    url(r'^sheets/visual/(?P<sheet_id>\d+)$', sheets_views.view_visual_sheet),
]

# Profiles & Settings
urlpatterns += [
    url(r'^my/profile', reader_views.my_profile),
    url(r'^profile/(?P<username>[^/]+)/?$', reader_views.user_profile),
    url(r'^contributors/(?P<username>[^/]+)(/(?P<page>\d+))?$', reader_views.profile_redirect),
    url(r'^settings/account?$', reader_views.account_settings),
    url(r'^settings/profile?$', reader_views.edit_profile),
    url(r'^interface/(?P<language>english|hebrew)$', reader_views.interface_language_redirect),
    url(r'^api/profile/user_history$', reader_views.profile_get_user_history),
    url(r'^api/profile/sync$', reader_views.profile_sync_api),
    url(r'^api/profile$', reader_views.profile_api),
    url(r'^api/profile/(?P<slug>[^/]+)$', reader_views.profile_get_api),
    url(r'^api/profile/(?P<slug>[^/]+)/(?P<ftype>followers|following)$', reader_views.profile_follow_api),
    url(r'^api/user_history/saved$', reader_views.saved_history_for_ref),
    url(r'^api/interrupting-messages/read/(?P<message>.+)$', reader_views.interrupting_messages_read_api),
]

# Topics
urlpatterns += [
    url(r'^topics$', reader_views.topics_page),
    url(r'^topics/(?P<topic>.+)$', reader_views.topic_page),
]

# Calendar Redirects
urlpatterns += [
    url(r'^parashat-hashavua$', reader_views.parashat_hashavua_redirect),
    url(r'^daf-yomi$', reader_views.daf_yomi_redirect),
]

# Texts Add / Edit / Translate
urlpatterns += [
    url(r'^edit/textinfo/(?P<title>.+)$', reader_views.edit_text_info),
    url(r'^add/textinfo/(?P<new_title>.+)$', reader_views.edit_text_info),
    url(r'^add/new/?$', reader_views.edit_text),
    url(r'^add/(?P<ref>.+)$', reader_views.edit_text),
    url(r'^translate/(?P<ref>.+)$', reader_views.edit_text),
    url(r'^edit/terms/(?P<term>.+)$', reader_views.terms_editor),
    url(r'^add/terms/(?P<term>.+)$', reader_views.terms_editor),
    url(r'^edit/(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.edit_text),
    url(r'^edit/(?P<ref>.+)$', reader_views.edit_text),
]

# Texts / Index / Links etc API
urlpatterns += [
    url(r'^api/texts/versions/(?P<tref>.+)$', reader_views.versions_api),
    url(r'^api/texts/version-status/tree/?(?P<lang>.*)?/?$', reader_views.version_status_tree_api),
    url(r'^api/texts/version-status/?$', reader_views.version_status_api),
    url(r'^api/texts/parashat_hashavua$', reader_views.parashat_hashavua_api),
    url(r'^api/texts/random?$', reader_views.random_text_api),
    url(r'^api/texts/random-by-topic/?$', reader_views.random_by_topic_api),
    url(r'^api/texts/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.old_text_versions_api_redirect),
    url(r'^api/texts/(?P<tref>.+)$', reader_views.texts_api),
    url(r'^api/index/?$', reader_views.table_of_contents_api),
    url(r'^api/search-filter-index/?$', reader_views.search_filter_table_of_contents_api),
    url(r'^api/opensearch-suggestions/?$', reader_views.opensearch_suggestions_api),
    url(r'^api/index/titles/?$', reader_views.text_titles_api),
    url(r'^api/v2/raw/index/(?P<title>.+)$', reader_views.index_api, {'v2': True, 'raw': True}),
    url(r'^api/v2/index/(?P<title>.+)$', reader_views.index_api, {'v2': True}),
    url(r'^api/index/(?P<title>.+)$', reader_views.index_api),
    url(r'^api/links/bare/(?P<book>.+)/(?P<cat>.+)$', reader_views.bare_link_api),
    url(r'^api/links/(?P<link_id_or_ref>.*)$', reader_views.links_api),
    url(r'^api/link-summary/(?P<ref>.+)$', reader_views.link_summary_api),
    url(r'^api/notes/all$', reader_views.all_notes_api),
    url(r'^api/notes/(?P<note_id_or_ref>.*)$', reader_views.notes_api),
    url(r'^api/related/(?P<tref>.*)$', reader_views.related_api),
    url(r'^api/counts/links/(?P<cat1>.+)/(?P<cat2>.+)$', reader_views.link_count_api),
    url(r'^api/counts/words/(?P<title>.+)/(?P<version>.+)/(?P<language>.+)$', reader_views.word_count_api),
    url(r'^api/counts/(?P<title>.+)$', reader_views.counts_api),
    url(r'^api/shape/(?P<title>.+)$', reader_views.shape_api),
    url(r'^api/preview/(?P<title>.+)$', reader_views.text_preview_api),
    url(r'^api/terms/(?P<name>.+)$', reader_views.terms_api),
    url(r'^api/calendars/?$', reader_views.calendars_api),
    url(r'^api/name/(?P<name>.+)$', reader_views.name_api),
    url(r'^api/category/?(?P<path>.+)?$', reader_views.category_api),
    url(r'^api/tag-category/?(?P<path>.+)?$', reader_views.tag_category_api),
    url(r'^api/words/completion/(?P<word>.+)/(?P<lexicon>.+)$', reader_views.dictionary_completion_api),
    url(r'^api/words/completion/(?P<word>.+)$', reader_views.dictionary_completion_api),   # Search all dicts
    url(r'^api/words/(?P<word>.+)$', reader_views.dictionary_api),
    url(r'^api/notifications/?$', reader_views.notifications_api),
    url(r'^api/notifications/read', reader_views.notifications_read_api),
    url(r'^api/updates/?(?P<gid>.+)?$', reader_views.updates_api),
    url(r'^api/stories/?(?P<gid>.+)?$', reader_views.stories_api),
    url(r'^api/story_reflector/?$', reader_views.story_reflector),
    url(r'^api/user_stats/(?P<uid>.+)/?$', reader_views.user_stats_api),
    url(r'^api/site_stats/?$', reader_views.site_stats_api),
    url(r'^api/messages/?$', reader_views.messages_api),
]

# Source Sheets API
urlpatterns += [
    url(r'^api/sheets/?$',                                            sheets_views.save_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/delete$',                     sheets_views.delete_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/add$',                        sheets_views.add_source_to_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/add_ref$',                    sheets_views.add_ref_to_sheet_api),
    url(r'^api/sheets/(?P<parasha>.+)/get_aliyot$',                   sheets_views.get_aliyot_by_parasha_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/copy_source$',                sheets_views.copy_source_to_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/tags$',                       sheets_views.update_sheet_tags_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)$',                            sheets_views.sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)\.(?P<node_id>\d+)$',          sheets_views.sheet_node_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/like$',                       sheets_views.like_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/visualize$',                  sheets_views.visual_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/unlike$',                     sheets_views.unlike_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/likers$',                     sheets_views.sheet_likers_api),
    url(r'^api/sheets/user/(?P<user_id>\d+)$',                        sheets_views.user_sheet_list_api),
    url(r'^api/sheets/user/(?P<user_id>\d+)/(?P<sort_by>\w+)/(?P<limiter>\d+)/(?P<offset>\d+)$',       sheets_views.user_sheet_list_api_with_sort),
    url(r'^api/sheets/modified/(?P<sheet_id>\d+)/(?P<timestamp>.+)$', sheets_views.check_sheet_modified_api),
    url(r'^api/sheets/create/(?P<ref>[^/]+)(/(?P<sources>.+))?$',     sheets_views.make_sheet_from_text_api),
    url(r'^api/sheets/tag/(?P<tag>[^/]+)?$',                          sheets_views.sheets_by_tag_api),
    url(r'^api/sheets/trending-tags/?$',                              sheets_views.trending_tags_api),
    url(r'^api/sheets/tag-list/?$',                                   sheets_views.tag_list_api),
    url(r'^api/sheets/tag-list/user/(?P<user_id>\d+)?$',              sheets_views.user_tag_list_api),
    url(r'^api/sheets/tag-list/(?P<sort_by>[a-zA-Z\-]+)$',            sheets_views.tag_list_api),
    url(r'^api/sheets/ref/(?P<ref>[^/]+)$',                           sheets_views.sheets_by_ref_api),
    url(r'^api/sheets/all-sheets/(?P<limiter>\d+)/(?P<offset>\d+)$',  sheets_views.all_sheets_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/export_to_drive$',            sheets_views.export_to_drive),
]

# Groups API
urlpatterns += [
    url(r'^api/groups(/(?P<group>[^/]+))?$', sheets_views.groups_api),
    url(r'^api/groups/(?P<group_name>[^/]+)/set-role/(?P<uid>\d+)/(?P<role>[^/]+)$', sheets_views.groups_role_api),
    url(r'^api/groups/(?P<group_name>[^/]+)/invite/(?P<uid_or_email>[^/]+)(?P<uninvite>\/uninvite)?$', sheets_views.groups_invite_api),
    url(r'^api/groups/(?P<group_name>[^/]+)/pin-sheet/(?P<sheet_id>\d+)', sheets_views.groups_pin_sheet_api),
    url(r'^api/groups/user-groups/(?P<user_id>\d+)$', sheets_views.user_groups_api),
]

# Search API
urlpatterns += [
    url(r'^api/dummy-search$', reader_views.dummy_search_api),
    url(r'^api/search-wrapper$', reader_views.search_wrapper_api)
]

# Following API
urlpatterns += [
    url(r'^api/(?P<action>(follow|unfollow))/(?P<uid>\d+)$', reader_views.follow_api),
    url(r'^api/(?P<kind>(followers|followees))/(?P<uid>\d+)$', reader_views.follow_list_api),
]

# Topics API
urlpatterns += [
    url(r'^api/topics$', reader_views.topics_list_api),
    url(r'^api/topics/(?P<topic>.+)$', reader_views.topics_api),
    url(r'^api/recommend/topics(/(?P<ref_list>.+))?', reader_views.recommend_topics_api),
]

# Reviews API
urlpatterns += [
    url(r'^api/reviews/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.reviews_api),
    url(r'^api/reviews/(?P<review_id>.+)$', reader_views.reviews_api),
]

# History API
urlpatterns += [
    url(r'^api/history/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.texts_history_api),
    url(r'^api/history/(?P<tref>.+)$', reader_views.texts_history_api),
]

# Translation Request API
urlpatterns += [
    url(r'^api/translation-request/(?P<tref>.+)$', reader_views.translation_request_api),
]

# Edit Locks API (temporary locks on segments during editing)
urlpatterns += [
    url(r'^api/locks/set/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.set_lock_api),
    url(r'^api/locks/release/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.release_lock_api),
    url(r'^api/locks/check/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.check_lock_api),
]

# Lock Text API (permament locking of an entire text)
urlpatterns += [
    url(r'^api/locktext/(?P<title>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.lock_text_api),
    url(r'^api/version/flags/(?P<title>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.flag_text_api),
]

# Campaigns
urlpatterns += [
    url(r'^translate/(?P<tref>.+)$', reader_views.translation_flow),
    url(r'^translation-requests/completed?', reader_views.completed_translation_requests),
    url(r'^translation-requests/featured-completed?', reader_views.completed_featured_translation_requests),
    url(r'^translation-requests/?', reader_views.translation_requests),
    url(r'^contests/(?P<slug>.+)$', reader_views.contest_splash),
]

# Discussions
urlpatterns += [
    url(r'^discussions/?$', reader_views.discussions),
    url(r'^api/discussions/new$', reader_views.new_discussion_api),
]

# Dashboard Page
urlpatterns += [
    url(r'^dashboard/?$', reader_views.dashboard),
]

# Activity
urlpatterns += [
    url(r'^activity/?$', reader_views.global_activity),
    url(r'^activity/leaderboard?$', reader_views.leaderboard),
    url(r'^activity/(?P<page>\d+)$', reader_views.global_activity),
    url(r'^activity/(?P<slug>[^/]+)/(?P<page>\d+)?$', reader_views.user_activity),
    url(r'^activity/(?P<tref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)/(?P<page>\d+)$', reader_views.segment_history),
    url(r'^activity/(?P<tref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)$', reader_views.segment_history),
    url(r'^api/revert/(?P<tref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)/(?P<revision>\d+)$', reader_views.revert_api),
]

# Random Text
urlpatterns += [
    url(r'^random/link$',        reader_views.random_redirect),
    url(r'^random/?$',           reader_views.random_text_page),
]

# Registration
urlpatterns += [
    url(r'^login/?$', django_auth_views.LoginView.as_view(authentication_form=SefariaLoginForm), name='login'),
    url(r'^register/?$', sefaria_views.register, name='register'),
    url(r'^logout/?$', django_auth_views.LogoutView.as_view(), name='logout'),
    url(r'^password/reset/?$', django_auth_views.PasswordResetView.as_view(email_template_name='registration/password_reset_email.txt', html_email_template_name='registration/password_reset_email.html'), name='password_reset'),
    url(r'^password/reset/confirm/(?P<uidb64>[0-9A-Za-z_\-]+)/(?P<token>[0-9A-Za-z]{1,13}-[0-9A-Za-z]{1,20})/$', django_auth_views.PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    url(r'^password/reset/complete/$', django_auth_views.PasswordResetCompleteView.as_view(), name='password_reset_complete'),
    url(r'^password/reset/done/$', django_auth_views.PasswordResetDoneView.as_view(), name='password_reset_done'),
]

# Compare Page
urlpatterns += [
    url(r'^compare/?((?P<secRef>[^/]+)/)?((?P<lang>en|he)/)?((?P<v1>[^/]+)/)?(?P<v2>[^/]+)?$', sefaria_views.compare)
]

# Gardens
urlpatterns += [
    #url(r'^garden/sheets/(?P<key>.+)$', 'sheet_tag_garden_page),
    url(r'^garden/(?P<key>.+)$', reader_views.custom_visual_garden_page),
    url(r'^garden/sheets/(?P<key>.+)$', reader_views.sheet_tag_visual_garden_page),
    url(r'^garden/search/(?P<q>.+)$', reader_views.search_query_visual_garden_page),
    url(r'^vgarden/custom/(?P<key>.*)$', reader_views.custom_visual_garden_page),  # legacy.  Used for "maggid" and "ecology"
]

# Sefaria.js -- Packaged JavaScript
urlpatterns += [
    url(r'^data\.js$', sefaria_views.data_js),
    url(r'^sefaria\.js$', sefaria_views.sefaria_js),
]

# Linker js, text upload & download
urlpatterns += [
    url(r'^linker\.?v?([0-9]+)?\.js$', sefaria_views.linker_js),
    url(r'^api/regexs/(?P<titles>.+)$', sefaria_views.title_regex_api),
    url(r'^api/bulktext/(?P<refs>.+)$', sefaria_views.bulktext_api),
    url(r'^download/version/(?P<title>.+) - (?P<lang>[he][en]) - (?P<versionTitle>.+)\.(?P<format>plain\.txt)', sefaria_views.text_download_api),
    url(r'^download/version/(?P<title>.+) - (?P<lang>[he][en]) - (?P<versionTitle>.+)\.(?P<format>json|csv|txt)',sefaria_views.text_download_api),
    url(r'^download/bulk/versions/', sefaria_views.bulk_download_versions_api),
    url(r'^api/text-upload$', sefaria_views.text_upload_api),
    url(r'^api/linker-track$', sefaria_views.linker_tracking_api),

]

urlpatterns += [
    url(r'^api/passages/(?P<refs>.+)$', sefaria_views.passages_api),
]

# File Uploads
urlpatterns += [
    url(r'^api/file/upload$', sefaria_views.file_upload),
]

# Send Feedback
urlpatterns += [
    url(r'^api/send_feedback$', sefaria_views.generate_feedback),
]

# Email Subscribe
urlpatterns += [
    url(r'^api/subscribe/(?P<email>.+)$', sefaria_views.subscribe),
]

# Admin
urlpatterns += [
    url(r'^admin/reset/varnish/(?P<tref>.+)$', sefaria_views.reset_varnish),
    url(r'^admin/reset/cache$', sefaria_views.reset_cache),
    url(r'^admin/reset/cache/(?P<title>.+)$', sefaria_views.reset_index_cache_for_text),
    url(r'^admin/reset/counts/all$', sefaria_views.reset_counts),
    url(r'^admin/reset/counts/(?P<title>.+)$', sefaria_views.reset_counts),
    url(r'^admin/reset/toc$', sefaria_views.rebuild_toc),
    url(r'^admin/reset/ac$', sefaria_views.rebuild_auto_completer),
    url(r'^admin/reset/topics$', sefaria_views.rebuild_topics),
    url(r'^admin/reset/api/(?P<apiurl>.+)$', sefaria_views.reset_cached_api),
    url(r'^admin/reset/(?P<tref>.+)$', sefaria_views.reset_ref),
    url(r'^admin/delete/orphaned-counts', sefaria_views.delete_orphaned_counts),
    url(r'^admin/rebuild/auto-links/(?P<title>.+)$', sefaria_views.rebuild_auto_links),
    url(r'^admin/rebuild/citation-links/(?P<title>.+)$', sefaria_views.rebuild_citation_links),
    url(r'^admin/delete/citation-links/(?P<title>.+)$', sefaria_views.delete_citation_links),
    url(r'^admin/cache/stats', sefaria_views.cache_stats),
    url(r'^admin/cache/dump', sefaria_views.cache_dump),
    url(r'^admin/run/tests', sefaria_views.run_tests),
    url(r'^admin/export/all', sefaria_views.export_all),
    url(r'^admin/error', sefaria_views.cause_error),
    url(r'^admin/contest-results', sefaria_views.list_contest_results),
    url(r'^admin/translation-requests-stats', sefaria_views.translation_requests_stats),
    url(r'^admin/sheet-stats', sefaria_views.sheet_stats),
    url(r'^admin/untagged-sheets', sefaria_views.untagged_sheets),
    url(r'^admin/versions-csv', sefaria_views.versions_csv),
    url(r'^admin/index-sheets-by-timestamp', sefaria_views.index_sheets_by_timestamp),
    url(r'^admin/?', include(admin.site.urls)),
]

# Stats API - return CSV
urlpatterns += [
    url(r'^api/stats/library-stats', sefaria_views.library_stats),
    url(r'^api/stats/core-link-stats', sefaria_views.core_link_stats),
]

# Google API OAuth 2.0
urlpatterns += [
    url(r'^gauth$', gauth_views.index, name="gauth_index"),
    url(r'^gauth/callback$', gauth_views.auth_return, name="gauth_callback"),
]

# Site specific URLS loaded from
urlpatterns += site_urlpatterns

# Sheets in a reader panel
urlpatterns += [
    url(r'^sheets/(?P<tref>[\d.]+)$', reader_views.catchall, {'sheet': True}),
]

# Catch all to send to Reader
urlpatterns += [
    url(r'^(?P<tref>[^/]+)/(?P<lang>\w\w)/(?P<version>.*)$', reader_views.old_versions_redirect),
    url(r'^(?P<tref>[^/]+)(/)?$', reader_views.catchall)
]


if DOWN_FOR_MAINTENANCE:
    # Keep admin accessible
    urlpatterns = [
        url(r'^admin/reset/cache', sefaria_views.reset_cache),
        url(r'^admin/?', include(admin.site.urls)),
    ]
    # Everything else gets maintenance message
    urlpatterns += [
        url(r'.*', sefaria_views.maintenance_message)
    ]
