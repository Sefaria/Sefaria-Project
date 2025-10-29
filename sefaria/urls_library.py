from django.conf.urls import url
from django.conf.urls import handler404, handler500
from django.contrib import admin
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from functools import partial
import reader.views as reader_views
import sefaria.views as sefaria_views
from sefaria.urls_shared import shared_patterns, maintenance_patterns
from sefaria.settings import DOWN_FOR_MAINTENANCE

admin.autodiscover()
handler500 = 'reader.views.custom_server_error'
handler404 = 'reader.views.custom_page_not_found'

urlpatterns = [
    url(r'^$', reader_views.home, name="home"),
    url(r'^texts/?$', reader_views.texts_list, name="table_of_contents"),
    url(r'^texts/saved/?$', reader_views.saved_content),
    url(r'^texts/notes/?$', reader_views.notes),
    url(r'^texts/history/?$', reader_views.user_history_content),
    url(r'^texts/recent/?$', reader_views.old_recent_redirect),
    url(r'^texts/(?P<cats>.+)?$', reader_views.texts_category_list),
    url(r'^calendars/?$', reader_views.calendars),
    url(r'^translations/(?P<slug>[^.]+)$', reader_views.translations_page),
    url(r'^modtools/?$', reader_views.modtools),
    url(r'^modtools/upload_text$', sefaria_views.modtools_upload_workflowy),
    url(r'^modtools/links$', sefaria_views.links_upload_api),
    url(r'^modtools/links/(?P<tref1>.+)/(?P<tref2>.+)$', sefaria_views.get_csv_links_by_refs_api),
    url(r'^modtools/index_links/(?P<tref1>.+)/(?P<tref2>.+)$',
        partial(sefaria_views.get_csv_links_by_refs_api, by_segment=True)),
    url(r'^torahtracker/?$', reader_views.user_stats),
    url(r'^explore(-(?P<topCat>[\w-]+)-and-(?P<bottomCat>[\w-]+))?(/(?P<book1>[A-Za-z-,\']+))?(/(?P<book2>[A-Za-z-,\']+))?(/(?P<lang>\w\w)/?)?/?$',
        reader_views.explore),

    url(r'^visualize/library/(?P<lang>[enh]*)/?(?P<cats>.*)/?$', reader_views.visualize_library),
    url(r'^visualize/library/?(?P<cats>.*)/?$', reader_views.visualize_library),
    url(r'^visualize/toc$', reader_views.visualize_toc),
    url(r'^visualize/parasha-colors$', reader_views.visualize_parasha_colors),
    url(r'^visualize/links-through-rashi$', reader_views.visualize_links_through_rashi),
    url(r'^visualize/talmudic-relationships$', reader_views.talmudic_relationships),
    url(r'^visualize/sefer-hachinukh-mitzvot$', reader_views.sefer_hachinukh_mitzvot),
    url(r'^visualize/timeline$', reader_views.visualize_timeline),
    url(r'^visualize/unique-words-by-commentator', reader_views.unique_words_viz),

    url(r'^settings/account?$', reader_views.account_settings),
    url(r'^settings/account/user$', reader_views.account_user_update),
    url(r'^settings/profile?$', reader_views.settings_profile_redirect),

    url(r'^community/?$', reader_views.community_to_voices_redirect),

    url(r'^parashat-hashavua$', reader_views.parashat_hashavua_redirect),
    url(r'^todays-daf-yomi$', reader_views.daf_yomi_redirect),

    url(r'^add/textinfo/(?P<new_title>.+)$', reader_views.edit_text_info),
    url(r'^add/new/?$', reader_views.edit_text),
    url(r'^add/(?P<ref>.+)$', reader_views.edit_text),
    url(r'^translate/(?P<ref>.+)$', reader_views.edit_text),
    url(r'^edit/terms/(?P<term>.+)$', reader_views.terms_editor),
    url(r'^add/terms/(?P<term>.+)$', reader_views.terms_editor),
    url(r'^edit/(?P<ref>.+)/(?P<lang>\w\w)/(?P<version>.+)$', reader_views.edit_text),
    url(r'^edit/(?P<ref>.+)$', reader_views.edit_text),

    url(r'^dashboard/?$', reader_views.dashboard),

    url(r'^activity/?$', reader_views.global_activity),
    url(r'^activity/leaderboard?$', reader_views.leaderboard),
    url(r'^activity/(?P<page>\d+)$', reader_views.global_activity),
    url(r'^activity/(?P<slug>[^/]+)/(?P<page>\d+)?$', reader_views.user_activity),
    url(r'^activity/(?P<tref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)/(?P<page>\d+)$', reader_views.segment_history),
    url(r'^activity/(?P<tref>[^/]+)/(?P<lang>.{2})/(?P<version>.+)$', reader_views.segment_history),

    url(r'^random/link$', reader_views.random_redirect),
    url(r'^random/?$', reader_views.random_text_page),

    url(r'^compare/?((?P<comp_ref>[^/]+)/)?((?P<lang>en|he)/)?((?P<v1>[^/]+)/)?(?P<v2>[^/]+)?$', sefaria_views.compare),

    url(r'^garden/(?P<key>.+)$', reader_views.custom_visual_garden_page),
    url(r'^garden/sheets/(?P<key>.+)$', reader_views.sheet_tag_visual_garden_page),
    url(r'^garden/search/(?P<q>.+)$', reader_views.search_query_visual_garden_page),
    url(r'^vgarden/custom/(?P<key>.*)$', reader_views.custom_visual_garden_page),

    url(r'^download/version/(?P<title>.+) - (?P<lang>[he][en]) - (?P<versionTitle>.+)\.(?P<format>plain\.txt)',
        sefaria_views.text_download_api),
    url(r'^download/version/(?P<title>.+) - (?P<lang>[he][en]) - (?P<versionTitle>.+)\.(?P<format>json|csv|txt)',
        sefaria_views.text_download_api),
    url(r'^download/bulk/versions/', sefaria_views.bulk_download_versions_api),

]

urlpatterns += shared_patterns

if DOWN_FOR_MAINTENANCE:
    urlpatterns = maintenance_patterns
