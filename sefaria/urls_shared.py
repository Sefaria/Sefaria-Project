from django.conf.urls import url, include
from django.contrib import admin
from sefaria.settings import ADMIN_PATH
import reader.views as reader_views
import sourcesheets.views as sheets_views
import api.views as api_views
import sefaria.views as sefaria_views
import sefaria.gauth.views as gauth_views
import guides.views as guides_views
from sefaria.site.urls import site_urlpatterns
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

shared_patterns = [
    url(fr'^login/?$', sefaria_views.CustomLoginView.as_view(), name='login'),
    url(fr'^register/?$', sefaria_views.register, name='register'),
    url(fr'logout/?$', sefaria_views.CustomLogoutView.as_view(), name='logout'),
    url(fr'password/reset/?$', sefaria_views.CustomPasswordResetView.as_view(), name='password_reset'),
    url(fr'password/reset/confirm/(?P<uidb64>[0-9A-Za-z_\-]+)/(?P<token>[0-9A-Za-z]{{1,13}}-[0-9A-Za-z]{{1,20}})/$',
        sefaria_views.CustomPasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    url(fr'password/reset/complete/$', sefaria_views.CustomPasswordResetCompleteView.as_view(),
        name='password_reset_complete'),
    url(fr'password/reset/done/$', sefaria_views.CustomPasswordResetDoneView.as_view(), name='password_reset_done'),

    url(fr'api/login/$', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    url(fr'api/login/refresh/$', TokenRefreshView.as_view(), name='token_refresh'),

    url(r'^saved/?$', reader_views.saved_content),
    url(r'^history/?$', reader_views.user_history_content),
    url(r'^search/?$', reader_views.search),
    url(r'^search-autocomplete-redirecter/?$', reader_views.search_autocomplete_redirecter),
    url(r'^notifications/?$', reader_views.notifications),
    url(r'^person/(?P<name>.+)$', reader_views.person_page_redirect),
    url(r'^people/Talmud/?$', reader_views.talmud_person_index_redirect),
    url(r'^people/?$', reader_views.person_index_redirect),

    url(r'^api/profile/user_history$', reader_views.user_history_api),
    url(r'^api/profile/sync$', reader_views.profile_sync_api),
    url(r'^api/profile/upload-photo$', reader_views.profile_upload_photo),
    url(r'^api/profile$', reader_views.profile_api),
    url(r'^api/profile/(?P<slug>[^/]+)$', reader_views.profile_api),
    url(r'^api/profile/(?P<slug>[^/]+)/(?P<ftype>followers|following)$', reader_views.profile_follow_api),
    url(r'^api/user_history/saved$', reader_views.saved_history_for_ref),
    url(r'^api/user-history/validate-refs/?$', reader_views.validate_user_history_refs_api),
    url(r'^api/user-history/validation-status/(?P<job_id>[^/]+)/?$', reader_views.validation_status_api),

    url(r'^topics/category/(?P<topicCategory>.+)?$', reader_views.topics_category_page),
    url(r'^topics/all/(?P<letter>.)$', reader_views.all_topics_page),
    url(r'^topics/?$', reader_views.topics_page),
    url(r'^topics/b/(?P<slug>.+)$', reader_views.topic_page_b),
    url(r'^topics/(?P<slug>.+)$', reader_views.topic_page),

    url(r'^new-home/?$', reader_views.new_home_redirect),
    url(r'^account/?$', reader_views.my_profile),
    url(r'^my/notes/?$', reader_views.my_notes_redirect),
    url(r'^sheets/tags/?$', reader_views.topics_redirect),
    url(r'^sheets/tags/(?P<tag>.+)$', reader_views.topic_page_redirect),
    url(r'^sheets/(?P<type>(public|private))/?$', reader_views.sheets_pages_redirect),
    url(r'^groups/?(?P<group>[^/]+)?$', reader_views.groups_redirect),
    url(r'^contributors/(?P<username>[^/]+)(/(?P<page>\d+))?$', reader_views.profile_redirect),

    url(r'^_api/topics/images/secondary/(?P<slug>.+)$', reader_views.topic_upload_photo, {"secondary": True}),
    url(r'^_api/topics/images/(?P<slug>.+)$', reader_views.topic_upload_photo),

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
    url(r'^api/versions/?$', reader_views.complete_version_api),
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
    url(r'^api/calendars/topics/parasha/?$', reader_views.parasha_data_api),
    url(r'^api/calendars/topics/holiday/?$', reader_views.seasonal_topic_api),
    url(r'^api/name/(?P<name>.+)$', reader_views.name_api),
    url(r'^api/category/?(?P<path>.+)?$', reader_views.category_api),
    url(r'^api/tag-category/?(?P<path>.+)?$', reader_views.tag_category_api),
    url(r'^api/words/completion/(?P<word>.+)/(?P<lexicon>.+)$', reader_views.dictionary_completion_api),
    url(r'^api/words/completion/(?P<word>.+)$', reader_views.dictionary_completion_api),  # Search all dicts
    url(r'^api/words/(?P<word>.+)$', reader_views.dictionary_api),
    url(r'^api/notifications/?$', reader_views.notifications_api),
    url(r'^api/notifications/read', reader_views.notifications_read_api),
    url(r'^api/updates/?(?P<gid>.+)?$', reader_views.updates_api),
    url(r'^api/user_stats/(?P<uid>.+)/?$', reader_views.user_stats_api),
    url(r'^api/site_stats/?$', reader_views.site_stats_api),
    url(r'^api/manuscripts/(?P<tref>.+)', reader_views.manuscripts_for_source),
    url(r'^api/background-data', reader_views.background_data_api),

    url(r'^api/sheets/?$', sheets_views.save_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/delete$', sheets_views.delete_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/add$', sheets_views.add_source_to_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/add_ref$', sheets_views.add_ref_to_sheet_api),
    url(r'^api/sheets/(?P<parasha>.+)/get_aliyot$', sheets_views.get_aliyot_by_parasha_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/copy_source$', sheets_views.copy_source_to_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/topics$', sheets_views.update_sheet_topics_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)$', sheets_views.sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)\.(?P<node_id>\d+)$', sheets_views.sheet_node_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/like$', sheets_views.like_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/visualize$', sheets_views.visual_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/unlike$', sheets_views.unlike_sheet_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/likers$', sheets_views.sheet_likers_api),
    url(r'^api/sheets/user/(?P<user_id>\d+)/((?P<sort_by>\w+)/(?P<limiter>\d+)/(?P<offset>\d+))?$',
        sheets_views.user_sheet_list_api),
    url(r'^api/sheets/modified/(?P<sheet_id>\d+)/(?P<timestamp>.+)$', sheets_views.check_sheet_modified_api),
    url(r'^api/sheets/create/(?P<ref>[^/]+)(/(?P<sources>.+))?$', sheets_views.make_sheet_from_text_api),
    url(r'^api/sheets/tag/(?P<tag>[^/]+)?$', sheets_views.sheets_by_tag_api),
    url(r'^api/v2/sheets/tag/(?P<tag>[^/]+)?$', sheets_views.story_form_sheets_by_tag),
    url(r'^api/v2/sheets/bulk/(?P<sheet_id_list>.+)$', sheets_views.bulksheet_api),
    url(r'^api/sheets/trending-tags/?$', sheets_views.trending_tags_api),
    url(r'^api/sheets/tag-list/?$', sheets_views.tag_list_api),
    url(r'^api/sheets/tag-list/user/(?P<user_id>\d+)?$', sheets_views.user_tag_list_api),
    url(r'^api/sheets/tag-list/(?P<sort_by>[a-zA-Z\-]+)$', sheets_views.tag_list_api),
    url(r'^api/sheets/ref/(?P<ref>[^/]+)$', sheets_views.sheets_by_ref_api),
    url(r'^api/sheets/all-sheets/(?P<limiter>\d+)/(?P<offset>\d+)$', sheets_views.all_sheets_api),
    url(r'^api/sheets/(?P<sheet_id>\d+)/export_to_drive$', sheets_views.export_to_drive),
    url(r'^api/sheets/upload-image$', sheets_views.upload_sheet_media),
    url(r'^api/sheets/next-untagged/?$', sheets_views.next_untagged),
    url(r'^api/sheets/next-uncategorized/?$', sheets_views.next_uncategorized),

    url(r'^api/collections/user-collections/(?P<user_id>\d+)$', sheets_views.user_collections_api),
    url(r'^api/collections/upload$', sefaria_views.collections_image_upload),
    url(r'^api/collections/for-sheet/(?P<sheet_id>\d+)$', sheets_views.collections_for_sheet_api),
    url(r'^api/collections(/(?P<slug>[^/]+))?$', sheets_views.collections_api),
    url(r'^api/collections/(?P<slug>[^/]+)/set-role/(?P<uid>\d+)/(?P<role>[^/]+)$', sheets_views.collections_role_api),
    url(r'^api/collections/(?P<slug>[^/]+)/invite/(?P<uid_or_email>[^/]+)(?P<uninvite>\/uninvite)?$',
        sheets_views.collections_invite_api),
    url(r'^api/collections/(?P<slug>[^/]+)/(?P<action>(add|remove))/(?P<sheet_id>\d+)',
        sheets_views.collections_inclusion_api),
    url(r'^api/collections/(?P<slug>[^/]+)/pin-sheet/(?P<sheet_id>\d+)', sheets_views.collections_pin_sheet_api),

    url(r'^api/dummy-search$', reader_views.dummy_search_api),
    url(r'^api/search-wrapper/es6$', reader_views.search_wrapper_api, {'es6_compat': True}),
    url(r'^api/search-wrapper/es8$', reader_views.search_wrapper_api),
    url(r'^api/search-wrapper$', reader_views.search_wrapper_api, {'es6_compat': True}),
    url(r'^api/search-path-filter/(?P<book_title>.+)$', reader_views.search_path_filter),

    url(r'^api/(?P<action>(follow|unfollow))/(?P<uid>\d+)$', reader_views.follow_api),
    url(r'^api/(?P<kind>(followers|followees))/(?P<uid>\d+)$', reader_views.follow_list_api),

    url(r'^api/(?P<action>(block|unblock))/(?P<uid>\d+)$', reader_views.block_api),

    url(r'^api/topics$', reader_views.topics_list_api),
    url(r'^api/topics/generate-prompts/(?P<slug>.+)$', reader_views.generate_topic_prompts_api),
    url(r'^api/topics-graph/(?P<topic>.+)$', reader_views.topic_graph_api),
    url(r'^api/topics/pools/(?P<pool_name>.+)$', reader_views.topic_pool_api),
    url(r'^_api/topics/featured-topic/?$', reader_views.featured_topic_api),
    url(r'^api/topics/trending/?$', reader_views.trending_topics_api),
    url(r'^api/ref-topic-links/bulk$', reader_views.topic_ref_bulk_api),
    url(r'^api/ref-topic-links/(?P<tref>.+)$', reader_views.topic_ref_api),
    url(r'^api/v2/topics/(?P<topic>.+)$', reader_views.topics_api, {'v2': True}),
    url(r'^api/topics/(?P<topic>.+)$', reader_views.topics_api),
    url(r'^api/topic/new$', reader_views.add_new_topic_api),
    url(r'^api/topic/delete/(?P<topic>.+)$', reader_views.delete_topic),
    url(r'^api/topic/reorder$', reader_views.reorder_topics),
    url(r'^api/source/reorder$', reader_views.reorder_sources),
    url(r'^api/bulktopics$', reader_views.bulk_topic_api),
    url(r'^api/recommend/topics(/(?P<ref_list>.+))?', reader_views.recommend_topics_api),

    url(r'^api/portals/(?P<slug>.+)$', reader_views.portals_api),

    url(r'^api/history/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.texts_history_api),
    url(r'^api/history/(?P<tref>.+)$', reader_views.texts_history_api),

    url(r'^api/locks/set/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.set_lock_api),
    url(r'^api/locks/release/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.release_lock_api),
    url(r'^api/locks/check/(?P<tref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.check_lock_api),

    url(r'^api/locktext/(?P<title>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.lock_text_api),
    url(r'^api/version/flags/(?P<title>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.flag_text_api),

    url(r'^api/revert/(?P<tref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)/(?P<revision>\d+)$', reader_views.revert_api),

    url(r'^api/img-gen/(?P<tref>.+)$', reader_views.social_image_api),

    url(r'^api/passages/(?P<refs>.+)$', sefaria_views.passages_api),

    url(r'^api/send_feedback$', sefaria_views.generate_feedback),

    url(r'^api/subscribe/(?P<org>.+)/(?P<email>.+)$', sefaria_views.generic_subscribe_to_newsletter_api),
    url(r'^api/subscribe/(?P<email>.+)$', sefaria_views.subscribe_sefaria_newsletter_view),
    url(r'^api/newsletter_mailing_lists/?$', sefaria_views.get_available_newsletter_mailing_lists),

    url(r'^api/stats/library-stats', sefaria_views.library_stats),
    url(r'^api/stats/core-link-stats', sefaria_views.core_link_stats),

    url(fr'api/register/$', sefaria_views.register_api),
    url(fr'api/account/delete$', reader_views.delete_user_account_api),
    url(fr'interface/(?P<language>english|hebrew)$', reader_views.interface_language_redirect),

    url(r'^gauth$', gauth_views.index, name="gauth_index"),
    url(r'^gauth/callback$', gauth_views.auth_return, name="gauth_callback"),
    url(r'^unlink-gauth$', sefaria_views.unlink_gauth),
    url(r'^data\.(?:(?:\d+)\.)?js$', sefaria_views.data_js),  # Allow for regular data.js and also data.<timestamp>.js for caching
    url(r'^sefaria\.js$', sefaria_views.sefaria_js),

    url(r'^linker\.?v?([0-9]+)?\.js$', sefaria_views.linker_js),
    url(r'^api/find-refs/report/?$', sefaria_views.find_refs_report_api),
    url(r'^api/find-refs/?$', sefaria_views.find_refs_api),
    url(r'^api/regexs/(?P<titles>.+)$', sefaria_views.title_regex_api),
    url(r'^api/websites/(?P<domain>.+)$', sefaria_views.websites_api),
    url(r'^api/linker-data/(?P<titles>.+)$', sefaria_views.linker_data_api),
    url(r'^api/bulktext/(?P<refs>.+)$', sefaria_views.bulktext_api),
    url(r'^api/text-upload$', sefaria_views.text_upload_api),
    url(r'^api/linker-track$', sefaria_views.linker_tracking_api),

    url(r'^api/guides/(?P<guide_key>[^/]+)$', guides_views.guides_api),

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
    url(r'^admin/rebuild/shared-cache', sefaria_views.rebuild_shared_cache),
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
    url(fr'^{ADMIN_PATH}/?', include(admin.site.urls)),

    url(r'^(?P<tref>[^/]+)/(?P<lang>\w\w)/(?P<version>.*)$', reader_views.old_versions_redirect),
]

shared_patterns += site_urlpatterns
shared_patterns += staticfiles_urlpatterns()
shared_patterns += [
    url(r'^(?P<tref>[^/]+)(/)?$', reader_views.catchall)
]

# Keep admin accessible
maintenance_patterns = [
    url(r'^admin/reset/cache', sefaria_views.reset_cache),
    url(r'^admin/?', include(admin.site.urls)),
    url(r'^healthz/?$', reader_views.application_health_api),  # this oddly is returning 'alive' when it's not.  is k8s jumping in the way?
    url(r'^health-check/?$', reader_views.application_health_api),
    url(r'^healthz-rollout/?$', reader_views.rollout_health_api),
]
# Everything else gets maintenance message
maintenance_patterns += [
    url(r'.*', sefaria_views.maintenance_message)
]
