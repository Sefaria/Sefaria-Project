from django.urls import path, re_path
from django.conf.urls import handler404, handler500
from django.contrib import admin
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from functools import partial
import reader.views as reader_views
import sefaria.views as sefaria_views
from sefaria.urls_shared import shared_patterns, maintenance_patterns
from sefaria.settings import DOWN_FOR_MAINTENANCE
import remote_config.views as remote_config_views
from sefaria.heapdump import heapdump_view

admin.autodiscover()
handler500 = 'reader.views.custom_server_error'
handler404 = 'reader.views.custom_page_not_found'

urlpatterns = [
    path('', reader_views.home, name="home"),
    re_path(r'^texts/?$', reader_views.texts_list, name="table_of_contents"),
    re_path(r'^texts/notes/?$', reader_views.notes),
    re_path(r'^texts/recent/?$', reader_views.old_recent_redirect),
    re_path(r'^texts/(?P<cats>.+)?$', reader_views.texts_category_list),
    re_path(r'^calendars/?$', reader_views.calendars),
    re_path(r'^translations/(?P<slug>[^.]+)$', reader_views.translations_page),
    re_path(r'^modtools/?$', reader_views.modtools),
    path('modtools/upload_text', sefaria_views.modtools_upload_workflowy),
    path('modtools/links', sefaria_views.links_upload_api),
    path('modtools/links/<path:tref1>/<path:tref2>', sefaria_views.get_csv_links_by_refs_api),
    path('modtools/index_links/<path:tref1>/<path:tref2>',
        partial(sefaria_views.get_csv_links_by_refs_api, by_segment=True)),
    re_path(r'^torahtracker/?$', reader_views.user_stats),
    re_path(r'^explore(-(?P<topCat>[\w-]+)-and-(?P<bottomCat>[\w-]+))?(/(?P<book1>[A-Za-z-,\']+))?(/(?P<book2>[A-Za-z-,\']+))?(/(?P<lang>\w\w)/?)?/?$',
        reader_views.explore),

    re_path(r'^visualize/library/(?P<lang>[enh]*)/?(?P<cats>.*)/?$', reader_views.visualize_library),
    re_path(r'^visualize/library/?(?P<cats>.*)/?$', reader_views.visualize_library),
    path('visualize/toc', reader_views.visualize_toc),
    path('visualize/parasha-colors', reader_views.visualize_parasha_colors),
    path('visualize/links-through-rashi', reader_views.visualize_links_through_rashi),
    path('visualize/talmudic-relationships', reader_views.talmudic_relationships),
    path('visualize/sefer-hachinukh-mitzvot', reader_views.sefer_hachinukh_mitzvot),
    path('visualize/timeline', reader_views.visualize_timeline),
    re_path(r'^visualize/unique-words-by-commentator', reader_views.unique_words_viz),

    re_path(r'^settings/account?$', reader_views.account_settings),
    path('settings/account/user', reader_views.account_user_update),
    re_path(r'^settings/profile/?$', reader_views.settings_profile_redirect),

    re_path(r'^community/?$', reader_views.community_to_voices_redirect),

    path('parashat-hashavua', reader_views.parashat_hashavua_redirect),
    path('todays-daf-yomi', reader_views.daf_yomi_redirect),

    path('add/textinfo/<path:new_title>', reader_views.edit_text_info),
    re_path(r'^add/new/?$', reader_views.edit_text),
    path('add/<path:ref>', reader_views.edit_text),
    path('translate/<path:ref>', reader_views.edit_text),
    path('edit/terms/<path:term>', reader_views.terms_editor),
    path('add/terms/<path:term>', reader_views.terms_editor),
    re_path(r'^edit/(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.edit_text),
    path('edit/<path:ref>', reader_views.edit_text),

    re_path(r'^dashboard/?$', reader_views.dashboard),

    re_path(r'^activity/?$', reader_views.global_activity),
    re_path(r'^activity/leaderboard?$', reader_views.leaderboard),
    path('activity/<int:page>', reader_views.global_activity),
    re_path(r'^activity/(?P<slug>[^/]+)/(?P<page>\d+)?$', reader_views.user_activity),
    re_path(r'^activity/(?P<tref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)/(?P<page>\d+)$', reader_views.segment_history),
    re_path(r'^activity/(?P<tref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)$', reader_views.segment_history),

    path('random/link', reader_views.random_redirect),
    re_path(r'^random/?$', reader_views.random_text_page),

    re_path(r'^compare/?((?P<comp_ref>[^/]+)/)?((?P<lang>en|he)/)?((?P<v1>[^/]+)/)?(?P<v2>[^/]+)?$', sefaria_views.compare),

    path('garden/<path:key>', reader_views.custom_visual_garden_page),
    path('garden/sheets/<path:key>', reader_views.sheet_tag_visual_garden_page),
    path('garden/search/<path:q>', reader_views.search_query_visual_garden_page),
    re_path(r'^vgarden/custom/(?P<key>.*)$', reader_views.custom_visual_garden_page),

    re_path(r'^download/version/(?P<title>.+) - (?P<lang>[he][en]) - (?P<versionTitle>.+)\.(?P<format>plain\.txt)',
        sefaria_views.text_download_api),
    re_path(r'^download/version/(?P<title>.+) - (?P<lang>[he][en]) - (?P<versionTitle>.+)\.(?P<format>json|csv|txt)',
        sefaria_views.text_download_api),
    re_path(r'^download/bulk/versions/', sefaria_views.bulk_download_versions_api),

]

# Operational tooling
urlpatterns += [
    path('admin/heapdump/', heapdump_view, name="heapdump"),
    re_path(r'^api/remote-config/?$', remote_config_views.remote_config_values, name="remote_config_api")
]

urlpatterns += shared_patterns

if DOWN_FOR_MAINTENANCE:
    urlpatterns = maintenance_patterns
