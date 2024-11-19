# -*- coding: utf-8 -*-
from datetime import datetime, timedelta
from elasticsearch_dsl import Search
from elasticsearch import Elasticsearch
from random import choice
import json
import urllib.request, urllib.parse, urllib.error
from bson.json_util import dumps
import socket
import bleach
from collections import OrderedDict
import pytz
from html import unescape
import redis
import os
import re
import uuid

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from django.template.loader import render_to_string
from django.shortcuts import render, redirect
from django.http import Http404, QueryDict, HttpResponse
from django.contrib.auth.decorators import login_required
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.encoding import iri_to_uri
from django.utils.translation import ugettext as _
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt, csrf_protect, requires_csrf_token
from django.contrib.auth.models import User
from django import http
from django.utils import timezone
from django.utils.html import strip_tags
from bson.objectid import ObjectId

from sefaria.app_analytic import track_page_to_mp
from sefaria.model import *
from sefaria.google_storage_manager import GoogleStorageManager
from sefaria.model.user_profile import UserProfile, user_link, user_started_text, public_user_data, UserWrapper
from sefaria.model.collection import CollectionSet
from sefaria.model.webpage import get_webpages_for_ref
from sefaria.model.media import get_media_for_ref
from sefaria.model.schema import SheetLibraryNode
from sefaria.model.following import general_follow_recommendations
from sefaria.model.trend import user_stats_data, site_stats_data
from sefaria.client.wrapper import format_object_for_client, format_note_object_for_client, get_notes, get_links
from sefaria.client.util import jsonResponse
from sefaria.history import text_history, get_maximal_collapsed_activity, top_contributors, text_at_revision, \
    record_version_deletion, record_index_deletion
from sefaria.sheets import get_sheets_for_ref, get_sheet_for_panel, annotate_user_links, trending_topics
from sefaria.utils.util import text_preview, short_to_long_lang_code, epoch_time
from sefaria.utils.hebrew import hebrew_term
from sefaria.utils.tibetan import has_tibetan
from sefaria.utils.calendars import get_all_calendar_items, get_todays_calendar_items, get_keyed_calendar_items, \
    get_parasha, get_todays_parasha
from sefaria.settings import STATIC_URL, USE_VARNISH, USE_NODE, NODE_HOST, DOMAIN_LANGUAGES, MULTISERVER_ENABLED, \
    MULTISERVER_REDIS_SERVER, \
    MULTISERVER_REDIS_PORT, MULTISERVER_REDIS_DB, DISABLE_AUTOCOMPLETER, ENABLE_LINKER
from sefaria.site.site_settings import SITE_SETTINGS
from sefaria.system.multiserver.coordinator import server_coordinator
from sefaria.system.decorators import catch_error_as_json, sanitize_get_params, json_response_decorator
from sefaria.system.exceptions import InputError, PartialRefInputError, BookNameError, NoVersionFoundError, \
    DictionaryEntryNotFoundError
from sefaria.system.cache import django_cache
from sefaria.system.database import db
from sefaria.helper.search import get_query_obj
from sefaria.helper.crm.crm_mediator import CrmMediator
from sefaria.search import get_search_categories
from sefaria.helper.topic import get_topic, get_all_topics, get_topics_for_ref, get_topics_for_book, \
    get_bulk_topics, recommend_topics, get_top_topic, get_random_topic, \
    get_random_topic_source, edit_topic_source, \
    update_order_of_topic_sources, delete_ref_topic_link, update_authors_place_and_time
from sefaria.helper.community_page import get_community_page_items
from sefaria.helper.file import get_resized_file
from sefaria.image_generator import make_img_http_response
import sefaria.tracker as tracker

from sefaria.settings import NODE_TIMEOUT, DEBUG
from sefaria.model.category import TocCollectionNode
from sefaria.model.abstract import SluggedAbstractMongoRecord
from sefaria.utils.calendars import parashat_hashavua_and_haftara
import sefaria.model.story as sefaria_story
from PIL import Image
from io import BytesIO
from sefaria.utils.user import delete_user_account
from django.core.mail import EmailMultiAlternatives
from babel import Locale
from sefaria.helper.topic import update_topic, update_topic_titles
from sefaria.helper.category import update_order_of_category_children, check_term
from redis_clear import clear_redis_cache
from django.middleware.csrf import get_token
from django.utils.text import slugify
import random
import string

if USE_VARNISH:
    from sefaria.system.varnish.wrapper import invalidate_ref, invalidate_linked

import structlog

logger = structlog.get_logger(__name__)

#    #    #
# Initialized cache library objects that depend on sefaria.model being completely loaded.
logger.info("Initializing library objects.")
logger.info("Initializing TOC Tree")
library.get_toc_tree()

logger.info("Initializing Shared Cache")
library.init_shared_cache()

if not DISABLE_AUTOCOMPLETER:
    logger.info("Initializing Full Auto Completer")
    library.build_full_auto_completer()

    logger.info("Initializing Ref Auto Completer")
    library.build_ref_auto_completer()

    logger.info("Initializing Lexicon Auto Completers")
    library.build_lexicon_auto_completers()

    logger.info("Initializing Cross Lexicon Auto Completer")
    library.build_cross_lexicon_auto_completer()

    logger.info("Initializing Topic Auto Completer")
    library.build_topic_auto_completer()

if ENABLE_LINKER:
    logger.info("Initializing Linker")
    library.build_ref_resolver()

if server_coordinator:
    server_coordinator.connect()


#    #    #

def sitemap(request):
    # Define the path to the sitemap.xml file
    filepath = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sitemap.xml')
    try:
        with open(filepath, 'r') as f:
            sitemap_content = f.read()
        return HttpResponse(sitemap_content, content_type='application/xml')
    except FileNotFoundError:
        return HttpResponse("Sitemap not found", status=404, content_type='text/plain')


def robot(request):
    # Define the path to the robots.txt file
    filepath = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'robots.txt')
    try:
        with open(filepath, 'r') as f:
            robots_content = f.read()
        return HttpResponse(robots_content, content_type='text/plain')
    except FileNotFoundError:
        return HttpResponse("robots.txt not found", status=404, content_type='text/plain') 


def render_template(request, template_name='base.html', app_props=None, template_context=None, content_type=None,
                    status=None, using=None):
    """
    This is a general purpose custom function that serves to render all the templates in the project and provide a central point for all similar processing.
    It can take props that are meant for the Node render of ReaderApp (and will properly combine them with base_props() and serialize
    It also takes care of adding these props to the template context
    If needed (i.e. currently, if props are passed in) it will also attempt to call render_react_component so it doesnt have to be called by the view itself.
    :param request: the request object
    :param template_name: the template name to pass to render (defaults to base.html)
    :param app_props: props to pass to ReaderApp, either via node or the template for client side
    :param template_context: regular template context for the django template
    :param content_type: param from Django's render, if needed
    :param status: param from Django's render, if needed
    :param using: param from Django's render, if needed
    :return:
    """
    app_props = app_props if app_props else {}
    template_context = template_context if template_context else {}
    props = base_props(request)
    props.update(app_props)
    propsJSON = json.dumps(props, ensure_ascii=False)
    template_context["propsJSON"] = propsJSON
    if app_props:  # We are rendering the ReaderApp in Node, otherwise its jsut a Django template view with ReaderApp set to headerMode
        html = render_react_component("ReaderApp", propsJSON)
        template_context["html"] = html
    return render(request, template_name=template_name, context=template_context, content_type=content_type,
                  status=status, using=using)


def render_react_component(component, props):
    """
    Asks the Node Server to render `component` with `props`.
    `props` may either be JSON (to save reencoding) or a dictionary.
    Returns HTML.
    """
    if not USE_NODE:
        return render_to_string("elements/loading.html", context={"SITE_SETTINGS": SITE_SETTINGS})

    propsJSON = json.dumps(props, ensure_ascii=False) if isinstance(props, dict) else props
    cache_key = "todo"  # zlib.compress(propsJSON)
    url = NODE_HOST + "/" + component + "/" + cache_key

    encoded_args = urllib.parse.urlencode({
        "propsJSON": propsJSON,
    }).encode("utf-8")
    try:
        req = urllib.request.Request(url)
        response = urllib.request.urlopen(req, encoded_args, NODE_TIMEOUT)
        html = response.read().decode("utf-8")
        return html
    except Exception as e:
        # Catch timeouts, however they may come.
        if isinstance(e, socket.timeout) or (hasattr(e, "reason") and isinstance(e.reason, socket.timeout)):
            props = json.loads(props) if isinstance(props, str) else props
            logger.warning("Node timeout: {} / {} / {} / {}\n".format(
                props.get("initialPath"),
                "MultiPanel" if props.get("multiPanel", True) else "Mobile",
                "Logged In" if props.get("loggedIn", False) else "Logged Out",
                props.get("interfaceLang")
            ))
            return render_to_string("elements/loading.html", context={"SITE_SETTINGS": SITE_SETTINGS})
        else:
            # If anything else goes wrong with Node, just fall back to client-side rendering
            logger.warning("Node error: Fell back to client-side rendering.")
            return render_to_string("elements/loading.html", context={"SITE_SETTINGS": SITE_SETTINGS})


def base_props(request):
    """
    Returns a dictionary of props that all App pages get based on the request
    AND are able to be sent over the wire to the Node SSR server.
    """
    if hasattr(request, "init_shared_cache"):
        logger.warning("Shared cache disappeared while application was running")
        library.init_shared_cache(rebuild=True)

    if request.user.is_authenticated:
        profile = UserProfile(user_obj=request.user)
        user_data = {
            "_uid": request.user.id,
            "_email": request.user.email,
            "_uses_new_editor": True,
            "slug": profile.slug if profile else "",
            "is_moderator": request.user.is_staff,
            "is_editor": UserWrapper(user_obj=request.user).has_permission_group("Editors"),
            "is_sustainer": profile.is_sustainer,
            "full_name": profile.full_name,
            "profile_pic_url": profile.profile_pic_url,
            "is_history_enabled": profile.settings.get("reading_history", True),
            "translationLanguagePreference": request.translation_language_preference,
            "versionPrefsByCorpus": request.version_preferences_by_corpus,
            "following": profile.followees.uids,
            "blocking": profile.blockees.uids,
            "calendars": get_todays_calendar_items(**_get_user_calendar_params(request)),
            "notificationCount": profile.unread_notification_count(),
            "notifications": profile.recent_notifications().client_contents(),
            "saved": {"loaded": False,
                      "items": profile.get_history(saved=True, secondary=False, serialized=True, annotate=False)},
            # saved is initially loaded without text annotations so it can quickly immediately mark any texts/sheets as saved, but marks as `loaded: false` so the full annotated data will be requested if the user visits the saved/history page
            "last_place": profile.get_history(last_place=True, secondary=False, sheets=False, serialized=True)
        }
    else:
        user_data = {
            "_uid": None,
            "_email": "",
            "slug": "",
            "is_moderator": False,
            "is_editor": False,
            "is_sustainer": False,
            "full_name": "",
            "profile_pic_url": "",
            "is_history_enabled": True,
            "translationLanguagePreference": request.translation_language_preference,
            "versionPrefsByCorpus": request.version_preferences_by_corpus,
            "following": [],
            "blocking": [],
            "calendars": get_todays_calendar_items(**_get_user_calendar_params(request)),
            "notificationCount": 0,
            "notifications": [],
            "saved": {"loaded": False, "items": []},
            "last_place": []
        }
    user_data.update({
        "last_cached": library.get_last_cached_time(),
        "multiPanel": not request.user_agent.is_mobile and not "mobile" in request.GET,
        "initialPath": request.get_full_path(),
        "interfaceLang": request.interfaceLang,
        "translation_language_preference_suggestion": request.translation_language_preference_suggestion,
        "initialSettings": {
            "language": getattr(request, "contentLang", "english"),
            "layoutDefault": request.COOKIES.get("layoutDefault", "segmented"),
            "layoutTalmud": request.COOKIES.get("layoutTalmud", "continuous"),
            "layoutTanakh": request.COOKIES.get("layoutTanakh", "segmented"),
            "aliyotTorah": request.COOKIES.get("aliyotTorah", "aliyotOff"),
            "vowels": request.COOKIES.get("vowels", "all"),
            "punctuationTalmud": request.COOKIES.get("punctuationTalmud", "punctuationOn"),
            "biLayout": request.COOKIES.get("biLayout", "stacked"),
            "color": request.COOKIES.get("color", "light"),
            "fontSize": request.COOKIES.get("fontSize", 62.5),
        },
        "trendingTopics": trending_topics(days=7, ntags=5),
        "_siteSettings": SITE_SETTINGS,
        "_debug": DEBUG
    })
    return user_data


def user_credentials(request):
    if request.user.is_authenticated:
        return {"user_type": "session", "user_id": request.user.id}
    else:
        req_key = request.POST.get("apikey", None)
        header_key = request.META.get("HTTP_X_API_KEY", None)  # request.META["HTTP_AUTHORIZATION"]?
        key = req_key if req_key else header_key
        if not key:
            return {"user_type": "session", "user_id": None,
                    "error": "You must be logged in or use an API key to add, edit or delete links."}
        apikey = db.apikeys.find_one({"key": key})
        if not apikey:
            return {"user_type": "API", "user_id": None, "error": "Unrecognized API key."}
        # user = User.objects.get(id=apikey["uid"])
        return {"user_type": "API", "user_id": apikey["uid"]}


@ensure_csrf_cookie
def catchall(request, tref, sheet=None):
    """
    Handle any URL not explicitly covers in urls.py.
    Catches text refs for text content and text titles for text table of contents.
    """

    def reader_redirect(uref):
        # Redirect to standard URLs
        url = "/" + uref

        response = redirect(iri_to_uri(url), permanent=True)
        params = request.GET.urlencode()
        response['Location'] += "?%s" % params if params else ""
        return response

    if sheet is None:
        try:
            oref = Ref.instantiate_ref_with_legacy_parse_fallback(tref)
        except InputError:
            raise Http404

        uref = oref.url()
        if uref and tref != uref:
            return reader_redirect(uref)

        return text_panels(request, ref=tref)

    return text_panels(request, ref=tref, sheet=sheet)


@ensure_csrf_cookie
def old_versions_redirect(request, tref, lang, version):
    url = "/{}?v{}={}".format(tref, lang, version)
    response = redirect(iri_to_uri(url), permanent=True)
    params = request.GET.urlencode()
    response['Location'] += "&{}".format(params) if params else ""
    return response


def get_connections_mode(filter):
    # List of sidebar modes that can function inside a URL parameter to open the sidebar in that state.
    sidebarModes = (
        "Sheets", "Notes", "About", "AboutSheet", "Navigation", "Translations", "Translation Open", "WebPages",
        "extended notes", "Topics", "Torah Readings", "manuscripts", "Lexicon", "SidebarSearch")
    if filter[0] in sidebarModes:
        return filter[0], True
    elif filter[0].endswith(" ConnectionsList"):
        return "ConnectionsList", False
    elif filter[0].startswith("WebPage:"):
        return "WebPagesList", False
    else:
        return "TextList", False


def make_panel_dict(oref, versionEn, versionHe, filter, versionFilter, mode, **kwargs):
    """
    Returns a dictionary corresponding to the React panel state,
    additionally setting `text` field with textual content.
    """
    if oref.is_book_level():
        index_details = library.get_index(oref.normal()).contents(with_content_counts=True)
        index_details["relatedTopics"] = get_topics_for_book(oref.normal(), annotate=True)
        if kwargs.get('extended notes', 0) and (versionEn is not None or versionHe is not None):
            currVersions = {"en": versionEn, "he": versionHe}
            if versionEn is not None and versionHe is not None:
                curr_lang = kwargs.get("panelDisplayLanguage", "en")
                for key in list(currVersions.keys()):
                    if key == curr_lang:
                        continue
                    else:
                        currVersions[key] = None
            panel = {
                "menuOpen": "extended notes",
                "mode": "Menu",
                "bookRef": oref.normal(),
                "indexDetails": index_details,
                "currVersions": currVersions
            }
        else:
            panel = {
                "menuOpen": "book toc",
                "mode": "Menu",
                "bookRef": oref.normal(),
                "indexDetails": index_details,
                "versions": oref.version_list()
            }
    else:
        section_ref = oref.first_available_section_ref()
        oref = section_ref if section_ref else oref
        panel = {
            "mode": mode,
            "ref": oref.normal(),
            "refs": [oref.normal()] if not oref.is_spanning() else [r.normal() for r in oref.split_spanning_ref()],
            "currVersions": {
                "en": versionEn,
                "he": versionHe,
            },
            "filter": filter,
            "versionFilter": versionFilter,
        }
        if filter and len(filter):
            panel["connectionsMode"], delete_filter = get_connections_mode(filter)
            if panel["connectionsMode"] == "ConnectionsList":
                panel['filter'] = [x.replace(" ConnectionsList", "") for x in panel['filter']]
                if len(panel['filter']) == 1:
                    panel['connectionsCategory'] = panel['filter'][0]
            if panel['connectionsMode'] == "WebPagesList":
                panel['webPagesFilter'] = [x.replace("WebPage:", "") for x in panel['filter']][0]
            if delete_filter:
                del panel['filter']
        settings_override = {}
        panelDisplayLanguage = kwargs.get("connectionsPanelDisplayLanguage",
                                          None) if mode == "Connections" else kwargs.get("panelDisplayLanguage", None)
        aliyotOverride = kwargs.get("aliyotOverride")
        panel["selectedWords"] = kwargs.get("selectedWords", None)
        panel["sidebarSearchQuery"] = kwargs.get("sidebarSearchQuery", None)
        panel["selectedNamedEntity"] = kwargs.get("selectedNamedEntity", None)
        panel["selectedNamedEntityText"] = kwargs.get("selectedNamedEntityText", None)
        if panelDisplayLanguage:
            settings_override.update({"language": short_to_long_lang_code(panelDisplayLanguage)})
        if aliyotOverride:
            settings_override.update({"aliyotTorah": aliyotOverride})
        if settings_override:
            panel["settings"] = settings_override
        if mode != "Connections" and oref != None:
            try:
                text_family = TextFamily(oref, version=panel["currVersions"]["en"], lang="en",
                                         version2=panel["currVersions"]["he"], lang2="he", commentary=False,
                                         context=True, pad=True, alts=True, wrapLinks=False,
                                         translationLanguagePreference=kwargs.get("translationLanguagePreference",
                                                                                  None)).contents()
            except NoVersionFoundError:
                text_family = {}
            text_family["updateFromAPI"] = True
            text_family["next"] = oref.next_section_ref().normal() if oref.next_section_ref() else None
            text_family["prev"] = oref.prev_section_ref().normal() if oref.prev_section_ref() else None
            panel["text"] = text_family

            if oref.index.categories == ["Tanakh", "Torah"]:
                panel["indexDetails"] = oref.index.contents()  # Included for Torah Parashah titles rendered in text

            if oref.is_segment_level() or oref.is_range():  # we don't want to highlight "Genesis 3" but we do want "Genesis 3:4" and "Genesis 3-5"
                panel["highlightedRefs"] = [subref.normal() for subref in oref.range_list()]

    return panel


def make_search_panel_dict(get_dict, i, **kwargs):
    search_params = get_search_params(get_dict, i)
    # TODO hard to pass search params related to textSearchState and sheetSearchState as those are JS objects
    # TODO this is not such a pressing issue though
    panel = {
        "menuOpen": "search",
        "searchQuery": search_params["query"],
        "searchTab": search_params["tab"],
    }
    panelDisplayLanguage = kwargs.get("panelDisplayLanguage")
    if panelDisplayLanguage:
        panel["settings"] = {"language": short_to_long_lang_code(panelDisplayLanguage)}

    return panel


def make_sheet_panel_dict(sheet_id, filter, **kwargs):
    highlighted_node = None
    if "." in sheet_id:
        highlighted_node = int(sheet_id.split(".")[1])
        sheet_id = int(sheet_id.split(".")[0])
    sheet_id = int(sheet_id)

    db.sheets.update({"id": sheet_id}, {"$inc": {"views": 1}})
    sheet = get_sheet_for_panel(sheet_id)
    if "error" in sheet and sheet["error"] != "Sheet updated.":
        raise Http404
    sheet["ownerProfileUrl"] = public_user_data(sheet["owner"])["profileUrl"]

    if "assigner_id" in sheet:
        asignerData = public_user_data(sheet["assigner_id"])
        sheet["assignerName"] = asignerData["name"]
        sheet["assignerProfileUrl"] = asignerData["profileUrl"]
    if "viaOwner" in sheet:
        viaOwnerData = public_user_data(sheet["viaOwner"])
        sheet["viaOwnerName"] = viaOwnerData["name"]
        sheet["viaOwnerProfileUrl"] = viaOwnerData["profileUrl"]

    sheet["sources"] = annotate_user_links(sheet["sources"])
    panel = {
        "sheetID": sheet_id,
        "mode": "Sheet",
        "sheet": sheet,
        "highlightedNode": highlighted_node
    }

    ref = None
    if highlighted_node:
        ref = next((element["ref"] for element in sheet["sources"] if
                    element.get("ref") and element["node"] == int(highlighted_node)),
                   'Sheet ' + str(sheet_id) + '.' + str(highlighted_node))

    panelDisplayLanguage = kwargs.get("panelDisplayLanguage")
    if panelDisplayLanguage:
        panel["settings"] = {"language": short_to_long_lang_code(panelDisplayLanguage)}

    referer = kwargs.get("referer")
    if referer == "/sheets/new":
        panel["sheet"]["editor"] = True

    panels = []
    panels.append(panel)

    if filter is not None and ref is not None:
        panels += [make_panel_dict(Ref(ref), None, None, filter, None, "Connections", **kwargs)]
        return panels
    else:
        return panels


def make_panel_dicts(oref, versionEn, versionHe, filter, versionFilter, multi_panel, **kwargs):
    """
    Returns an array of panel dictionaries.
    Depending on whether `multi_panel` is True, connections set in `filter` are displayed in either 1 or 2 panels.
    """
    panels = []
    # filter may have value [], meaning "all".  Therefore we test filter with "is not None".
    if filter is not None and multi_panel:
        panels += [make_panel_dict(oref, versionEn, versionHe, filter, versionFilter, "Text", **kwargs)]
        panels += [make_panel_dict(oref, versionEn, versionHe, filter, versionFilter, "Connections", **kwargs)]
    elif filter is not None and not multi_panel:
        panels += [make_panel_dict(oref, versionEn, versionHe, filter, versionFilter, "TextAndConnections", **kwargs)]
    else:
        panels += [make_panel_dict(oref, versionEn, versionHe, filter, versionFilter, "Text", **kwargs)]

    return panels


@sanitize_get_params
def text_panels(request, ref, version=None, lang=None, sheet=None):
    """
    Handles views of ReaderApp that involve texts, connections, and text table of contents in panels.
    """
    if sheet == None:
        try:
            primary_ref = oref = Ref(ref)
            if primary_ref.book == "Sheet":
                sheet = True
                ref = '.'.join(map(str, primary_ref.sections))
        except InputError:
            raise Http404

    panels = []
    multi_panel = not request.user_agent.is_mobile and not "mobile" in request.GET
    # Handle first panel which has a different signature in params
    versionEn = request.GET.get("ven", None)
    if versionEn:
        versionEn = versionEn.replace("_", " ")
    versionHe = request.GET.get("vhe", None)
    if versionHe:
        versionHe = versionHe.replace("_", " ")

    filter = request.GET.get("with").replace("_", " ").split("+") if request.GET.get("with") else None
    filter = [] if filter == ["all"] else filter

    noindex = False

    if sheet == None:
        versionFilter = [request.GET.get("vside").replace("_", " ")] if request.GET.get("vside") else []

        if versionEn and not Version().load({"versionTitle": versionEn, "language": "en"}):
            raise Http404
        if versionHe and not Version().load({"versionTitle": versionHe, "language": "he"}):
            raise Http404
        versionEn, versionHe = override_version_with_preference(oref, request, versionEn, versionHe)

        kwargs = {
            "panelDisplayLanguage": request.GET.get("lang", request.contentLang),
            'extended notes': int(request.GET.get("notes", 0)),
            "translationLanguagePreference": request.translation_language_preference,
        }
        if filter is not None:
            lang1 = kwargs["panelDisplayLanguage"]
            lang2 = request.GET.get("lang2", None)
            if lang2:
                kwargs["connectionsPanelDisplayLanguage"] = lang2 if lang2 in ["en", "he"] else lang1 if lang1 in ["en",
                                                                                                                   "he"] else request.interfaceLang[
                                                                                                                              0:2]
        if request.GET.get("aliyot", None):
            kwargs["aliyotOverride"] = "aliyotOn" if int(request.GET.get("aliyot")) == 1 else "aliyotOff"
        kwargs["selectedWords"] = request.GET.get("lookup", None)
        kwargs["sidebarSearchQuery"] = request.GET.get("sbsq", None)
        kwargs["selectedNamedEntity"] = request.GET.get("namedEntity", None)
        kwargs["selectedNamedEntityText"] = request.GET.get("namedEntityText", None)
        panels += make_panel_dicts(oref, versionEn, versionHe, filter, versionFilter, multi_panel, **kwargs)

    elif sheet == True:
        panels += make_sheet_panel_dict(ref, filter,
                                        **{"panelDisplayLanguage": request.GET.get("lang", request.contentLang),
                                           "referer": request.path})

    # Handle any panels after 1 which are identified with params like `p2`, `v2`, `l2`.
    i = 2
    while True:
        ref = request.GET.get("p{}".format(i))

        if not ref:
            break
        if ref == "search":
            panelDisplayLanguage = request.GET.get("lang{}".format(i), request.contentLang)
            panels += [make_search_panel_dict(request.GET, i, **{"panelDisplayLanguage": panelDisplayLanguage})]

        elif ref == "sheet":
            sheet_id = request.GET.get("s{}".format(i))
            panelDisplayLanguage = request.GET.get("lang", request.contentLang)
            panels += make_sheet_panel_dict(sheet_id, None, **{"panelDisplayLanguage": panelDisplayLanguage})

        else:
            try:
                oref = Ref(ref)
            except InputError:
                i += 1
                continue  # Stop processing all panels?
                # raise Http404

            versionEn = request.GET.get("ven{}".format(i)).replace("_", " ") if request.GET.get(
                "ven{}".format(i)) else None
            versionHe = request.GET.get("vhe{}".format(i)).replace("_", " ") if request.GET.get(
                "vhe{}".format(i)) else None
            if not versionEn and not versionHe:
                # potential link using old version format
                language = request.GET.get("l{}".format(i))
                if language == "en":
                    versionEn = request.GET.get("v{}".format(i)).replace("_", " ") if request.GET.get(
                        "v{}".format(i)) else None
                else:  # he
                    versionHe = request.GET.get("v{}".format(i)).replace("_", " ") if request.GET.get(
                        "v{}".format(i)) else None
            versionEn, versionHe = override_version_with_preference(oref, request, versionEn, versionHe)
            filter = request.GET.get("w{}".format(i)).replace("_", " ").split("+") if request.GET.get(
                "w{}".format(i)) else None
            filter = [] if filter == ["all"] else filter
            versionFilter = [request.GET.get("vside").replace("_", " ")] if request.GET.get("vside") else []
            kwargs = {
                "panelDisplayLanguage": request.GET.get("lang{}".format(i), request.contentLang),
                'extended notes': int(request.GET.get("notes{}".format(i), 0)),
                "translationLanguagePreference": request.translation_language_preference,
            }
            if request.GET.get("aliyot{}".format(i), None):
                kwargs["aliyotOverride"] = "aliyotOn" if int(
                    request.GET.get("aliyot{}".format(i))) == 1 else "aliyotOff"
            kwargs["selectedWords"] = request.GET.get(f"lookup{i}", None)
            kwargs["sidebarSearchQuery"] = request.GET.get(f"sbsq{i}", None)
            kwargs["selectedNamedEntity"] = request.GET.get(f"namedEntity{i}", None)
            kwargs["selectedNamedEntityText"] = request.GET.get(f"namedEntityText{i}", None)
            if (versionEn and not Version().load({"versionTitle": versionEn, "language": "en"})) or \
                    (versionHe and not Version().load({"versionTitle": versionHe, "language": "he"})):
                i += 1
                continue  # Stop processing all panels?
                # raise Http404

            panels += make_panel_dicts(oref, versionEn, versionHe, filter, versionFilter, multi_panel, **kwargs)
        i += 1

    props = {
        "headerMode": False,
        "initialPanels": panels,
        "initialTab": request.GET.get("tab", None),
        "initialPanelCap": len(panels),
        "initialQuery": None,
        "initialNavigationCategories": None,
        "initialNavigationTopicCategory": None,
        "initialNavigationTopicTitle": None,
    }
    if sheet == None:
        title = primary_ref.he_normal() if request.interfaceLang == "hebrew" else primary_ref.normal()
        breadcrumb = ld_cat_crumbs(request, oref=primary_ref)

        if primary_ref.is_book_level():
            if request.interfaceLang == "hebrew":
                desc = getattr(primary_ref.index, 'heDesc', "")
                book = primary_ref.he_normal()
            else:
                desc = getattr(primary_ref.index, 'enDesc', "")
                book = primary_ref.normal()
            read = _("Read the text of %(book)s online with commentaries and connections.") % {'book': book}
            desc = desc + " " + read if desc else read

        else:
            segmentIndex = primary_ref.sections[-1] - 1 if primary_ref.is_segment_level() else 0
            try:
                enText = _reduce_ranged_ref_text_to_first_section(panels[0]["text"].get("text", []))
                heText = _reduce_ranged_ref_text_to_first_section(panels[0]["text"].get("he", []))
                enDesc = enText[segmentIndex] if segmentIndex < len(
                    enText) else ""  # get english text for section if it exists
                heDesc = heText[segmentIndex] if segmentIndex < len(
                    heText) else ""  # get hebrew text for section if it exists
                if request.interfaceLang == "hebrew":
                    desc = heDesc or enDesc  # if no hebrew, fall back on hebrew
                else:
                    desc = enDesc or heDesc  # if no english, fall back on hebrew

                desc = bleach.clean(desc, strip=True, tags=())
                desc = desc[:160].rsplit(' ', 1)[
                           0] + "..."  # truncate as close to 160 characters as possible while maintaining whole word. Append ellipses.

            except (IndexError, KeyError):
                desc = _("Explore 3,000 years of Jewish texts in Hebrew and English translation.")

    else:
        sheet = panels[0].get("sheet", {})
        sheet["title"] = unescape(sheet["title"])
        title = strip_tags(sheet["title"]) + " | " + _("Sefaria")
        breadcrumb = sheet_crumbs(request, sheet)
        desc = unescape(sheet.get("summary", _("A source sheet created with Sefaria's Source Sheet Builder")))
        noindex = sheet.get("noindex", False) or sheet["status"] != "public"

    if len(panels) > 0 and panels[0].get("refs") == [] and panels[0].get("mode") == "Text":
        logger.debug("Mangled panel state: {}".format(panels), stack_info=True)
    return render_template(request, 'base.html', props, {
        "title": title,
        "desc": desc,
        "canonical_url": canonical_url(request),
        "ldBreadcrumbs": breadcrumb,
        "noindex": noindex,
    })


def _reduce_ranged_ref_text_to_first_section(text_list):
    """
    given jagged-array-like list, return only first section
    :param text_list: list
    :return: returns list of text representing first section
    """
    if len(text_list) == 0:
        return text_list
    while not isinstance(text_list[0], str):
        text_list = text_list[0]
    return text_list


@sanitize_get_params
def texts_category_list(request, cats):
    """
    List of texts in a category.
    """
    if "Tanach" in cats:
        cats = cats.replace("Tanach", "Tanakh")
        return redirect("/texts/%s" % cats)

    if cats == "recent":
        title = _("Recently Viewed")
        desc = _("Texts that you've recently viewed on Sefaria.")
    else:
        cats = cats.split("/")
        tocObject = library.get_toc_tree().lookup(cats)
        if len(cats) == 0 or tocObject is None:
            return texts_list(request)
        cat_string = ", ".join(cats) if request.interfaceLang == "english" else ", ".join(
            [hebrew_term(cat) for cat in cats])
        catDesc = getattr(tocObject, "enDesc", '') if request.interfaceLang == "english" else getattr(tocObject,
                                                                                                      "heDesc", '')
        catShortDesc = getattr(tocObject, "enShortDesc", '') if request.interfaceLang == "english" else getattr(
            tocObject, "heShortDesc", '')
        catDefaultDesc = _("Read %(categories)s texts online with commentaries and connections.") % {
            'categories': cat_string}
        title = cat_string + _(" | Sefaria")
        desc = catDesc if len(catDesc) else catShortDesc if len(catShortDesc) else catDefaultDesc

    props = {
        "initialMenu": "navigation",
        "initialNavigationCategories": cats,
    }
    return render_template(request, 'base.html', props, {
        "title": title,
        "desc": desc,
        "canonical_url": canonical_url(request),
        "ldBreadcrumbs": ld_cat_crumbs(request, cats)
    })


@sanitize_get_params
def topics_category_page(request, topicCategory):
    """
    List of topics in a category.
    """
    topic_obj = Topic.init(topicCategory)
    if not topic_obj:
        raise Http404
    props = {
        "initialMenu": "topics",
        "initialNavigationTopicCategory": topicCategory,
        "initialNavigationTopicTitle": {
            "en": topic_obj.get_primary_title('en'),
            "he": topic_obj.get_primary_title('he')
        }
    }

    short_lang = 'en' if request.interfaceLang == 'english' else 'he'
    title = topic_obj.get_primary_title(short_lang) + " | " + _(
        "Texts & Source Sheets from Torah, Talmud and Sefaria's library of Jewish sources.")
    desc = _(
        "Jewish texts and source sheets about %(topic)s from Torah, Talmud and other sources in Sefaria's library.") % {
               'topic': topic_obj.get_primary_title(short_lang)}

    return render_template(request, 'base.html', props, {
        "title": title,
        "desc": desc,
    })


def all_topics_page(request, letter):
    """
    Page listing all topics alphabetically.
    """
    props = {
        "initialMenu": "allTopics",
        "initialNavigationTopicLetter": letter,
    }
    return render_template(request, 'base.html', props, {
        "title": _("Explore Jewish Texts by Topic"),
        "desc": _(
            "Explore Jewish texts related to traditional and contemporary topics, coming from Torah, Talmud, and more."),
    })


def get_search_params(get_dict, i=None):
    def get_param(param, i=None):
        return "{}{}".format(param, "" if i is None else i)

    def get_filters(prefix, filter_type):
        return [urllib.parse.unquote(f) for f in
                get_dict.get(get_param(prefix + filter_type + "Filters", i)).split("|")] if get_dict.get(
            get_param(prefix + filter_type + "Filters", i), "") else []

    sheet_filters_types = ("collections", "topics_en", "topics_he")
    sheet_filters = []
    sheet_agg_types = []
    for filter_type in sheet_filters_types:
        filters = get_filters("s", filter_type)
        sheet_filters += filters
        sheet_agg_types += [filter_type] * len(filters)
    text_filters = get_filters("t", "path")

    return {
        "query": urllib.parse.unquote(get_dict.get(get_param("q", i), "")),
        "tab": urllib.parse.unquote(get_dict.get(get_param("tab", i), "text")),
        "textField": ("naive_lemmatizer" if get_dict.get(get_param("tvar", i)) == "1" else "exact") if get_dict.get(
            get_param("tvar", i)) else "",
        "textSort": get_dict.get(get_param("tsort", i), None),
        "textFilters": text_filters,
        "textFilterAggTypes": [None for _ in text_filters],
        # currently unused. just needs to be equal len as text_filters
        "sheetSort": get_dict.get(get_param("ssort", i), None),
        "sheetFilters": sheet_filters,
        "sheetFilterAggTypes": sheet_agg_types,
    }


def get_version_preferences_from_dict(oref, version_preferences_by_corpus):
    corpus = oref.index.get_primary_corpus()
    vpref_dict = version_preferences_by_corpus.get(corpus, None)
    if vpref_dict is None:
        return None
    return vpref_dict


def override_version_with_preference(oref, request, versionEn, versionHe):
    vpref_dict = get_version_preferences_from_dict(oref, request.version_preferences_by_corpus)
    if vpref_dict is None:
        return versionEn, versionHe
    for lang, vtitle in vpref_dict.items():
        if Version().load({"versionTitle": vtitle, "language": lang, "title": oref.index.title}):
            # vpref exists and the version exists for this text
            if lang == "en" and not versionEn:
                versionEn = vtitle
            elif lang == "he" and not versionHe:
                versionHe = vtitle
    return versionEn, versionHe


@ensure_csrf_cookie
@sanitize_get_params
def search(request):
    """
    Search or Search Results page.
    """
    search_params = get_search_params(request.GET)

    props = {
        "initialMenu": "search",
        "initialQuery": search_params["query"],
        "initialSearchTab": search_params["tab"],
        "initialTextSearchFilters": search_params["textFilters"],
        "initialTextSearchFilterAggTypes": search_params["textFilterAggTypes"],
        "initialTextSearchField": search_params["textField"],
        "initialTextSearchSortType": search_params["textSort"],
        "initialSheetSearchFilters": search_params["sheetFilters"],
        "initialSheetSearchFilterAggTypes": search_params["sheetFilterAggTypes"],
        "initialSheetSearchSortType": search_params["sheetSort"]
    }
    return render_template(request, 'base.html', props, {
        "title": (search_params["query"] + " | " if search_params["query"] else "") + _("Sefaria Search"),
        "desc": _("Search 3,000 years of Jewish texts in Hebrew and English translation."),
        "noindex": True
    })


@login_required
def enable_new_editor(request):
    profile = UserProfile(id=request.user.id)
    profile.update({"uses_new_editor": True, "show_editor_toggle": True})
    profile.save()
    return redirect(f"/profile/{profile.slug}")


@login_required
def disable_new_editor(request):
    profile = UserProfile(id=request.user.id)
    profile.update({"uses_new_editor": False})
    profile.save()
    return redirect(f"/profile/{profile.slug}")


def public_collections(request):
    props = base_props(request)
    props.update({
        "collectionListing": CollectionSet.get_collection_listing(request.user.id)
    })
    title = _("Sefaria Collections")
    return menu_page(request, props, "collectionsPublic")


@login_required
def my_notes_redirect(request):
    return redirect("/my/profile?tab=notes")


def topic_page_redirect(request, tag):
    """
    Redirect legacy URLs to topics pages.
    """
    return redirect("/topics/{}".format(tag), permanent=True)


def sheets_pages_redirect(request, type=None):
    """
    Redirects old sheet pages URLs
    """
    if type == "public":
        return redirect("/sheets", permanent=True)

    elif type == "private":
        return redirect("/my/profile", permanent=True)


def topics_redirect(request):
    """
    Redirect legacy URLs (sheet tags page) to topics
    """
    return redirect("/topics", permanent=True)


@sanitize_get_params
def collection_page(request, slug):
    """
    Main page for collection named by `slug`
    """
    collection = Collection().load({"$or": [{"slug": slug}, {"privateSlug": slug}]})
    if not collection:
        raise Http404
    if slug != collection.slug:
        # Support URLs using previous set private slug
        return redirect("/collections/{}".format(collection.slug))

    authenticated = request.user.is_authenticated and collection.is_member(request.user.id)

    props = base_props(request)
    props.update({
        "initialMenu": "collection",
        "initialCollectionName": collection.name,
        "initialCollectionSlug": collection.slug,
        "initialCollectionTag": request.GET.get("tag", None),
        "initialTab": request.GET.get("tab", None)
    })

    props["collectionData"] = collection.contents(with_content=True, authenticated=authenticated)
    del props["collectionData"]["lastModified"]

    return render_template(request, 'base.html', props, {
        "title": collection.name + " | " + _("Sefaria Collections"),
        "desc": props["collectionData"].get("description", ""),
        "noindex": not getattr(collection, "listed", False)
    })


@login_required
def edit_collection_page(request, slug=None):
    if slug:
        collection = Collection().load({"slug": slug})
        if not collection:
            raise Http404
        collectionData = collection.contents()
        del collectionData["lastModified"]
    else:
        collectionData = None

    return render_template(request, 'edit_collection.html', None, {"initialData": collectionData})


def groups_redirect(request, group):
    """
    Redirect legacy groups URLs to collections.
    """
    if not group:
        return redirect("/collections")
    collection = Collection().load({"name": group.replace("-", " ")})
    if not collection:
        raise Http404

    param = "?tag={}".format(request.GET["tag"]) if "tag" in request.GET else ""
    url = "/collections/{}{}".format(collection.slug, param)
    return redirect(url)


@sanitize_get_params
def translations_page(request, slug):
    """
    Main page for translations
    """
    title_dictionary = {
        "ar": {"name": "Arabic", "nativeName": "عربى", "title": "نصوص يهودية بالعربية",
               "desc": "أكبر مكتبة مجانية للنصوص اليهودية المتاحة للقراءة عبر الإنترنت باللغات العبرية والعربية والإنجليزية بما في ذلك التوراة والتناخ والتلمود والميشناه والمدراش والتعليقات والمزيد."},
        "de": {"name": "German", "nativeName": "Deutsch", "title": "Jüdische Texte in Deutscher Sprache",
               "desc": "Die größte kostenlose Bibliothek jüdischer Texte, die online auf Hebräisch, Deutsch und Englisch gelesen werden kann, einschließlich Tora, Tanach, Talmud, Mischna, Midrasch, Kommentare und mehr."},
        "en": {"name": "English", "nativeName": "English", "title": "Jewish Texts in English",
               "desc": "The largest free library of Jewish texts available to read online in Hebrew and English including Torah, Tanakh, Talmud, Mishnah, Midrash, commentaries and more."},
        "eo": {"name": "Esperanto", "nativeName": "Esperanto", "title": "Judaj Tekstoj en Esperanto",
               "desc": "La plej granda senpaga biblioteko de judaj tekstoj legebla interrete en la hebrea, Esperanto kaj la angla inkluzive de Torao, Tanaĥo, Talmudo, Miŝnao, Midraŝo, komentaĵoj kaj pli."},
        "es": {"name": "Spanish", "nativeName": "Español", "title": "Textos Judíos en Español",
               "desc": "La biblioteca gratuita más grande de textos judíos disponibles para leer en línea en hebreo, español e inglés, incluyendo Torá, Tanaj, Talmud, Mishná, Midrash, comentarios y más."},
        "fa": {"name": "Persian", "nativeName": "فارسی", "title": "متون یهودی به زبان فارسی",
               "desc": "بزرگترین کتابخانه رایگان متون یهودی در دسترس برای خواندن آنلاین به زبان های عبری، فارسی و انگلیسی از جمله تورات، تناخ، تلمود، میشنا، میدراش، تفسیرها و غیره."},
        "fi": {"name": "Finnish", "nativeName": "suomen kieli", "title": "Juutalaiset tekstit suomeksi",
               "desc": "Suurin ilmainen kirjasto juutalaisia tekstejä luettavaksi verkossa hepreaksi, suomeksi ja englanniksi, mukaan lukien Toora, Tanakh, Talmud, Mishna, Midrash, kommentit ja paljon muuta."},
        "fr": {"name": "French", "nativeName": "Français", "title": "Textes juifs en français",
               "desc": "La plus grande bibliothèque gratuite de textes juifs disponibles à lire en ligne en hébreu, français et anglais, y compris Torah, Tanakh, Talmud, Mishnah, Midrash, commentaires et plus encore."},
        "he": {"name": "Hebrew", "nativeName": "עברית", "title": "ספריה בעברית",
               "desc": "הספרייה החינמית הגדולה ביותר של טקסטים יהודיים הזמינים לקריאה מקוונת בעברית ובאנגלית, לרבות תורה, תנח, תלמוד, משנה, מדרש, פירושים ועוד."},
        "it": {"name": "Italian", "nativeName": "Italiano", "title": "Testi ebraici in italiano",
               "desc": "La più grande libreria gratuita di testi ebraici disponibile per la lettura online in ebraico, italiano e inglese, inclusi Torah, Tanakh, Talmud, Mishnah, Midrash, commenti e altro ancora."},
        # "lad": {"name": "Ladino", "nativeName": "Judeo-español"},
        "pl": {"name": "Polish", "nativeName": "Polski", "title": "Teksty żydowskie w języku polskim",
               "desc": "Największa bezpłatna biblioteka tekstów żydowskich dostępna do czytania online w języku hebrajskim, polskim i angielskim, w tym Tora, Tanach, Talmud, Miszna, Midrasz, komentarze i wiele innych."},
        "pt": {"name": "Portuguese", "nativeName": "Português", "title": "Textos judaicos em portugues",
               "desc": "A maior biblioteca gratuita de textos judaicos disponível para leitura online em hebraico, português e inglês, incluindo Torá, Tanakh, Talmud, Mishnah, Midrash, comentários e muito mais."},
        "ru": {"name": "Russian", "nativeName": "Pусский", "title": "Еврейские тексты на русском языке",
               "desc": "Самая большая бесплатная библиотека еврейских текстов, доступных для чтения онлайн на иврите, русском и английском языках, включая Тору, Танах, Талмуд, Мишну, Мидраш, комментарии и многое другое."},
        "yi": {"name": "Yiddish", "nativeName": "יידיש", "title": "יידישע טעקסטן אויף יידיש",
               "desc": "די גרעסטע פרייע ביבליאָטעק פון יידישע טעקסטן צו לייענען אָנליין אין לשון קדוש ,יידיש און ענגליש. תורה, תנך, תלמוד, משנה, מדרש, פירושים און אזוי אנדערע."},
    }
    if slug not in title_dictionary:
        raise Http404
    props = base_props(request)
    props.update({
        "initialMenu": "translationsPage",
        "initialTranslationsSlug": slug,
    })
    return render_template(request, 'base.html', props, {
        "title": title_dictionary[slug]["title"] if "title" in title_dictionary[slug] else "Jewish Texts in " +
                                                                                           title_dictionary[slug][
                                                                                               "name"] if slug in title_dictionary else "Jewish Texts in" + " " + slug,
        "desc": title_dictionary[slug]["desc"] if "desc" in title_dictionary[
            slug] else "The largest free library of Jewish texts available to read online in Hebrew, " +
                       title_dictionary[slug][
                           "name"] + ", and English including Torah, Tanakh, Talmud, Mishnah, Midrash, commentaries and more.",
        "noindex": False
    })


@sanitize_get_params
def menu_page(request, props=None, page="", title="", desc=""):
    """
    View for any App page that can described with the `menuOpen` param in React
    """
    # Here we call props.update() and not a new dict because props are passed in from higher functions
    props = props if props else {}
    props.update({
        "initialMenu": page,
    })
    return render_template(request, 'base.html', props, {
        "title": title,
        "desc": desc,
        "canonical_url": canonical_url(request),
    })


def _get_user_calendar_params(request):
    if request.user.is_authenticated:
        profile = UserProfile(user_obj=request.user)
        custom = profile.settings.get("textual_custom", "ashkenazi")
    else:
        custom = "ashkenazi"  # this is default because this is the most complete data set
    return {"diaspora": request.diaspora, "custom": custom}


def texts_list(request):
    title = _("Pecha - Buddhism in your own words")
    desc = _("The largest free library of Buddhist texts available to read online in Tibetan, English and Chinese including Sutras, Tantras, Abhidharma, Vinaya, commentaries and more.")
    return menu_page(request, page="navigation", title=title, desc=desc)


def calendars(request):
    title = _("Learning Schedules") + " | " + _(SITE_SETTINGS["LIBRARY_NAME"]["en"])
    desc = _("Weekly Torah portions, Daf Yomi, and other schedules for Torah learning.")
    return menu_page(request, page="calendars", title=title, desc=desc)


@login_required
def saved(request):
    title = _("My Saved Content")
    desc = _("See your saved content on Sefaria")
    profile = UserProfile(user_obj=request.user)
    props = {"saved": {"loaded": True,
                       "items": profile.get_history(saved=True, secondary=False, serialized=True, annotate=True,
                                                    limit=20)}}
    return menu_page(request, props, page="saved", title=title, desc=desc)


def user_history(request):
    if request.user.is_authenticated:
        profile = UserProfile(user_obj=request.user)
        uhistory = profile.get_history(secondary=False, serialized=True, annotate=True,
                                       limit=20) if profile.settings.get("reading_history", True) else []
    else:
        uhistory = _get_anonymous_user_history(request)
    props = {"userHistory": {"loaded": True, "items": uhistory}}
    title = _("My User History")
    desc = _("See your user history on Sefaria")
    return menu_page(request, props, page="history", title=title, desc=desc)


def updates(request):
    title = _("New Additions to the Pecha Library")
    desc = _("See texts, translations and connections that have been recently added to Pecha.")
    return menu_page(request, page="updates", title=title, desc=desc)


@login_required
def user_stats(request):
    title = _("User Stats")
    return menu_page(request, page="user_stats", title=title)


@login_required
def notifications(request):
    # Notifications content is not rendered server side
    title = _("Sefaria Notifications")
    notifications = UserProfile(user_obj=request.user).recent_notifications()
    props = {
        "notifications": notifications.client_contents(),
    }
    return menu_page(request, props, page="notifications", title=title)


@staff_member_required
def modtools(request):
    title = _("Moderator Tools")
    return menu_page(request, page="modtools", title=title)


def canonical_url(request):
    if not SITE_SETTINGS["TORAH_SPECIFIC"]:
        return None

    path = request.get_full_path()
    if request.interfaceLang == "hebrew":
        host = "https://www.pecha.org"
        # Default params for texts, text toc, and text category
        path = re.sub("\?lang=he(&aliyot=0)?$", "", path)
    else:
        host = "https://www.pecha.org"
        # Default params for texts, text toc, and text category
        path = re.sub("\?lang=bi(&aliyot=0)?$", "", path)

    path = "" if path == "/" else path
    return host + path


"""
JSON - LD snippets for use in "rich snippets" - semantic markup.
"""


def _crumb(pos, id, name):
    return {
        "@type": "ListItem",
        "position": pos,
        "name": name,
        "item": {
            "@id": id,
        }}


def sheet_crumbs(request, sheet=None):
    if sheet is None:
        return ""
    short_lang = 'en' if request.interfaceLang == 'english' else 'he'
    main_topic = get_top_topic(sheet)
    if main_topic is None:  # crumbs make no sense if there are no topics on sheet
        return ""
    breadcrumbJsonList = [
        _crumb(1, "/topics", _("Topics")),
        _crumb(2, f"/topics/{main_topic.slug}", main_topic.get_primary_title(short_lang)),
        _crumb(3, f"/sheets/{sheet['id']}", _("Source Sheet"))
    ]
    return json.dumps({
        "@context": "http://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": breadcrumbJsonList
    })


def ld_cat_crumbs(request, cats=None, title=None, oref=None):
    """
    JSON - LD breadcrumbs(https://developers.google.com/search/docs/data-types/breadcrumbs)
    :param cats: List of category names
    :param title: String
    :return: serialized json-ld object, for inclusion in <script> tag.
    """

    if cats is None and title is None and oref is None:
        return ""

    # Fill in missing information
    if oref is not None:
        assert isinstance(oref, Ref)
        if cats is None:
            cats = oref.index.categories[:]
        if title is None:
            title = oref.index.title
    elif title is not None and cats is None:
        cats = library.get_index(title).categories[:]

    breadcrumbJsonList = [_crumb(1, "/texts", _("Texts"))]
    nextPosition = 2

    for i, c in enumerate(cats):
        name = hebrew_term(c) if request.interfaceLang == "hebrew" else c
        breadcrumbJsonList += [_crumb(nextPosition, "/texts/" + "/".join(cats[0:i + 1]), name)]
        nextPosition += 1

    if title:
        name = hebrew_term(title) if request.interfaceLang == "hebrew" else title
        breadcrumbJsonList += [_crumb(nextPosition, "/" + title.replace(" ", "_"), name)]
        nextPosition += 1

        if oref and oref.index_node != oref.index.nodes:
            for snode in oref.index_node.ancestors()[1:] + [oref.index_node]:
                if snode.is_default():
                    continue
                name = snode.primary_title("he") if request.interfaceLang == "hebrew" else snode.primary_title("en")
                breadcrumbJsonList += [_crumb(nextPosition, "/" + snode.ref().url(), name)]
                nextPosition += 1

        # todo: range?
        if oref and getattr(oref.index_node, "depth", None) and not oref.is_range():
            depth = oref.index_node.depth
            for i in range(len(oref.sections)):
                if request.interfaceLang == "english":
                    name = oref.index_node.sectionNames[i] + " " + oref.normal_section(i, "en")
                else:
                    name = hebrew_term(oref.index_node.sectionNames[i]) + " " + oref.normal_section(i, "he")
                breadcrumbJsonList += [_crumb(nextPosition, "/" + oref.context_ref(depth - i - 1).url(), name)]
                nextPosition += 1

    return json.dumps({
        "@context": "http://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": breadcrumbJsonList
    })


@ensure_csrf_cookie
@sanitize_get_params
def edit_text(request, ref=None, lang=None, version=None):
    """
    Opens a view directly to adding, editing or translating a given text.
    """
    if ref is not None:
        try:
            oref = Ref(ref)
            if oref.sections == []:
                # Only text name specified, let them chose section first
                initJSON = json.dumps({"mode": "add new", "newTitle": oref.normal()})
                mode = "Add"
            else:
                # Pull a particular section to edit
                # text = get_text(ref, lang=lang, version=version)
                text = TextFamily(Ref(ref), lang=lang, version=version).contents()
                text["mode"] = request.path.split("/")[1]
                mode = text["mode"].capitalize()
                text["edit_lang"] = lang if lang is not None else request.contentLang
                text["edit_version"] = version
                initJSON = json.dumps(text)
        except Exception as e:
            index = library.get_index(ref)
            if index:
                ref = None
                initJSON = json.dumps({"mode": "add new", "newTitle": index.contents()['title']})
    else:
        initJSON = json.dumps({"mode": "add new"})

    titles = json.dumps(library.full_title_list())
    page_title = "%s %s" % (mode, ref) if ref else "Add a New Text"

    return render_template(request, 'edit_text.html', None, {
        'titles': titles,
        'initJSON': initJSON,
        'page_title': page_title,
    })


@ensure_csrf_cookie
@sanitize_get_params
def edit_text_info(request, title=None, new_title=None):
    """
    Opens the Edit Text Info page.
    """
    if title:
        # Edit Existing
        title = title.replace("_", " ")
        i = library.get_index(title)
        if not (request.user.is_staff or user_started_text(request.user.id, title)):
            return render_template(request, 'static/generic.html', None, {
                "title": "Permission Denied",
                "content": "The Text Info for %s is locked.<br><br>Please email hello@sefaria.org if you believe edits are needed." % title
            })
        indexJSON = json.dumps(i.contents() if "toc" in request.GET else i.contents())
        versions = VersionSet({"title": title})
        text_exists = versions.count() > 0
        new = False
    elif new_title:
        # Add New
        new_title = new_title.replace("_", " ")
        try:  # Redirect to edit path if this title already exists
            library.get_index(new_title)
            return redirect("/edit/textinfo/%s" % new_title)
        except BookNameError:
            pass
        indexJSON = json.dumps({"title": new_title})
        text_exists = False
        new = True

    return render_template(request, 'edit_text_info.html', None, {
        'title': title,
        'indexJSON': indexJSON,
        'text_exists': text_exists,
        'new': new,
        'toc': library.get_toc()
    })


@ensure_csrf_cookie
@staff_member_required
def terms_editor(request, term=None):
    """
    Add/Editor a term using the JSON Editor.
    """
    if term is not None:
        existing_term = Term().load_by_title(term)
        data = existing_term.contents() if existing_term else {"name": term, "titles": []}
    else:
        return render_template(request, 'static/generic.html', None, {
            "title": "Terms Editor",
            "content": "Please include the primary Term name in the URL to uses the Terms Editor."
        })

    dataJSON = json.dumps(data)
    return render_template(request, 'edit_term.html', None, {
        'term': term,
        'dataJSON': dataJSON,
        'is_update': "true" if existing_term else "false"
    })


def interface_language_redirect(request, language):
    """
    Set the interfaceLang cookie, saves to UserProfile (if logged in)
    and redirects to `next` url param.
    """
    next = request.GET.get("next", "/")
    next = "/" if next == "undefined" else next

    for domain in DOMAIN_LANGUAGES:
        if DOMAIN_LANGUAGES[domain] == language and not request.get_host() in domain:
            next = domain + next
            next = next + ("&" if "?" in next else "?") + "set-language-cookie"
            break

    response = redirect(next)

    response.set_cookie("interfaceLang", language)
    if request.user.is_authenticated:
        p = UserProfile(id=request.user.id)
        p.settings["interface_language"] = language
        p.save()
    return response


@catch_error_as_json
@csrf_exempt
def modify_bulk_text_api(request, title):
    title = title.replace('_', ' ')
    if request.method == "POST":
        skip_links = request.GET.get("skip_links", False)
        count_after = int(request.GET.get("count_after", 0))
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})
        t = json.loads(j)
        versionTitle = t['versionTitle']
        language = t['language']
        versionSource = t.get("versionSource", None)
        version = Version().load({"title": title, "versionTitle": versionTitle, "language": language})
        if version is None:
            return jsonResponse(
                {"error": f"Version does not exist. Title: {title}, VTitle: {versionTitle}, Language: {language}"})

        def modify(uid):
            error_map = tracker.modify_bulk_text(uid, version, t['text_map'], vsource=versionSource,
                                                 skip_links=skip_links, count_after=count_after)
            response = {"status": "ok"}
            if len(error_map) > 0:
                response["status"] = "some refs failed"
                response["ref_error_map"] = error_map
            return response

        if not request.user.is_authenticated:
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to save texts."})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            return jsonResponse(modify(apikey['uid']))
        else:
            @staff_member_required
            @csrf_protect
            def protected_post(request):
                return jsonResponse(modify(request.user.id))

            return protected_post(request)
    return jsonResponse({"error": "Unsupported HTTP method."}, callback=request.GET.get("callback", None))


@catch_error_as_json
@csrf_exempt
def texts_api(request, tref):
    oref = Ref.instantiate_ref_with_legacy_parse_fallback(tref)
    tref = oref.url()

    if request.method == "GET":
        uref = oref.url()
        if uref and tref != uref:  # This is very similar to reader.reader_redirect subfunction, above.
            url = "/api/texts/" + uref
            response = redirect(iri_to_uri(url), permanent=True)
            params = request.GET.urlencode()
            response['Location'] += "?%s" % params if params else ""
            return response

        cb = request.GET.get("callback", None)
        context = int(request.GET.get("context", 1))
        commentary = bool(int(request.GET.get("commentary", False)))
        pad = bool(int(request.GET.get("pad", 1)))
        versionEn = request.GET.get("ven", None)
        versionHe = request.GET.get("vhe", None)
        firstAvailableRef = bool(int(request.GET.get("firstAvailableRef",
                                                     False)))  # use first available ref, which may not be the same as oref
        if firstAvailableRef:
            temp_oref = oref.first_available_section_ref()
            oref = temp_oref or oref  # don't overwrite oref if first available section ref fails
        layer_name = request.GET.get("layer", None)
        alts = bool(int(request.GET.get("alts", True)))
        wrapLinks = bool(int(request.GET.get("wrapLinks", False)))
        wrapNamedEntities = bool(int(request.GET.get("wrapNamedEntities", False)))
        stripItags = bool(int(request.GET.get("stripItags", False)))
        multiple = int(request.GET.get("multiple",
                                       0))  # Either undefined, or a positive integer (indicating how many sections forward) or negative integer (indicating backward)
        translationLanguagePreference = request.GET.get("transLangPref",
                                                        None)  # as opposed to vlangPref, this refers to the actual lang of the text
        fallbackOnDefaultVersion = bool(int(request.GET.get("fallbackOnDefaultVersion", False)))

        def _get_text(oref, versionEn=versionEn, versionHe=versionHe, commentary=commentary, context=context, pad=pad,
                      alts=alts, wrapLinks=wrapLinks, layer_name=layer_name, wrapNamedEntities=wrapNamedEntities):
            text_family_kwargs = dict(version=versionEn, lang="en", version2=versionHe, lang2="he",
                                      commentary=commentary, context=context, pad=pad, alts=alts,
                                      wrapLinks=wrapLinks, stripItags=stripItags, wrapNamedEntities=wrapNamedEntities,
                                      translationLanguagePreference=translationLanguagePreference,
                                      fallbackOnDefaultVersion=fallbackOnDefaultVersion)
            try:
                text = TextFamily(oref, **text_family_kwargs).contents()
            except AttributeError as e:
                oref = oref.default_child_ref()
                text = TextFamily(oref, **text_family_kwargs).contents()
            except NoVersionFoundError as e:
                return {"error": str(e), "ref": oref.normal(), "enVersion": versionEn, "heVersion": versionHe}

            # TODO: what if pad is false and the ref is of an entire book? Should next_section_ref return None in that case?
            oref = oref.padded_ref() if pad else oref
            try:
                text["next"] = oref.next_section_ref().normal() if oref.next_section_ref() else None
                text["prev"] = oref.prev_section_ref().normal() if oref.prev_section_ref() else None
            except AttributeError as e:
                # There are edge cases where the TextFamily call above works on a default node, but the next section call here does not.
                oref = oref.default_child_ref()
                text["next"] = oref.next_section_ref().normal() if oref.next_section_ref() else None
                text["prev"] = oref.prev_section_ref().normal() if oref.prev_section_ref() else None
            text["commentary"] = text.get("commentary", [])
            text["sheets"] = get_sheets_for_ref(tref) if int(request.GET.get("sheets", 0)) else []

            if layer_name:
                layer = Layer().load({"urlkey": layer_name})
                if not layer:
                    raise InputError("Layer not found.")
                layer_content = [format_note_object_for_client(n) for n in layer.all(tref=tref)]
                text["layer"] = layer_content
                text["layer_name"] = layer_name
                text["_loadSourcesFromDiscussion"] = True
            else:
                text["layer"] = []

            return text

        if not multiple or abs(multiple) == 1:
            text = _get_text(oref, versionEn=versionEn, versionHe=versionHe, commentary=commentary, context=context,
                             pad=pad,
                             alts=alts, wrapLinks=wrapLinks, layer_name=layer_name)
            return jsonResponse(text, cb)
        else:
            # Return list of many sections
            assert multiple != 0
            direction = "next" if multiple > 0 else "prev"
            target_count = abs(multiple)

            current = 0
            texts = []

            while current < target_count:
                text = _get_text(oref, versionEn=versionEn, versionHe=versionHe, commentary=commentary, context=context,
                                 pad=pad,
                                 alts=alts, wrapLinks=wrapLinks, layer_name=layer_name)
                texts += [text]
                if not text[direction]:
                    break
                oref = Ref(text[direction])
                current += 1

            return jsonResponse(texts, cb)

    if request.method == "POST":
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})

        oref = oref.default_child_ref()  # Make sure we're on the textual child
        skip_links = request.GET.get("skip_links", False)
        count_after = int(request.GET.get("count_after", 0))

        if not request.user.is_authenticated:
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to save texts."})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            t = json.loads(j)
            tracker.modify_text(apikey["uid"], oref, t["versionTitle"], t["language"], t["text"], t["versionSource"], completestatus=t["completestatus"],
                                method="API", skip_links=skip_links, count_after=count_after)
            return jsonResponse({"status": "ok"})
        else:
            @csrf_protect
            def protected_post(request):
                t = json.loads(j)
                tracker.modify_text(request.user.id, oref, t["versionTitle"], t["language"], t["text"],
                                    t.get("versionSource", None), completestatus=t["completestatus"], skip_links=skip_links, count_after=count_after)
                return jsonResponse({"status": "ok"})

            return protected_post(request)

    if request.method == "DELETE":
        versionEn = request.GET.get("ven", None)
        versionHe = request.GET.get("vhe", None)
        if not request.user.is_staff:
            return jsonResponse({"error": "Only moderators can delete texts."})
        if not (tref and (versionEn or versionHe)):
            return jsonResponse(
                {"error": "To delete a text version please specifiy a text title, version title and language."})

        tref = tref.replace("_", " ")
        if versionEn:
            versionEn = versionEn.replace("_", " ")
            v = Version().load({"title": tref, "versionTitle": versionEn, "language": "en"})

            if not v:
                return jsonResponse({"error": "Text version not found."})

            v.delete()
            record_version_deletion(tref, versionEn, "en", request.user.id)

            if USE_VARNISH:
                invalidate_linked(oref)
                invalidate_ref(oref, "en", versionEn)
        if versionHe:
            versionHe = versionHe.replace("_", " ")
            v = Version().load({"title": tref, "versionTitle": versionHe, "language": "he"})

            if not v:
                return jsonResponse({"error": "Text version not found."})

            v.delete()
            record_version_deletion(tref, versionHe, "he", request.user.id)

            if USE_VARNISH:
                invalidate_linked(oref)
                invalidate_ref(oref, "he", versionHe)

        return jsonResponse({"status": "ok"})

    return jsonResponse({"error": "Unsupported HTTP method."}, callback=request.GET.get("callback", None))


@catch_error_as_json
@csrf_exempt
def social_image_api(request, tref):
    print("Image generation requested")
    print(f"Path: {request.path}")
    print(f"Query params: {request.GET}")
    lang = request.GET.get("lang", "en")
    if lang == "bi":
        lang = "en"
    version = request.GET.get("ven", None) if lang == "en" else request.GET.get("vhe", None)
    platform = request.GET.get("platform", "facebook")

    try:
        ref = Ref(tref)
        ref_str = ref.normal() if lang == "en" else ref.he_normal()

        tf = TextFamily(ref, stripItags=True, lang=None, version=version, context=0, commentary=False).contents()


        he = tf["he"] if type(tf["he"]) is list else [tf["he"]]
        en = tf["text"] if type(tf["text"]) is list else [tf["text"]]
        text = en if lang == "en" else he
        text = ' '.join(text)
        cat = tf["primary_category"]

    except Exception as e:
        text = None
        cat = None
        ref_str = None

    res = make_img_http_response(text, cat, ref_str, lang, platform)

    return res


@catch_error_as_json
@csrf_exempt
def old_text_versions_api_redirect(request, tref, lang, version):
    url = "/api/texts/{}?v{}={}".format(tref, lang, version)
    response = redirect(iri_to_uri(url), permanent=True)
    params = request.GET.urlencode()
    response['Location'] += "&{}".format(params) if params else ""
    return response


def old_recent_redirect(request):
    return redirect("/texts/history", permanent=True)


@catch_error_as_json
def parashat_hashavua_api(request):
    callback = request.GET.get("callback", None)
    p = get_parasha(datetime.now(), request.diaspora)
    p["date"] = p["date"].isoformat()
    # p.update(get_text(p["ref"]))
    p.update(TextFamily(Ref(p["ref"])).contents())
    return jsonResponse(p, callback)


@catch_error_as_json
def table_of_contents_api(request):
    return jsonResponse(library.get_toc(), callback=request.GET.get("callback", None))


@catch_error_as_json
def search_autocomplete_redirecter(request):
    query = request.GET.get("q", "")
    topic_override = query.startswith('#')
    query = query[1:] if topic_override else query
    completions_dict = get_name_completions(query, 1, False, topic_override)
    ref = completions_dict['ref']
    object_data = completions_dict['object_data']
    if ref:
        response = redirect('/{}'.format(ref.url()), permanent=False)
    elif object_data is not None and object_data.get('type', '') in {'Topic', 'PersonTopic', 'AuthorTopic'}:
        response = redirect('/topics/{}'.format(object_data['key']), permanent=False)
    elif object_data is not None and object_data.get('type', '') == 'TocCategory':
        response = redirect('/{}'.format(object_data['key']), permanent=False)
    else:
        response = redirect('/search?q={}'.format(query), permanent=False)
    return response


@catch_error_as_json
def opensearch_suggestions_api(request):
    # see here for docs: http://www.opensearch.org/Specifications/OpenSearch/Extensions/Suggestions/1.1
    query = request.GET.get("q", "")
    completions_dict = get_name_completions(query, 5, False)
    ret_data = [
        query,
        completions_dict["completions"]
    ]
    return jsonResponse(ret_data, callback=request.GET.get("callback", None))


@catch_error_as_json
def text_titles_api(request):
    return jsonResponse({"books": library.full_title_list()}, callback=request.GET.get("callback", None))


@catch_error_as_json
@csrf_exempt
def index_node_api(request, title):
    pass


@catch_error_as_json
@csrf_exempt
def index_api(request, title, raw=False):
    """
    API for manipulating text index records (aka "Text Info")
    """
    if request.method == "GET":
        with_content_counts = bool(request.GET.get("with_content_counts", False))
        i = library.get_index(title).contents(raw=raw, with_content_counts=with_content_counts)

        if request.GET.get("with_related_topics", False):
            i["relatedTopics"] = get_topics_for_book(title, annotate=True)

        return jsonResponse(i, callback=request.GET.get("callback", None))

    if request.method == "POST":
        # use the update function if update is in the params

        func = tracker.update if request.GET.get("update", False) else tracker.add
        j = json.loads(request.POST.get("json"))
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})
        j["title"] = title.replace("_", " ")
        # todo: move this to texts_api, pass the changes down through the tracker and text chunk
        # if "versionTitle" in j:
        #    if j["versionTitle"] == "Sefaria Community Translation":
        #        j["license"] = "CC0"
        #        j["licenseVetter"] = True
        if not request.user.is_authenticated:
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to save texts."})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            return jsonResponse(func(apikey["uid"], Index, j, method="API", raw=raw).contents(raw=raw))
        else:
            title = j.get("oldTitle", j.get("title"))
            try:
                library.get_index(title)  # getting the index just to tell if it exists
                # Only allow staff and the person who submitted a text to edit
                if not request.user.is_staff and not user_started_text(request.user.id, title):
                    return jsonResponse({
                        "error": "{} is protected from change.<br/><br/>See a mistake?<br/>Email hello@sefaria.org.".format(
                            title)})
            except BookNameError:
                pass  # if this is a new text, allow any logged in user to submit

        @csrf_protect
        def protected_index_post(request):
            return jsonResponse(
                func(request.user.id, Index, j, raw=raw).contents(raw=raw)
            )

        return protected_index_post(request)

    if request.method == "DELETE":
        if not request.user.is_staff:
            return jsonResponse({"error": "Only moderators can delete texts indices."})

        title = title.replace("_", " ")

        i = library.get_index(title)

        i.delete()
        record_index_deletion(title, request.user.id)

        return jsonResponse({"status": "ok"})

    return jsonResponse({"error": "Unsupported HTTP method."}, callback=request.GET.get("callback", None))


@catch_error_as_json
@json_response_decorator
@django_cache(cache_type="persistent", default_on_miss=True, decorate_data_with_key=True)
def bare_link_api(request, book, cat):
    if request.method == "GET":
        resp = get_book_link_collection(book, cat)
        return resp

    elif request.method == "POST":
        return {"error": "Not implemented."}


@catch_error_as_json
@json_response_decorator
@django_cache(cache_type="persistent", default_on_miss=True, decorate_data_with_key=True)
def link_count_api(request, cat1, cat2):
    """
    Return a count document with the number of links between every text in cat1 and every text in cat2
    """
    if request.method == "GET":
        resp = get_link_counts(cat1, cat2)
        return resp

    elif request.method == "POST":
        return {"error": "Not implemented."}


@catch_error_as_json
def word_count_api(request, title, version, language):
    if request.method == "GET":
        counts = VersionSet({"title": title, "versionTitle": version, "language": language}).word_count()
        resp = jsonResponse({"wordCount": counts}, callback=request.GET.get("callback", None))
        return resp

    elif request.method == "POST":
        return jsonResponse({"error": "Not implemented."})


@catch_error_as_json
def counts_api(request, title):
    """
    API for retrieving the counts document for a given text node.
    :param title: A valid node title
    """
    title = title.replace("_", " ")

    if request.method == "GET":
        return jsonResponse(StateNode(title).contents(), callback=request.GET.get("callback", None))

    elif request.method == "POST":
        if not request.user.is_staff:
            return jsonResponse({"error": "Not permitted."})

        if "update" in request.GET:
            flag = request.GET.get("flag", None)
            if not flag:
                return jsonResponse({"error": "'flag' parameter missing."})
            val = request.GET.get("val", None)
            val = True if val == "true" else False

            vs = VersionState(title)
            if not vs:
                raise InputError("State not found for : {}".format(title))
            vs.set_flag(flag, val).save()

            return jsonResponse({"status": "ok"})

        return jsonResponse({"error": "Not implemented."})


@catch_error_as_json
def shape_api(request, title):
    """
    API for retrieving a shape document for a given text or category.
    For simple texts, returns a dict with keys:
	{
		"section": Category immediately above book
		"heTitle": Hebrew title of node
		"length": Number of chapters
		"chapters": List of Chapter Lengths (think about depth 1 & 3)
		"title": English title of node
		"book": English title of Book
	}
    For complex texts or categories, returns a list of dicts.
    :param title: A valid node title or a path to a category, separated by /.

    "depth" parameter is DEPRECATED. I don't believe it's used but if so, below is the old documenation for it
    The "depth" parameter in the query string indicates how many levels in the category tree to descend.  Default is 2.
    If depth == 0, descends to end of tree

    The "dependents" parameter, if true, includes dependent texts.  By default, they are filtered out.
    """

    def _simple_shape(snode):
        sn = StateNode(snode=snode)
        shape = sn.var("all", "shape")

        return {
            "section": snode.index.categories[-1],
            "heTitle": snode.full_title("he"),
            "title": snode.full_title("en"),
            "length": len(shape) if isinstance(shape, list) else 1,  # hmmmm
            "chapters": shape,
            "book": snode.index.title,
            "heBook": snode.index.get_title(lang="he"),
        }

    def _collapse_book_leaf_shapes(leaf_shapes):
        """Groups leaf node shapes for a single book into one object so that resulting list corresponds 1:1 to books"""
        if type(leaf_shapes) != list:
            return leaf_shapes

        results = []
        prev_shape = None
        complex_book_in_progress = None

        for shape in leaf_shapes:
            if prev_shape and prev_shape["book"] != shape["book"]:
                if complex_book_in_progress:
                    results.append(complex_book_in_progress)
                    complex_book_in_progress = None
                else:
                    results.append(prev_shape)
            elif prev_shape:
                complex_book_in_progress = complex_book_in_progress or {
                    "isComplex": True,
                    "section": prev_shape["section"],
                    "length": prev_shape["length"],
                    "chapters": [prev_shape],
                    "book": prev_shape["book"],
                    "heBook": prev_shape["heBook"],
                }
                complex_book_in_progress["chapters"].append(shape)
                complex_book_in_progress["length"] += shape["length"]
            prev_shape = shape

        results.append(complex_book_in_progress or prev_shape)

        return results

    title = title.replace("_", " ")

    if request.method == "GET":
        sn = library.get_schema_node(title, "en")

        # Leaf Node
        if sn and not sn.children:
            res = [_simple_shape(sn)]

        # Branch Node
        elif sn and sn.children:
            res = [_simple_shape(n) for n in sn.get_leaf_nodes()]

        # Category
        else:
            cat_list = title.split("/")
            depth = request.GET.get("depth", 2)
            include_dependents = request.GET.get("dependents", False)
            indexes = []
            if len(cat_list) == 1:
                # try as corpus
                indexes = library.get_indexes_in_corpus(cat_list[0], include_dependant=include_dependents,
                                                        full_records=True)
            if len(indexes) == 0:
                cat = library.get_toc_tree().lookup(cat_list)  # just used for validating that the cat exists
                if not cat:
                    res = {"error": "No index or category found to match {}".format(title)}
                    return jsonResponse(res, callback=request.GET.get("callback", None))
                indexes = library.get_indexes_in_category_path(cat_list, include_dependant=include_dependents,
                                                               full_records=True)

            res = [_simple_shape(jan) for index in indexes for jan in index.nodes.get_leaf_nodes()]

        res = _collapse_book_leaf_shapes(res)
        return jsonResponse(res, callback=request.GET.get("callback", None))


@catch_error_as_json
def text_preview_api(request, title):
    """
    API for retrieving a document that gives preview text (first characters of each section)
    for text 'title'
    """
    oref = Ref(title)
    response = oref.index.contents()
    response['node_title'] = oref.index_node.full_title()

    def get_preview(prev_oref):
        text = TextFamily(prev_oref, pad=False, commentary=False)

        if prev_oref.index_node.depth == 1:
            # Give deeper previews for texts with depth 1 (boring to look at otherwise)
            text.text, text.he = [[i] for i in text.text], [[i] for i in text.he]
        preview = text_preview(text.text, text.he) if (text.text or text.he) else []
        return preview if isinstance(preview, list) else [preview]

    if not oref.index_node.has_children():
        response['preview'] = get_preview(oref)
    elif oref.index_node.has_default_child():
        r = oref.index_node.get_default_child().ref()  # Get ref through ref() to get default leaf node and avoid getting parent node
        response['preview'] = get_preview(r)

    return jsonResponse(response, callback=request.GET.get("callback", None))


def revarnish_link(link):
    if USE_VARNISH:
        for ref in link.refs:
            invalidate_ref(Ref(ref), purge=True)


@catch_error_as_json
@csrf_exempt
def links_api(request, link_id_or_ref=None):
    """
    API for textual links.
    Currently also handles post notes.
    #TODO: can we distinguish between a link_id (mongo id) for POSTs and a ref for GETs?
    """

    def _internal_do_post(request, link, uid, **kwargs):
        func = tracker.update if "_id" in link else tracker.add
        # use the correct function if params indicate this is a note save
        # func = save_note if "type" in j and j["type"] == "note" else save_link
        # obj = func(apikey["uid"], model.Link, link, **kwargs)
        obj = func(uid, Link, link, **kwargs)
        try:
            if USE_VARNISH:
                revarnish_link(obj)
        except Exception as e:
            logger.error(e)
        return format_object_for_client(obj)

    def _internal_do_delete(request, link_id_or_ref, uid):
        obj = tracker.delete(uid, Link, link_id_or_ref, callback=revarnish_link)
        return obj

    if request.method == "GET":
        callback = request.GET.get("callback", None)
        if link_id_or_ref is None:
            return jsonResponse({"error": "Missing text identifier"}, callback)
        # The Ref instanciation is just to validate the Ref and let an error bubble up.
        # TODO is there are better way to validate the ref from GET params?
        Ref(link_id_or_ref)
        with_text = int(request.GET.get("with_text", 1))
        with_sheet_links = int(request.GET.get("with_sheet_links", 0))
        return jsonResponse(get_links(link_id_or_ref, with_text=with_text, with_sheet_links=with_sheet_links), callback)

    if not request.user.is_authenticated:
        delete_query = QueryDict(request.body)
        key = delete_query.get("apikey")  # key = request.POST.get("apikey")
        if not key:
            return jsonResponse({"error": "You must be logged in or use an API key to add, edit or delete links."})
        apikey = db.apikeys.find_one({"key": key})
        if not apikey:
            return jsonResponse({"error": "Unrecognized API key."})
        uid = apikey["uid"]
        kwargs = {"method": "API"}
        user = User.objects.get(id=apikey["uid"])
    else:
        user = request.user
        uid = request.user.id
        kwargs = {}
        _internal_do_post = csrf_protect(_internal_do_post)
        _internal_do_delete = staff_member_required(csrf_protect(_internal_do_delete))

    if request.method == "POST":
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})

        j = json.loads(j)
        skip_check = request.GET.get("skip_lang_check", 0)
        override_preciselink = request.GET.get("override_preciselink", 0)
        if isinstance(j, list):
            res = []
            for i in j:
                try:
                    if skip_check:
                        i["_skip_lang_check"] = True
                    if override_preciselink:
                        i["_override_preciselink"] = True
                    retval = _internal_do_post(request, i, uid, **kwargs)
                    res.append({"status": "ok. Link: {} | {} Saved".format(retval["ref"], retval["anchorRef"])})
                except Exception as e:
                    res.append({"error": "Link: {} | {} Error: {}".format(i["refs"][0], i["refs"][1], str(e))})

            try:
                res_slice = request.GET.get("truncate_response", None)
                if res_slice:
                    res_slice = int(res_slice)
            except Exception as e:
                res_slice = None
            return jsonResponse(res[:res_slice])
        else:
            if skip_check:
                j["_skip_lang_check"] = True
            return jsonResponse(_internal_do_post(request, j, uid, **kwargs))

    if request.method == "DELETE":
        if not link_id_or_ref:
            return jsonResponse({"error": "No link id given for deletion."})

        if not user.is_staff:
            return jsonResponse({"error": "Only Sefaria Moderators can delete links."})

        try:
            ref = Ref(link_id_or_ref)
        except InputError as e:
            if ObjectId.is_valid(link_id_or_ref):
                # link_id_or_ref is id so just delete this link
                retval = _internal_do_delete(request, link_id_or_ref, uid)
                return jsonResponse(retval)
            else:
                return jsonResponse(
                    {"error": "{} is neither a valid Ref nor a valid Mongo ObjectID. {}".format(link_id_or_ref, e)})

        ls = LinkSet(ref)
        if ls.count() == 0:
            return jsonResponse({"error": "No links found for {}".format(ref)})

        results = []
        for l in ls:
            link_id = str(l._id)
            refs = l.refs
            try:
                retval = _internal_do_delete(request, link_id, uid)
                if "error" in retval:
                    raise Exception(retval["error"])
                else:
                    results.append({"status": "ok. Link: {} | {} Deleted".format(refs[0], refs[1])})
            except Exception as e:
                results.append({"error": "Link: {} | {} Error: {}".format(refs[0], refs[1], str(e))})

        return jsonResponse(results)

    return jsonResponse({"error": "Unsupported HTTP method."})


@catch_error_as_json
@csrf_exempt
def link_summary_api(request, ref):
    """
    Returns a summary of links available for ref.
    """
    oref = Ref(ref)
    summary = oref.linkset().summary(oref)
    return jsonResponse(summary, callback=request.GET.get("callback", None))


@catch_error_as_json
@csrf_exempt
def notes_api(request, note_id_or_ref):
    """
    API for user notes.
    A call to this API with GET returns the list of public notes and private notes belong to the current user on this Ref.
    """
    if request.method == "GET":
        creds = user_credentials(request)
        if not note_id_or_ref:
            raise Http404
        oref = Ref(note_id_or_ref)
        cb = request.GET.get("callback", None)
        private = request.GET.get("private", False)
        res = get_notes(oref, uid=creds["user_id"], public=(not private))
        return jsonResponse(res, cb)

    if request.method == "POST":
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})
        note = json.loads(j)

        if "refs" in note:
            # If data was posted with an array or refs, squish them into one
            # This assumes `refs` are sequential.
            note["ref"] = Ref(note["refs"][0]).to(Ref(note["refs"][-1])).normal()
            del note["refs"]

        func = tracker.update if "_id" in note else tracker.add
        if "_id" in note:
            note["_id"] = ObjectId(note["_id"])
        if not request.user.is_authenticated:
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to add, edit or delete links."})

            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            note["owner"] = apikey["uid"]
            response = format_object_for_client(
                func(apikey["uid"], Note, note, method="API")
            )
        else:
            note["owner"] = request.user.id

            @csrf_protect
            def protected_note_post(req):
                resp = format_object_for_client(
                    func(req.user.id, Note, note)
                )
                return resp

            response = protected_note_post(request)
        if request.POST.get("layer", None):
            layer = Layer().load({"urlkey": request.POST.get("layer")})
            if not layer:
                raise InputError("Layer not found.")
            else:
                # Create notifications for this activity
                path = "/" + note["ref"] + "?layer=" + layer.urlkey
                if ObjectId(response["_id"]) not in layer.note_ids:
                    # only notify for new notes, not edits
                    for uid in layer.listeners():
                        if request.user.id == uid:
                            continue
                        n = Notification({"uid": uid})
                        n.make_discuss(adder_id=request.user.id, discussion_path=path)
                        n.save()
                layer.add_note(response["_id"])
                layer.save()

        return jsonResponse(response)

    if request.method == "DELETE":
        if not request.user.is_authenticated:
            return jsonResponse({"error": "You must be logged in to delete notes."})
        return jsonResponse(
            tracker.delete(request.user.id, Note, note_id_or_ref)
        )

    return jsonResponse({"error": "Unsupported HTTP method."})


@api_view(["GET"])
@catch_error_as_json
def all_notes_api(request):
    private = request.GET.get("private", False)
    if private:
        if not request.user.is_authenticated:
            res = {"error": "You must be logged in to access you notes."}
        else:
            res = [note.contents(with_string_id=True) for note in
                   NoteSet({"owner": request.user.id}, sort=[("_id", -1)])]
    else:
        resr = {"error": "Not implemented."}
    return jsonResponse(res, callback=request.GET.get("callback", None))


@catch_error_as_json
def related_api(request, tref):
    """
    Single API to bundle available content related to `tref`.
    """
    if request.GET.get("private", False) and request.user.is_authenticated:
        oref = Ref(tref)
        response = {
            "sheets": get_sheets_for_ref(tref, uid=request.user.id),
            "notes": get_notes(oref, uid=request.user.id, public=False)
        }
    elif request.GET.get("private", False) and not request.user.is_authenticated:
        response = {"error": "You must be logged in to access private content."}
    else:
        response = {
            "links": get_links(tref, with_text=False, with_sheet_links=request.GET.get("with_sheet_links", False)),
            "sheets": get_sheets_for_ref(tref),
            "notes": [],  # get_notes(oref, public=True) # Hiding public notes for now
            "webpages": get_webpages_for_ref(tref),
            "topics": get_topics_for_ref(tref, annotate=True),
            "manuscripts": ManuscriptPageSet.load_set_for_client(tref),
            "media": get_media_for_ref(tref),
        }
        for value in response.values():
            for item in value:
                if 'expandedRefs' in item:
                    del item['expandedRefs']
    return jsonResponse(response, callback=request.GET.get("callback", None))


@catch_error_as_json
def versions_api(request, tref):
    """
    API for retrieving available text versions list of a ref.
    """
    oref = Ref(tref)
    versions = oref.version_list()

    return jsonResponse(versions, callback=request.GET.get("callback", None))


@catch_error_as_json
def version_status_api(request):
    res = []
    for v in VersionSet():
        try:
            res.append({
                "id": str(v._id),
                "title": v.title,
                "version": v.versionTitle,
                "language": v.language,
                "categories": v.get_index().categories,
                "wordcount": v.word_count()
            })
        except Exception:
            pass
    return jsonResponse(sorted(res, key=lambda x: x["title"] + x["version"]),
                        callback=request.GET.get("callback", None))


@json_response_decorator
@django_cache(cache_type="persistent", default_on_miss=True, decorate_data_with_key=True)
def version_status_tree_api(request, lang=None):
    return library.simplify_toc(lang=lang)


@sanitize_get_params
def visualize_library(request, lang=None, cats=None):
    template_vars = {"lang": lang or "",
                     "cats": json.dumps(cats.replace("_", " ").split("/") if cats else [])}

    return render_template(request, 'visual_library.html', None, template_vars)


def visualize_toc(request):
    return render_template(request, 'visual_toc.html', None, {})


def visualize_parasha_colors(request):
    return render_template(request, 'visual_parasha_colors.html', None, {})


def visualize_links_through_rashi(request):
    level = request.GET.get("level", 1)
    json_file = "../static/files/torah_rashi_torah.json" if level == 1 else "../static/files/tanach_rashi_tanach.json"
    return render_template(request, 'visualize_links_through_rashi.html', None, {"json_file": json_file})


def talmudic_relationships(request):
    json_file = "../static/files/talmudic_relationships_data.json"
    return render_template(request, 'talmudic_relationships.html', None, {"json_file": json_file})


def sefer_hachinukh_mitzvot(request):
    csv_file = "../static/files/mitzvot.csv"
    return render_template(request, 'sefer_hachinukh_mitzvot.html', None, {"csv": csv_file})


def unique_words_viz(request):
    csv_file = "../static/files/commentators_torah_unique_words.csv"
    return render_template(request, 'unique_words_viz.html', None, {"csv": csv_file})


@catch_error_as_json
def set_lock_api(request, tref, lang, version):
    """
    API to set an edit lock on a text segment.
    """
    user = request.user.id if request.user.is_authenticated else 0
    set_lock(Ref(tref).normal(), lang, version.replace("_", " "), user)
    return jsonResponse({"status": "ok"})


@catch_error_as_json
def release_lock_api(request, tref, lang, version):
    """
    API to release the edit lock on a text segment.
    """
    release_lock(Ref(tref).normal(), lang, version.replace("_", " "))
    return jsonResponse({"status": "ok"})


@catch_error_as_json
def check_lock_api(request, tref, lang, version):
    """
    API to check whether a text segment currently has an edit lock.
    """
    locked = check_lock(Ref(tref).normal(), lang, version.replace("_", " "))
    return jsonResponse({"locked": locked})


@catch_error_as_json
def lock_text_api(request, title, lang, version):
    """
    API for locking or unlocking a text as a whole.
    To unlock, include the URL parameter "action=unlock"
    """
    if not request.user.is_staff:
        return jsonResponse({"error": "Only Sefaria Moderators can lock texts."})

    title = title.replace("_", " ")
    version = version.replace("_", " ")
    vobj = Version().load({"title": title, "language": lang, "versionTitle": version})

    if request.GET.get("action", None) == "unlock":
        vobj.status = None
    else:
        vobj.status = "locked"

    vobj.save()
    return jsonResponse({"status": "ok"})


@catch_error_as_json
@csrf_exempt
def flag_text_api(request, title, lang, version):
    """
    API for manipulating attributes of versions.
    versionTitle changes are handled with an attribute called `newVersionTitle`

    Non-Identifying attributes handled:
        versionSource, versionNotes, license, priority, digitizedBySefaria

    `language` attributes are not handled.
    """
    _attributes_to_save = Version.optional_attrs + ["versionSource"]

    if not request.user.is_authenticated:
        key = request.POST.get("apikey")
        if not key:
            return jsonResponse({"error": "You must be logged in or use an API key to perform this action."})
        apikey = db.apikeys.find_one({"key": key})
        if not apikey:
            return jsonResponse({"error": "Unrecognized API key."})
        user = User.objects.get(id=apikey["uid"])
        if not user.is_staff:
            return jsonResponse({"error": "Only Sefaria Moderators can flag texts."})

        flags = json.loads(request.POST.get("json"))
        title = title.replace("_", " ")
        version = version.replace("_", " ")
        vobj = Version().load({"title": title, "language": lang, "versionTitle": version})
        if flags.get("newVersionTitle"):
            vobj.versionTitle = flags.get("newVersionTitle")
        for flag in _attributes_to_save:
            if flag in flags:
                setattr(vobj, flag, flags[flag])
        vobj.save()
        return jsonResponse({"status": "ok"})
    elif request.user.is_staff:
        @csrf_protect
        def protected_post(request, title, lang, version):
            flags = json.loads(request.POST.get("json"))
            title = title.replace("_", " ")
            version = version.replace("_", " ")
            vobj = Version().load({"title": title, "language": lang, "versionTitle": version})
            if flags.get("newVersionTitle"):
                vobj.versionTitle = flags.get("newVersionTitle")
            for flag in _attributes_to_save:
                if flag in flags:
                    setattr(vobj, flag, flags[flag])
            vobj.save()
            return jsonResponse({"status": "ok"})

        return protected_post(request, title, lang, version)
    else:
        return jsonResponse({"error": "Unauthorized"})


@catch_error_as_json
@csrf_exempt
def tag_category_api(request, path=None):
    if request.method == "GET":
        if not path or path == "index":
            categories = TopicSet({"isTopLevelDisplay": True}, sort=[("displayOrder", 1)])
        else:
            slug = SluggedAbstractMongoRecord.normalize_slug(path)
            topic = Topic.init(slug)
            if not topic:
                categories = []
            else:
                links = topic.link_set(query_kwargs={"linkType": "displays-under", "toTopic": slug})
                categories = [Topic.init(l.topic) for l in links]
                categories.sort(key=lambda x: getattr(x, 'displayOrder', 10000))

        category_names = [{
            "tag": category.get_primary_title('en'),
            "heTag": category.get_primary_title("he"),
            "slug": category.slug
        } for category in categories]
        return jsonResponse(category_names)


@catch_error_as_json
@csrf_exempt
def category_api(request, path=None):
    """
    API for looking up categories and adding Categories to the Category collection.
    DELETE takes a category path on the URL
    GET takes a category path on the URL.  Returns the category specified.
       e.g. "api/category/Tanakh/Torah"
       If the category is not found, it will return "error" in a json object.
       It will also attempt to find the closest parent.  If found, it will include "closest_parent" alongside "error".
    POST can take the argument 'reorder' on the URL and if provided, its children will be reordered.  Takes complete category as payload.  Parent of category must exist.
    """
    if request.method == "DELETE":
        cat = Category().load({"path": path.split("/")})
        if cat and cat.can_delete():
            cat.delete()
            library.rebuild(include_toc=True)
            return jsonResponse({"status": "OK"})
        else:
            return jsonResponse({"error": "Category {} doesn't exist".format(path)})
    elif request.method == "GET":
        if not path:
            return jsonResponse({"error": "Please provide category path."})
        cats = path.split("/")
        cat = Category().load({"path": cats})
        if cat:
            return jsonResponse(cat.contents())
        else:
            for i in range(len(cats) - 1, 0, -1):
                cat = Category().load({"path": cats[:i]})
                if cat:
                    return jsonResponse({"error": "Category not found", "closest_parent": cat.contents()})
        return jsonResponse({"error": "Category not found"})

    if request.method == "POST":
        def _internal_do_post(request, update, cat, uid, **kwargs):
            func = tracker.update if update else tracker.add
            return func(uid, Category, cat, **kwargs).contents()

        if not request.user.is_authenticated:
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to add or delete categories."})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            user = User.objects.get(id=apikey["uid"])
            if not user.is_staff:
                return jsonResponse({"error": "Only Sefaria Moderators can add or delete categories."})
            uid = apikey["uid"]
            kwargs = {"method": "API"}
        elif request.user.is_staff:
            uid = request.user.id
            kwargs = {}
            _internal_do_post = csrf_protect(_internal_do_post)
        else:
            return jsonResponse({"error": "Only Sefaria Moderators can add or delete categories."})

        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})
        j = json.loads(j)
        update = int(request.GET.get("update", False))
        new_category = Category().load({"path": j["path"]})
        if "path" not in j:
            return jsonResponse({"error": "'path' is a required attribute"})
        if not update and new_category is not None:
            return jsonResponse({"error": "Category {} already exists.".format(", ".join(j["path"]))})

        parent = j["path"][:-1]
        if len(parent) > 0 and not Category().load({"path": parent}):
            # ignore len(parent) == 0 since these categories are at the root of the TOC tree and have no parent
            return jsonResponse({"error": "No parent category found: {}".format(", ".join(j["path"][:-1]))})

        reorder = request.GET.get("reorder", False)
        last_path = j.get("sharedTitle", "")
        he_last_path = j.get("heSharedTitle", "")

        if new_category is not None and "origPath" in j and j["origPath"] != j["path"] and j["origPath"][
            -1] == last_path:
            # this case occurs when moving Tanakh's Rashi category into
            # Rishonim on Bavli where there is already a Rashi, which may mean user wants to merge the two
            return {"error": f"Merging two categories named {last_path} is not supported."}
        elif "heSharedTitle" in j:
            # if heSharedTitle provided, make sure sharedTitle and heSharedTitle correspond to same Term
            en_term = Term().load_by_title(last_path)
            he_term = Term().load_by_title(he_last_path)
            if en_term and en_term == he_term:
                pass  # both titles are found in an existing Term object
            else:
                # titles weren't found in same Term object, so try to create a new Term
                t = Term()
                t.name = last_path
                t.add_primary_titles(last_path, he_last_path)
                t.save()

        results = {}
        if reorder:
            orig_path = j.get('path', []) if "origPath" not in j else j.get('origPath', [])
            results["reorder"] = update_order_of_category_children(orig_path, uid, j["subcategoriesAndBooks"])
        if len(j['path']) > 0:  # not at root of TOC
            results["update"] = _internal_do_post(request, update, j, uid, **kwargs)

        return jsonResponse(results)

    return jsonResponse({"error": "Unsupported HTTP method."})


@catch_error_as_json
@csrf_exempt
def calendars_api(request):
    if request.method == "GET":
        diaspora = request.GET.get("diaspora", "1")
        custom = request.GET.get("custom", None)
        zone_name = request.GET.get("timezone", timezone.get_current_timezone_name())

        try:
            zone = pytz.timezone(zone_name)
        except pytz.exceptions.UnknownTimeZoneError as e:
            return jsonResponse({"error": "Unknown 'timezone' value: '%s'." % zone_name})

        try:
            year = int(request.GET.get("year", None))
            month = int(request.GET.get("month", None))
            day = int(request.GET.get("day", None))
            # If a user is asking the API for a specific date there's really no reason to specify a timezone.
            # The user also doesnt expect the date to get mangled by the default timzone which might implicitly set it back a day
            datetimeobj = datetime(year, month, day, tzinfo=pytz.timezone("UTC"))
        except Exception as e:
            datetimeobj = timezone.localtime(timezone.now(), timezone=zone)

        if diaspora not in ["0", "1"]:
            return jsonResponse({"error": "'Diaspora' parameter must be 1 or 0."})
        else:
            diaspora = True if diaspora == "1" else False
            calendars = get_all_calendar_items(datetimeobj, diaspora=diaspora, custom=custom)
            return jsonResponse({"date": datetimeobj.date().isoformat(),
                                 "timezone": datetimeobj.tzinfo.zone,
                                 "calendar_items": calendars},
                                callback=request.GET.get("callback", None))


@catch_error_as_json
@csrf_exempt
def parasha_next_read_api(request, parasha):
    """
    Get info on when `parasha` is next read.
    Returns JSON with Haftarahs read and date of when this parasha is next read
    :param request:
    :return:
    """
    if request.method == "GET":
        datetimeobj = timezone.localtime(timezone.now())
        return jsonResponse(
            parashat_hashavua_and_haftara(datetimeobj, request.diaspora, parasha=parasha, ret_type='dict'))


@catch_error_as_json
@csrf_exempt
def terms_api(request, name):
    """
    API for adding a Term to the Term collection.
    This is mainly to be used for adding hebrew internationalization language for section names, categories and commentators
    """
    if request.method == "GET":
        term = Term().load({'name': name}) or Term().load_by_title(name)
        if term is None:
            return jsonResponse({"error": "Term does not exist."})
        else:
            return jsonResponse(term.contents(), callback=request.GET.get("callback", None))

    if request.method in ("POST", "DELETE"):
        def _internal_do_post(request, uid):
            t = Term().load({'name': name}) or Term().load_by_title(name)
            if request.method == "POST":
                term = request.POST.get("json")
                if not term:
                    return {"error": "Missing 'json' parameter in POST data."}
                term = json.loads(term)
                if t and not request.GET.get("update"):
                    return {"error": "Term already exists."}
                elif t and request.GET.get("update"):
                    term["_id"] = t._id

                func = tracker.update if request.GET.get("update", False) else tracker.add
                return func(uid, Term, term, **kwargs).contents()

            elif request.method == "DELETE":
                if not t:
                    return {"error": 'Term "%s" does not exist.' % name}
                return tracker.delete(uid, Term, t._id)

        if not request.user.is_authenticated:
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to add, edit or delete terms."})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            user = User.objects.get(id=apikey["uid"])
            if not user.is_staff:
                return jsonResponse({"error": "Only Sefaria Moderators can add or edit terms."})
            uid = apikey["uid"]
            kwargs = {"method": "API"}
        elif request.user.is_staff:
            uid = request.user.id
            kwargs = {}
            _internal_do_post = csrf_protect(_internal_do_post)
        else:
            return jsonResponse({"error": "Only Sefaria Moderators can add or edit terms."})

        return jsonResponse(_internal_do_post(request, uid))

    return jsonResponse({"error": "Unsupported HTTP method."})


def get_name_completions(name, limit, ref_only, topic_override=False):
    lang = "he" if has_tibetan(name) else "en"
    completer = library.ref_auto_completer(lang) if ref_only else library.full_auto_completer(lang)
    object_data = None
    ref = None
    topic = None
    if topic_override:
        topic_set = TopicSet({"titles.text": re.compile(fr'^{re.escape(name)}$', flags=re.IGNORECASE)},
                             sort=[("numSources", -1)], limit=1)
        if topic_set.count() > 0:
            topic = topic_set.array()[0]
    try:
        ref = Ref(name)
        inode = ref.index_node
        if isinstance(inode, SheetLibraryNode):
            ref = None
            raise InputError

        # Find possible dictionary entries.  This feels like a messy way to do this.  Needs a refactor.
        if inode.is_virtual and inode.parent and getattr(inode.parent, "lexiconName",
                                                         None) in library._lexicon_auto_completer:
            base_title = inode.parent.full_title()
            lexicon_ac = library.lexicon_auto_completer(inode.parent.lexiconName)
            t = [base_title + ", " + t[1] for t in lexicon_ac.items(inode.word)[:limit or None]]
            completions = list(OrderedDict.fromkeys(t))  # filter out dupes
            completion_objects = [o for n in completions for o in lexicon_ac.get_data(n)]

        else:
            completions, completion_objects = completer.complete(name, limit)
            object_data = completer.get_object(name)

    except DictionaryEntryNotFoundError as e:
        # A dictionary beginning, but not a valid entry
        lexicon_ac = library.lexicon_auto_completer(e.lexicon_name)
        t = [e.base_title + ", " + t[1] for t in lexicon_ac.items(e.word)[:limit or None]]
        completions = list(OrderedDict.fromkeys(t))  # filter out dupes
        completion_objects = [o for n in completions for o in lexicon_ac.get_data(n)]
    except InputError:  # Not a Ref
        completions, completion_objects = completer.complete(name, limit)
        object_data = completer.get_object(name)

    return {
        "completions": completions,
        "completion_objects": completion_objects,
        "lang": lang,
        "object_data": object_data,
        "ref": ref,
        "topic": topic,
    }


@catch_error_as_json
def topic_completion_api(request, topic):
    limit = int(request.GET.get("limit", 10))
    result = library.topic_auto_completer().complete(topic, limit=limit)
    return jsonResponse(result)


@catch_error_as_json
def name_api(request, name):
    if request.method != "GET":
        return jsonResponse({"error": "Unsupported HTTP method."})
    topic_override = name.startswith('#')
    name = name[1:] if topic_override else name
    # Number of results to return.  0 indicates no limit
    LIMIT = int(request.GET.get("limit", 10))
    ref_only = request.GET.get("ref_only", False)
    completions_dict = get_name_completions(name, LIMIT, ref_only, topic_override)
    ref = completions_dict["ref"]
    topic = completions_dict["topic"]
    d = {
        "lang": completions_dict["lang"],
        "is_ref": False,
        "completions": completions_dict["completions"],
        "completion_objects": completions_dict["completion_objects"],
    }
    if ref:
        inode = ref.index_node
        d.update({
            "is_ref": True,
            "is_book": ref.is_book_level(),
            "is_node": len(ref.sections) == 0,
            "is_section": ref.is_section_level(),
            "is_segment": ref.is_segment_level(),
            "is_range": ref.is_range(),
            "type": "ref",
            "ref": ref.normal(),
            "url": ref.url(),
            "index": ref.index.title,
            "book": ref.book,
            "internalSections": ref.sections,
            "internalToSections": ref.toSections,
            "sections": ref.normal_sections(),  # this switch is to match legacy behavior of parseRef
            "toSections": ref.normal_toSections(),
            # todo: ADD textual completions as well (huh?)
            "examples": []
        })
        if inode.has_numeric_continuation():
            inode = inode.get_default_child() if inode.has_default_child() else inode
            d["sectionNames"] = inode.sectionNames
            d["heSectionNames"] = list(map(hebrew_term, inode.sectionNames))
            d["addressExamples"] = [t.toStr("en", 3 * i + 3) for i, t in enumerate(inode._addressTypes)]
            d["heAddressExamples"] = [t.toStr("he", 3 * i + 3) for i, t in enumerate(inode._addressTypes)]
    elif topic:
        d['topic_slug'] = topic.slug
    elif completions_dict["object_data"]:
        # let's see if it's a known name of another sort
        d["type"] = completions_dict["object_data"]["type"]
        d["key"] = completions_dict["object_data"]["key"]

    return jsonResponse(d)


@catch_error_as_json
def dictionary_completion_api(request, word, lexicon=None):
    """
    Given a dictionary, looks up the word in that dictionary
    :param request:
    :param word:
    :param dictionary:
    :return:
    """
    if request.method != "GET":
        return jsonResponse({"error": "Unsupported HTTP method."})

    # Number of results to return.  0 indicates no limit
    LIMIT = int(request.GET.get("limit", 10))

    if lexicon is None:
        ac = library.cross_lexicon_auto_completer()
        rs, _ = ac.complete(word, LIMIT)
        result = [[r, r] for r in
                  rs]  # ac.title_trie[ac.normalizer(r)][0]["key"] - this was when we wanted the first option with nikud
    else:
        matches = [(item[0], x) for item in library.lexicon_auto_completer(lexicon).items(word)[:LIMIT] for x in
                   item[1]]
        result = sorted(set(matches), key=lambda x: matches.index(x))  # dedup matches
    return jsonResponse(result)


@catch_error_as_json
def dictionary_api(request, word):
    """
    Looks for lexicon entries for the given string.
    If the string is more than one word, this will look for substring matches when not finding for the original input
    Optional attributes:
    'lookup_ref' to fine tune the search
    'never_split' to limit lookup to only the actual input string
    'always_split' to look for substring matches regardless of results for original input
    :param request:
    :param word:
    :return:
    """
    kwargs = {}
    for key in ["lookup_ref", "never_split", "always_split", "always_consonants"]:
        if request.GET.get(key, None):
            kwargs[key] = request.GET.get(key)
    result = []
    ls = LexiconLookupAggregator.lexicon_lookup(word, **kwargs)
    if ls:
        for l in ls:
            result.append(l.contents())

    return jsonResponse(result, callback=request.GET.get("callback", None))


@login_required
def user_stats_api(request, uid):
    assert request.method == "GET", "Unsupported Method"
    u = request.user
    assert (u.is_active and u.is_staff) or (int(uid) == u.id)
    quick = bool(request.GET.get("quick", False))
    if quick:
        return jsonResponse(public_user_data(uid))
    return jsonResponse(user_stats_data(uid))


@login_required
def site_stats_api(request):
    assert request.method == "GET", "Unsupported Method"
    return jsonResponse(site_stats_data())


@catch_error_as_json
def updates_api(request, gid=None):
    """
    API for retrieving general notifications.
    """
    if request.method == "GET":
        page = int(request.GET.get("page", 0))
        page_size = int(request.GET.get("page_size", 10))

        notifications = GlobalNotificationSet({}, limit=page_size, page=page)

        return jsonResponse({
            "updates": notifications.client_contents(),
            "page": page,
            "page_size": page_size,
            "count": notifications.count()
        })

    elif request.method == "POST":
        if not request.user.is_authenticated:
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to perform this action."})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            user = User.objects.get(id=apikey["uid"])
            if not user.is_staff:
                return jsonResponse({"error": "Only Sefaria Moderators can add announcements."})

            payload = json.loads(request.POST.get("json"))
            try:
                GlobalNotification(payload).save()
                return jsonResponse({"status": "ok"})
            except AssertionError as e:
                return jsonResponse({"error": str(e)})

        elif request.user.is_staff:
            @csrf_protect
            def protected_post(request):
                payload = json.loads(request.POST.get("json"))
                try:
                    GlobalNotification(payload).save()
                    return jsonResponse({"status": "ok"})
                except AssertionError as e:
                    return jsonResponse({"error": str(e)})

            return protected_post(request)
        else:
            return jsonResponse({"error": "Unauthorized"})

    elif request.method == "DELETE":
        if not gid:
            return jsonResponse({"error": "No post id given for deletion."})
        if request.user.is_staff:
            @csrf_protect
            def protected_post(request):
                GlobalNotification().load_by_id(gid).delete()
                return jsonResponse({"status": "ok"})

            return protected_post(request)
        else:
            return jsonResponse({"error": "Unauthorized"})


@catch_error_as_json
def notifications_api(request):
    """
    API for retrieving user notifications.
    """
    if not request.user.is_authenticated:
        return jsonResponse({"error": "You must be logged in to access your notifications."})

    page = int(request.GET.get("page", 0))
    page_size = int(request.GET.get("page_size", 10))

    notifications = NotificationSet().recent_for_user(request.user.id, limit=page_size, page=page)

    return jsonResponse({
        "notifications": notifications.client_contents(),
        "page": page,
        "page_size": page_size,
        "count": len(notifications)
    })


@catch_error_as_json
def notifications_read_api(request):
    """
    API for marking notifications as read

    Takes JSON in the "notifications" parameter of an array of
    notifcation ids as strings.
    """
    if request.method == "POST":
        notifications = request.POST.get("notifications")
        if not notifications:
            return jsonResponse({"error": "'notifications' post parameter missing."})
        if notifications == "all":
            notificationSet = NotificationSet().unread_for_user(request.user.id)
            for notification in notificationSet:
                notification.mark_read().save()
        else:
            notifications = json.loads(notifications)
            for id in notifications:
                notification = Notification().load_by_id(id)
                if notification.uid != request.user.id:
                    # Only allow expiring your own notifications
                    continue
                notification.mark_read().save()

        return jsonResponse({
            "status": "ok",
            "unreadCount": UserProfile(user_obj=request.user).unread_notification_count()
        })

    else:
        return jsonResponse({"error": "Unsupported HTTP method."})


@catch_error_as_json
def follow_api(request, action, uid):
    """
    API for following and unfollowing another user.
    """
    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."})

    if not request.user.is_authenticated:
        return jsonResponse({"error": "You must be logged in to follow."})

    follow = FollowRelationship(follower=request.user.id, followee=int(uid))
    if action == "follow":
        follow.follow()
    elif action == "unfollow":
        follow.unfollow()

    return jsonResponse({"status": "ok"})


@catch_error_as_json
def follow_list_api(request, kind, uid):
    """
    API for retrieving a list of followers/followees for a given user.
    """
    if kind == "followers":
        f = FollowersSet(int(uid))
    elif kind == "followees":
        f = FolloweesSet(int(uid))

    return jsonResponse(annotate_user_list(f.uids))


@catch_error_as_json
def block_api(request, action, uid):
    """
    API for following and unfollowing another user.
    """

    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."}, status=405)

    if not request.user.is_authenticated:
        return jsonResponse({"error": "You must be logged in to follow."}, status=401)

    block = BlockRelationship(blocker=request.user.id, blockee=int(uid))
    if action == "block":
        block.block()
    elif action == "unblock":
        block.unblock()

    return jsonResponse({"status": "ok"})


def background_data_api(request):
    """
    API that bundles data which we want the client to prefetch,
    but should not block initial pageload.
    """
    language = request.GET.get("locale", 'english')
    # This is an API, its excluded from interfacelang middleware. There's no point in defaulting to request.interfaceLang here as its always 'english'.

    data = {}
    data.update(community_page_data(request, language=language))

    return jsonResponse(data)


@catch_error_as_json
def texts_history_api(request, tref, lang=None, version=None):
    """
    API for retrieving history information about a given text.
    """
    if request.method != "GET":
        return jsonResponse({"error": "Unsupported HTTP method."})

    tref = Ref(tref).normal()
    refRe = '^%s$|^%s:' % (tref, tref)
    if lang and version:
        query = {"ref": {"$regex": refRe}, "language": lang, "version": version.replace("_", " ")}
    else:
        query = {"ref": {"$regex": refRe}}
    history = db.history.find(query)

    summary = {"copiers": set(), "translators": set(), "editors": set(), "reviewers": set()}
    updated = history[0]["date"].isoformat() if len(history) else "Unknown"

    for act in history:
        if act["rev_type"].startswith("edit"):
            summary["editors"].update([act["user"]])
        elif act["rev_type"] == "review":
            summary["reviewers"].update([act["user"]])
        elif act["version"] == "Sefaria Community Translation":
            summary["translators"].update([act["user"]])
        else:
            summary["copiers"].update([act["user"]])

    # Don't list copiers and translators as editors as well
    summary["editors"].difference_update(summary["copiers"])
    summary["editors"].difference_update(summary["translators"])

    for group in summary:
        uids = list(summary[group])
        names = []
        for uid in uids:
            try:
                user = User.objects.get(id=uid)
                name = "%s %s" % (user.first_name, user.last_name)
                link = user_link(uid)
            except User.DoesNotExist:
                name = "Someone"
                link = user_link(-1)
            u = {
                'name': name,
                'link': link
            }
            names.append(u)
        summary[group] = names

    summary["lastUpdated"] = updated

    return jsonResponse(summary, callback=request.GET.get("callback", None))


@sanitize_get_params
def topics_page(request):
    """
    Page of all Topics
    """
    props = {
        "initialMenu": "topics",
        "initialTopic": None,
    }
    track_page_to_mp(request=request, page_title='Topics', text_ref='')
    return render_template(request, 'base.html', props, {
        "title": _("Topics") + " | " + _("Sefaria"),
        "desc": _("Explore Jewish Texts by Topic on Sefaria"),
    })


def topic_page_b(request, topic):
    track_page_to_mp(request=request, page_title='Topics', text_ref=topic)
    return topic_page(request, topic, test_version="b")


@sanitize_get_params
def topic_page(request, topic, test_version=None):
    """
    Page of an individual Topic
    """
    topic_obj = Topic.init(topic)
    if topic_obj is None:
        # try to normalize
        topic_obj = Topic.init(SluggedAbstractMongoRecord.normalize_slug(topic))
        if topic_obj is None:
            raise Http404
        topic = topic_obj.slug

    props = {
        "initialMenu": "topics",
        "initialTopic": topic,
        "initialTab": urllib.parse.unquote(request.GET.get('tab', 'sources')),
        "initialTopicSort": urllib.parse.unquote(request.GET.get('sort', 'Relevance')),
        "initialTopicTitle": {
            "en": topic_obj.get_primary_title('en'),
            "he": topic_obj.get_primary_title('he')
        },
        "topicData": _topic_page_data(topic),
    }

    if test_version is not None:
        props["topicTestVersion"] = test_version

    short_lang = 'en' if request.interfaceLang == 'english' else 'he'
    title = topic_obj.get_primary_title(short_lang) + " | " + _(
        "Texts & Source Sheets from Torah, Talmud and Sefaria's library of Jewish sources.")
    desc = _(
        "Jewish texts and source sheets about %(topic)s from Torah, Talmud and other sources in Sefaria's library.") % {
               'topic': topic_obj.get_primary_title(short_lang)}
    topic_desc = getattr(topic_obj, 'description', {}).get(short_lang, '')
    if topic_desc is not None:
        desc += " " + topic_desc
    return render_template(request, 'base.html', props, {
        "title": title,
        "desc": desc,
    })


@catch_error_as_json
def topics_list_api(request):
    """
    API to get data for a particular topic.
    """
    limit = int(request.GET.get("limit", 1000))
    topics = get_all_topics(limit)
    response = [t.contents() for t in topics]
    response = jsonResponse(response, callback=request.GET.get("callback", None))
    response["Cache-Control"] = "max-age=5"
    return response


@staff_member_required
def add_new_topic_api(request):
    if request.method == "POST":
        data = json.loads(request.POST["json"])
        isTopLevelDisplay = data["category"] == Topic.ROOT
        t = Topic({'slug': "", "isTopLevelDisplay": isTopLevelDisplay, "data_source": "sefaria", "numSources": 0})
        update_topic_titles(t, **data)
        if not isTopLevelDisplay:  # not Top Level so create an IntraTopicLink to category
            new_link = IntraTopicLink({"toTopic": data["category"], "fromTopic": t.slug, "linkType": "displays-under",
                                       "dataSource": "sefaria"})
            new_link.save()

        if data["category"] == 'authors':
            t = update_authors_place_and_time(t, **data)

        t.description_published = True
        t.data_source = "sefaria"  # any topic edited manually should display automatically in the TOC and this flag ensures this
        if "description" in data:
            t.change_description(data["description"], data.get("categoryDescription", None))

        if "image" in data:
            t.image = data["image"]

        t.save()
        clear_redis_cache()

        library.build_topic_auto_completer()
        library.get_topic_toc(rebuild=True)
        library.get_topic_toc_json(rebuild=True)
        library.get_topic_toc_category_mapping(rebuild=True)

        def protected_index_post(request):
            return jsonResponse(t.contents())

        return protected_index_post(request)


@staff_member_required
def delete_topic(request, topic):
    if request.method == "DELETE":
        topic_obj = Topic().load({"slug": topic})
        if topic_obj:
            topic_obj.delete()
            library.build_topic_auto_completer()
            library.get_topic_toc(rebuild=True)
            library.get_topic_toc_json(rebuild=True)
            library.get_topic_toc_category_mapping(rebuild=True)
            return jsonResponse({"status": "OK"})
        else:
            return jsonResponse({"error": "Topic {} doesn't exist".format(topic)})
    else:
        return jsonResponse({"error": "This API only accepts DELETE requests."})


@catch_error_as_json
def topics_api(request, topic, v2=False):
    """
    API to get data or edit data for an existing topic
    """
    if request.method == "GET":
        with_html = bool(int(request.GET.get("with_html", False)))
        with_links = bool(int(request.GET.get("with_links", False)))
        annotate_links = bool(int(request.GET.get("annotate_links", False)))
        group_related = bool(int(request.GET.get("group_related", False)))
        with_refs = bool(int(request.GET.get("with_refs", False)))
        annotate_time_period = bool(int(request.GET.get("annotate_time_period", False)))
        with_indexes = bool(int(request.GET.get("with_indexes", False)))
        ref_link_type_filters = set(
            filter(lambda x: len(x) > 0, request.GET.get("ref_link_type_filters", "").split("|")))
        response = get_topic(v2, topic, with_html=with_html, with_links=with_links, annotate_links=annotate_links,
                             with_refs=with_refs, group_related=group_related,
                             annotate_time_period=annotate_time_period, ref_link_type_filters=ref_link_type_filters,
                             with_indexes=with_indexes)
        return jsonResponse(response, callback=request.GET.get("callback", None))
    elif request.method == "POST":
        if not request.user.is_staff:
            return jsonResponse({
                "error": "Adding topics is locked.<br><br>Please email hello@sefaria.org if you believe edits are needed."})
        topic_data = json.loads(request.POST["json"])
        topic = Topic().load({'slug': topic_data["origSlug"]})
        topic_data["manual"] = True
        author_status_changed = (topic_data["category"] == "authors") ^ (topic_data["origCategory"] == "authors")
        topic = update_topic(topic, **topic_data)
        if author_status_changed:
            library.build_topic_auto_completer()

        def protected_index_post(request):
            return jsonResponse(topic.contents())

        return protected_index_post(request)


@catch_error_as_json
def topic_graph_api(request, topic):
    link_type = request.GET.get("link-type", 'is-a')
    max_depth = int(request.GET.get("max-depth", -1))
    if max_depth == -1:
        max_depth = None
    topic_obj = Topic.init(topic)

    if topic_obj is None:
        response = {"error": f"Topic slug {topic} does not exist"}
    else:
        topics, links = topic_obj.topics_and_links_by_link_type_recursively(linkType=link_type, max_depth=max_depth)
        response = {
            "topics": [t.contents() for t in topics],
            "links": [l.contents() for l in links]
        }
    return jsonResponse(response, callback=request.GET.get("callback", None))


@staff_member_required
def reorder_topics(request):
    topics = json.loads(request.POST["json"]).get("topics", [])
    results = []
    for display_order, t in enumerate(topics):
        topic = Topic().load({'slug': t['slug']})
        topic.displayOrder = display_order * 10
        topic.save()
        results.append(topic.contents())
    return jsonResponse({"topics": results})


@catch_error_as_json
def topic_ref_api(request, tref):
    """
    API to get RefTopicLinks, as well as creating, editing, and deleting of RefTopicLinks
    """

    data = request.GET if request.method in ["DELETE", "GET"] else json.loads(request.POST.get('json'))
    slug = data.get('topic')
    interface_lang = 'en' if data.get('interface_lang') == 'english' else 'he'
    tref = Ref(tref).normal()  # normalize input
    linkType = _CAT_REF_LINK_TYPE_FILTER_MAP['authors'][0] if AuthorTopic.init(slug) else 'about'
    annotate = bool(int(data.get("annotate", False)))

    if request.method == "GET":
        response = get_topics_for_ref(tref, annotate)
        return jsonResponse(response, callback=request.GET.get("callback", None))
    else:
        if not request.user.is_staff:
            return jsonResponse({"error": "Only moderators can connect edit topic sources."})
        elif request.method == "DELETE":
            return jsonResponse(delete_ref_topic_link(tref, slug, linkType, interface_lang))
        elif request.method == "POST":
            description = data.get("description", {})
            creating_new_link = data.get("is_new", True)
            new_tref = Ref(data.get("new_ref",
                                    tref)).normal()  # `new_tref` is only present when editing (`creating_new_link` is False)
            ref_topic_dict = edit_topic_source(slug, orig_tref=tref, new_tref=new_tref,
                                               creating_new_link=creating_new_link,
                                               linkType=linkType, description=description,
                                               interface_lang=interface_lang)
            return jsonResponse(ref_topic_dict)


@staff_member_required
def reorder_sources(request):
    sources = json.loads(request.POST["json"]).get("sources", [])
    slug = request.GET.get('topic')
    lang = 'en' if request.GET.get('lang') == 'english' else 'he'
    return jsonResponse(update_order_of_topic_sources(slug, sources, request.user.id, lang=lang))


_CAT_REF_LINK_TYPE_FILTER_MAP = {
    'authors': ['popular-writing-of'],
}


def _topic_page_data(topic):
    _topic_data(topic=topic, annotate_time_period=True)


def _topic_data(**kwargs):
    cat = library.get_topic_toc_category_mapping().get(topic, None)
    ref_link_type_filters = _CAT_REF_LINK_TYPE_FILTER_MAP.get(cat, ['about', 'popular-writing-of'])

    response = get_topic(True, ref_link_type_filters=ref_link_type_filters, **kwargs)
    return response


@catch_error_as_json
def bulk_topic_api(request):
    """
    Use POST because topic_slug_list can be very large when used for search topic filters
    :param request:
    :return:
    """
    if request.method == "POST":
        minify = request.GET.get("minify", False)
        postJSON = request.POST.get("json")
        topic_slug_list = json.loads(postJSON)
        response = [t.contents(minify=minify) for t in get_bulk_topics(topic_slug_list)]
        return jsonResponse(response, callback=request.GET.get("callback", None))


@catch_error_as_json
def recommend_topics_api(request, ref_list=None):
    """
    API to receive recommended topics for list of strings `refs`.
    """
    if request.method == "GET":
        refs = [Ref(ref).normal() for ref in ref_list.split("+")] if ref_list else []

    elif request.method == "POST":
        postJSON = request.POST.get("json")
        if not postJSON:
            return jsonResponse({"error": "No post JSON."})
        refs = json.loads(postJSON)

    response = {"topics": recommend_topics(refs)}
    response = jsonResponse(response, callback=request.GET.get("callback", None))
    return response


@api_view(["GET"])
@catch_error_as_json
def portals_api(request, slug):
    """
    API to get data for a Portal object by slug
    """
    portal = Portal.init(slug)
    return jsonResponse(portal.contents(), callback=request.GET.get("callback", None))


@ensure_csrf_cookie
@sanitize_get_params
def global_activity(request, page=1):
    """
    Recent Activity page listing all recent actions and contributor leaderboards.
    """
    page = int(page)
    page_size = 100

    if page > 40:
        return render_template(request, 'static/generic.html', None, {
            "title": "Activity Unavailable",
            "content": "You have requested a page deep in Sefaria's history.<br><br>For performance reasons, this page is unavailable. If you need access to this information, please <a href='mailto:dev@sefaria.org'>email us</a>."
        })

    if "api" in request.GET:
        q = {}
    else:
        q = {"method": {"$ne": "API"}}

    filter_type = request.GET.get("type", None)
    activity, page = get_maximal_collapsed_activity(query=q, page_size=page_size, page=page, filter_type=filter_type)

    next_page = page + 1 if page else None
    next_page = "/activity/%d" % next_page if next_page else None
    next_page = "%s?type=%s" % (next_page, filter_type) if next_page and filter_type else next_page

    email = request.user.email if request.user.is_authenticated else False
    return render_template(request, 'activity.html', None, {
        'activity': activity,
        'filter_type': filter_type,
        'email': email,
        'next_page': next_page,
        'he': request.interfaceLang == "hebrew",  # to make templates less verbose
    })


@ensure_csrf_cookie
@sanitize_get_params
def user_activity(request, slug, page=1):
    """
    Recent Activity page for a single user.
    """
    page = int(page) if page else 1
    page_size = 100

    try:
        profile = UserProfile(slug=slug)
    except Exception as e:
        raise Http404

    if page > 40:
        return render_template(request, 'static/generic.html', None, {
            "title": "Activity Unavailable",
            "content": "You have requested a page deep in Sefaria's history.<br><br>For performance reasons, this page is unavailable. If you need access to this information, please <a href='mailto:dev@sefaria.org'>email us</a>."
        })

    q = {"user": profile.id}
    filter_type = request.GET.get("type", None)
    activity, page = get_maximal_collapsed_activity(query=q, page_size=page_size, page=page, filter_type=filter_type)

    next_page = page + 1 if page else None
    next_page = "/activity/%d" % next_page if next_page else None
    next_page = "%s?type=%s" % (next_page, filter_type) if next_page and filter_type else next_page

    email = request.user.email if request.user.is_authenticated else False
    return render_template(request, 'activity.html', None, {
        'activity': activity,
        'filter_type': filter_type,
        'profile': profile,
        'for_user': True,
        'email': email,
        'next_page': next_page,
        'he': request.interfaceLang == "hebrew",  # to make templates less verbose
    })


@ensure_csrf_cookie
@sanitize_get_params
def segment_history(request, tref, lang, version, page=1):
    """
    View revision history for the text segment named by ref / lang / version.
    """
    try:
        oref = Ref(tref)
    except InputError:
        raise Http404

    page = int(page)
    nref = oref.normal()

    version = version.replace("_", " ")
    version_record = Version().load({"title": oref.index.title, "versionTitle": version, "language": lang})
    if not version_record:
        raise Http404(
            "We do not have a version of {} called '{}'.  Please use the menu to find the text you are looking for.".format(
                oref.index.title, version))
    filter_type = request.GET.get("type", None)
    history = text_history(oref, version, lang, filter_type=filter_type, page=page)

    next_page = page + 1 if page else None
    next_page = "/activity/%s/%s/%s/%d" % (nref, lang, version, next_page) if next_page else None
    next_page = "%s?type=%s" % (next_page, filter_type) if next_page and filter_type else next_page

    email = request.user.email if request.user.is_authenticated else False
    return render_template(request, 'activity.html', None, {
        'activity': history,
        "single": True,
        "ref": nref,
        "lang": lang,
        "version": version,
        "versionTitleInHebrew": getattr(version_record, "versionTitleInHebrew", version_record.versionTitle),
        'email': email,
        'filter_type': filter_type,
        'next_page': next_page,
        'he': request.interfaceLang == "hebrew",  # to make templates less verbose
    })


@catch_error_as_json
def revert_api(request, tref, lang, version, revision):
    """
    API for reverting a text segment to a previous revision.
    """
    if not request.user.is_authenticated:
        return jsonResponse({"error": "You must be logged in to revert changes."})

    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."})

    revision = int(revision)
    version = version.replace("_", " ")
    oref = Ref(tref)

    new_text = text_at_revision(oref.normal(), version, lang, revision)

    tracker.modify_text(request.user.id, oref, version, lang, new_text, completestatus="done", type="revert")

    return jsonResponse({"status": "ok"})


def leaderboard(request):
    return render_template(request, 'leaderboard.html', None, {
        'leaders': top_contributors(),
        'leaders30': top_contributors(30),
        'leaders7': top_contributors(7),
        'leaders1': top_contributors(1),
    })


@ensure_csrf_cookie
@sanitize_get_params
def user_profile(request, username):
    """
    User's profile page.
    """
    requested_profile = UserProfile(slug=username)
    if requested_profile.user is None:
        raise Http404
    if not requested_profile.user.is_active:
        raise Http404('Profile is inactive.')

    tab = request.GET.get("tab", "sheets")
    props = {
        "initialMenu": "profile",
        "initialProfile": requested_profile.to_api_dict(),
        "initialTab": tab,
    }
    title = _("%(full_name)s on Pecha") % {"full_name": requested_profile.full_name}
    desc = _('%(full_name)s is on Pecha. Follow to view their public source sheets, notes and translations.') % {
        "full_name": requested_profile.full_name}
    return render_template(request, 'base.html', props, {
        "title": title,
        "desc": desc,
    })


@catch_error_as_json
def profile_api(request):
    """
    API for user profiles.
    """
    if not request.user.is_authenticated:
        return jsonResponse({"error": _("You must be logged in to update your profile.")})

    if request.method == "POST":
        profileJSON = request.POST.get("json")
        if not profileJSON:
            return jsonResponse({"error": "No post JSON."})
        profileUpdate = json.loads(profileJSON)

        profile = UserProfile(id=request.user.id)
        profile.update(profileUpdate)

        error = profile.errors()
        # TODO: should validation not need to be called manually? maybe inside the save
        if error:
            return jsonResponse({"error": error})
        else:
            profile.save()
            return jsonResponse(profile.to_mongo_dict())
    return jsonResponse({"error": "Unsupported HTTP method."})


@login_required
@csrf_protect
def account_user_update(request):
    """
    API for user profiles.
    """
    if not request.user.is_authenticated:
        return jsonResponse({"error": _("You must be logged in to update your profile.")})

    if request.method == "POST":
        accountJSON = request.POST.get("json")
        if not accountJSON:
            return jsonResponse({"error": "No post JSON."})
        accountUpdate = json.loads(accountJSON)
        error = None
        # some validation on post fields
        if accountUpdate["email"] != accountUpdate["confirmEmail"]:
            error = _("Email fields did not match")
        elif not request.user.check_password(accountUpdate["confirmPassword"]):
            error = _("Incorrect account password for this account")
        else:
            # get the logged in user
            uuser = UserWrapper(request.user.email)
            try:
                uuser.set_email(accountUpdate["email"])
                uuser.save()
            except Exception as e:
                error = uuser.errors()

            try:
                crm_mediator = CrmMediator()
                if not crm_mediator.update_user_email(accountUpdate["email"], uid=request.user.id):
                    logger.warning("failed to add user to CRM")

            except Exception as e:
                logger.warning(f"failed to add user to salesforce: {e}")

        if not error:
            return jsonResponse({"status": "ok"})
        else:
            return jsonResponse({"error": error})

    return jsonResponse({"error": "Unsupported HTTP method."})


@catch_error_as_json
def profile_get_api(request, slug):
    if request.method == "GET":
        profile = UserProfile(slug=slug)
        return jsonResponse(profile.to_api_dict())
    return jsonResponse({"error": "Unsupported HTTP method."})


@catch_error_as_json
def profile_follow_api(request, ftype, slug):
    if request.method == "GET":
        profile = UserProfile(slug=slug)
        follow_set = FollowersSet(profile.id) if ftype == "followers" else FolloweesSet(profile.id)
        response = [UserProfile(id=uid).to_api_dict(basic=True) for uid in follow_set.uids]
        return jsonResponse(response)
    return jsonResponse({"error": "Unsupported HTTP method."})


@staff_member_required
def topic_upload_photo(request, topic):
    from io import BytesIO
    import uuid
    import base64
    if request.method == "DELETE":
        old_filename = request.GET.get("old_filename")
        if old_filename is None:
            return jsonResponse({"error": "You cannot remove an image as you haven't selected one yet."})
        old_filename = f"topics/{old_filename.split('/')[-1]}"
        GoogleStorageManager.delete_filename(old_filename, GoogleStorageManager.TOPICS_BUCKET)
        topic = Topic.init(topic)
        if hasattr(topic, "image"):
            del topic.image
            topic.save()
        return jsonResponse({"success": "You have successfully removed the image."})
    elif request.method == "POST":
        file = request.POST.get('file')
        old_filename = request.POST.get('old_filename')  # delete file from google storage if there is one there
        if old_filename:
            old_filename = f"topics/{old_filename.split('/')[-1]}"
        img_file_in_mem = BytesIO(base64.b64decode(file))
        img_url = GoogleStorageManager.upload_file(img_file_in_mem, f"topics/{request.user.id}-{uuid.uuid1()}.gif",
                                                   GoogleStorageManager.TOPICS_BUCKET, old_filename=old_filename)
        topic = Topic.init(topic)
        if not hasattr(topic, "image"):
            topic.image = {"image_uri": img_url, "image_caption": {"en": "", "he": ""}}
        else:
            topic.image["image_uri"] = img_url
        topic.save()
        return jsonResponse({"url": img_url})
    return jsonResponse({"error": "Unsupported HTTP method."})


@catch_error_as_json
def profile_upload_photo(request):
    if not request.user.is_authenticated:
        return jsonResponse({"error": _("You must be logged in to update your profile photo.")})
    if request.method == "POST":
        now = epoch_time()

        profile = UserProfile(id=request.user.id)
        bucket_name = GoogleStorageManager.PROFILES_BUCKET
        image = Image.open(request.FILES['file'])
        old_big_pic_filename = GoogleStorageManager.get_filename_from_url(profile.profile_pic_url)
        old_small_pic_filename = GoogleStorageManager.get_filename_from_url(profile.profile_pic_url_small)

        big_pic_url = GoogleStorageManager.upload_file(get_resized_file(image, (250, 250)),
                                                       "{}-{}.png".format(profile.slug, now), bucket_name,
                                                       old_big_pic_filename)
        small_pic_url = GoogleStorageManager.upload_file(get_resized_file(image, (80, 80)),
                                                         "{}-{}-small.png".format(profile.slug, now), bucket_name,
                                                         old_small_pic_filename)

        profile.update({"profile_pic_url": big_pic_url, "profile_pic_url_small": small_pic_url})
        profile.save()
        public_user_data(request.user.id, ignore_cache=True)  # reset user data cache
        return jsonResponse({"urls": [big_pic_url, small_pic_url]})
    return jsonResponse({"error": "Unsupported HTTP method."})


MAX_LEN_USER_HISTORY = 3000


@api_view(["POST"])
@catch_error_as_json
def profile_sync_api(request):
    """
    API for syncing history and settings with your profile
    Required POST fields: settings, last_sync
    POST payload should look like
    {
        settings: {..., time_stamp},
        user_history: [{...},...],
        last_sync: ...
    }
    """
    if not request.user.is_authenticated:
        return jsonResponse({"error": _("You must be logged in to update your profile.")})
    # fields in the POST req which can be synced
    syncable_fields = ["settings", "user_history"]
    if request.method == "POST":
        profile_updated = False
        post = request.POST
        now = epoch_time()
        no_return = request.GET.get("no_return", False)
        annotate = bool(int(request.GET.get("annotate", 0)))
        profile = UserProfile(id=request.user.id)
        ret = {"created": []}
        # sync items from request
        for field in syncable_fields:
            if field not in post:
                continue
            field_data = json.loads(post[field])
            if field == "settings":
                settings_time_stamp = field_data.pop("time_stamp")  # don't save time_stamp as a field of profile
                try:
                    # mobile app is sending time_stamps as strings. for now, patch by casting server-side. can be None if user hasn't updated settings yet.
                    settings_time_stamp = 0 if settings_time_stamp is None else int(settings_time_stamp)
                except ValueError as e:
                    logger.warning(f'profile_sync_api: {e}')
                    continue
                if settings_time_stamp > profile.attr_time_stamps[field]:
                    # this change happened after other changes in the db
                    profile.attr_time_stamps.update({field: settings_time_stamp})
                    settingsInDB = profile.settings
                    settingsInDB.update(field_data)
                    profile.update({
                        field: settingsInDB,
                        "attr_time_stamps": profile.attr_time_stamps
                    })
                    profile_updated = True
            elif field == "user_history":
                if len(field_data) > MAX_LEN_USER_HISTORY:
                    return jsonResponse({
                        "error": f"Length of user history sync too large. Maximum supported is {MAX_LEN_USER_HISTORY}."})
                # loop thru `field_data` reversed to apply `last_place` to the last item read in each book
                for hist in reversed(field_data):
                    if 'ref' not in hist:
                        logger.warning(f'Ref not in hist. History item: {hist}. User ID: {request.user.id}')
                        continue
                    try:
                        uh = profile.process_history_item(hist, now)
                        if uh:
                            ret["created"] += [uh.contents(for_api=True, annotate=annotate)]
                    except InputError:
                        # validation failed
                        continue

        if not no_return:
            # determine return value after new history saved to include new saved and deleted saves
            # send back items after `last_sync`
            if post.get("last_sync",
                        None) == 'undefined':  # in certain rare sitatuations, last_sync is literally 'undefined'. This should be equivalent to sending '0'.
                last_sync = 0
            else:
                last_sync = json.loads(post.get("last_sync", str(profile.last_sync_web)))

            uhs = UserHistorySet({"uid": request.user.id, "server_time_stamp": {"$gt": last_sync}},
                                 hint="uid_1_server_time_stamp_1")
            ret["last_sync"] = now
            ret["user_history"] = [uh.contents(for_api=True, annotate=False) for uh in uhs.array()]
            ret["settings"] = profile.settings
            ret["settings"]["time_stamp"] = profile.attr_time_stamps["settings"]
            if post.get("client", "") == "web":
                # TODO: This future proofing might not work, because even if we did want to keep local history for browsers, they'd need to store last sync time locally anyway.
                # request was made from web. update last_sync on profile
                profile.update({"last_sync_web": now})
                profile_updated = True
        if profile_updated:
            profile.save()
        return jsonResponse(ret)

    return jsonResponse({"error": "Unsupported HTTP method."})


@catch_error_as_json
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_user_account_api(request):
    # Deletes the user and emails sefaria staff for followup
    if not request.user.is_authenticated:
        return jsonResponse({"error": _("You must be logged in to delete your account.")})
    uid = request.user.id
    user_email = request.user.email
    email_subject = "User Account Deletion Followup"
    email_msg = "User {} has requested deletion of his account".format(user_email)
    reply_email = None
    try:
        delete_user_account(uid, False)
        email_msg += "\n\n The request was completed automatically."
        reply_email = user_email
        response = jsonResponse({"status": "ok"})
    except Exception as e:
        # There are on rare occasions ForeignKeyViolation exceptions due to records in gauth_credentialsmodel or gauth_flowmodel in the sql db not getting
        # removed properly
        email_msg += "\n\n The request failed to complete automatically. The user has been directed to email in his request."
        logger.error("User {} deletion failed. {}".format(uid, e))
        response = jsonResponse({"error": "There was an error deleting the account", "user": user_email})

    EmailMultiAlternatives(email_subject, email_msg, from_email="Sefaria System <dev@sefaria.org>",
                           to=["Sefaria <hello@sefaria.org>"],
                           reply_to=[reply_email if reply_email else "hello@sefaria.org"]).send()
    return response


def get_url_params_user_history(request):
    saved = request.GET.get("saved", None)
    if saved is not None:
        saved = bool(int(saved))
    secondary = request.GET.get("secondary", None)
    if secondary is not None:
        secondary = bool(int(secondary))
    last_place = request.GET.get("last_place", None)
    if last_place is not None:
        last_place = bool(int(last_place))
    tref = request.GET.get("tref", None)
    oref = Ref(tref) if tref else None
    return saved, secondary, last_place, oref


def saved_history_for_ref(request):
    """
    GET API for saved history of a ref
    :tref: Ref associated with history item
    """
    if request.method == "GET":
        _, _, _, oref = get_url_params_user_history(request)
        if oref is None:
            return jsonResponse({"error": "Must specify 'tref' param"})
        return jsonResponse(UserHistory.get_user_history(oref=oref, saved=True, serialized=True))
    return jsonResponse({"error": "Unsupported HTTP method."})


def _get_anonymous_user_history(request):
    history = json.loads(urllib.parse.unquote(request.COOKIES.get("user_history", '[]')))
    return history


def user_history_api(request):
    """
    GET API for user history for a particular user. optional URL params are
    :saved: bool. True if you only want saved items. None if you dont care
    :secondary: bool. True if you only want secondary items. None if you dont care
    :tref: Ref associated with history item
    """
    if request.method == "GET":
        if not request.user.is_authenticated:
            return jsonResponse(_get_anonymous_user_history(request))
        else:
            saved, secondary, last_place, oref = get_url_params_user_history(request)
            user = UserProfile(id=request.user.id)
            if "reading_history" in user.settings and not user.settings["reading_history"] and not saved:
                return jsonResponse([])
            skip = int(request.GET.get("skip", 0))
            limit = int(request.GET.get("limit", 100))
            annotate = bool(int(request.GET.get("annotate", 0)))
            return jsonResponse(
                user.get_history(oref=oref, saved=saved, secondary=secondary, serialized=True, annotate=annotate,
                                 last_place=last_place, skip=skip, limit=limit))
    return jsonResponse({"error": "Unsupported HTTP method."})


def profile_redirect(request, uid, page=1):
    """"
    Redirect to the profile of the logged in user.
    """
    return redirect("/profile/%s" % uid, permanent=True)


@login_required
def my_profile(request):
    """
    Redirect to a user profile
    """
    url = "/profile/%s" % UserProfile(id=request.user.id).slug
    if "tab" in request.GET:
        url += "?tab=" + request.GET.get("tab")
    return redirect(url)


@login_required
@ensure_csrf_cookie
def edit_profile(request):
    """
    Page for editing a user's profile.
    """
    profile = UserProfile(id=request.user.id)
    if not profile.slug:
        profile.slug = slugify(request.user.username) or generate_random_slug()
        while db.profiles.find_one({"slug": profile.slug, "_id": {"$ne": profile.id}}):
            profile.slug = generate_random_slug()
        profile.save()
    sheets = db.sheets.find({"owner": profile.id, "status": "public"}, {"id": 1, "datePublished": 1}).sort(
        [["datePublished", -1]])
    return render_template(request, 'edit_profile.html', None, {
        'user': request.user,
        'profile': profile,
        'sheets': sheets,
    })

def generate_random_slug(length=8):
    """
    Generates a random slug in case the username slug conflicts or is empty.
    """
    letters = string.ascii_lowercase + string.digits
    return ''.join(random.choice(letters) for i in range(length))


# @login_required
# @ensure_csrf_cookie
# def edit_profile(request):
#     """
#     Page for editing a user's profile.
#     """
#     # Fetch the user's profile
#     profile = UserProfile(id=request.user.id)
    
#     # Check if slug is empty or None, and generate a default slug if needed
#     if not profile.slug:
#         # Generate a default slug using the username
#         profile.slug = slugify(request.user.username)
#         # Save the profile with the new slug
#         profile.save()

#     # Get public sheets owned by the user
#     sheets = db.sheets.find({"owner": profile.id, "status": "public"}, {"id": 1, "datePublished": 1}).sort(
#         [["datePublished", -1]])

#     # Render the edit profile page
#     return render(request, 'edit_profile.html', {
#         'user': request.user,
#         'profile': profile,
#         'sheets': sheets,
#         'csrf_token': get_token(request),  # ensure CSRF token is available in the context
#     })

@login_required
@ensure_csrf_cookie
def account_settings(request):
    """
    Page for managing a user's account settings.
    """
    profile = UserProfile(id=request.user.id)
    return render_template(request, 'account_settings.html', None, {
        'user': request.user,
        'profile': profile,
        'lang_names_and_codes': zip(
            [Locale(lang).languages[lang].capitalize() for lang in SITE_SETTINGS['SUPPORTED_TRANSLATION_LANGUAGES']],
            SITE_SETTINGS['SUPPORTED_TRANSLATION_LANGUAGES']),
        'translation_language_preference': (profile is not None and profile.settings.get(
            "translation_language_preference", None)) or request.COOKIES.get("translation_language_preference", None)
    })


@ensure_csrf_cookie
def home(request):
    """
    Homepage (which is the texts page)
    """
    device_id = request.user.id
    email = ''
    if request.user.is_authenticated:
        email = request.user.email
    logger.warning(f"User email: {email}")
    track_page_to_mp(request=request, page_title='Home', text_ref='')
    return redirect("/texts")


def community_page(request, props={}):
    """
    Community Page
    """
    title = _("From the Community: Today on Sefaria")
    desc = _(
        "New and featured source sheets, divrei torah, articles, sermons and more created by members of the Sefaria community.")
    data = community_page_data(request, language=request.interfaceLang)
    data.update(props)  # don't overwrite data that was passed n with props
    return menu_page(request, page="community", props=data, title=title, desc=desc)


def community_page_data(request, language="english"):
    data = {
        "community": get_community_page_items(language=language, diaspora=(language != "hebrew"))
    }
    if request.user.is_authenticated:
        profile = UserProfile(user_obj=request.user)
        data["followRecommendations"] = profile.follow_recommendations(lang=request.interfaceLang)
    else:
        data["followRecommendations"] = general_follow_recommendations(lang=request.interfaceLang)

    return data


@staff_member_required
def community_preview(request):
    """
    Preview the community page as it will appear at some date in the future
    """
    datetime_obj = datetime(2021, 7, 25) + timedelta(days=1)
    tomorrow = datetime_obj.strftime("%-m/%-d/%y")
    date = request.GET.get("date", tomorrow)
    community = get_community_page_items(date=date, language=request.interfaceLang)

    return community_page(request, props={"community": community, "communityPreview": date})


@staff_member_required
def community_reset(request):
    """
    Reset the cache of the community page content from Google sheet
    """
    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("in_memory_cache", "set", ["community-page-data-english", None])
        server_coordinator.publish_event("in_memory_cache", "set", ["community-page-data-hebrew", None])

    datetime_obj = datetime(2021, 7, 25) + timedelta(days=1)
    tomorrow = datetime_obj.strftime("%-m/%-d/%y")
    date = request.GET.get("next", tomorrow)
    community = get_community_page_items(date=date, language=request.interfaceLang, refresh=True)

    return community_page(request, props={"community": community, "communityPreview": date})


def new_home_redirect(request):
    """ Redirect old /new-home urls to / """
    return redirect("/")


@ensure_csrf_cookie
def discussions(request):
    """
    Discussions page.
    """
    discussions = LayerSet({"owner": request.user.id})
    return render_template(request, 'discussions.html', None, {
        "discussions": discussions,
    })


@catch_error_as_json
def new_discussion_api(request):
    """
    API for user profiles.
    """
    if not request.user.is_authenticated:
        return jsonResponse({"error": "You must be logged in to start a discussion."})

    if request.method == "POST":
        attempts = 10
        while attempts > 0:
            key = str(uuid.uuid4())[:8]
            if LayerSet({"urlkey": key}).count() > 0:
                attempts -= 1
                continue

            discussion = Layer({
                "urlkey": key,
                "owner": request.user.id,
            })
            discussion.save()
            return jsonResponse(discussion.contents())

        return jsonResponse({"error": "An extremely unlikely event has occurred."})

    return jsonResponse({"error": "Unsupported HTTP method."})


@ensure_csrf_cookie
def dashboard(request):
    """
    Dashboard page -- table view of all content
    """
    states = VersionStateSet(
        {},
        proj={"title": 1, "flags": 1, "linksCount": 1, "content._en.percentAvailable": 1,
              "content._he.percentAvailable": 1}
    ).array()
    flat_toc = library.get_toc_tree().flatten()

    def toc_sort(a):
        try:
            return flat_toc.index(a["title"])
        except:
            return 9999

    states = sorted(states, key=toc_sort)

    return render_template(request, 'dashboard.html', None, {
        "states": states,
    })


@ensure_csrf_cookie
def metrics(request):
    """
    Metrics page. Shows graphs of core metrics.
    """
    metrics = db.metrics.find().sort("timestamp", 1)
    metrics_json = dumps(metrics)
    return render_template(request, 'metrics.html', None, {
        "metrics_json": metrics_json,
    })


@ensure_csrf_cookie
def digitized_by_sefaria(request):
    """
    Metrics page. Shows graphs of core metrics.
    """
    texts = VersionSet({"digitizedBySefaria": True}, sort=[["title", 1]])
    return render_template(request, 'static/digitized-by-sefaria.html', None, {
        "texts": texts,
    })


def parashat_hashavua_redirect(request):
    """ Redirects to this week's Parashah"""
    diaspora = request.GET.get("diaspora", "1")
    calendars = get_keyed_calendar_items()  # TODO Support israel / customs
    parashah = calendars["Parashat Hashavua"]
    return redirect(iri_to_uri("/" + parashah["url"]), permanent=False)


def daf_yomi_redirect(request):
    """ Redirects to today's Daf Yomi"""
    calendars = get_keyed_calendar_items()
    daf_yomi = calendars["Daf Yomi"]
    return redirect(iri_to_uri("/" + daf_yomi["url"]), permanent=False)


def random_ref(categories=None, titles=None):
    """
    Returns a valid random ref within the Sefaria library.
    """

    # refs = library.ref_list()
    # ref  = choice(refs)
    if categories is not None or titles is not None:
        if categories is None:
            categories = set()
        if titles is None:
            titles = set()
        all_indexes = [x for x in library.all_index_records() if
                       x.title in titles or (x.get_primary_category() in categories)]
    else:
        all_indexes = library.all_index_records()
    # picking by text first biases towards short texts
    index = choice(all_indexes)
    try:
        ref = choice(index.all_segment_refs()).normal()  # check for orphaned texts
        # ref = Ref(text).normal()
    except Exception:
        return random_ref()
    return ref


def random_redirect(request):
    """
    Redirect to a random text page.
    """
    response = redirect(iri_to_uri("/" + random_ref()), permanent=False)
    return response


def random_text_page(request):
    """
    Page for generating random texts.
    """
    return render_template(request, 'random.html', None, {})


def random_text_api(request):
    """
    Return Texts API data for a random ref.
    """

    if "categories" in request.GET:
        categories = set(request.GET.get('categories', '').split('|'))
    else:
        categories = None

    if "titles" in request.GET:
        titles = set(request.GET.get('titles', '').split('|'))
    else:
        titles = None

    response = redirect(iri_to_uri("/api/texts/" + random_ref(categories, titles)) + "?commentary=0&context=0",
                        permanent=False)
    return response


def translations_api(request, lang=None):
    """
    When a lang is provided, returns a dictionary of texts translated into that language,
    organized by category & secondary category.
    When a language is not provided, returns a list of distinct languages for which
    translations exist in the database.
    """
    bundle_commentaries_langs = ["en", "he"]
    if not lang:
        res = db.texts.distinct("actualLanguage")
        return jsonResponse(res)
    # import time
    # t0 = time.time()
    aggregation_query = [{"$match": {"actualLanguage": lang}}, {"$lookup": {
        "from": "index",
        "localField": "title",
        "foreignField": "title",
        "as": "index"
    }}, {"$lookup": {
        "from": "vstate",
        "localField": "title",
        "foreignField": "title",
        "as": "vstate"
    }}]
    if lang == "en":
        aggregation_query.append({"$match": {"vstate.flags.enComplete": True}})

    aggregation_query.extend([{"$project": {"index.dependence": 1, "index.order": 1, "index.collective_title": 1,
                                            "index.title": 1, "index.order": 1,
                                            "versionTitle": 1, "language": 1, "title": 1, "index.categories": 1,
                                            "priority": 1, "vstate.first_section_ref": 1}},
                              {"$sort": {"index.order.0": 1, "index.order.1": 1, "priority": -1}}])

    texts = db.texts.aggregate(aggregation_query)
    # t1 = time.time()
    # print("aggregation: ")
    # print(f"{t1 - t0}")
    res = {}
    titles = []
    for my_index in texts:
        if my_index["title"] not in titles:
            if len(my_index["index"]) > 0:
                my_index_info = my_index["index"][0]
                categories = my_index_info["categories"]
                if "Reference" in categories:
                    continue  # don't list references (also they don't fit assumptions)
                titles.append(my_index["title"])
                depth = 2
                ind = 0
                cur = res
                while len(categories) < depth:
                    categories = categories + ["Uncategorized"]
                while ind < depth and ind < len(categories):
                    if categories[ind] not in cur:
                        cur[categories[ind]] = [] if ind == depth - 1 else {}
                    cur = cur[categories[ind]]
                    ind += 1
                to_add = {}
                if "dependence" in my_index_info and "collective_title" in my_index_info \
                        and my_index_info["dependence"] == "Commentary" and lang in bundle_commentaries_langs:
                    if len(list(filter(lambda x: True if x["title"] == my_index_info["collective_title"] else False,
                                       cur))) > 0:
                        continue
                    else:
                        try:
                            to_add["title"] = my_index_info["collective_title"]
                            categories_to_add = categories[:categories.index(my_index_info["collective_title"]) + 1]
                            to_add["url"] = "/texts/" + "/".join(categories_to_add)
                        except:
                            print("failed to find author page for " + my_index_info["collective_title"] + ": " +
                                  my_index_info["title"])
                            # these are also not showing up in TOC
                            # TODO: fix assumptions?
                            continue
                else:
                    to_add["title"] = my_index_info["title"]
                    to_add[
                        "url"] = f'/{my_index["vstate"][0]["first_section_ref"].replace(":", ".")}?{"ven=" + my_index["versionTitle"] if my_index["language"] == "en" else "vhe=" + my_index["versionTitle"]}&lang=bi'

                if "order" in my_index["index"][0]:
                    to_add["order"] = my_index["index"][0]["order"]
                to_add["versionTitle"] = my_index["versionTitle"]
                to_add["rtlLanguage"] = my_index["language"]
                cur.append(to_add)
    # t2 = time.time()
    # print("create dictionary")
    # print(f"{t2 - t1}")
    return jsonResponse(res)


def random_by_topic_api(request):
    """
    Returns Texts API data for a random text taken from popular topic tags
    """
    cb = request.GET.get("callback", None)
    random_topic = get_random_topic(good_to_promote=True)
    if random_topic is None:
        return random_by_topic_api(request)
    random_source = get_random_topic_source(random_topic)
    if random_source is None:
        return random_by_topic_api(request)
    tref = random_source.normal()
    url = random_source.url()
    resp = jsonResponse({"ref": tref, "topic": random_topic.contents(), "url": url}, callback=cb)
    resp['Content-Type'] = "application/json; charset=utf-8"
    return resp


@csrf_exempt
def dummy_search_api(request):
    # Thou shalt upgrade thine app or thou shalt not glean the results of search thou seeketh
    # this api is meant to information users of the old search.sefaria.org to upgrade their apps to get search to work again
    were_sorry = "We're sorry, but your version of the app is no longer compatible with our new search. We recommend you upgrade the Sefaria app to fully enjoy all it has to offer <br> עמכם הסליחה, אך גרסת האפליקציה הנמצאת במכשירכם איננה תואמת את מנוע החיפוש החדש. אנא עדכנו את אפליקצית ספריא להמשך שימוש בחיפוש"
    resp = jsonResponse({
        "took": 613,
        "timed_out": False,
        "_shards": {
            "total": 5,
            "successful": 5,
            "skipped": 0,
            "failed": 0
        },
        "hits": {
            "total": 1,
            "max_score": 1234,
            "hits": [
                {
                    "_index": "merged-c",
                    "_type": "text",
                    "_id": "yoyo [he]",
                    "_score": 1,
                    "_source": {
                        "titleVariants": ["Upgrade"],
                        "path": "Tanakh/Torah/Genesis",
                        "version_priority": 0,
                        "content": were_sorry,
                        "exact": were_sorry,
                        "naive_lemmatizer": were_sorry,
                        "comp_date": -1400,
                        "categories": ["Tanakh", "Torah"],
                        "lang": "he",
                        "pagesheetrank": 1,
                        "ref": "Genesis 1:1",
                        "heRef": "בראשית א:א",
                        "version": None,
                        "order": "A00000100220030"
                    },
                    "highlight": {
                        "content": [
                            were_sorry
                        ],
                        "exact": [
                            were_sorry
                        ],
                        "naive_lemmatizer": [
                            were_sorry
                        ]
                    }
                }
            ]
        },
        "aggregations": {
            "category": {
                "buckets": []
            }
        }
    })
    resp['Content-Type'] = "application/json; charset=utf-8"
    return resp

def search_sheet(query):
    result = []
    if query:
        query = [
            {
                '$match': {
                    '$or': [
                        {
                            'sources.outsideBiText.en': {
                                '$regex': query, 
                                '$options': 'i'
                            }
                        }, {
                            'sources.outsideBiText.he': {
                                '$regex': query, 
                                '$options': 'i'
                            }
                        }
                    ]
                }
            }, {
                '$project': {
                    'owner': '$owner', 
                    'id': '$id', 
                    'title': '$title', 
                    'sources': {
                        '$map': {
                            'input': '$sources', 
                            'as': 'source', 
                            'in': {
                                '$cond': [
                                    {
                                        '$or': [
                                            {
                                                '$regexMatch': {
                                                    'input': '$$source.outsideBiText.en', 
                                                    'regex': query, 
                                                    'options': 'i'
                                                }
                                            }, {
                                                '$regexMatch': {
                                                    'input': '$$source.outsideBiText.he', 
                                                    'regex': query, 
                                                    'options': 'i'
                                                }
                                            }
                                        ]
                                    }, {
                                        'outsideBiText': {
                                            '$cond': [
                                                {
                                                    '$regexMatch': {
                                                        'input': '$$source.outsideBiText.en', 
                                                        'regex': query, 
                                                        'options': 'i'
                                                    }
                                                }, {
                                                    'en': '$$source.outsideBiText.en'
                                                }, {
                                                    'he': '$$source.outsideBiText.he'
                                                }
                                            ]
                                        }, 
                                        'node': '$$source.node'
                                    }, '$$REMOVE'
                                ]
                            }
                        }
                    }
                }
            }, {
                '$project': {
                    'sheet_id': '$id', 
                    'title': '$title', 
                    'owner_id': '$owner', 
                    'sources': {
                        '$filter': {
                            'input': '$sources', 
                            'as': 'source', 
                            'cond': {
                                '$or': {
                                    '$ne': [
                                        '$$source', None
                                    ]
                                }
                            }
                        }
                    }
                }
            }
        ]
        result = list(db.sheets.aggregate(query))
        
        for item in result:
            item.pop('_id', None)
    return result

def search_text(chapter_query,title_query):
    result = []
    if chapter_query:
        # data = json.loads(request.body)
        # query = data.get('query', '')
        print("query: ", chapter_query, "title", title_query)
        query = [
          {
            "$unwind": {
              "path": "$chapter",
              "includeArrayIndex": "outerIndex"
            }
          },
          {
            "$unwind": {
              "path": "$chapter",
              "includeArrayIndex": "innerIndex"
            }
          },
          {
            "$addFields": {
              "outerIndex": { "$add": ["$outerIndex", 1] },
              "innerIndex": { "$add": ["$innerIndex", 1] }
            }
          },
          {
            "$match": {
                "$and": [
                  { "title": { "$regex": title_query, "$options": "i" } },
                  { "chapter": { "$regex": chapter_query, "$options": "i" } }
                ]
            }
          },
          {
            "$group": {
              "_id": "$_id",
              "language": { "$first": "$language" },
              "title": { "$first": "$title" },
              "versionSource": { "$first": "$versionSource" },
              "versionTitle": { "$first": "$versionTitle" },
              "iscompleted": { "$first": "$iscompleted" },
              "actualLanguage": { "$first": "$actualLanguage" },
              "languageFamilyName": { "$first": "$languageFamilyName" },
              "direction": { "$first": "$direction" },
              "matchingChapters": {
                "$push": {
                  "chapter": "$chapter",
                  "index": {
                    "$concat": [
                      { "$toString": "$outerIndex" },
                      ".",
                      { "$toString": "$innerIndex" }
                    ]
                  }
                }
              }
            }
          }
        ]
        result = list(db.texts.aggregate(query))
        for item in result:
            item.pop('_id', None)
    return result

@csrf_exempt
def mongo_search_api(request):
    print(">>>>>>>>>>>>>>>>>>>>>text and sheet search from mongo>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>",request.method)
    result = {
        "text": "",
        "sheet": "",
    }
    if(request.method == "GET"):
        try:
            chapter_query = urllib.parse.unquote(request.GET.get('chapterQuery', ''))
            title_query =  urllib.parse.unquote(request.GET.get('titleQuery', ''))

            text = search_text(chapter_query,title_query)
            sheet = search_sheet(chapter_query)

            result["text"] = text
            result["sheet"] = sheet

            return jsonResponse({'status': 'success', 'result': result})
        
        except Exception as e:
            print({'status': 'error', 'message': str(e)})
            return jsonResponse({'status': 'error', 'message': str(e)}, status=500)


@csrf_exempt
def search_wrapper_api(request, es6_compat=False):
    """
    @param request:
    @param es6_compat: True to return API response that's compatible with an Elasticsearch 6 compatible client
    @return:
    """
    from sefaria.helper.search import get_elasticsearch_client

    if request.method == "POST":
        if "json" in request.POST:
            j = request.POST.get("json")  # using form-urlencoded
        else:
            j = request.body  # using content-type: application/json
        j = json.loads(j)
        es_client = get_elasticsearch_client()
        search_obj = Search(using=es_client, index=j.get("type")).params(request_timeout=5)
        search_obj = get_query_obj(search_obj=search_obj, **j)
        response = search_obj.execute()
        if response.success():
            response_json = getattr(response.to_dict(), 'body', response.to_dict())
            if es6_compat and isinstance(response_json['hits']['total'], dict):
                response_json['hits']['total'] = response_json['hits']['total']['value']
            return jsonResponse(response_json, callback=request.GET.get("callback", None))
        return jsonResponse({
            "error": "Error with connection to Elasticsearch. Total shards: {}, Shards successful: {}, Timed out: {}".format(
                response._shards.total, response._shards.successful, response.timed_out)},
            callback=request.GET.get("callback", None))
    return jsonResponse({"error": "Unsupported HTTP method."}, callback=request.GET.get("callback", None))


@csrf_exempt
def search_path_filter(request, book_title):
    oref = Ref(book_title)

    categories = oref.index.categories
    indexed_categories = get_search_categories(oref, categories)
    path = "/".join(indexed_categories + [book_title])
    return jsonResponse(path)


@ensure_csrf_cookie
def serve_static(request, page):
    """
    Serve a static page whose template matches the URL
    """
    return render_template(request, 'static/%s.html' % page, None, {})


@ensure_csrf_cookie
def serve_static_by_lang(request, page):
    """
    Serve a static page whose template matches the URL
    """
    return render_template(request, 'static/{}/{}.html'.format(request.LANGUAGE_CODE, page), None, {})


def annual_report(request, report_year):
    pdfs = {
        '2020': STATIC_URL + 'files/Sefaria 2020 Annual Report.pdf',
        '2021': 'https://indd.adobe.com/embed/98a016a2-c4d1-4f06-97fa-ed8876de88cf?startpage=1&allowFullscreen=true',
        '2022': STATIC_URL + 'files/Sefaria_AnnualImpactReport_R14.pdf',
    }
    if report_year not in pdfs:
        raise Http404
    # Renders a simple template, does not extend base.html
    return render(request, template_name='static/annualreport.html',
                  context={'reportYear': report_year, 'pdfURL': pdfs[report_year]})


@ensure_csrf_cookie
def explore(request, topCat, bottomCat, book1, book2, lang=None):
    """
    Serve the explorer, with the provided deep linked books
    """
    books = []
    for book in [book1, book2]:
        if book:
            books.append(book)

    if not topCat and not bottomCat:
        topCat, bottomCat = "Tanakh", "Bavli"
        urlRoot = "/explore"
    else:
        urlRoot = "/explore-" + topCat + "-and-" + bottomCat

    (topCat, bottomCat) = [x.replace("-", "") for x in (topCat, bottomCat)]

    categories = {
        "Tanakh": {
            "title": "Tanakh",
            "heTitle": 'התנ"ך',
            "shapeParam": "Tanakh",
            "linkCountParam": "Tanakh",
        },
        "Torah": {
            "title": "Torah",
            "heTitle": 'תורה',
            "shapeParam": "Tanakh/Torah",
            "linkCountParam": "Torah",
        },
        "Bavli": {
            "title": "Talmud",
            "heTitle": "התלמוד",
            "shapeParam": "Bavli",
            "linkCountParam": "Bavli",
            "talmudAddressed": True,
        },
        "Yerushalmi": {
            "title": "Jerusalem Talmud",
            "heTitle": "התלמוד ירושלמי",
            "shapeParam": "Yerushalmi",
            "linkCountParam": "Yerushalmi",
            "talmudAddressed": True,
        },
        "Mishnah": {
            "title": "Mishnah",
            "heTitle": "המשנה",
            "shapeParam": "Mishnah",
            "linkCountParam": "Mishnah",
        },
        "Tosefta": {
            "title": "Tosefta",
            "heTitle": "התוספתא",
            "shapeParam": "Tosefta",
            "linkCountParam": "Tosefta",
        },
        "MidrashRabbah": {
            "title": "Midrash Rabbah",
            "heTitle": "מדרש רבה",
            "shapeParam": "Midrash Rabbah",
            "linkCountParam": "Midrash Rabbah",
            "colorByBook": True,
        },
        "MishnehTorah": {
            "title": "Mishneh Torah",
            "heTitle": "משנה תורה",
            "shapeParam": "Halakhah/Mishneh Torah",
            "linkCountParam": "Mishneh Torah",
            "labelBySection": True,
        },
        "ShulchanArukh": {
            "title": "Shulchan Arukh",
            "heTitle": "השולחן ערוך",
            "shapeParam": "Halakhah/Shulchan Arukh",
            "linkCountParam": "Shulchan Arukh",
            "colorByBook": True,
        },
        "Zohar": {
            "title": "Zohar",
            "heTitle": "הזוהר",
            "shapeParam": "Zohar",
            "linkCountParam": "Zohar",
            "talmudAddressed": True,
        },
    }

    template_vars = {
        "books": json.dumps(books),
        "categories": json.dumps(categories),
        "topCat": topCat,
        "bottomCat": bottomCat,
        "topCatTitle": categories[topCat]["heTitle"] if request.interfaceLang == "hebrew" else categories[topCat][
            "title"],
        "bottomCatTitle": categories[bottomCat]["heTitle"] if request.interfaceLang == "hebrew" else
        categories[bottomCat]["title"],
        "urlRoot": urlRoot,
    }
    if lang == "he":  # Override language settings if 'he' is in URL
        request.contentLang = "hebrew"

    return render_template(request, 'explore.html', None, template_vars)


@staff_member_required
def visualize_timeline(request):
    return render_template(request, 'timeline.html', None, {})


def person_page_redirect(request, name):
    person = PersonTopic.get_person_by_key(name)

    if not person:
        raise Http404

    url = f'/topics/{person.slug}'
    return redirect(iri_to_uri(url), permanent=True)


def person_index_redirect(request):
    return redirect(iri_to_uri('/topics/category/authors'), permanent=True)


def talmud_person_index_redirect(request):
    return redirect(iri_to_uri('/topics/category/talmudic-figures'), permanent=True)


def _get_sheet_tag_garden(tag):
    garden_key = "sheets.tagged.{}".format(tag)
    g = Garden().load({"key": garden_key})
    if not g:
        g = Garden({"key": garden_key, "title": "Sources from Sheets Tagged {}".format(tag),
                    "heTitle": "מקורות מדפים מתויגים:" + " " + str(tag)})
        g.import_sheets_by_tag(tag)
        g.save()
    return g


def sheet_tag_garden_page(request, key):
    g = _get_sheet_tag_garden(key)
    return garden_page(request, g)


def sheet_tag_visual_garden_page(request, key):
    g = _get_sheet_tag_garden(key)
    return visual_garden_page(request, g)


def custom_visual_garden_page(request, key):
    g = Garden().load({"key": "sefaria.custom.{}".format(key)})
    if not g:
        raise Http404
    return visual_garden_page(request, g)


def _get_search_garden(q):
    garden_key = "search.query.{}".format(q)
    g = Garden().load({"key": garden_key})
    if not g:
        g = Garden({"key": garden_key, "title": "Search: {}".format(q), "heTitle": "חיפוש:" + " " + str(q)})
        g.import_search(q)
        g.save()
    return g


def search_query_visual_garden_page(request, q):
    g = _get_search_garden(q)
    return visual_garden_page(request, g)


def garden_page(request, g):
    template_vars = {
        'title': g.title,
        'heTitle': g.heTitle,
        'key': g.key,
        'stopCount': g.stopSet().count(),
        'stopsByTime': g.stopsByTime(),
        'stopsByPlace': g.stopsByPlace(),
        'stopsByAuthor': g.stopsByAuthor(),
        'stopsByTag': g.stopsByTag()
    }

    return render_template(request, 'garden.html', None, template_vars)


def visual_garden_page(request, g):
    template_vars = {
        'title': g.title,
        'heTitle': g.heTitle,
        'subtitle': getattr(g, "subtitle", ""),
        'heSubtitle': getattr(g, "heSubtitle", ""),
        'key': g.key,
        'stopCount': g.stopSet().count(),
        'stops': json.dumps(g.stopData()),
        'places': g.placeSet().asGeoJson(as_string=True),
        'config': json.dumps(getattr(g, "config", {}))
    }

    return render_template(request, 'visual_garden.html', None, template_vars)


@requires_csrf_token
def custom_page_not_found(request, exception, template_name='404.html'):
    return render_template(request, template_name=template_name, app_props=None, template_context={}, status=404)


@catch_error_as_json
@csrf_exempt
def manuscripts_for_source(request, tref):
    if request.method == "GET":
        if not Ref.is_ref(tref):
            return jsonResponse({"error": "Unrecognized Reference"})
        return jsonResponse(ManuscriptPageSet.load_set_for_client(tref))
    else:
        return jsonResponse({"error": "Unsupported HTTP method."}, callback=request.GET.get("callback", None))


@requires_csrf_token
def custom_server_error(request, template_name='500.html'):
    """
    500 error handler.

    Templates: `500.html`
    """
    return render_template(request, template_name=template_name, app_props=None, template_context={}, status=500)
    # t = get_template(template_name) # You need to create a 500.html template.
    # return http.HttpResponseServerError(t.render({'request_path': request.path}, request))


def apple_app_site_association(request):
    teamID = "2626EW4BML"
    bundleID = "org.sefaria.sefariaApp"
    return jsonResponse({
        "applinks": {
            "apps": [],
            "details": [
                {
                    "appID": "{}.{}".format(teamID, bundleID),
                    "paths": ["*"]
                }
            ]
        }
    })


def android_asset_links_json(request):
    return jsonResponse(
        [{
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
                "namespace": "android_app",
                "package_name": "org.sefaria.sefaria",
                "sha256_cert_fingerprints":
                    ["FD:86:BA:99:63:C2:71:D9:5F:E6:0D:0B:0F:A1:67:EA:26:15:45:BE:0C:D0:DF:69:64:01:F3:AD:D0:EE:C6:87"]
            }
        }]
    )


def application_health_api(request):
    """
    Defines the /healthz  and /health-check API endpoints which responds with
        200 if the application is ready for requests,
        500 if the application is not ready for requests
    """
    if library.is_initialized():
        return http.HttpResponse("Healthy", status="200")
    else:
        return http.HttpResponse("Unhealthy", status="500")


def application_health_api_nonlibrary(request):
    return http.HttpResponse("Healthy", status="200")


def rollout_health_api(request):
    """
    Defines the /healthz-rollout API endpoint which responds with
        200 if the services Django depends on, Redis, Multiserver, and NodeJs
            are available.
        500 if any of the aforementioned services are not available

    {
        allReady: (true|false)
        multiserverReady: (true|false)
        redisReady: (true|false)
        nodejsReady: (true|false)
    }
    """

    def isRedisReachable():
        try:
            redis_client = redis.StrictRedis(host=MULTISERVER_REDIS_SERVER, port=MULTISERVER_REDIS_PORT,
                                             db=MULTISERVER_REDIS_DB, decode_responses=True, encoding="utf-8")
            return redis_client.ping() == True
        except Exception as e:
            logger.warn(f"Failed redis healthcheck. Error: {e}")
            return False

    def isMultiserverReachable():
        return True

    def isNodeJsReachable():
        url = NODE_HOST + "/healthz"
        try:
            statusCode = urllib.request.urlopen(url).status
            return statusCode == 200
        except Exception as e:
            logger.warn(f"Failed node healthcheck. Error: {e}")
            return False

    def is_database_reachable():
        try:
            from sefaria.system.database import db
            return True
        except SystemError as ivne:
            return False

    allReady = isRedisReachable() and isMultiserverReachable() and isNodeJsReachable() and is_database_reachable()

    resp = {
        'allReady': allReady,
        'dbConnected': f'Database Connection: {is_database_reachable()}',
        'multiserverReady': isMultiserverReachable(),
        'redisReady': isRedisReachable(),
        'nodejsReady': isNodeJsReachable(),
        'revisionNumber': os.getenv("HELM_REVISION"),
    }

    print(resp)

    if allReady:
        statusCode = 200
        logger.info("Passed rollout healthcheck.")
    else:
        statusCode = 503
        logger.warn("Failed rollout healthcheck. Healthcheck Response: {}".format(resp))

    return http.JsonResponse(resp, status=statusCode)
