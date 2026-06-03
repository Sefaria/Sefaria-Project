# -*- coding: utf-8 -*-

from django.urls import re_path
from django.http import HttpResponseRedirect
import reader.views as reader_views
from sefaria.settings import STATIC_URL
from sites.sefaria.site_settings import SITE_SETTINGS


static_pages = [
    "strategy",
    "supporters",
    "visualizations",
    "jobs",
    "terms",
    "privacy-policy",
    "coming-soon",
    "shraga-silverstein",
    "henry-and-julia-koschitzky-apps",
    "adin-even-israel-steinsaltz",
    "william-davidson-talmud",
    "nash-bravmann-collection",
    "linker",
    "ios",
    "mobile",
    "app",
    "sefaria-edition",
    "sefaria-community-translation",
    "contributed-to-sefaria",
    "random-walk-through-torah",
    "educators",
    "the-sefaria-story",
    "aramaic-translation-contest",
    "newsletter",
    "testimonials",
    "torah-tab",
    "dicta-thanks",
    "daf-yomi",
    "powered-by-sefaria-contest-2020",
    "powered-by-sefaria-contest-2021",
    "ramban-sponsorships",
    "contest",
    "design-system",
    "powered-by",
    "word-by-word",
    "cloudflare_site_is_down_en",
    "cloudflare_site_is_down_he",
    "team",
    "products",
    "link-to-annual-report",
    'mobile-about-menu',
    "updates",
    "pioneers",
    "ai",
    "metrics"
]

static_pages_by_lang = [
    "about",
    "ways-to-give",
]


# Static and Semi Static Content
site_urlpatterns = [
    re_path(r'^metrics/?$', reader_views.metrics),
    re_path(r'^digitized-by-sefaria/?$', reader_views.digitized_by_sefaria),
    re_path(r'^(favicon\.ico|apple-touch-icon\.png|favicon\.svg)/?$', reader_views.module_favicon),
    re_path(r'^(?P<filename>site\.webmanifest|manifest\.json)/?$', reader_views.dynamic_manifest),
    re_path(r'^apple-app-site-association/?$', reader_views.apple_app_site_association),
    re_path(r'^\.well-known/apple-app-site-association/?$', reader_views.apple_app_site_association),
    re_path(r'^\.well-known/assetlinks.json/?$', reader_views.android_asset_links_json),
    re_path(r'^llms\.txt/?$', reader_views.serve_llms_txt),
    re_path(r'^(%s)/?$' % "|".join(static_pages), reader_views.serve_static),
    re_path(r'^(%s)/?$' % "|".join(static_pages_by_lang), reader_views.serve_static_by_lang),
    re_path(r'^healthz/?$', reader_views.application_health_api),  # this oddly is returning 'alive' when it's not.  is k8s jumping in the way?
    re_path(r'^health-check/?$', reader_views.application_health_api),
    re_path(r'^healthz-rollout/?$', reader_views.rollout_health_api),
]


# Redirects to Wikis etc
site_urlpatterns += [
    re_path(r'^donate/mobile?$', lambda x: HttpResponseRedirect('https://donate.sefaria.org/english?c_src=App' if x.interfaceLang == 'english' else 'https://donate.sefaria.org/he?c_src=App')),
    re_path(r'^donate/?$', lambda x: HttpResponseRedirect('https://donate.sefaria.org/english' if x.interfaceLang == 'english' else 'https://donate.sefaria.org/he')),
    re_path(r'^wiki/?$', lambda x: HttpResponseRedirect('https://developers.sefaria.org/docs/welcome')),
    re_path(r'^developers/?$', lambda x: HttpResponseRedirect('https://developers.sefaria.org')),
    re_path(r'^request-a-text/?$', lambda x: HttpResponseRedirect('https://goo.gl/forms/ru33ivawo7EllQxa2')),
    re_path(r'^request-a-training/?$', lambda x: HttpResponseRedirect(' https://docs.google.com/forms/d/1CJZHRivM2qFeF2AE2afpvE1m86AgJPCxUEFu5EG92F8/edit?usp=sharing_eil&ts=5a4dc5e0')),
    re_path(r'^contribute/?$', lambda x: HttpResponseRedirect('https://github.com/Sefaria/Sefaria-Project/wiki/Guide-to-Contributing')),
    re_path(r'^faq/?$', lambda x: HttpResponseRedirect(SITE_SETTINGS['HELP_CENTER_URLS']['EN_US'] if x.interfaceLang == 'english' else SITE_SETTINGS['HELP_CENTER_URLS']['HE'])),
    re_path(r'^help/?$', lambda x: HttpResponseRedirect(SITE_SETTINGS['HELP_CENTER_URLS']['EN_US'] if x.interfaceLang == 'english' else SITE_SETTINGS['HELP_CENTER_URLS']['HE'])), # Used in the app
    re_path(r'^gala/?$', lambda x: HttpResponseRedirect('https://donate.sefaria.org/event/sefarias-10-year-anniversary-gala/e486954')),
    re_path(r'^give/(?P<channel_source>[a-zA-Z0-9]+)/?$', lambda x, channel_source: HttpResponseRedirect(f'https://donate.sefaria.org/give/550774/#!/donation/checkout?c_src={channel_source}')),
    re_path(r'^give/?$', lambda x: HttpResponseRedirect(f'https://donate.sefaria.org/give/550774/#!/donation/checkout?c_src=mu')),
    re_path(r'^giving/?$', lambda x: HttpResponseRedirect('https://donate.sefaria.org/give/524771/#!/donation/checkout')),
    re_path(r'^jfn?$', lambda x: HttpResponseRedirect('https://voices.sefaria.org/sheets/60494')),
    re_path(r'^[nN]echama/?', lambda x: HttpResponseRedirect("/collections/גיליונות-נחמה")),
    re_path(r'^contest?', lambda x: HttpResponseRedirect("/powered-by-sefaria-contest-2020")),
    re_path(r'^dayoflearningcalendar/?$', lambda x: HttpResponseRedirect("https://docs.google.com/spreadsheets/d/1CUVb18QKbRcgBvBzH-x9R_Stx-_o5YkE9bi7oYBTlRw/edit#gid=0")),
    re_path(r'^rabbis/?$', lambda x: HttpResponseRedirect('/educators')),
    re_path(r'^connect/?$', lambda x: HttpResponseRedirect('/newsletter')),
]


site_urlpatterns +=[
    re_path(r'^textmap/?$', lambda x: HttpResponseRedirect(STATIC_URL + 'files/Sefaria-Text-Map-June-2016.pdf')),
    re_path(r'^workshop/?$', lambda x: HttpResponseRedirect(STATIC_URL + 'files/Sefaria_SummerMeeting_2016.pdf')),
    re_path(r'^ideasforteaching/?$',lambda x: HttpResponseRedirect(STATIC_URL + 'files/Sefaria_Teacher_Generated_Ideas_for_Your_Classroom.pdf')),
    re_path(r'^strategicplan/?$',lambda x: HttpResponseRedirect(STATIC_URL + 'files/Sefaria_Strategic_Plan.pdf')),
    re_path(r'^annualreport2021?$', lambda x: HttpResponseRedirect('/annualreport/2021')), # Added for backwards compatability for old links that might still point to this
    re_path(r'^annualreport(/(?P<report_year>\d+)/?|/?)$', reader_views.annual_report),
]
