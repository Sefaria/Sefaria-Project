from django.urls import path
from django.urls import re_path
from django.contrib import admin
from sefaria.settings import ADMIN_PATH
import reader.views as reader_views
import sourcesheets.views as sheets_views
import remote_config.views as remote_config_views
import api.views as api_views
import sefaria.views as sefaria_views
import sefaria.gauth.views as gauth_views
import guides.views as guides_views
from sefaria.heapdump import heapdump_view
from sefaria.site.urls import site_urlpatterns
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

shared_patterns = [
    re_path(fr'^login/?$', sefaria_views.CustomLoginView.as_view(), name='login'),
    re_path(fr'^register/?$', sefaria_views.register, name='register'),
    re_path(fr'logout/?$', sefaria_views.CustomLogoutView.as_view(), name='logout'),
    re_path(fr'password/reset/?$', sefaria_views.CustomPasswordResetView.as_view(), name='password_reset'),
    path('password/reset/confirm/<uidb64>/<token>/',
        sefaria_views.CustomPasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    re_path(fr'password/reset/complete/$', sefaria_views.CustomPasswordResetCompleteView.as_view(),
        name='password_reset_complete'),
    re_path(fr'password/reset/done/$', sefaria_views.CustomPasswordResetDoneView.as_view(), name='password_reset_done'),

    re_path(fr'api/login/$', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    re_path(fr'api/login/refresh/$', TokenRefreshView.as_view(), name='token_refresh'),

    re_path(r'^saved/?$', reader_views.saved_content),
    re_path(r'^history/?$', reader_views.user_history_content),
    re_path(r'^search/?$', reader_views.search),
    re_path(r'^search-autocomplete-redirecter/?$', reader_views.search_autocomplete_redirecter),
    re_path(r'^notifications/?$', reader_views.notifications),
    path('person/<path:name>', reader_views.person_page_redirect),
    re_path(r'^people/Talmud/?$', reader_views.talmud_person_index_redirect),
    re_path(r'^people/?$', reader_views.person_index_redirect),

    path('api/profile/user_history', reader_views.user_history_api),
    path('api/profile/sync', reader_views.profile_sync_api),
    path('api/profile/upload-photo', reader_views.profile_upload_photo),
    path('api/profile/experiments/opt-in', reader_views.experiments_opt_in_api),
    path('api/profile', reader_views.profile_api),
    path('api/profile/<str:slug>', reader_views.profile_api),
    re_path(r'^api/profile/(?P<slug>[^/]+)/(?P<ftype>followers|following)$', reader_views.profile_follow_api),
    path('api/user_history/saved', reader_views.saved_history_for_ref),

    re_path(r'^topics/category/(?P<topicCategory>.+)?$', reader_views.topics_category_page),
    re_path(r'^topics/all/(?P<letter>.)$', reader_views.all_topics_page),
    re_path(r'^topics/?$', reader_views.topics_page),
    path('topics/b/<path:slug>', reader_views.topic_page_b),
    path('topics/<path:slug>', reader_views.topic_page),

    re_path(r'^new-home/?$', reader_views.new_home_redirect),
    re_path(r'^account/?$', reader_views.my_profile),
    re_path(r'^my/notes/?$', reader_views.my_notes_redirect),
    re_path(r'^sheets/tags/?$', reader_views.topics_redirect),
    path('sheets/tags/<path:tag>', reader_views.topic_page_redirect),
    re_path(r'^sheets/(?P<type>(public|private))/?$', reader_views.sheets_pages_redirect),
    re_path(r'^groups/?(?P<group>[^/]+)?$', reader_views.groups_redirect),
    re_path(r'^contributors/(?P<username>[^/]+)(/(?P<page>\d+))?$', reader_views.profile_redirect),

    path('_api/topics/images/secondary/<path:slug>', reader_views.topic_upload_photo, {"secondary": True}),
    path('_api/topics/images/<path:slug>', reader_views.topic_upload_photo),
    path('api/texts/versions/<path:tref>', reader_views.versions_api),
    re_path(r'^api/texts/version-status/tree/?(?P<lang>.*)?/?$', reader_views.version_status_tree_api),
    re_path(r'^api/texts/version-status/?$', reader_views.version_status_api),
    path('api/texts/parashat_hashavua', reader_views.parashat_hashavua_api),
    re_path(r'^api/texts/translations/?$', reader_views.translations_api),
    re_path(r'^api/texts/translations/(?P<lang>.+)', reader_views.translations_api),
    re_path(r'^api/texts/random?$', reader_views.random_text_api),
    re_path(r'^api/texts/random-by-topic/?$', reader_views.random_by_topic_api),
    path('api/texts/modify-bulk/<path:title>', reader_views.modify_bulk_text_api),
    re_path(r'^api/texts/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.old_text_versions_api_redirect),
    path('api/texts/<path:tref>', reader_views.texts_api),
    re_path(r'^api/versions/?$', reader_views.complete_version_api),
    path('api/v3/texts/<path:tref>', api_views.Text.as_view()),
    re_path(r'^api/index/?$', reader_views.table_of_contents_api),
    re_path(r'^api/opensearch-suggestions/?$', reader_views.opensearch_suggestions_api),
    re_path(r'^api/index/titles/?$', reader_views.text_titles_api),
    path('api/v2/raw/index/<path:title>', reader_views.index_api, {'raw': True}),
    path('api/v2/index/<path:title>', reader_views.index_api),
    path('api/index/<path:title>', reader_views.index_api),
    path('api/links/bare/<path:book>/<path:cat>', reader_views.bare_link_api),
    re_path(r'^api/links/(?P<link_id_or_ref>.*)$', reader_views.links_api),
    path('api/link-summary/<path:ref>', reader_views.link_summary_api),
    path('api/notes/all', reader_views.all_notes_api),
    re_path(r'^api/notes/(?P<note_id_or_ref>.*)$', reader_views.notes_api),
    path('api/related/<path:tref>/websites', reader_views.websites_api),
    re_path(r'^api/related/(?P<tref>.*)$', reader_views.related_api),
    path('api/counts/links/<path:cat1>/<path:cat2>', reader_views.link_count_api),
    path('api/counts/words/<path:title>/<path:version>/<path:language>', reader_views.word_count_api),
    path('api/counts/<path:title>', reader_views.counts_api),
    path('api/shape/<path:title>', reader_views.shape_api),
    path('api/preview/<path:title>', reader_views.text_preview_api),
    path('api/terms/<path:name>', reader_views.terms_api),
    path('api/calendars/next-read/<path:parasha>', reader_views.parasha_next_read_api),
    re_path(r'^api/calendars/?$', reader_views.calendars_api),
    re_path(r'^api/calendars/topics/parasha/?$', reader_views.parasha_data_api),
    re_path(r'^api/calendars/topics/holiday/?$', reader_views.seasonal_topic_api),
    path('api/name/<path:name>', reader_views.name_api),
    re_path(r'^api/category/?(?P<path>.+)?$', reader_views.category_api),
    re_path(r'^api/tag-category/?(?P<path>.+)?$', reader_views.tag_category_api),
    path('api/words/completion/<path:word>/<path:lexicon>', reader_views.dictionary_completion_api),
    path('api/words/completion/<path:word>', reader_views.dictionary_completion_api),  # Search all dicts
    path('api/words/<path:word>', reader_views.dictionary_api),
    re_path(r'^api/notifications/?$', reader_views.notifications_api),
    re_path(r'^api/notifications/read', reader_views.notifications_read_api),
    re_path(r'^api/updates/?(?P<gid>.+)?$', reader_views.updates_api),
    re_path(r'^api/user_stats/(?P<uid>.+)/?$', reader_views.user_stats_api),
    re_path(r'^api/site_stats/?$', reader_views.site_stats_api),
    re_path(r'^api/manuscripts/(?P<tref>.+)', reader_views.manuscripts_for_source),
    re_path(r'^api/background-data', reader_views.background_data_api),
    re_path(r'^api/version-indices$', sefaria_views.version_indices_api),
    re_path(r'^api/version-bulk-edit$', sefaria_views.version_bulk_edit_api),
    re_path(r'^api/version-bulk-delete$', sefaria_views.version_bulk_delete_api),
    re_path(r'^api/check-index-dependencies/(?P<title>.+)$', sefaria_views.check_index_dependencies_api),
    re_path(r'^api/sheets/?$', sheets_views.save_sheet_api),
    path('api/sheets/<int:sheet_id>/delete', sheets_views.delete_sheet_api),
    path('api/sheets/<int:sheet_id>/add', sheets_views.add_source_to_sheet_api),
    path('api/sheets/<int:sheet_id>/add_ref', sheets_views.add_ref_to_sheet_api),
    path('api/sheets/<path:parasha>/get_aliyot', sheets_views.get_aliyot_by_parasha_api),
    path('api/sheets/<int:sheet_id>/copy_source', sheets_views.copy_source_to_sheet_api),
    path('api/sheets/<int:sheet_id>/topics', sheets_views.update_sheet_topics_api),
    path('api/sheets/<int:sheet_id>', sheets_views.sheet_api),
    path('api/sheets/<int:sheet_id>.<int:node_id>', sheets_views.sheet_node_api),
    path('api/sheets/<int:sheet_id>/like', sheets_views.like_sheet_api),
    path('api/sheets/<int:sheet_id>/visualize', sheets_views.visual_sheet_api),
    path('api/sheets/<int:sheet_id>/unlike', sheets_views.unlike_sheet_api),
    path('api/sheets/<int:sheet_id>/likers', sheets_views.sheet_likers_api),
    re_path(r'^api/sheets/user/(?P<user_id>\d+)/((?P<sort_by>\w+)/(?P<limiter>\d+)/(?P<offset>\d+))?$',
        sheets_views.user_sheet_list_api),
    path('api/sheets/modified/<int:sheet_id>/<path:timestamp>', sheets_views.check_sheet_modified_api),
    re_path(r'^api/sheets/create/(?P<ref>[^/]+)(/(?P<sources>.+))?$', sheets_views.make_sheet_from_text_api),
    re_path(r'^api/sheets/tag/(?P<tag>[^/]+)?$', sheets_views.sheets_by_tag_api),
    re_path(r'^api/v2/sheets/tag/(?P<tag>[^/]+)?$', sheets_views.story_form_sheets_by_tag),
    path('api/v2/sheets/bulk/<path:sheet_id_list>', sheets_views.bulksheet_api),
    re_path(r'^api/sheets/trending-tags/?$', sheets_views.trending_tags_api),
    re_path(r'^api/sheets/tag-list/?$', sheets_views.tag_list_api),
    re_path(r'^api/sheets/tag-list/user/(?P<user_id>\d+)?$', sheets_views.user_tag_list_api),
    re_path(r'^api/sheets/tag-list/(?P<sort_by>[a-zA-Z\-]+)$', sheets_views.tag_list_api),
    path('api/sheets/ref/<str:ref>', sheets_views.sheets_by_ref_api),
    path('api/sheets/all-sheets/<int:limiter>/<int:offset>', sheets_views.all_sheets_api),
    path('api/sheets/<int:sheet_id>/export_to_drive', sheets_views.export_to_drive),
    path('api/sheets/upload-image', sheets_views.upload_sheet_media),
    re_path(r'^api/sheets/next-untagged/?$', sheets_views.next_untagged),
    re_path(r'^api/sheets/next-uncategorized/?$', sheets_views.next_uncategorized),

    path('api/collections/user-collections/<int:user_id>', sheets_views.user_collections_api),
    path('api/collections/upload', sefaria_views.collections_image_upload),
    path('api/collections/for-sheet/<int:sheet_id>', sheets_views.collections_for_sheet_api),
    re_path(r'^api/collections(/(?P<slug>[^/]+))?$', sheets_views.collections_api),
    path('api/collections/<str:slug>/set-role/<int:uid>/<str:role>', sheets_views.collections_role_api),
    re_path(r'^api/collections/(?P<slug>[^/]+)/invite/(?P<uid_or_email>[^/]+)(?P<uninvite>\/uninvite)?$',
        sheets_views.collections_invite_api),
    re_path(r'^api/collections/(?P<slug>[^/]+)/(?P<action>(add|remove))/(?P<sheet_id>\d+)',
        sheets_views.collections_inclusion_api),
    re_path(r'^api/collections/(?P<slug>[^/]+)/pin-sheet/(?P<sheet_id>\d+)', sheets_views.collections_pin_sheet_api),

    path('api/dummy-search', reader_views.dummy_search_api),
    path('api/search-wrapper/es6', reader_views.search_wrapper_api, {'es6_compat': True}),
    path('api/search-wrapper/es8', reader_views.search_wrapper_api),
    path('api/search-wrapper', reader_views.search_wrapper_api, {'es6_compat': True}),
    path('api/search-path-filter/<path:book_title>', reader_views.search_path_filter),

    re_path(r'^api/(?P<action>(follow|unfollow))/(?P<uid>\d+)$', reader_views.follow_api),
    re_path(r'^api/(?P<kind>(followers|followees))/(?P<uid>\d+)$', reader_views.follow_list_api),

    re_path(r'^api/(?P<action>(block|unblock))/(?P<uid>\d+)$', reader_views.block_api),

    re_path(r'^api/authors/(?P<author_slug>[^/]+)/indexes/?$', reader_views.author_indexes_api),
    path('api/topics', reader_views.topics_list_api),
    path('api/topics/generate-prompts/<path:slug>', reader_views.generate_topic_prompts_api),
    path('api/topics-graph/<path:topic>', reader_views.topic_graph_api),
    path('api/topics/pools/<path:pool_name>', reader_views.topic_pool_api),
    re_path(r'^_api/topics/featured-topic/?$', reader_views.featured_topic_api),
    re_path(r'^api/topics/trending/?$', reader_views.trending_topics_api),
    path('api/ref-topic-links/bulk', reader_views.topic_ref_bulk_api),
    path('api/ref-topic-links/<path:tref>', reader_views.topic_ref_api),
    path('api/v2/topics/<path:topic>', reader_views.topics_api, {'v2': True}),
    path('api/topics/<path:topic>', reader_views.topics_api),
    path('api/topic/new', reader_views.add_new_topic_api),
    path('api/topic/delete/<path:topic>', reader_views.delete_topic),
    path('api/topic/reorder', reader_views.reorder_topics),
    path('api/source/reorder', reader_views.reorder_sources),
    path('api/bulktopics', reader_views.bulk_topic_api),
    re_path(r'^api/recommend/topics(/(?P<ref_list>.+))?', reader_views.recommend_topics_api),

    path('api/portals/<path:slug>', reader_views.portals_api),

    re_path(r'^api/history/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.texts_history_api),
    path('api/history/<path:tref>', reader_views.texts_history_api),

    re_path(r'^api/locks/set/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.set_lock_api),
    re_path(r'^api/locks/release/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.release_lock_api),
    re_path(r'^api/locks/check/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.check_lock_api),

    re_path(r'^api/locktext/(?P<title>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.lock_text_api),
    re_path(r'^api/version/flags/(?P<title>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.flag_text_api),

    re_path(r'^api/revert/(?P<tref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)/(?P<revision>\d+)$', reader_views.revert_api),

    path('api/img-gen/', reader_views.social_image_api, {"tref": ""}),
    path('api/img-gen/<path:tref>', reader_views.social_image_api),

    path('api/passages/<path:refs>', sefaria_views.passages_api),

    path('api/send_feedback', sefaria_views.generate_feedback),

    path('api/subscribe/<path:org>/<path:email>', sefaria_views.generic_subscribe_to_newsletter_api),
    path('api/subscribe/<path:email>', sefaria_views.subscribe_sefaria_newsletter_view),
    re_path(r'^api/newsletter_mailing_lists/?$', sefaria_views.get_available_newsletter_mailing_lists),

    path('api/strapi/graphql-cache', sefaria_views.strapi_graphql_cache),
    path('api/strapi/cache-invalidate', sefaria_views.strapi_cache_invalidate),

    re_path(r'^api/stats/library-stats', sefaria_views.library_stats),
    re_path(r'^api/stats/core-link-stats', sefaria_views.core_link_stats),

    re_path(fr'api/register/$', sefaria_views.register_api),
    re_path(fr'api/account/delete$', reader_views.delete_user_account_api),
    re_path(fr'interface/(?P<language>english|hebrew)$', reader_views.interface_language_redirect),

    path('gauth', gauth_views.index, name="gauth_index"),
    path('gauth/callback', gauth_views.auth_return, name="gauth_callback"),
    path('unlink-gauth', sefaria_views.unlink_gauth),
    re_path(r'^data\.(?:(?:\d+)\.)?js$', sefaria_views.data_js),  # Allow for regular data.js and also data.<timestamp>.js for caching
    path('sefaria.js', sefaria_views.sefaria_js),

    re_path(r'^linker\.?v?([0-9]+)?\.js$', sefaria_views.linker_js),
    path('linker.v3.js.map', sefaria_views.linker_js_map),
    re_path(r'^api/find-refs/report/?$', sefaria_views.find_refs_report_api),
    re_path(r'^api/find-refs/?$', sefaria_views.find_refs_api),
    re_path(r'^api/regexs/(?P<titles>.+)$', sefaria_views.title_regex_api),
    re_path(r'^api/websites/(?P<domain>.+)$', sefaria_views.websites_api),
    re_path(r'^api/linker-data/(?P<titles>.+)$', sefaria_views.linker_data_api),
    re_path(r'^api/bulktext/(?P<refs>.+)$', sefaria_views.bulktext_api),
    re_path(r'^api/text-upload$', sefaria_views.text_upload_api),
    re_path(r'^api/linker-track$', sefaria_views.linker_tracking_api),
    re_path(r'^api/guides/(?P<guide_key>[^/]+)$', guides_views.guides_api),
    re_path(r'^admin/reset/varnish/(?P<tref>.+)$', sefaria_views.reset_varnish),
    re_path(r'^admin/reset/cache$', sefaria_views.reset_cache),
    re_path(r'^admin/reset/cache/(?P<title>.+)$', sefaria_views.reset_index_cache_for_text),
    re_path(r'^admin/reset/counts/all$', sefaria_views.reset_counts),
    re_path(r'^admin/reset/counts/(?P<title>.+)$', sefaria_views.reset_counts),
    re_path(r'^admin/reset/toc$', sefaria_views.rebuild_toc),
    re_path(r'^admin/reset/ac$', sefaria_views.rebuild_auto_completer),
    re_path(r'^admin/reset/api/(?P<apiurl>.+)$', sefaria_views.reset_cached_api),
    re_path(r'^admin/reset/(?P<tref>.+)$', sefaria_views.reset_ref),
    re_path(r'^admin/reset-websites-data', sefaria_views.reset_websites_data),
    re_path(r'^admin/delete/orphaned-counts', sefaria_views.delete_orphaned_counts),
    re_path(r'^admin/delete/user-account', sefaria_views.delete_user_by_email, name="delete/user-account"),
    re_path(r'^admin/delete/sheet$', sefaria_views.delete_sheet_by_id, name="delete/sheet"),
    re_path(r'^admin/rebuild/auto-links/(?P<title>.+)$', sefaria_views.rebuild_auto_links),
    re_path(r'^admin/rebuild/citation-links/(?P<title>.+)$', sefaria_views.rebuild_citation_links),
    re_path(r'^admin/rebuild/shared-cache', sefaria_views.rebuild_shared_cache),
    re_path(r'^admin/delete/citation-links/(?P<title>.+)$', sefaria_views.delete_citation_links),
    re_path(r'^admin/cache/stats', sefaria_views.cache_stats),
    re_path(r'^admin/memory/summary', sefaria_views.memory_summary),
    re_path(r'^admin/heapdump/$', heapdump_view, name="heapdump"),
    re_path(r'^admin/cache/dump', sefaria_views.cache_dump),
    re_path(r'^admin/run/tests', sefaria_views.run_tests),
    re_path(r'^admin/export/all', sefaria_views.export_all),
    re_path(r'^admin/error', sefaria_views.cause_error),
    re_path(r'^admin/account-stats', sefaria_views.account_stats),
    re_path(r'^admin/categorize-sheets', sefaria_views.categorize_sheets),
    re_path(r'^admin/sheet-stats', sefaria_views.sheet_stats),
    re_path(r'^admin/untagged-sheets', sefaria_views.untagged_sheets),
    re_path(r'^admin/spam$', sefaria_views.spam_dashboard),
    re_path(r'^admin/spam/sheets', sefaria_views.sheet_spam_dashboard),
    re_path(r'^admin/spam/profiles', sefaria_views.profile_spam_dashboard),
    re_path(r'^admin/versions-csv', sefaria_views.versions_csv),
    re_path(r'^admin/index-sheets-by-timestamp', sefaria_views.index_sheets_by_timestamp),
    re_path(r'^admin/descriptions/authors/update', sefaria_views.update_authors_from_sheet),
    re_path(r'^admin/descriptions/categories/update', sefaria_views.update_categories_from_sheet),
    re_path(r'^admin/descriptions/texts/update', sefaria_views.update_texts_from_sheet),
    re_path(fr'{ADMIN_PATH}/?', admin.site.urls),
    re_path(r'^(?P<tref>[^/]+)/(?P<lang>\w\w)/(?P<version>.*)$', reader_views.old_versions_redirect),
    re_path(r'^api/remote-config/?$', remote_config_views.remote_config_values, name="remote_config_api"),
    re_path(r'^api/async/(?P<task_id>.+)$', sefaria_views.async_task_status_api),
]

shared_patterns += site_urlpatterns
shared_patterns += staticfiles_urlpatterns()
shared_patterns += [
    re_path(r'^(?P<tref>[^/]+)(/)?$', reader_views.catchall)
]

# Keep admin accessible
maintenance_patterns = [
    re_path(r'^admin/reset/cache', sefaria_views.reset_cache),
    re_path(r'admin/?', admin.site.urls),
    re_path(fr'{ADMIN_PATH}/?', admin.site.urls),
    re_path(r'^healthz/?$', reader_views.application_health_api),  # this oddly is returning 'alive' when it's not.  is k8s jumping in the way?
    re_path(r'^health-check/?$', reader_views.application_health_api),
    re_path(r'^healthz-rollout/?$', reader_views.rollout_health_api),
]
# Everything else gets maintenance message.
maintenance_patterns += [
    re_path(r'.*', sefaria_views.maintenance_message)
]
