# -*- coding: utf-8 -*-

from django.conf.urls import url
from django.http import HttpResponseRedirect
import reader.views as reader_views
from sefaria.settings import STATIC_URL


static_pages = [
    "strategy",
    "supporters",
    "connect",
    "visualizations",
    "jobs",
    "terms",
    "privacy-policy",
    "coming-soon",
    "shraga-silverstein",
    "henry-and-julia-koschitzky-apps",
    "adin-even-israel-steinsaltz",
    "william-davidson-talmud",
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
    "remote-learning",
    "sheets",
    "powered-by-sefaria-contest-2020",
    "powered-by-sefaria-contest-2021",
    "ramban-sponsorships",
    "rabbis",
    "contest",
    "design-system",
    "powered-by",
    "word-by-word",
    "cloudflare_site_is_down_en",
    "cloudflare_site_is_down_he",
    "team",
]

static_pages_by_lang = [
    "about",
    "ways-to-give",
]


# Static and Semi Static Content
site_urlpatterns = [
    url(r'^enable_new_editor/?$', reader_views.enable_new_editor),
    url(r'^disable_new_editor/?$', reader_views.disable_new_editor),
    url(r'^metrics/?$', reader_views.metrics),
    url(r'^digitized-by-sefaria/?$', reader_views.digitized_by_sefaria),
    url(r'^apple-app-site-association/?$', reader_views.apple_app_site_association),
    url(r'^\.well-known/apple-app-site-association/?$', reader_views.apple_app_site_association),
    url(r'^\.well-known/assetlinks.json/?$', reader_views.android_asset_links_json),
    url(r'^(%s)/?$' % "|".join(static_pages), reader_views.serve_static),
    url(r'^(%s)/?$' % "|".join(static_pages_by_lang), reader_views.serve_static_by_lang),
    url(r'^healthz/?$', reader_views.application_health_api),  # this oddly is returning 'alive' when it's not.  is k8s jumping in the way?
    url(r'^health-check/?$', reader_views.application_health_api),
    url(r'^healthz-rollout/?$', reader_views.rollout_health_api),
]


# Redirects to Wikis etc
site_urlpatterns += [
    url(r'^donate/mobile?$', lambda x: HttpResponseRedirect('https://donate.sefaria.org/en?c_src=mobile-app' if x.interfaceLang == 'english' else 'https://donate.sefaria.org/he?c_src=mobile-app')),
    url(r'^donate/?$', lambda x: HttpResponseRedirect('https://donate.sefaria.org/en' if x.interfaceLang == 'english' else 'https://donate.sefaria.org/he')),
    url(r'^wiki/?$', lambda x: HttpResponseRedirect('https://github.com/Sefaria/Sefaria-Project/wiki')),
    url(r'^developers/?$', lambda x: HttpResponseRedirect('https://github.com/Sefaria/Sefaria-Project/wiki#developers')),
    url(r'^request-a-text/?$', lambda x: HttpResponseRedirect('https://goo.gl/forms/ru33ivawo7EllQxa2')),
    url(r'^request-a-training/?$', lambda x: HttpResponseRedirect(' https://docs.google.com/forms/d/1CJZHRivM2qFeF2AE2afpvE1m86AgJPCxUEFu5EG92F8/edit?usp=sharing_eil&ts=5a4dc5e0')),
    url(r'^contribute/?$', lambda x: HttpResponseRedirect('https://github.com/Sefaria/Sefaria-Project/wiki/Guide-to-Contributing')),
    url(r'^faq/?$', lambda x: HttpResponseRedirect('/collections/help-center' if x.interfaceLang == 'english' else '/collections/%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%A0%D7%A4%D7%95%D7%A6%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90')),
    url(r'^help/?$', lambda x: HttpResponseRedirect('/collections/help-center' if x.interfaceLang == 'english' else '/collections/%D7%A9%D7%90%D7%9C%D7%95%D7%AA-%D7%A0%D7%A4%D7%95%D7%A6%D7%95%D7%AA-%D7%91%D7%A1%D7%A4%D7%A8%D7%99%D7%90')),
    url(r'^gala/?$', lambda x: HttpResponseRedirect('https://donate.sefaria.org/event/sefarias-10-year-anniversary-gala/e486954')),
    url(r'^give/(?P<campaign_id>[a-zA-Z0-9]+)/?$', lambda x, campaign_id: HttpResponseRedirect(f'https://donate.sefaria.org/give/550774/#!/donation/checkout?c_src={campaign_id}')),
    url(r'^give/?$', lambda x: HttpResponseRedirect(f'https://donate.sefaria.org/give/550774/#!/donation/checkout?c_src=mu')),
    url(r'^jfn?$', lambda x: HttpResponseRedirect('https://www.sefaria.org/sheets/60494')),
    url(r'^[nN]echama/?', lambda x: HttpResponseRedirect("/collections/גיליונות-נחמה")),
    url(r'^contest?', lambda x: HttpResponseRedirect("/powered-by-sefaria-contest-2020")),
    url(r'^dayoflearningcalendar/?$', lambda x: HttpResponseRedirect("https://docs.google.com/spreadsheets/d/1CUVb18QKbRcgBvBzH-x9R_Stx-_o5YkE9bi7oYBTlRw/edit#gid=0")),
]


site_urlpatterns +=[
    url(r'^textmap/?$', lambda x: HttpResponseRedirect(STATIC_URL + 'files/Sefaria-Text-Map-June-2016.pdf')),
    url(r'^workshop/?$', lambda x: HttpResponseRedirect(STATIC_URL + 'files/Sefaria_SummerMeeting_2016.pdf')),
    url(r'^ideasforteaching/?$',lambda x: HttpResponseRedirect(STATIC_URL + 'files/Sefaria_Teacher_Generated_Ideas_for_Your_Classroom.pdf')),
    url(r'^strategicplan/?$',lambda x: HttpResponseRedirect(STATIC_URL + 'files/Sefaria_Strategic_Plan.pdf')),
    url(r'^annualreport2021?$', lambda x: HttpResponseRedirect('/annualreport/2021')), # Added for backwards compatability for old links that might still point to this
    url(r'^annualreport/(?P<report_year>\d+)$', reader_views.annual_report),
]
