# -*- coding: utf-8 -*-
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from functools import partial
from django.conf.urls import include, url
from django.conf.urls import handler404, handler500
from django.contrib import admin
from django.http import HttpResponseRedirect
import django.contrib.auth.views as django_auth_views
from sefaria.forms import SefariaPasswordResetForm, SefariaSetPasswordForm, SefariaLoginForm
from sefaria.settings import DOWN_FOR_MAINTENANCE, STATIC_URL

import reader.views as reader_views
import sefaria.views as sefaria_views
import sourcesheets.views as sheets_views
import sefaria.gauth.views as gauth_views
import django.contrib.auth.views as django_auth_views
import api.views as api_views

from sefaria.site.urls import site_urlpatterns

admin.autodiscover()
handler500 = 'reader.views.custom_server_error'
handler404 = 'reader.views.custom_page_not_found'


# App Pages
urlpatterns = [
    url(r'^$', reader_views.home, name="home"),
    url(r'^texts/?$', reader_views.texts_list, name="table_of_contents"),
    url(r'^texts/saved/?$', reader_views.saved),
    url(r'^texts/history/?$', reader_views.user_history),
    url(r'^texts/recent/?$', reader_views.old_recent_redirect),
    url(r'^texts/(?P<cats>.+)?$', reader_views.texts_category_list),
    url(r'^search/?$', reader_views.search),
    url(r'^search-autocomplete-redirecter/?$', reader_views.search_autocomplete_redirecter),
    url(r'^calendars/?$', reader_views.calendars),
    url(r'^collections/?$', reader_views.public_collections),
    url(r'^collections/new$', reader_views.edit_collection_page),
    url(r'^collections/(?P<slug>[^.]+)/settings$', reader_views.edit_collection_page),
    url(r'^collections/(?P<slug>[^.]+)$', reader_views.collection_page),
    url(r'^translations/(?P<slug>[^.]+)$', reader_views.translations_page),
    url(r'^community/?$', reader_views.community_page),
    url(r'^notifications/?$', reader_views.notifications),
    url(r'^updates/?$', reader_views.updates),
    url(r'^modtools/?$', reader_views.modtools),
    url(r'^modtools/upload_text$', sefaria_views.modtools_upload_workflowy),
    url(r'^modtools/links$', sefaria_views.links_upload_api),
    url(r'^modtools/links/(?P<tref1>.+)/(?P<tref2>.+)$', sefaria_views.get_csv_links_by_refs_api),
    url(r'^modtools/index_links/(?P<tref1>.+)/(?P<tref2>.+)$', partial(sefaria_views.get_csv_links_by_refs_api, by_segment=True)),
    url(r'^torahtracker/?$', reader_views.user_stats),
]

# People Pages
urlpatterns += [
    url(r'^person/(?P<name>.+)$', reader_views.person_page_redirect),

    url(r'^people/Talmud/?$', reader_views.talmud_person_index_redirect),
    url(r'^people/?$', reader_views.person_index_redirect),
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
    url(r'^settings/account?$', reader_views.account_settings),
    url(r'^settings/profile?$', reader_views.edit_profile),
    url(r'^interface/(?P<language>english|hebrew)$', reader_views.interface_language_redirect),
    url(r'^api/profile/user_history$', reader_views.user_history_api),
    url(r'^api/profile/sync$', reader_views.profile_sync_api),
    url(r'^api/profile/upload-photo$', reader_views.profile_upload_photo),
    url(r'^api/profile$', reader_views.profile_api),
    url(r'^settings/account/user$', reader_views.account_user_update),
    url(r'^api/profile/(?P<slug>[^/]+)$', reader_views.profile_get_api),
    url(r'^api/profile/(?P<slug>[^/]+)/(?P<ftype>followers|following)$', reader_views.profile_follow_api),
    url(r'^api/user_history/saved$', reader_views.saved_history_for_ref),
]

# Topics
urlpatterns += [
    url(r'^topics/category/(?P<topicCategory>.+)?$', reader_views.topics_category_page),
    url(r'^topics/all/(?P<letter>.)$', reader_views.all_topics_page),
    url(r'^topics/?$', reader_views.topics_page),
    url(r'^topics/b/(?P<topic>.+)$', reader_views.topic_page_b),
    url(r'^topics/(?P<topic>.+)$', reader_views.topic_page),
    url(r'^api/topic/completion/(?P<topic>.+)', reader_views.topic_completion_api),
    url(r'^api/topics/images/(?P<topic>.+)$', reader_views.topic_upload_photo)

]

# Calendar Redirects
urlpatterns += [
    url(r'^parashat-hashavua$', reader_views.parashat_hashavua_redirect),
    url(r'^todays-daf-yomi$', reader_views.daf_yomi_redirect),
]

# Texts Add / Edit / Translate
urlpatterns += [
    url(r'^add/textinfo/(?P<new_title>.+)$', reader_views.edit_text_info),
    url(r'^add/new/?$', reader_views.edit_text),
    url(r'^add/(?P<ref>.+)$', reader_views.edit_text),
    url(r'^translate/(?P<ref>.+)$', reader_views.edit_text),
    url(r'^edit/terms/(?P<term>.+)$', reader_views.terms_editor),
    url(r'^add/terms/(?P<term>.+)$', reader_views.terms_editor),
    url(r'^edit/(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.edit_text),
    url(r'^edit/(?P<ref>.+)$', reader_views.edit_text),
]

# Redirects for legacy URLs
urlpatterns += [
    url(r'^new-home/?$', reader_views.new_home_redirect),
    url(r'^account/?$', reader_views.my_profile),
    url(r'^my/notes/?$', reader_views.my_notes_redirect),
    url(r'^sheets/tags/?$', reader_views.topics_redirect),
    url(r'^sheets/tags/(?P<tag>.+)$', reader_views.topic_page_redirect),
    url(r'^sheets/(?P<type>(public|private))/?$', reader_views.sheets_pages_redirect),
    url(r'^groups/?(?P<group>[^/]+)?$', reader_views.groups_redirect),
    url(r'^contributors/(?P<username>[^/]+)(/(?P<page>\d+))?$', reader_views.profile_redirect),
]

# Texts / Index / Links etc API
urlpatterns += [
    url(r'^api/texts/versions/(?P<tref>.+)$', reader_views.versions_api),
    url(r'^api/texts/version-status/tree/?(?P<lang>.*)?/?$', reader_views.version_status_tree_api),
    url(r'^api/texts/version-status/?$', reader_views.version_status_api),
    url(r'^api/texts/parashat_hashavua$', reader_views.parashat_hashavua_api),
    url(r'^api/texts/translations/?$', reader_views.translations_api),
    url(r'^api/texts/translations/(?P<lang>.+)', reader_views.translations_api),
    url(r'^api/texts/random?$', reader_views.random_text_api),
    url(r'^api/texts/random-by-topic/?$', reader_views.random_by_topic_api),
    url(r'^api/texts/modify-bulk/(?P<title>.+)$', reader_views.modify_bulk_text_api),
    url(r'^api/texts/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.old_text_versions_api_redirect),
    url(r'^api/texts/(?P<tref>.+)$', reader_views.texts_api),
    url(r'^api/v3/texts/(?P<tref>.+)$', api_views.Text.as_view()),
    url(r'^api/index/?$', reader_views.table_of_contents_api),
    url(r'^api/opensearch-suggestions/?$', reader_views.opensearch_suggestions_api),
    url(r'^api/index/titles/?$', reader_views.text_titles_api),
    url(r'^api/v2/raw/index/(?P<title>.+)$', reader_views.index_api, {'raw': True}),
    url(r'^api/v2/index/(?P<title>.+)$', reader_views.index_api),
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
    url(r'^api/calendars/next-read/(?P<parasha>.+)$', reader_views.parasha_next_read_api),
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
    url(r'^api/user_stats/(?P<uid>.+)/?$', reader_views.user_stats_api),
    url(r'^api/site_stats/?$', reader_views.site_stats_api),
    url(r'^api/manuscripts/(?P<tref>.+)', reader_views.manuscripts_for_source),
    url(r'^api/background-data', reader_views.background_data_api),

]

# Source Sheets API
urlpatterns += [
    url(r'^api/sheets/?$',                                            sheets_views.save_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/delete$',                     sheets_views.delete_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/add$',                        sheets_views.add_source_to_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/add_ref$',                    sheets_views.add_ref_to_sheet_api),
    url(r'^api/sheets/(?P<parasha>.+)/get_aliyot$',                   sheets_views.get_aliyot_by_parasha_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/copy_source$',                sheets_views.copy_source_to_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/topics$',                     sheets_views.update_sheet_topics_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)$',                            sheets_views.sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)\.(?P<node_id>\d+)$',          sheets_views.sheet_node_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/like$',                       sheets_views.like_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/visualize$',                  sheets_views.visual_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/unlike$',                     sheets_views.unlike_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/likers$',                     sheets_views.sheet_likers_api),
    url(r'^api/sheets/user/(?P<user_id>\d+)/((?P<sort_by>\w+)/(?P<limiter>\d+)/(?P<offset>\d+))?$',       sheets_views.user_sheet_list_api),
    url(r'^api/sheets/modified/(?P<sheet_id>\d+)/(?P<timestamp>.+)$', sheets_views.check_sheet_modified_api),
    url(r'^api/sheets/create/(?P<ref>[^/]+)(/(?P<sources>.+))?$',     sheets_views.make_sheet_from_text_api),
    url(r'^api/sheets/tag/(?P<tag>[^/]+)?$',                          sheets_views.sheets_by_tag_api),
    url(r'^api/v2/sheets/tag/(?P<tag>[^/]+)?$',                       sheets_views.story_form_sheets_by_tag),
    url(r'^api/v2/sheets/bulk/(?P<sheet_id_list>.+)$',                sheets_views.bulksheet_api),
    url(r'^api/sheets/trending-tags/?$',                              sheets_views.trending_tags_api),
    url(r'^api/sheets/tag-list/?$',                                   sheets_views.tag_list_api),
    url(r'^api/sheets/tag-list/user/(?P<user_id>\d+)?$',              sheets_views.user_tag_list_api),
    url(r'^api/sheets/tag-list/(?P<sort_by>[a-zA-Z\-]+)$',            sheets_views.tag_list_api),
    url(r'^api/sheets/ref/(?P<ref>[^/]+)$',                           sheets_views.sheets_by_ref_api),
    url(r'^api/sheets/all-sheets/(?P<limiter>\d+)/(?P<offset>\d+)$',  sheets_views.all_sheets_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/export_to_drive$',            sheets_views.export_to_drive),
    url(r'^api/sheets/upload-image$',                                 sheets_views.upload_sheet_media),
    url(r'^api/sheets/next-untagged/?$',                              sheets_views.next_untagged),
    url(r'^api/sheets/next-uncategorized/?$',                         sheets_views.next_uncategorized)
]

# Unlink Google Account Subscribe
urlpatterns += [
    url(r'^unlink-gauth$', sefaria_views.unlink_gauth),
]

# Collections API
urlpatterns += [
    url(r'^api/collections/user-collections/(?P<user_id>\d+)$', sheets_views.user_collections_api),
    url(r'^api/collections/upload$', sefaria_views.collections_image_upload),
    url(r'^api/collections/for-sheet/(?P<sheet_id>\d+)$', sheets_views.collections_for_sheet_api),
    url(r'^api/collections(/(?P<slug>[^/]+))?$', sheets_views.collections_api),
    url(r'^api/collections/(?P<slug>[^/]+)/set-role/(?P<uid>\d+)/(?P<role>[^/]+)$', sheets_views.collections_role_api),
    url(r'^api/collections/(?P<slug>[^/]+)/invite/(?P<uid_or_email>[^/]+)(?P<uninvite>\/uninvite)?$', sheets_views.collections_invite_api),
    url(r'^api/collections/(?P<slug>[^/]+)/(?P<action>(add|remove))/(?P<sheet_id>\d+)', sheets_views.collections_inclusion_api),
    url(r'^api/collections/(?P<slug>[^/]+)/(?P<action>(add|remove))/(?P<sheet_id>\d+)', sheets_views.collections_inclusion_api),
    url(r'^api/collections/(?P<slug>[^/]+)/pin-sheet/(?P<sheet_id>\d+)', sheets_views.collections_pin_sheet_api),
]

# Search API
urlpatterns += [
    url(r'^api/dummy-search$', reader_views.dummy_search_api),
    url(r'^api/search-wrapper/es6$', reader_views.search_wrapper_api, {'es6_compat': True}),
    url(r'^api/search-wrapper/es8$', reader_views.search_wrapper_api),
    url(r'^api/search-wrapper$', reader_views.search_wrapper_api, {'es6_compat': True}),
    url(r'^api/search-path-filter/(?P<book_title>.+)$', reader_views.search_path_filter),
]

# Following API
urlpatterns += [
    url(r'^api/(?P<action>(follow|unfollow))/(?P<uid>\d+)$', reader_views.follow_api),
    url(r'^api/(?P<kind>(followers|followees))/(?P<uid>\d+)$', reader_views.follow_list_api),
]

# Blocking API
urlpatterns += [
    url(r'^api/(?P<action>(block|unblock))/(?P<uid>\d+)$', reader_views.block_api),
]

# Topics API
urlpatterns += [
    url(r'^api/topics$', reader_views.topics_list_api),
    url(r'^api/topics-graph/(?P<topic>.+)$', reader_views.topic_graph_api),
    url(r'^api/ref-topic-links/(?P<tref>.+)$', reader_views.topic_ref_api),
    url(r'^api/v2/topics/(?P<topic>.+)$', reader_views.topics_api, {'v2': True}),
    url(r'^api/topics/(?P<topic>.+)$', reader_views.topics_api),
    url(r'^api/topic/new$', reader_views.add_new_topic_api),
    url(r'^api/topic/delete/(?P<topic>.+)$', reader_views.delete_topic),
    url(r'^api/topic/reorder$', reader_views.reorder_topics),
    url(r'^api/source/reorder$', reader_views.reorder_sources),
    url(r'^api/bulktopics$', reader_views.bulk_topic_api),
    url(r'^api/recommend/topics(/(?P<ref_list>.+))?', reader_views.recommend_topics_api),
]

# Portals API
urlpatterns += [
    url(r'^api/portals/(?P<slug>.+)$', reader_views.portals_api),
]

# History API
urlpatterns += [
    url(r'^api/history/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.texts_history_api),
    url(r'^api/history/(?P<tref>.+)$', reader_views.texts_history_api),
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
# SEC-AUDIT: do we also want to maybe move these to 'admin'

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

# Preview Images
urlpatterns += [
    url(r'^api/img-gen/(?P<tref>.+)$', reader_views.social_image_api),
]


# Registration
urlpatterns += [
    url(r'^login/?$', django_auth_views.LoginView.as_view(authentication_form=SefariaLoginForm), name='login'),
    url(r'^register/?$', sefaria_views.register, name='register'),
    url(r'^logout/?$', django_auth_views.LogoutView.as_view(), name='logout'),
    url(r'^password/reset/?$', django_auth_views.PasswordResetView.as_view(form_class=SefariaPasswordResetForm, email_template_name='registration/password_reset_email.txt', html_email_template_name='registration/password_reset_email.html'), name='password_reset'),
    url(r'^password/reset/confirm/(?P<uidb64>[0-9A-Za-z_\-]+)/(?P<token>[0-9A-Za-z]{1,13}-[0-9A-Za-z]{1,20})/$', django_auth_views.PasswordResetConfirmView.as_view(form_class=SefariaSetPasswordForm), name='password_reset_confirm'),
    url(r'^password/reset/complete/$', django_auth_views.PasswordResetCompleteView.as_view(), name='password_reset_complete'),
    url(r'^password/reset/done/$', django_auth_views.PasswordResetDoneView.as_view(), name='password_reset_done'),
    url(r'^api/register/$', sefaria_views.register_api),
    url(r'^api/login/$', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    url(r'^api/login/refresh/$', TokenRefreshView.as_view(), name='token_refresh'),
    url(r'^api/account/delete$', reader_views.delete_user_account_api),
]

# Compare Page
urlpatterns += [
    url(r'^compare/?((?P<comp_ref>[^/]+)/)?((?P<lang>en|he)/)?((?P<v1>[^/]+)/)?(?P<v2>[^/]+)?$', sefaria_views.compare)
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
    url(r'^data\.(?:(?:\d+)\.)?js$', sefaria_views.data_js), # Allow for regular data.js and also data.<timestamp>.js for caching
    url(r'^sefaria\.js$', sefaria_views.sefaria_js),
]

# Linker js, text upload & download
urlpatterns += [
    url(r'^linker\.?v?([0-9]+)?\.js$', sefaria_views.linker_js),
    url(r'^api/find-refs/report/?$', sefaria_views.find_refs_report_api),
    url(r'^api/find-refs/?$', sefaria_views.find_refs_api),
    url(r'^api/regexs/(?P<titles>.+)$', sefaria_views.title_regex_api),
    url(r'^api/websites/(?P<domain>.+)$', sefaria_views.websites_api),
    url(r'^api/linker-data/(?P<titles>.+)$', sefaria_views.linker_data_api),
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

# Send Feedback
urlpatterns += [
    url(r'^api/send_feedback$', sefaria_views.generate_feedback),
]

# Email Subscribe
urlpatterns += [
    url(r'^api/subscribe/(?P<org>.+)/(?P<email>.+)$', sefaria_views.generic_subscribe_to_newsletter_api),
    url(r'^api/subscribe/(?P<email>.+)$', sefaria_views.subscribe_sefaria_newsletter_view),
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
    url(r'^admin/reset/api/(?P<apiurl>.+)$', sefaria_views.reset_cached_api),
    url(r'^admin/reset/community$', reader_views.community_reset),
    url(r'^admin/reset/(?P<tref>.+)$', sefaria_views.reset_ref),
    url(r'^admin/reset-websites-data', sefaria_views.reset_websites_data),
    url(r'^admin/delete/orphaned-counts', sefaria_views.delete_orphaned_counts),
    url(r'^admin/delete/user-account', sefaria_views.delete_user_by_email, name="delete/user-account"),
    url(r'^admin/delete/sheet$', sefaria_views.delete_sheet_by_id, name="delete/sheet"),
    url(r'^admin/rebuild/auto-links/(?P<title>.+)$', sefaria_views.rebuild_auto_links),
    url(r'^admin/rebuild/citation-links/(?P<title>.+)$', sefaria_views.rebuild_citation_links),
    url(r'^admin/delete/citation-links/(?P<title>.+)$', sefaria_views.delete_citation_links),
    url(r'^admin/cache/stats', sefaria_views.cache_stats),
    url(r'^admin/cache/dump', sefaria_views.cache_dump),
    url(r'^admin/run/tests', sefaria_views.run_tests),
    url(r'^admin/export/all', sefaria_views.export_all),
    url(r'^admin/error', sefaria_views.cause_error),
    url(r'^admin/account-stats', sefaria_views.account_stats),
    url(r'^admin/categorize-sheets', sefaria_views.categorize_sheets),
    url(r'^admin/sheet-stats', sefaria_views.sheet_stats),
    url(r'^admin/untagged-sheets', sefaria_views.untagged_sheets),
    url(r'^admin/spam$', sefaria_views.spam_dashboard),
    url(r'^admin/spam/sheets', sefaria_views.sheet_spam_dashboard),
    url(r'^admin/spam/profiles', sefaria_views.profile_spam_dashboard),
    url(r'^admin/versions-csv', sefaria_views.versions_csv),
    url(r'^admin/index-sheets-by-timestamp', sefaria_views.index_sheets_by_timestamp),
    url(r'^admin/community-preview', reader_views.community_preview),
    url(r'^admin/descriptions/authors/update', sefaria_views.update_authors_from_sheet),
    url(r'^admin/descriptions/categories/update', sefaria_views.update_categories_from_sheet),
    url(r'^admin/descriptions/texts/update', sefaria_views.update_texts_from_sheet),
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

# add static files to urls
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
urlpatterns += staticfiles_urlpatterns()

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
        url(r'^healthz/?$', reader_views.application_health_api),  # this oddly is returning 'alive' when it's not.  is k8s jumping in the way?
        url(r'^health-check/?$', reader_views.application_health_api),
        url(r'^healthz-rollout/?$', reader_views.rollout_health_api),
    ]
    # Everything else gets maintenance message
    urlpatterns += [
        url(r'.*', sefaria_views.maintenance_message)
    ]
