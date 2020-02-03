# -*- coding: utf-8 -*-

from datetime import datetime, timedelta
from elasticsearch_dsl import Search
from elasticsearch import Elasticsearch
from random import choice
import json
import urllib.request, urllib.parse, urllib.error
import dateutil.parser
from bson.json_util import dumps
import socket
import bleach
from collections import OrderedDict

from rest_framework.decorators import api_view
from django.template.loader import render_to_string, get_template
from django.shortcuts import render, get_object_or_404, redirect
from django.http import Http404
from django.contrib.auth.decorators import login_required
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.encoding import iri_to_uri
from django.utils.translation import ugettext as _
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt, csrf_protect, requires_csrf_token
from django.contrib.auth.models import User
from django import http
from django.utils import timezone

from sefaria.model import *
from sefaria.workflows import *
from sefaria.reviews import *
from sefaria.google_storage_manager import GoogleStorageManager
from sefaria.model.user_profile import user_link, user_started_text, unread_notifications_count_for_user, public_user_data
from sefaria.model.group import GroupSet
from sefaria.model.webpage import get_webpages_for_ref
from sefaria.model.schema import SheetLibraryNode
from sefaria.model.trend import user_stats_data, site_stats_data
from sefaria.client.wrapper import format_object_for_client, format_note_object_for_client, get_notes, get_links
from sefaria.system.exceptions import InputError, PartialRefInputError, BookNameError, NoVersionFoundError, DictionaryEntryNotFoundError
from sefaria.client.util import jsonResponse
from sefaria.history import text_history, get_maximal_collapsed_activity, top_contributors, make_leaderboard, make_leaderboard_condition, text_at_revision, record_version_deletion, record_index_deletion
from sefaria.system.decorators import catch_error_as_json, sanitize_get_params, json_response_decorator
from sefaria.summaries import get_or_make_summary_node
from sefaria.sheets import get_sheets_for_ref, public_sheets, get_sheets_by_tag, user_sheets, user_tags, trending_topics, sheet_to_dict, get_top_sheets, public_tag_list, group_sheets, get_sheet_for_panel, annotate_user_links
from sefaria.utils.util import text_preview
from sefaria.utils.hebrew import hebrew_term, is_hebrew
from sefaria.utils.talmud import daf_to_section
from sefaria.utils.calendars import get_all_calendar_items, get_keyed_calendar_items, this_weeks_parasha
from sefaria.utils.util import short_to_long_lang_code, titlecase
import sefaria.tracker as tracker
from sefaria.system.cache import django_cache
from sefaria.settings import USE_VARNISH, USE_NODE, NODE_HOST, DOMAIN_LANGUAGES, MULTISERVER_ENABLED, SEARCH_ADMIN
from sefaria.site.site_settings import SITE_SETTINGS
from sefaria.system.multiserver.coordinator import server_coordinator
from sefaria.helper.search import get_query_obj
from sefaria.helper.topic import get_topic, get_all_topics
from django.utils.html import strip_tags

if USE_VARNISH:
    from sefaria.system.varnish.wrapper import invalidate_ref, invalidate_linked

import logging
logger = logging.getLogger(__name__)

#    #    #
# Initialized cache library objects that depend on sefaria.model being completely loaded.
logger.warn("Initializing library objects.")
library.get_toc_tree()
library.build_full_auto_completer()
library.build_ref_auto_completer()
library.build_lexicon_auto_completers()
library.build_cross_lexicon_auto_completer()
if server_coordinator:
    server_coordinator.connect()
#    #    #

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
            oref = model.Ref(tref)
        except PartialRefInputError as e:
            logger.warning('{}'.format(e))
            matched_ref = Ref(e.matched_part)
            return reader_redirect(matched_ref.url())
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


def render_react_component(component, props):
    """
    Asks the Node Server to render `component` with `props`.
    `props` may either be JSON (to save reencoding) or a dictionary.
    Returns HTML.
    """
    if not USE_NODE:
        return render_to_string("elements/loading.html", context={"SITE_SETTINGS": SITE_SETTINGS})

    from sefaria.settings import NODE_TIMEOUT, NODE_TIMEOUT_MONITOR

    propsJSON = json.dumps(props) if isinstance(props, dict) else props
    cache_key = "todo" # zlib.compress(propsJSON)
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
        # Catch timeouts, however they may come.  Write to file NODE_TIMEOUT_MONITOR, which forever monitors to restart process
        if isinstance(e, socket.timeout) or (hasattr(e, "reason") and isinstance(e.reason, socket.timeout)):
            logger.exception("Node timeout: Fell back to client-side rendering.")
            with open(NODE_TIMEOUT_MONITOR, "a") as myfile:
                props = json.loads(props) if isinstance(props, str) else props
                myfile.write("Timeout at {}: {} / {} / {} / {}\n".format(
                    datetime.now().isoformat(),
                    props.get("initialPath"),
                    "MultiPanel" if props.get("multiPanel", True) else "Mobile",
                    "Logged In" if props.get("loggedIn", False) else "Logged Out",
                    props.get("interfaceLang")
                ))
            return render_to_string("elements/loading.html", context={"SITE_SETTINGS": SITE_SETTINGS})
        else:
            # If anything else goes wrong with Node, just fall back to client-side rendering
            logger.exception("Node error: Fell back to client-side rendering.")
            return render_to_string("elements/loading.html", context={"SITE_SETTINGS": SITE_SETTINGS})


def make_panel_dict(oref, versionEn, versionHe, filter, versionFilter, mode, **kwargs):
    """
    Returns a dictionary corresponding to the React panel state,
    additionally setting `text` field with textual content.
    """
    if oref.is_book_level():
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
                "bookRef": oref.normal(),
                "indexDetails": library.get_index(oref.normal()).contents_with_content_counts(),
                "currVersions": currVersions
            }
        else:
            panel = {
                "menuOpen": "book toc",
                "bookRef": oref.normal(),
                "indexDetails": library.get_index(oref.normal()).contents_with_content_counts(),
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
            if filter[0] in ("Sheets", "Notes", "About", "Versions", "Version Open", "Web Pages", "extended notes"):
                panel["connectionsMode"] = filter[0]
            else:
                panel["connectionsMode"] = "TextList"

        settings_override = {}
        panelDisplayLanguage = kwargs.get("panelDisplayLanguage")
        aliyotOverride = kwargs.get("aliyotOverride")
        if panelDisplayLanguage:
            settings_override.update({"language" : short_to_long_lang_code(panelDisplayLanguage)})
        if aliyotOverride:
            settings_override.update({"aliyotTorah": aliyotOverride})
        if settings_override:
            panel["settings"] = settings_override
        if mode != "Connections":
            try:
                text_family = TextFamily(oref, version=panel["currVersions"]["en"], lang="en", version2=panel["currVersions"]["he"], lang2="he", commentary=False,
                                  context=True, pad=True, alts=True, wrapLinks=False).contents()
            except NoVersionFoundError:
                text_family = {}
            text_family["updateFromAPI"] = True
            text_family["next"] = oref.next_section_ref().normal() if oref.next_section_ref() else None
            text_family["prev"] = oref.prev_section_ref().normal() if oref.prev_section_ref() else None
            panel["text"] = text_family

            if oref.index.categories == ["Tanakh", "Torah"]:
                panel["indexDetails"] = oref.index.contents(v2=True) # Included for Torah Parashah titles rendered in text

            if oref.is_segment_level(): # Note: a ranging or spanning ref like "Genesis 1:2-3:4" is considered segment level
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
        highlighted_node = sheet_id.split(".")[1]
        sheet_id = sheet_id.split(".")[0]

    db.sheets.update({"id": int(sheet_id)}, {"$inc": {"views": 1}})
    sheet = get_sheet_for_panel(int(sheet_id))
    if "error" in sheet:
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
        "highlightedNodes": highlighted_node
    }

    if highlighted_node:
        ref = next((element["ref"] for element in sheet["sources"] if element.get("ref") and element["node"] == int(highlighted_node)), None)

    panelDisplayLanguage = kwargs.get("panelDisplayLanguage")
    if panelDisplayLanguage:
        panel["settings"] = {"language": short_to_long_lang_code(panelDisplayLanguage)}

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


def base_props(request):
    """
    Returns a dictionary of props that all App pages get based on the request.
    """
    from sefaria.system.context_processors import user_and_notifications
    return {
        "multiPanel": not request.user_agent.is_mobile and not "mobile" in request.GET,
        "initialPath": request.get_full_path(),
        "loggedIn": True if request.user.is_authenticated else False, # Django 1.10 changed this to a CallableBool, so it doesnt have a direct value of True/False,
        "_uid": request.user.id,
        "interfaceLang": request.interfaceLang,
        "initialSettings": {
            "language":      request.contentLang,
            "layoutDefault": request.COOKIES.get("layoutDefault", "segmented"),
            "layoutTalmud":  request.COOKIES.get("layoutTalmud", "continuous"),
            "layoutTanakh":  request.COOKIES.get("layoutTanakh", "segmented"),
            "aliyotTorah":   request.COOKIES.get("aliyotTorah", "aliyotOff"),
            "vowels":        request.COOKIES.get("vowels", "all"),
            "biLayout":      request.COOKIES.get("biLayout", "stacked"),
            "color":         request.COOKIES.get("color", "light"),
            "fontSize":      request.COOKIES.get("fontSize", 62.5),
        },
    }


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

    props = base_props(request)

    panels = []
    multi_panel = props["multiPanel"]
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
        kwargs = {
            "panelDisplayLanguage": request.GET.get("lang", props["initialSettings"]["language"]),
            'extended notes': int(request.GET.get("notes", 0)),
        }
        if request.GET.get("aliyot", None):
            kwargs["aliyotOverride"] = "aliyotOn" if int(request.GET.get("aliyot")) == 1 else "aliyotOff"
        panels += make_panel_dicts(oref, versionEn, versionHe, filter, versionFilter, multi_panel, **kwargs)

    elif sheet == True:
        panels += make_sheet_panel_dict(ref, filter, **{"panelDisplayLanguage": request.GET.get("lang", "bi")})

    # Handle any panels after 1 which are identified with params like `p2`, `v2`, `l2`.
    i = 2
    while True:
        ref = request.GET.get("p{}".format(i))

        if not ref:
            break
        if ref == "search":
            panelDisplayLanguage = request.GET.get("lang{}".format(i), props["initialSettings"]["language"])
            panels += [make_search_panel_dict(request.GET, i, **{"panelDisplayLanguage": panelDisplayLanguage})]

        elif ref == "sheet":
            sheet_id = request.GET.get("s{}".format(i))
            panelDisplayLanguage = request.GET.get("lang", "bi")
            panels += make_sheet_panel_dict(sheet_id, None, **{"panelDisplayLanguage": panelDisplayLanguage})

        else:
            try:
                oref = Ref(ref)
            except InputError:
                i += 1
                continue  # Stop processing all panels?
                # raise Http404

            versionEn  = request.GET.get("ven{}".format(i)).replace("_", " ") if request.GET.get("ven{}".format(i)) else None
            versionHe  = request.GET.get("vhe{}".format(i)).replace("_", " ") if request.GET.get("vhe{}".format(i)) else None
            if not versionEn and not versionHe:
                # potential link using old version format
                language = request.GET.get("l{}".format(i))
                if language == "en":
                    versionEn = request.GET.get("v{}".format(i)).replace("_", " ") if request.GET.get("v{}".format(i)) else None
                else: # he
                    versionHe = request.GET.get("v{}".format(i)).replace("_", " ") if request.GET.get("v{}".format(i)) else None

            filter   = request.GET.get("w{}".format(i)).replace("_", " ").split("+") if request.GET.get("w{}".format(i)) else None
            filter   = [] if filter == ["all"] else filter
            versionFilter = [request.GET.get("vside").replace("_", " ")] if request.GET.get("vside") else []
            kwargs = {
                "panelDisplayLanguage": request.GET.get("lang{}".format(i), props["initialSettings"]["language"]),
                'extended notes': int(request.GET.get("notes{}".format(i), 0)),
            }
            if request.GET.get("aliyot{}".format(i), None):
                kwargs["aliyotOverride"] = "aliyotOn" if int(request.GET.get("aliyot{}".format(i))) == 1 else "aliyotOff"

            if (versionEn and not Version().load({"versionTitle": versionEn, "language": "en"})) or \
                (versionHe and not Version().load({"versionTitle": versionHe, "language": "he"})):
                i += 1
                continue  # Stop processing all panels?
                # raise Http404

            panels += make_panel_dicts(oref, versionEn, versionHe, filter, versionFilter, multi_panel, **kwargs)
        i += 1

    props.update({
        "headerMode":                  False,
        "initialRefs":                 panels[0].get("refs", []),
        "initialFilter":               panels[0].get("filter", None), # used only for mobile, TextAndConnections case.
        "initialBookRef":              panels[0].get("bookRef", None),
        "initialPanels":               panels,
        "initialPanelCap":             len(panels),
        "initialQuery":                None,
        "initialSheetsTag":            None,
        "initialNavigationCategories": None,
        "initialNavigationTopicCategory":     None,
    })
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
                enText = _reduce_ranged_ref_text_to_first_section(props["initialPanels"][0]["text"].get("text", []))
                heText = _reduce_ranged_ref_text_to_first_section(props["initialPanels"][0]["text"].get("he", []))
                enDesc = enText[segmentIndex] if segmentIndex < len(enText) else "" # get english text for section if it exists
                heDesc = heText[segmentIndex] if segmentIndex < len(heText) else "" # get hebrew text for section if it exists
                if request.interfaceLang == "hebrew":
                    desc = heDesc or enDesc # if no hebrew, fall back on hebrew
                else:
                    desc = enDesc or heDesc  # if no english, fall back on hebrew

                desc = bleach.clean(desc, strip=True, tags=())
                desc = desc[:160].rsplit(' ', 1)[0] + "..."  # truncate as close to 160 characters as possible while maintaining whole word. Append ellipses.

            except (IndexError, KeyError):
                desc = _("Explore 3,000 years of Jewish texts in Hebrew and English translation.")

    else:
        sheet = panels[0].get("sheet",{})
        title = "Sefaria Source Sheet: " + strip_tags(sheet["title"])
        breadcrumb = sheet_crumbs(request, sheet)
        desc = sheet.get("summary","A source sheet created with Sefaria's Source Sheet Builder")
        noindex = sheet["status"] != "public"

    propsJSON = json.dumps(props)
    html = render_react_component("ReaderApp", propsJSON)
    return render(request, 'base.html', {
        "propsJSON":      propsJSON,
        "html":           html,
        "title":          title,
        "desc":           desc,
        "ldBreadcrumbs":  breadcrumb,
        "noindex":        noindex,
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

    props = base_props(request)
    cats  = cats.split("/")
    if cats != ["recent"]:
        toc        = library.get_toc()
        cat_toc    = get_or_make_summary_node(toc, cats, make_if_not_found=False)
        if cat_toc is None or len(cats) == 0:
            return texts_list(request)
        cat_string = ", ".join(cats) if request.interfaceLang == "english" else ", ".join([hebrew_term(cat) for cat in cats])
        title = cat_string + _(" | Sefaria")
        desc  = _("Read %(categories)s texts online with commentaries and connections.") % {'categories': cat_string}

    else:
        title = _("Recently Viewed")
        desc  = _("Texts that you've recently viewed on Sefaria.")

    props.update({
        "initialMenu": "navigation",
        "initialNavigationCategories": cats,
    })
    propsJSON = json.dumps(props)
    html = render_react_component("ReaderApp", propsJSON)
    return render(request, 'base.html', {
        "propsJSON":        propsJSON,
        "html":             html,
        "title":            title,
        "desc":             desc,
        "ldBreadcrumbs":    ld_cat_crumbs(request, cats)
    })

@sanitize_get_params
def topics_toc_page(request, topicCategory):
    """
    List of texts in a category.
    """
    props = base_props(request)

    props.update({
        "initialMenu": "navigation",
        "initialNavigationTopicCategory": topicCategory,
    })
    propsJSON = json.dumps(props)
    html = render_react_component("ReaderApp", propsJSON)
    return render(request, 'base.html', {
        "propsJSON":        propsJSON,
        "html":             html,
        "title":            "",
        "desc":             "",
        #"ldBreadcrumbs":    ld_cat_crumbs(request, cats)
    })


def get_param(param, i=None):
    return "{}{}".format(param, "" if i is None else i)


def get_search_params(get_dict, i=None):
    gp = get_param
    sheet_group_search_filters = [urllib.parse.unquote(f) for f in get_dict.get(gp("sgroupFilters", i)).split("|")] if get_dict.get(gp("sgroupFilters", i),
                                                                                                     "") else []
    sheet_tags_search_filters = [urllib.parse.unquote(f) for f in get_dict.get(gp("stagsFilters", i), "").split("|")] if get_dict.get(gp("stagsFilters", i),
                                                                                                       "") else []
    sheet_agg_types = ['group'] * len(sheet_group_search_filters) + ['tags'] * len(
        sheet_tags_search_filters)  # i got a tingly feeling writing this
    text_filters = [urllib.parse.unquote(f) for f in get_dict.get(gp("tpathFilters", i)).split("|")] if get_dict.get(gp("tpathFilters", i)) else []
    return {
        "query": urllib.parse.unquote(get_dict.get(gp("q", i), "")),
        "tab": urllib.parse.unquote(get_dict.get(gp("tab", i), "text")),
        "textField": ("naive_lemmatizer" if get_dict.get(gp("tvar", i)) == "1" else "exact") if get_dict.get(gp("tvar", i)) else "",
        "textSort": get_dict.get(gp("tsort", i), None),
        "textFilters": text_filters,
        "textFilterAggTypes": [None for _ in text_filters],  # currently unused. just needs to be equal len as text_filters
        "sheetSort": get_dict.get(gp("ssort", i), None),
        "sheetFilters": (sheet_group_search_filters + sheet_tags_search_filters),
        "sheetFilterAggTypes": sheet_agg_types,
    }


@ensure_csrf_cookie
@sanitize_get_params
def search(request):
    """
    Search or Search Results page.
    """
    search_params = get_search_params(request.GET)

    props = base_props(request)
    props.update({
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
    })
    propsJSON = json.dumps(props)
    html = render_react_component("ReaderApp", propsJSON)
    return render(request,'base.html', {
        "propsJSON": propsJSON,
        "html":      html,
        "title":     (search_params["query"] + " | " if search_params["query"] else "") + _("Sefaria Search"),
        "desc":      _("Search 3,000 years of Jewish texts in Hebrew and English translation.")
    })


@sanitize_get_params
def sheets(request):
    """
    Source Sheets Home Page.
    """
    props = base_props(request)
    props.update({
        "initialMenu": "sheets",
        "topSheets": get_top_sheets(),
        "tagList": public_tag_list(sort_by="count"),
        "trendingTags": trending_topics(ntags=18)
    })

    title = _("Sefaria Source Sheets")
    desc  = _("Explore thousands of public Source Sheets and use our Source Sheet Builder to create your own online.")
    propsJSON = json.dumps(props)
    html = render_react_component("ReaderApp", propsJSON)
    return render(request, 'base.html', {
        "propsJSON":      propsJSON,
        "title":          title,
        "desc":           desc,
        "html":           html,
    })


@sanitize_get_params
def get_group_page(request, group, authenticated):
    props = base_props(request)
    props.update({
        "initialMenu":     "sheets",
        "initialSheetsTag": "sefaria-groups",
        "initialGroup":     group,
        "initialGroupTag":  request.GET.get("tag", None)
    })
    group = GroupSet({"name": group})
    if not len(group):
        raise Http404
    props["groupData"] = group[0].contents(with_content=True, authenticated=authenticated)

    propsJSON = json.dumps(props)
    html = render_react_component("ReaderApp", propsJSON)
    return render(request, 'base.html', {
        "propsJSON": propsJSON,
        "html": html,
        "title": group[0].name + " | " + _("Sefaria Groups"),
        "desc": props["groupData"].get("description", ""),
        "noindex": not getattr(group[0], "listed", False)
    })


def public_groups(request):
    props = base_props(request)
    title = _("Sefaria Groups")
    return menu_page(request, props, "publicGroups")


@login_required
def my_groups(request):
    props = base_props(request)
    title = _("Sefaria Groups")
    return menu_page(request, props, "myGroups")


@login_required
def my_notes(request):
    title = _("My Notes on Sefaria")
    props = base_props(request)
    return menu_page(request, props, "myNotes", title)


@sanitize_get_params
def sheets_by_tag(request, tag):
    """
    Page of sheets by tag.
    Currently used to for "My Sheets" and  "All Sheets" as well.
    """
    if tag != Term.normalize(tag):
        return redirect("/sheets/tags/%s" % Term.normalize(tag))

    props = base_props(request)
    props.update({
        "initialMenu":     "sheets",
        "initialSheetsTag": tag,
    })
    if tag == "My Sheets" and request.user.is_authenticated:
        props["userSheets"] = user_sheets(request.user.id)["sheets"]
        props["userTags"]   = user_tags(request.user.id)
        title = _("My Source Sheets | Sefaria Source Sheets")
        desc  = _("My Sources Sheets on Sefaria, both private and public.")

    elif tag == "My Sheets" and not request.user.is_authenticated:
        return redirect("/login?next=/sheets/private")

    elif tag == "All Sheets":
        props["publicSheets"] = {"offset0num50": public_sheets(limit=50)["sheets"]}
        title = _("Public Source Sheets | Sefaria Source Sheets")
        desc  = _("Explore thousands of public Source Sheets drawing on Sefaria's library of Jewish texts.")

    else:
        # redirect to topics
        return redirect("/topics/{}".format(tag), permanent=True)

    propsJSON = json.dumps(props)
    html = render_react_component("ReaderApp", propsJSON)
    return render(request,'base.html', {
        "propsJSON":      propsJSON,
        "title":          title,
        "desc":           desc,
        "html":           html,
    })


## Sheet Views
def sheets_list(request, type=None):
    """
    List of all public/your/all sheets
    either as a full page or as an HTML fragment
    """
    if not type:
        # Sheet Splash page
        return sheets(request)

    response = { "status": 0 }

    if type == "public":
        return sheets_by_tag(request,"All Sheets")

    elif type == "private" and request.user.is_authenticated:
        return sheets_by_tag(request,"My Sheets")

    elif type == "private" and not request.user.is_authenticated:
        return redirect("/login?next=/sheets/private")


def sheets_tags_list(request):
    """
    Redirect to Sheets homepage which has tags list.
    Previously: View public sheets organized by tags.
    """
    return redirect("/sheets")


def group_page(request, group):
    """
    Main page for group `group`
    """
    group = group.replace("-", " ").replace("_", " ")
    group = Group().load({"name": group})
    if not group:
        raise Http404
    if request.user.is_authenticated and group.is_member(request.user.id):
        return get_group_page(request, group.name, True)
    else:
        return get_group_page(request, group.name, False)


@login_required
def edit_group_page(request, group=None):
    if group:
        group = group.replace("-", " ").replace("_", " ")
        group = Group().load({"name": group})
        if not group:
            raise Http404
        groupData = group.contents()
    else:
        groupData = None

    return render(request, 'edit_group.html', {"groupData": groupData})


@staff_member_required
def groups_admin_page(request):
    """
    Page listing all groups for admins
    """
    groups = GroupSet(sort=[["name", 1]])
    return render(request, "groups.html", {"groups": groups})


@sanitize_get_params
def menu_page(request, props, page, title="", desc=""):
    """
    View for any App page that can described with the `menuOpen` param in React
    """
    props.update({
        "initialMenu": page,
    })
    propsJSON = json.dumps(props)
    html = render_react_component("ReaderApp", propsJSON)
    return render(request, 'base.html', {
        "propsJSON":      propsJSON,
        "title":          title,
        "desc":           desc,
        "html":           html,
    })


def mobile_home(request):
    props = base_props(request)
    return menu_page(request, props, "home")


def texts_list(request):
    props = base_props(request)
    title = _(SITE_SETTINGS["LIBRARY_NAME"]["en"])
    desc  = _("Browse 1,000s of Jewish texts in the Sefaria Library by category and title.")
    return menu_page(request, props, "navigation", title, desc)


def saved(request):
    props = base_props(request)
    title = _("My Saved Content")
    desc = _("See your saved content on Sefaria")
    return menu_page(request, props, "saved", title, desc)


def user_history(request):
    props = base_props(request)
    title = _("My User History")
    desc = _("See your user history on Sefaria")
    return menu_page(request, props, "history", title, desc)


def updates(request):
    props = base_props(request)
    title = _("New Additions to the Sefaria Library")
    desc  = _("See texts, translations and connections that have been recently added to Sefaria.")
    return menu_page(request, props, "updates", title, desc)


def new_home(request):
    props = base_props(request)
    title = _("Sefaria: a Living Library of Jewish Texts Online")
    desc  = _( "The largest free library of Jewish texts available to read online in Hebrew and English including Torah, Tanakh, Talmud, Mishnah, Midrash, commentaries and more.")
    return menu_page(request, props, "homefeed", title, desc)


@staff_member_required
def story_editor(request):
    props = base_props(request)
    title = _("Story Editor")
    return menu_page(request, props, "story_editor", title)


@login_required
def user_stats(request):
    props = base_props(request)
    title = _("User Stats")
    return menu_page(request, props, "user_stats", title)

@login_required
def account(request):
    title = _("Sefaria Account")
    props = base_props(request)
    return menu_page(request, props, "account", title)


@login_required
def notifications(request):
    # Notifications content is not rendered server side
    title = _("Sefaria Notifications")
    props = base_props(request)
    return menu_page(request, props, "notifications", title)


@login_required
def modtools(request):
    title = _("Moderator Tools")
    props = base_props(request)
    return menu_page(request, props, "modtools", title)


""" Is this used?

def s2_extended_notes(request, tref, lang, version_title):
    if not Ref.is_ref(tref):
        raise Http404

    version_title = version_title.replace("_", " ")
    version = Version().load({'title': tref, 'language': lang, 'versionTitle': version_title})
    if version is None:
        return reader(request, tref)

    if not hasattr(version, 'extendedNotes') and not hasattr(version, 'extendedNotesHebrew'):
        return reader(request, tref, lang, version_title)

    title = _("Extended Notes")
    props = s2_props(request)
    panel = {
        "mode": "extended notes",
        "ref": tref,
        "refs": [tref],
        "version": version_title,
        "versionLanguage": lang,
        "extendedNotes": getattr(version, "extendedNotes", ""),
        "extendedNotesHebrew": getattr(version, "extendedNotesHebrew", "")
    }
    props['panels'] = [panel]
    return s2_page(request, props, "extended notes", title)
"""

"""
JSON - LD snippets for use in "rich snippets" - semantic markup.
"""
def _crumb(pos, id, name):
    return {
        "@type": "ListItem",
        "position": pos,
        "item": {
            "@id": id,
            "name": name
        }}


def sheet_crumbs(request, sheet=None):
    if sheet is None:
        return ""

    # todo: write up topic breadcrumbs
    breadcrumbJsonList = [_crumb(1, "/sheets", _("Sheets"))]

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

    for i,c in enumerate(cats):
        name = hebrew_term(c) if request.interfaceLang == "hebrew" else c
        breadcrumbJsonList += [_crumb(nextPosition, "/texts/" + "/".join(cats[0:i+1]), name)]
        nextPosition += 1

    if title:
        name = hebrew_term(title) if request.interfaceLang == "hebrew" else title
        breadcrumbJsonList += [_crumb(nextPosition, "/" + title.replace(" ", "_"), name)]
        nextPosition += 1

        if oref and oref.index_node != oref.index.nodes:
            for snode in oref.index_node.ancestors()[1:] + [oref.index_node]:
                if snode.is_default():
                    continue
                name = snode.primary_title("he") if request.interfaceLang == "hebrew" else  snode.primary_title("en")
                breadcrumbJsonList += [_crumb(nextPosition, "/" + snode.ref().url(), name)]
                nextPosition += 1

        #todo: range?
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
                version = version.replace("_", " ") if version else None
                #text = get_text(ref, lang=lang, version=version)
                text = TextFamily(Ref(ref), lang=lang, version=version).contents()
                text["mode"] = request.path.split("/")[1]
                mode = text["mode"].capitalize()
                text["edit_lang"] = lang if lang is not None else request.contentLang
                text["edit_version"] = version
                initJSON = json.dumps(text)
        except:
            index = library.get_index(ref)
            if index:
                ref = None
                initJSON = json.dumps({"mode": "add new", "newTitle": index.contents()['title']})
    else:
        initJSON = json.dumps({"mode": "add new"})

    titles = json.dumps(model.library.full_title_list())
    page_title = "%s %s" % (mode, ref) if ref else "Add a New Text"

    return render(request,'edit_text.html',
                             {'titles': titles,
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
            return render(request,'static/generic.html', {"title": "Permission Denied", "content": "The Text Info for %s is locked.<br><br>Please email hello@sefaria.org if you believe edits are needed." % title})
        indexJSON = json.dumps(i.contents(v2=True) if "toc" in request.GET else i.contents(force_complex=True))
        versions = VersionSet({"title": title})
        text_exists = versions.count() > 0
        new = False
    elif new_title:
        # Add New
        new_title = new_title.replace("_", " ")
        try: # Redirect to edit path if this title already exists
            library.get_index(new_title)
            return redirect("/edit/textinfo/%s" % new_title)
        except BookNameError:
            pass
        indexJSON = json.dumps({"title": new_title})
        text_exists = False
        new = True

    return render(request,'edit_text_info.html',
                             {'title': title,
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
        generic_response = { "title": "Terms Editor", "content": "Please include the primary Term name in the URL to uses the Terms Editor." }
        return render(request,'static/generic.html', generic_response)

    dataJSON = json.dumps(data)

    return render(request,'edit_term.html',
                             {
                              'term': term,
                              'dataJSON': dataJSON,
                              'is_update': "true" if existing_term else "false"
                             })


def interface_language_redirect(request, language):
    """
    Set the interfaceLang cookie, saves to UserProfile (if logged in)
    and redirects to `next` url param.
    """
    next = request.GET.get("next", "/?home")
    next = "/?home" if next == "undefined" else next

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


#todo: is this used elsewhere? move it?
def count_and_index(c_oref, c_lang, vtitle, to_count=1):
    # count available segments of text
    if to_count:
        library.recount_index_in_toc(c_oref.index)
        if MULTISERVER_ENABLED:
            server_coordinator.publish_event("library", "recount_index_in_toc", [c_oref.index.title])

    from sefaria.settings import SEARCH_INDEX_ON_SAVE
    if SEARCH_INDEX_ON_SAVE:
        model.IndexQueue({
            "ref": c_oref.normal(),
            "lang": c_lang,
            "version": vtitle,
            "type": "ref",
        }).save()


@catch_error_as_json
@csrf_exempt
def texts_api(request, tref):
    oref = Ref(tref)

    if request.method == "GET":
        uref = oref.url()
        if uref and tref != uref:    # This is very similar to reader.reader_redirect subfunction, above.
            url = "/api/texts/" + uref
            response = redirect(iri_to_uri(url), permanent=True)
            params = request.GET.urlencode()
            response['Location'] += "?%s" % params if params else ""
            return response

        cb         = request.GET.get("callback", None)
        context    = int(request.GET.get("context", 1))
        commentary = bool(int(request.GET.get("commentary", False)))
        pad        = bool(int(request.GET.get("pad", 1)))
        versionEn  = request.GET.get("ven", None)
        if versionEn:
            versionEn = versionEn.replace("_", " ")
        versionHe  = request.GET.get("vhe", None)
        if versionHe:
            versionHe = versionHe.replace("_", " ")
        layer_name = request.GET.get("layer", None)
        alts       = bool(int(request.GET.get("alts", True)))
        wrapLinks = bool(int(request.GET.get("wrapLinks", False)))
        stripItags = bool(int(request.GET.get("stripItags", False)))
        multiple = int(request.GET.get("multiple", 0))  # Either undefined, or a positive integer (indicating how many sections forward) or negtive integer (indicating backward)

        def _get_text(oref, versionEn=versionEn, versionHe=versionHe, commentary=commentary, context=context, pad=pad,
                      alts=alts, wrapLinks=wrapLinks, layer_name=layer_name):
            try:
                text = TextFamily(oref, version=versionEn, lang="en", version2=versionHe, lang2="he", commentary=commentary, context=context, pad=pad, alts=alts, wrapLinks=wrapLinks, stripItags=stripItags).contents()
            except AttributeError as e:
                oref = oref.default_child_ref()
                text = TextFamily(oref, version=versionEn, lang="en", version2=versionHe, lang2="he", commentary=commentary, context=context, pad=pad, alts=alts, wrapLinks=wrapLinks, stripItags=stripItags).contents()
            except NoVersionFoundError as e:
                return {"error": str(e), "ref": oref.normal(), "enVersion": versionEn, "heVersion": versionHe}


            # TODO: what if pad is false and the ref is of an entire book? Should next_section_ref return None in that case?
            oref               = oref.padded_ref() if pad else oref
            try:
                text["next"]       = oref.next_section_ref().normal() if oref.next_section_ref() else None
                text["prev"]       = oref.prev_section_ref().normal() if oref.prev_section_ref() else None
            except AttributeError as e:
                # There are edge cases where the TextFamily call above works on a default node, but the next section call here does not.
                oref = oref.default_child_ref()
                text["next"] = oref.next_section_ref().normal() if oref.next_section_ref() else None
                text["prev"] = oref.prev_section_ref().normal() if oref.prev_section_ref() else None
            text["commentary"] = text.get("commentary", [])
            text["sheets"]     = get_sheets_for_ref(tref) if int(request.GET.get("sheets", 0)) else []

            if layer_name:
                layer = Layer().load({"urlkey": layer_name})
                if not layer:
                    raise InputError("Layer not found.")
                layer_content        = [format_note_object_for_client(n) for n in layer.all(tref=tref)]
                text["layer"]        = layer_content
                text["layer_name"]   = layer_name
                text["_loadSourcesFromDiscussion"] = True
            else:
                text["layer"] = []

            return text

        if not multiple or abs(multiple) == 1:
            text = _get_text(oref, versionEn=versionEn, versionHe=versionHe, commentary=commentary, context=context, pad=pad,
                             alts=alts, wrapLinks=wrapLinks, layer_name=layer_name)
            return jsonResponse(text, cb)
        else:
            # Return list of many sections
            target_count = int(multiple)
            assert target_count != 0
            direction = "next" if target_count > 0 else "prev"
            target_count = abs(target_count)

            current = 0
            texts = []

            while current < target_count:
                text = _get_text(oref, versionEn=versionEn, versionHe=versionHe, commentary=commentary, context=context, pad=pad,
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
        if not request.user.is_authenticated:
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to save texts."})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            t = json.loads(j)
            chunk = tracker.modify_text(apikey["uid"], oref, t["versionTitle"], t["language"], t["text"], t["versionSource"], method="API", skip_links=skip_links)
            count_after = int(request.GET.get("count_after", 0))
            count_and_index(oref, chunk.lang, chunk.vtitle, count_after)
            return jsonResponse({"status": "ok"})
        else:
            @csrf_protect
            def protected_post(request):
                t = json.loads(j)
                chunk = tracker.modify_text(request.user.id, oref, t["versionTitle"], t["language"], t["text"], t.get("versionSource", None), skip_links=skip_links)
                count_after = int(request.GET.get("count_after", 1))
                count_and_index(oref, chunk.lang, chunk.vtitle, count_after)
                return jsonResponse({"status": "ok"})
            return protected_post(request)

    if request.method == "DELETE":
        versionEn = request.GET.get("ven", None)
        versionHe = request.GET.get("vhe", None)
        if not request.user.is_staff:
            return jsonResponse({"error": "Only moderators can delete texts."})
        if not (tref and (versionEn or versionHe)):
            return jsonResponse({"error": "To delete a text version please specifiy a text title, version title and language."})

        tref    = tref.replace("_", " ")
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
    p = this_weeks_parasha(datetime.now(), request.diaspora)
    p["date"] = p["date"].isoformat()
    #p.update(get_text(p["ref"]))
    p.update(TextFamily(Ref(p["ref"])).contents())
    return jsonResponse(p, callback)


@catch_error_as_json
def table_of_contents_api(request):
    return jsonResponse(library.get_toc(), callback=request.GET.get("callback", None))


@catch_error_as_json
def search_filter_table_of_contents_api(request):
    return jsonResponse(library.get_search_filter_toc(), callback=request.GET.get("callback", None))

@catch_error_as_json
def search_autocomplete_redirecter(request):
    query = request.GET.get("q", "")
    completions_dict = get_name_completions(query, 1, False)
    ref = completions_dict['ref']
    object_data = completions_dict['object_data']
    if ref:
        response = redirect('/{}'.format(ref.url()), permanent=False)
    elif object_data is not None and object_data.get('type', '') == 'Person':
        response = redirect('/person/{}'.format(object_data['key']), permanent=False)
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
    return jsonResponse({"books": model.library.full_title_list()}, callback=request.GET.get("callback", None))


@catch_error_as_json
@csrf_exempt
def index_node_api(request, title):
    pass

@catch_error_as_json
@csrf_exempt
def index_api(request, title, v2=False, raw=False):
    """
    API for manipulating text index records (aka "Text Info")
    """
    if request.method == "GET":
        try:
            if request.GET.get("with_content_counts", False):
                i = library.get_index(title).contents_with_content_counts()
            else:
                i = library.get_index(title).contents(v2=v2, raw=raw)
        except InputError as e:
            node = library.get_schema_node(title)  # If the request were for v1 and fails, this falls back to v2.
            if not node:
                raise e
            if node.is_default():
                node = node.parent
            i = node.as_index_contents()

        return jsonResponse(i, callback=request.GET.get("callback", None))

    if request.method == "POST":
        # use the update function if update is in the params
        func = tracker.update if request.GET.get("update", False) else tracker.add
        j = json.loads(request.POST.get("json"))
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})
        j["title"] = title.replace("_", " ")
        #todo: move this to texts_api, pass the changes down through the tracker and text chunk
        #if "versionTitle" in j:
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
            return jsonResponse(func(apikey["uid"], model.Index, j, method="API", v2=v2, raw=raw, force_complex=True).contents(v2=v2, raw=raw, force_complex=True))
        else:
            title = j.get("oldTitle", j.get("title"))
            try:
                library.get_index(title)  # getting the index just to tell if it exists
                # Only allow staff and the person who submitted a text to edit
                if not request.user.is_staff and not user_started_text(request.user.id, title):
                   return jsonResponse({"error": "{} is protected from change.<br/><br/>See a mistake?<br/>Email hello@sefaria.org.".format(title)})
            except BookNameError:
                pass  # if this is a new text, allow any logged in user to submit
        @csrf_protect
        def protected_index_post(request):
            return jsonResponse(
                func(request.user.id, model.Index, j, v2=v2, raw=raw, force_complex=True).contents(v2=v2, raw=raw, force_complex=True)
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
@django_cache(default_on_miss = True)
def bare_link_api(request, book, cat):
    if request.method == "GET":
        resp = get_book_link_collection(book, cat)
        return resp

    elif request.method == "POST":
        return {"error": "Not implemented."}


@catch_error_as_json
@json_response_decorator
@django_cache(default_on_miss = True)
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
		"section": Category immediately above book?,
		[Perhaps, instead, "categories"]
		"heTitle": Hebrew title of node
		"length": Number of chapters,
		"chapters": List of Chapter Lengths (think about depth 1 & 3)
		"title": English title of node
		"book": English title of Book
	}
    For complex texts or categories, returns a list of dicts.
    :param title: A valid node title or a path to a category, separated by /.
    The "depth" parameter in the query string indicates how many levels in the category tree to descend.  Default is 2.
    If depth == 0, descends to end of tree
    The "dependents" parameter, if true, includes dependent texts.  By default, they are filtered out.
    """
    from sefaria.model.category import TocGroupNode

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
            cat = library.get_toc_tree().lookup(title.split("/"))

            if not cat:
                res = {"error": "No index or category found to match {}".format(title)}
            else:
                depth = request.GET.get("depth", 2)
                include_dependents = request.GET.get("dependents", False)

                leaves = cat.get_leaf_nodes() if depth == 0 else [n for n in cat.get_leaf_nodes_to_depth(depth)]
                leaves = [n for n in leaves if not isinstance(n, TocGroupNode)]
                if not include_dependents:
                    leaves = [n for n in leaves if not n.dependence]

                res = [_simple_shape(jan) for toc_index in leaves for jan in toc_index.get_index_object().nodes.get_leaf_nodes()]

        res = _collapse_book_leaf_shapes(res)
        return jsonResponse(res, callback=request.GET.get("callback", None))



@catch_error_as_json
def text_preview_api(request, title):
    """
    API for retrieving a document that gives preview text (first characters of each section)
    for text 'title'
    """
    oref = Ref(title)
    response = oref.index.contents(v2=True)
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
    if request.method == "GET":
        callback=request.GET.get("callback", None)
        if link_id_or_ref is None:
            return jsonResponse({"error": "Missing text identifier"}, callback)
        #The Ref instanciation is just to validate the Ref and let an error bubble up.
        #TODO is there are better way to validate the ref from GET params?
        model.Ref(link_id_or_ref)
        with_text = int(request.GET.get("with_text", 1))
        with_sheet_links = int(request.GET.get("with_sheet_links", 0))
        return jsonResponse(get_links(link_id_or_ref, with_text=with_text, with_sheet_links=with_sheet_links), callback)

    def _internal_do_post(request, link, uid, **kwargs):
        func = tracker.update if "_id" in link else tracker.add
        # use the correct function if params indicate this is a note save
        # func = save_note if "type" in j and j["type"] == "note" else save_link
        #obj = func(apikey["uid"], model.Link, link, **kwargs)
        obj = func(uid, model.Link, link, **kwargs)
        try:
            if USE_VARNISH:
                revarnish_link(obj)
        except Exception as e:
            logger.error(e)
        return format_object_for_client(obj)

    def _internal_do_delete(request, link_id_or_ref, uid):
        obj = tracker.delete(uid, model.Link, link_id_or_ref, callback=revarnish_link)
        return obj

    # delegate according to single/multiple objects posted
    if not request.user.is_authenticated:
        key = request.POST.get("apikey")
        if not key:
            return jsonResponse({"error": "You must be logged in or use an API key to add, edit or delete links."})
        apikey = db.apikeys.find_one({"key": key})
        if not apikey:
            return jsonResponse({"error": "Unrecognized API key."})
        uid = apikey["uid"]
        kwargs = {"method": "API"}
    else:
        uid = request.user.id
        kwargs = {}
        _internal_do_post = csrf_protect(_internal_do_post)
        _internal_do_delete = csrf_protect(_internal_do_delete)

    if request.method == "POST":
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})

        j = json.loads(j)
        if isinstance(j, list):
            res = []
            for i in j:
                try:
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
            return jsonResponse(_internal_do_post(request, j, uid, **kwargs))

    if request.method == "DELETE":
        if not link_id_or_ref:
            return jsonResponse({"error": "No link id given for deletion."})
        retval = _internal_do_delete(request, link_id_or_ref, uid)

        return jsonResponse(retval)

    return jsonResponse({"error": "Unsupported HTTP method."})


@catch_error_as_json
@csrf_exempt
def link_summary_api(request, ref):
    """
    Returns a summary of links available for ref.
    """
    oref    = Ref(ref)
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
        if not note_id_or_ref:
            raise Http404
        oref = Ref(note_id_or_ref)
        cb = request.GET.get("callback", None)
        private = request.GET.get("private", False)
        res = get_notes(oref, uid=request.user.id, public=(not private))
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
                func(apikey["uid"], model.Note, note, method="API")
            )
        else:
            note["owner"] = request.user.id
            @csrf_protect
            def protected_note_post(req):
                resp = format_object_for_client(
                    func(req.user.id, model.Note, note)
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
            tracker.delete(request.user.id, model.Note, note_id_or_ref)
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
            res = [note.contents(with_string_id=True) for note in NoteSet({"owner": request.user.id}, sort=[("_id", -1)]) ]
    else:
        resr = {"error": "Not implemented."}
    return jsonResponse(res, callback=request.GET.get("callback", None))


@catch_error_as_json
def related_api(request, tref):
    """
    Single API to bundle available content related to `tref`.
    """
    oref = model.Ref(tref)
    if request.GET.get("private", False) and request.user.is_authenticated:
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
        }
    return jsonResponse(response, callback=request.GET.get("callback", None))


@catch_error_as_json
def versions_api(request, tref):
    """
    API for retrieving available text versions list of a ref.
    """
    oref = model.Ref(tref)
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
    return jsonResponse(sorted(res, key = lambda x: x["title"] + x["version"]), callback=request.GET.get("callback", None))




@json_response_decorator
@django_cache(default_on_miss = True)
def version_status_tree_api(request, lang=None):
    return library.simplify_toc(lang=lang)


@sanitize_get_params
def visualize_library(request, lang=None, cats=None):

    template_vars = {"lang": lang or "",
                     "cats": json.dumps(cats.replace("_", " ").split("/") if cats else [])}

    return render(request,'visual_library.html', template_vars)


def visualize_toc(request):
    return render(request,'visual_toc.html', {})


def visualize_parasha_colors(request):
    return render(request,'visual_parasha_colors.html', {})


def visualize_links_through_rashi(request):
    level = request.GET.get("level", 1)
    json_file = "../static/files/torah_rashi_torah.json" if level == 1 else "../static/files/tanach_rashi_tanach.json"
    return render(request,'visualize_links_through_rashi.html', {"json_file": json_file})

def talmudic_relationships(request):
    json_file = "../static/files/talmudic_relationships_data.json"
    return render(request,'talmudic_relationships.html', {"json_file": json_file})

def sefer_hachinukh_mitzvot(request):
    csv_file = "../static/files/mitzvot.csv"
    return render(request,'sefer_hachinukh_mitzvot.html', {"csv": csv_file})

def unique_words_viz(request):
    csv_file = "../static/files/commentators_torah_unique_words.csv"
    return render(request,'unique_words_viz.html', {"csv": csv_file})

@catch_error_as_json
def set_lock_api(request, tref, lang, version):
    """
    API to set an edit lock on a text segment.
    """
    user = request.user.id if request.user.is_authenticated else 0
    model.set_lock(model.Ref(tref).normal(), lang, version.replace("_", " "), user)
    return jsonResponse({"status": "ok"})


@catch_error_as_json
def release_lock_api(request, tref, lang, version):
    """
    API to release the edit lock on a text segment.
    """
    model.release_lock(model.Ref(tref).normal(), lang, version.replace("_", " "))
    return jsonResponse({"status": "ok"})


@catch_error_as_json
def check_lock_api(request, tref, lang, version):
    """
    API to check whether a text segment currently has an edit lock.
    """
    locked = model.check_lock(model.Ref(tref).normal(), lang, version.replace("_", " "))
    return jsonResponse({"locked": locked})


@catch_error_as_json
def lock_text_api(request, title, lang, version):
    """
    API for locking or unlocking a text as a whole.
    To unlock, include the URL parameter "action=unlock"
    """
    if not request.user.is_staff:
        return jsonResponse({"error": "Only Sefaria Moderators can lock texts."})

    title   = title.replace("_", " ")
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
        title   = title.replace("_", " ")
        version = version.replace("_", " ")
        vobj = Version().load({"title": title, "language": lang, "versionTitle": version})
        if flags.get("newVersionTitle"):
            vobj.versionTitle = flags.get("newVersionTitle")
        for flag in vobj.optional_attrs:
            if flag in flags:
                setattr(vobj, flag, flags[flag])
        vobj.save()
        return jsonResponse({"status": "ok"})
    elif request.user.is_staff:
        @csrf_protect
        def protected_post(request, title, lang, version):
            flags = json.loads(request.POST.get("json"))
            title   = title.replace("_", " ")
            version = version.replace("_", " ")
            vobj = Version().load({"title": title, "language": lang, "versionTitle": version})
            if flags.get("newVersionTitle"):
                vobj.versionTitle = flags.get("newVersionTitle")
            for flag in vobj.optional_attrs:
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
            categories = TermSet({"scheme": "Tag Category"})

        else:
            categories = TermSet({"category": path})


        category_names = [{"tag": category.get_primary_title(), "heTag": category.get_primary_title("he"), } for category in categories]
        return jsonResponse(category_names)




@catch_error_as_json
@csrf_exempt
def category_api(request, path=None):
    """
    API for looking up categories and adding Categories to the Category collection.
    GET takes a category path on the URL.  Returns the category specified.
       e.g. "api/category/Tanakh/Torah"
       If the category is not found, it will return "error" in a json object.
       It will also attempt to find the closest parent.  If found, it will include "closest_parent" alongside "error".
    POST takes no arguments on the URL.  Takes complete category as payload.  Category must not already exist.  Parent of category must exist.
    """
    if request.method == "GET":
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
        def _internal_do_post(request, cat, uid, **kwargs):
            return tracker.add(uid, model.Category, cat, **kwargs).contents()

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
        if "path" not in j:
            return jsonResponse({"error": "'path' is a required attribute"})
        if Category().load({"path": j["path"]}):
            return jsonResponse({"error": "Category {} already exists.".format(", ".join(j["path"]))})
        if not Category().load({"path": j["path"][:-1]}):
            return jsonResponse({"error": "No parent category found: {}".format(", ".join(j["path"][:-1]))})
        return jsonResponse(_internal_do_post(request, j, uid, **kwargs))

    if request.method == "DELETE":
        return jsonResponse({"error": "Unsupported HTTP method."})  # TODO: support this?

    return jsonResponse({"error": "Unsupported HTTP method."})


@catch_error_as_json
@csrf_exempt
def calendars_api(request):
    if request.method == "GET":
        import datetime
        diaspora = request.GET.get("diaspora", "1")
        custom = request.GET.get("custom", None)
        try:
            year = int(request.GET.get("year", None))
            month = int(request.GET.get("month", None))
            day = int(request.GET.get("day", None))
            datetimeobj = datetime.datetime(year, month, day)
        except Exception as e:
            datetimeobj = timezone.localtime(timezone.now())

        if diaspora not in ["0", "1"]:
            return jsonResponse({"error": "'Diaspora' parameter must be 1 or 0."})
        else:
            diaspora = True if diaspora == "1" else False
            calendars = get_all_calendar_items(datetimeobj, diaspora=diaspora, custom=custom)
            return jsonResponse({"date": datetimeobj.date().isoformat(),
                                 "timezone" : timezone.get_current_timezone_name(),
                                 "calendar_items": calendars},
                                callback=request.GET.get("callback", None))


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
                return func(uid, model.Term, term, **kwargs).contents()

            elif request.method == "DELETE":
                if not t:
                    return {"error": 'Term "%s" does not exist.' % name}
                return tracker.delete(uid, model.Term, t._id)

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


def get_name_completions(name, limit, ref_only):
    lang = "he" if is_hebrew(name) else "en"
    completer = library.ref_auto_completer(lang) if ref_only else library.full_auto_completer(lang)
    object_data = None
    ref = None
    try:
        ref = Ref(name)
        inode = ref.index_node
        if isinstance(inode, SheetLibraryNode):
            ref = None
            raise InputError

        # Find possible dictionary entries.  This feels like a messy way to do this.  Needs a refactor.
        if inode.is_virtual and inode.parent and getattr(inode.parent, "lexiconName", None) in library._lexicon_auto_completer:
            base_title = inode.parent.full_title()
            lexicon_ac = library.lexicon_auto_completer(inode.parent.lexiconName)
            t = [base_title + ", " + t[1] for t in lexicon_ac.items(inode.word)[:limit or None]]
            completions = list(OrderedDict.fromkeys(t))  # filter out dupes
        else:
            completions = [name.capitalize()] + completer.next_steps_from_node(name)

        if limit == 0 or len(completions) < limit:
            current = {t: 1 for t in completions}
            additional_results = completer.complete(name, limit)
            for res in additional_results:
                if res not in current:
                    completions += [res]
    except DictionaryEntryNotFoundError as e:
        # A dictionary beginning, but not a valid entry
        lexicon_ac = library.lexicon_auto_completer(e.lexicon_name)
        t = [e.base_title + ", " + t[1] for t in lexicon_ac.items(e.word)[:limit or None]]
        completions = list(OrderedDict.fromkeys(t))  # filter out dupes
    except InputError:
        completions = completer.complete(name, limit)
        object_data = completer.get_data(name)

    return {
        "completions": completions,
        "lang": lang,
        "object_data": object_data,
        "ref": ref
    }


@catch_error_as_json
def name_api(request, name):
    if request.method != "GET":
        return jsonResponse({"error": "Unsupported HTTP method."})

    # Number of results to return.  0 indicates no limit
    LIMIT = int(request.GET.get("limit", 16))
    ref_only = request.GET.get("ref_only", False)
    completions_dict = get_name_completions(name, LIMIT, ref_only)
    ref = completions_dict["ref"]
    if ref:
        inode = ref.index_node
        d = {
            "lang": completions_dict["lang"],
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
            # "number_follows": inode.has_numeric_continuation(),
            # "titles_follow": titles_follow,
            "completions": completions_dict["completions"] if LIMIT == 0 else completions_dict["completions"][:LIMIT],
            # todo: ADD textual completions as well
            "examples": []
        }
        if inode.has_numeric_continuation():
            inode = inode.get_default_child() if inode.has_default_child() else inode
            d["sectionNames"] = inode.sectionNames
            d["heSectionNames"] = list(map(hebrew_term, inode.sectionNames))
            d["addressExamples"] = [t.toStr("en", 3*i+3) for i,t in enumerate(inode._addressTypes)]
            d["heAddressExamples"] = [t.toStr("he", 3*i+3) for i,t in enumerate(inode._addressTypes)]

    else:
        # This is not a Ref
        d = {
            "lang": completions_dict["lang"],
            "is_ref": False,
            "completions": completions_dict["completions"]
        }

        # let's see if it's a known name of another sort
        if completions_dict["object_data"]:
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
        rs = ac.complete(word, LIMIT)
        result = [[r, ac.title_trie[ac.normalizer(r)]["key"]] for r in rs]
    else:
        result = library.lexicon_auto_completer(lexicon).items(word)[:LIMIT]
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
    for key in ["lookup_ref", "never_split", "always_split"]:
        if request.GET.get(key, None):
            kwargs[key] = request.GET.get(key)
    result = []
    ls = LexiconLookupAggregator.lexicon_lookup(word, **kwargs)
    if ls:
        for l in ls:
            result.append(l.contents())
        if len(result):
            return jsonResponse(result, callback=request.GET.get("callback", None))
    else:
        return jsonResponse({"error": "No information found for given word."})


@catch_error_as_json
def stories_api(request, gid=None):
    """
    API for retrieving stories.
    """

    # if not request.user.is_authenticated:
    #     return jsonResponse({"error": "You must be logged in to access your notifications."})

    if request.method == "GET":

        page      = int(request.GET.get("page", 0))
        page_size = int(request.GET.get("page_size", 10))
        shared_only = bool(request.GET.get("shared_only", False))
        admin_feed = bool(request.GET.get("admin_feed", False))

        if not request.user.is_authenticated:
            shared_only = True
            user = None
            traits = get_session_traits(request)
        else:
            user = UserProfile(id=request.user.id)
            traits = get_session_traits(request, request.user.id)

        if admin_feed:
            if not request.user.is_staff:
                return {"error": "Permission Denied"}
            stories = SharedStorySet({}, limit=page_size, page=page).contents()
            count = len(stories)
        elif shared_only or not user:
            stories = SharedStorySet.for_traits(traits, limit=page_size, page=page).contents()
            count = len(stories)
        else:
            stories = UserStorySet.recent_for_user(request.user.id, traits, limit=page_size, page=page).contents()
            count = len(stories)
            stories = addDynamicStories(stories, user, page)

        return jsonResponse({
                                "stories": stories,
                                "page": page,
                                "page_size": page_size,
                                "count": count
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
                return jsonResponse({"error": "Only Sefaria Moderators can add stories."})

            payload = json.loads(request.POST.get("json"))
            try:
                s = SharedStory(payload).save()
                return jsonResponse({"status": "ok", "story": s.contents()})
            except AssertionError as e:
                return jsonResponse({"error": str(e)})

        elif request.user.is_staff:
            @csrf_protect
            def protected_post(request):
                payload = json.loads(request.POST.get("json"))
                try:
                    s = SharedStory(payload).save()
                    return jsonResponse({"status": "ok", "story": s.contents()})
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
                SharedStory().load_by_id(gid).delete()
                return jsonResponse({"status": "ok"})

            return protected_post(request)
        else:
            return jsonResponse({"error": "Unauthorized"})


def addDynamicStories(stories, user, page):
    """

    :param stories: Array of Story.contents() dicts
    :param user: UserProfile object
    :param page: Which page of stories are we rendering - 0 based
    :return: Array of Story.contents() dicts.
    """
    if page == 0:
        # Disable most recent story
        return stories

        # Keep Reading Most recent
        most_recent = user.get_user_history(last_place=True, secondary=False, limit=1)[0]
        if most_recent:
            if getattr(most_recent, "is_sheet", None):
                stry = SheetListFactory().generate_story(
                    sheet_ids=[most_recent.sheet_id],
                    title={"en": "Keep Reading", "he": "המשך לקרוא"},
                    lead={"en": "Sheets", "he": "דפים"}
                )
            else:
                stry = TextPassageStoryFactory().generate_from_user_history(most_recent,
                    lead={"en": "Keep Reading", "he": "המשך לקרוא"})
            stories = [stry.contents()] + stories

    if page == 1:
        # Show an old saved story
        saved = user.get_user_history(saved=True, secondary=False, sheets=False)
        if len(saved) > 2:
            saved_item = choice(saved)
            stry = TextPassageStoryFactory().generate_from_user_history(saved_item,
                    lead={"en": "Take Another Look", "he": "קרא עוד"})
            stories = [stry.contents()] + stories

    return stories


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


@staff_member_required
def story_reflector(request):
    """
    Show what a story will look like.
    :param request:
    :return:
    """
    assert request.user.is_authenticated and request.user.is_staff and request.method == "POST"

    @csrf_protect
    def protected_post(request):
        payload = json.loads(request.POST.get("json"))

        factory_name = payload.get("factory")
        method_name = payload.get("method")
        if factory_name and method_name:
            try:
                del payload["factory"]
                del payload["method"]
                import sefaria.model.story as s
                factory = getattr(s, factory_name)
                method = getattr(factory, method_name)
                s = method(**payload)
                return jsonResponse(s.contents())
            except AssertionError as e:
                return jsonResponse({"error": str(e)})
        else:
            #Treat payload as attrs to story object
            try:
                s = SharedStory(payload)
                return jsonResponse(s.contents())
            except AssertionError as e:
                return jsonResponse({"error": str(e)})

    return protected_post(request)



@catch_error_as_json
def updates_api(request, gid=None):
    """
    API for retrieving general notifications.
    """

    if request.method == "GET":
        page      = int(request.GET.get("page", 0))
        page_size = int(request.GET.get("page_size", 10))

        notifications = GlobalNotificationSet({},limit=page_size, page=page)

        return jsonResponse({
                                "updates": notifications.contents(),
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
                gn = GlobalNotification(payload).save()
                SharedStory.from_global_notification(gn).save()
                return jsonResponse({"status": "ok"})
            except AssertionError as e:
                return jsonResponse({"error": str(e)})

        elif request.user.is_staff:
            @csrf_protect
            def protected_post(request):
                payload = json.loads(request.POST.get("json"))
                try:
                    gn = GlobalNotification(payload).save()
                    SharedStory.from_global_notification(gn).save()
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

    page      = int(request.GET.get("page", 0))
    page_size = int(request.GET.get("page_size", 10))

    notifications = NotificationSet().recent_for_user(request.user.id, limit=page_size, page=page)

    return jsonResponse({
                            "html": notifications.to_HTML(),
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
        notifications = json.loads(notifications)
        for id in notifications:
            notification = Notification().load_by_id(id)
            if notification.uid != request.user.id:
                # Only allow expiring your own notifications
                continue
            notification.mark_read().save()

        return jsonResponse({
                                "status": "ok",
                                "unreadCount": unread_notifications_count_for_user(request.user.id)
                            })

    else:
        return jsonResponse({"error": "Unsupported HTTP method."})


@catch_error_as_json
def messages_api(request):
    """
    API for posting user to user messages
    """
    if not request.user.is_authenticated:
        return jsonResponse({"error": "You must be logged in to access your messages."})

    if request.method == "POST":
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "No post JSON."})
        j = json.loads(j)

        Notification({"uid": j["recipient"]}).make_message(sender_id=request.user.id, message=j["message"]).save()
        return jsonResponse({"status": "ok"})

    elif request.method == "GET":
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
def texts_history_api(request, tref, lang=None, version=None):
    """
    API for retrieving history information about a given text.
    """
    if request.method != "GET":
        return jsonResponse({"error": "Unsupported HTTP method."})

    tref = model.Ref(tref).normal()
    refRe = '^%s$|^%s:' % (tref, tref)
    if lang and version:
        query = {"ref": {"$regex": refRe }, "language": lang, "version": version.replace("_", " ")}
    else:
        query = {"ref": {"$regex": refRe }}
    history = db.history.find(query)

    summary = {"copiers": set(), "translators": set(), "editors": set(), "reviewers": set() }
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


@catch_error_as_json
def reviews_api(request, tref=None, lang=None, version=None, review_id=None):
    if request.method == "GET":
        callback=request.GET.get("callback", None)
        if tref and lang and version:
            nref = model.Ref(tref).normal()
            version = version.replace("_", " ")

            reviews = get_reviews(nref, lang, version)
            last_edit = get_last_edit_date(nref, lang, version)
            score_since_last_edit = get_review_score_since_last_edit(nref, lang, version, reviews=reviews, last_edit=last_edit)

            for r in reviews:
                r["date"] = r["date"].isoformat()

            response = {
                "ref":                nref,
                "lang":               lang,
                "version":            version,
                "reviews":            reviews,
                "reviewCount":        len(reviews),
                "scoreSinceLastEdit": score_since_last_edit,
                "lastEdit":           last_edit.isoformat() if last_edit else None,
            }
        elif review_id:
            response = {}

        return jsonResponse(response, callback)

    elif request.method == "POST":
        if not request.user.is_authenticated:
            return jsonResponse({"error": "You must be logged in to write reviews."})
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "No post JSON."})
        j = json.loads(j)

        response = save_review(j, request.user.id)
        return jsonResponse(response)

    elif request.method == "DELETE":
        if not review_id:
            return jsonResponse({"error": "No review ID given for deletion."})

        return jsonResponse(delete_review(review_id, request.user.id))

    else:
        return jsonResponse({"error": "Unsupported HTTP method."})




@sanitize_get_params
def topics_page(request):
    """
    Page of all
    """
    props = base_props(request)
    props.update({
        "initialMenu":  "topics",
        "initialTopic": None,
        # "trendingTags": trending_tags(ntags=12),
    })

    propsJSON = json.dumps(props)
    html = render_react_component("ReaderApp", propsJSON)
    return render(request, 'base.html', {
        "propsJSON":      propsJSON,
        "title":          _("Topics") + " | " + _("Sefaria"),
        "desc":           _("Explore Jewish Texts by Topic on Sefaria"),
        "html":           html,
    })


@sanitize_get_params
def topic_page(request, topic):
    """
    """

    topic_obj = Topic().load({'slug': topic})
    if topic_obj is None:
        # try to normalize
        norm_topic = re.sub(r"[ /]", "-", topic.lower().strip())
        norm_topic = re.sub(r"[^a-z0-9\-]", "", norm_topic)
        topic_obj = Topic().load({'slug': norm_topic})
        if topic_obj is None:
            raise Http404
        topic = norm_topic

    props = base_props(request)
    props.update({
        "initialMenu": "topics",
        "initialTopic": topic,
        "topicData": _topic_data(topic),
    })

    title = '{} | Sefaria'.format(topic_obj.get_primary_title('en'))
    desc = 'Explore {} on Sefaria, drawing from our library of Jewish texts. {}'.format(topic_obj.get_primary_title('en'), getattr(topic_obj, 'description', {}).get('en', ''))

    propsJSON = json.dumps(props)
    html = render_react_component("ReaderApp", propsJSON)
    return render(request,'base.html', {
        "propsJSON":      propsJSON,
        "title":          title,
        "desc":           desc,
        "html":           html,
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
    response["Cache-Control"] = "max-age=3600"
    return response


@catch_error_as_json
def topics_api(request, topic):
    """
    API to get data for a particular topic.
    """
    with_links = bool(int(request.GET.get("with_links", False)))
    annotate_links = bool(int(request.GET.get("annotate_links", False)))
    group_related = bool(int(request.GET.get("group_related", False)))
    with_refs = bool(int(request.GET.get("with_refs", False)))
    response = get_topic(topic, with_links, annotate_links, with_refs, group_related)
    return jsonResponse(response, callback=request.GET.get("callback", None))


def _topic_data(topic):
    response = get_topic(topic, with_links=True, annotate_links=True, with_refs=True, group_related=True)
    return response


@catch_error_as_json
def recommend_topics_api(request, ref_list=None):
    """
    API to receive recommended topics for list of strings `refs`.
    """
    if request.method == "GET":
        refs = [Ref(ref).normal() for ref in ref_list.split("+")] if ref_list else []

    elif request.method == "POST":
        topics = get_topics()
        postJSON = request.POST.get("json")
        if not postJSON:
            return jsonResponse({"error": "No post JSON."})
        refs = json.loads(postJSON)

    topics = get_topics()
    response = {"topics": topics.recommend_topics(refs)}
    response = jsonResponse(response, callback=request.GET.get("callback", None))
    return response


@ensure_csrf_cookie
@sanitize_get_params
def global_activity(request, page=1):
    """
    Recent Activity page listing all recent actions and contributor leaderboards.
    """
    page = int(page)
    page_size = 100

    if page > 40:
        generic_response = { "title": "Activity Unavailable", "content": "You have requested a page deep in Sefaria's history.<br><br>For performance reasons, this page is unavailable. If you need access to this information, please <a href='mailto:dev@sefaria.org'>email us</a>." }
        return render(request,'static/generic.html', generic_response)

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
    return render(request,'activity.html',
                             {'activity': activity,
                                'filter_type': filter_type,
                                'email': email,
                                'next_page': next_page,
                                'he': request.interfaceLang == "hebrew", # to make templates less verbose
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
        generic_response = { "title": "Activity Unavailable", "content": "You have requested a page deep in Sefaria's history.<br><br>For performance reasons, this page is unavailable. If you need access to this information, please <a href='mailto:dev@sefaria.org'>email us</a>." }
        return render(request,'static/generic.html', generic_response)

    q              = {"user": profile.id}
    filter_type    = request.GET.get("type", None)
    activity, page = get_maximal_collapsed_activity(query=q, page_size=page_size, page=page, filter_type=filter_type)

    next_page = page + 1 if page else None
    next_page = "/activity/%d" % next_page if next_page else None
    next_page = "%s?type=%s" % (next_page, filter_type) if next_page and filter_type else next_page

    email = request.user.email if request.user.is_authenticated else False
    return render(request,'activity.html',
                             {'activity': activity,
                                'filter_type': filter_type,
                                'profile': profile,
                                'for_user': True,
                                'email': email,
                                'next_page': next_page,
                                'he': request.interfaceLang == "hebrew", # to make templates less verbose
                                })


@ensure_csrf_cookie
@sanitize_get_params
def segment_history(request, tref, lang, version, page=1):
    """
    View revision history for the text segment named by ref / lang / version.
    """
    try:
        oref = model.Ref(tref)
    except InputError:
        raise Http404

    page = int(page)
    nref = oref.normal()

    version = version.replace("_", " ")
    version_record = Version().load({"title":oref.index.title, "versionTitle":version, "language":lang})
    if not version_record:
        raise Http404("We do not have a version of {} called '{}'.  Please use the menu to find the text you are looking for.".format(oref.index.title, version))
    filter_type = request.GET.get("type", None)
    history = text_history(oref, version, lang, filter_type=filter_type, page=page)

    next_page = page + 1 if page else None
    next_page = "/activity/%s/%s/%s/%d" % (nref, lang, version, next_page) if next_page else None
    next_page = "%s?type=%s" % (next_page, filter_type) if next_page and filter_type else next_page

    email = request.user.email if request.user.is_authenticated else False
    return render(request,'activity.html',
                             {'activity': history,
                               "single": True,
                               "ref": nref,
                               "lang": lang,
                               "version": version,
                               "versionTitleInHebrew": getattr(version_record, "versionTitleInHebrew", version_record.versionTitle),
                               'email': email,
                               'filter_type': filter_type,
                               'next_page': next_page,
                               'he': request.interfaceLang == "hebrew", # to make templates less verbose
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
    oref = model.Ref(tref)

    new_text = text_at_revision(oref.normal(), version, lang, revision)

    tracker.modify_text(request.user.id, oref, version, lang, new_text, type="revert")

    return jsonResponse({"status": "ok"})


def leaderboard(request):
    return render(request,'leaderboard.html',
                             {'leaders': top_contributors(),
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
    user = None

    try:
        profile = UserProfile(slug=username)
    except Exception as e:
        # Couldn't find by slug, try looking up by username (old style urls)
        # If found, redirect to new URL
        # If we no longer want to support the old URLs, we can remove this
        user = get_object_or_404(User, username=username)
        profile = UserProfile(id=user.id)

        return redirect("/profile/%s" % profile.slug, permanent=True)

    if user is None:
        user = User.objects.get(id=profile.id)
    if not user.is_active:
        raise Http404('Profile is inactive.')

    props = base_props(request)
    profileJSON = profile.to_api_dict()
    props.update({
        "initialMenu":  "profile",
        "initialProfile": profileJSON,
    })
    title = "%(full_name)s on Sefaria" % {"full_name": profile.full_name}
    desc = '%(full_name)s is on Sefaria. Follow to view their public source sheets, notes and translations.' % {"full_name": profile.full_name}

    propsJSON = json.dumps(props)
    html = render_react_component("ReaderApp", propsJSON)
    return render(request,'base.html', {
        "propsJSON":      propsJSON,
        "title":          title,
        "desc":           desc,
        "html":           html,
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
        #TODO: should validation not need to be called manually? maybe inside the save
        if error:
            return jsonResponse({"error": error})
        else:
            profile.save()
            return jsonResponse(profile.to_mongo_dict())
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

@catch_error_as_json
def profile_upload_photo(request):
    if not request.user.is_authenticated:
        return jsonResponse({"error": _("You must be logged in to update your profile photo.")})
    if request.method == "POST":
        from PIL import Image
        from io import StringIO
        from sefaria.utils.util import epoch_time
        now = epoch_time()

        def get_resized_file(image, size):
            resized_image = image.resize(size, resample=Image.LANCZOS)
            resized_image_file = StringIO()
            resized_image.save(resized_image_file, format="PNG")
            resized_image_file.seek(0)
            return resized_image_file

        profile = UserProfile(id=request.user.id)
        bucket_name = GoogleStorageManager.PROFILES_BUCKET
        image = Image.open(request.FILES['file'])
        old_big_pic_filename = re.findall(r"/([^/]+)$", profile.profile_pic_url)[0] if profile.profile_pic_url.startswith(GoogleStorageManager.BASE_URL) else None
        old_small_pic_filename = re.findall(r"/([^/]+)$", profile.profile_pic_url_small)[0] if profile.profile_pic_url_small.startswith(GoogleStorageManager.BASE_URL) else None

        big_pic_url = GoogleStorageManager.upload_file(get_resized_file(image, (250, 250)), "{}-{}.png".format(profile.slug, now), bucket_name, old_big_pic_filename)
        small_pic_url = GoogleStorageManager.upload_file(get_resized_file(image, (80, 80)), "{}-{}-small.png".format(profile.slug, now), bucket_name, old_small_pic_filename)

        profile.update({"profile_pic_url": big_pic_url, "profile_pic_url_small": small_pic_url})
        profile.save()
        public_user_data(request.user.id, ignore_cache=True)  # reset user data cache
        return jsonResponse({"urls": [big_pic_url, small_pic_url]})
    return jsonResponse({"error": "Unsupported HTTP method."})



@api_view(["POST"])
@catch_error_as_json
def profile_sync_api(request):
    """
    API for syncing history and settings with your profile
    Required POST fields: settings, last_synce
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
        from sefaria.utils.util import epoch_time
        now = epoch_time()
        no_return = request.GET.get("no_return", False)
        profile = UserProfile(id=request.user.id)
        ret = {"created": []}
        # sync items from request
        for field in syncable_fields:
            if field not in post:
                continue
            field_data = json.loads(post[field])
            if field == "settings":
                if field_data["time_stamp"] > profile.attr_time_stamps[field]:
                    # this change happened after other changes in the db
                    settings_time_stamp = field_data.pop("time_stamp")  # don't save time_stamp as a field of profile
                    profile.attr_time_stamps.update({field: settings_time_stamp})
                    profile.update({
                        field: field_data,
                        "attr_time_stamps": profile.attr_time_stamps
                    })
                    profile_updated = True
            elif field == "user_history":
                # loop thru `field_data` reversed to apply `last_place` to the last item read in each book
                for hist in reversed(field_data):
                    uh = UserHistory.save_history_item(request.user.id, hist, now)
                    ret["created"] += [uh.contents(for_api=True)]

        if not no_return:
            # determine return value after new history saved to include new saved and deleted saves
            # send back items after `last_sync`
            last_sync = json.loads(post.get("last_sync", str(profile.last_sync_web)))
            uhs = UserHistorySet({"uid": request.user.id, "server_time_stamp": {"$gt": last_sync}}, hint="uid_1_server_time_stamp_1")
            ret["last_sync"] = now
            ret["user_history"] = [uh.contents(for_api=True) for uh in uhs.array()]
            ret["settings"] = profile.settings
            ret["settings"]["time_stamp"] = profile.attr_time_stamps["settings"]
            if post.get("client", "") == "web":
                # request was made from web. update last_sync on profile
                profile.update({"last_sync_web": now})
                profile_updated = True
        if profile_updated:
            profile.save()
        return jsonResponse(ret)

    return jsonResponse({"error": "Unsupported HTTP method."})


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


def profile_get_user_history(request):
    """
    GET API for user history for a particular user. optional URL params are
    :saved: bool. True if you only want saved items. None if you dont care
    :secondary: bool. True if you only want secondary items. None if you dont care
    :tref: Ref associated with history item
    """
    if not request.user.is_authenticated:
        import urllib.parse
        recents = json.loads(urllib.parse.unquote(request.COOKIES.get("recentlyViewed", '[]')))  # for backwards compat
        recents = UserProfile.transformOldRecents(None, recents)
        history = json.loads(urllib.parse.unquote(request.COOKIES.get("user_history", '[]')))
        return jsonResponse(history + recents)
    if request.method == "GET":
        saved, secondary, last_place, oref = get_url_params_user_history(request)
        user = UserProfile(id=request.user.id)
        return jsonResponse(user.get_user_history(oref=oref, saved=saved, secondary=secondary, serialized=True, last_place=last_place))
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
    return redirect("/profile/%s" % UserProfile(id=request.user.id).slug)


def interrupting_messages_read_api(request, message):
    if not request.user.is_authenticated:
        return jsonResponse({"error": "You must be logged in to use this API."})
    profile = UserProfile(id=request.user.id)
    profile.mark_interrupting_message_read(message)
    return jsonResponse({"status": "ok"})


@login_required
@ensure_csrf_cookie
def edit_profile(request):
    """
    Page for editing a user's profile.
    """
    profile = UserProfile(id=request.user.id)
    sheets  = db.sheets.find({"owner": profile.id, "status": "public"}, {"id": 1, "datePublished": 1}).sort([["datePublished", -1]])

    return render(request,'edit_profile.html',
                              {
                              'user': request.user,
                              'profile': profile,
                              'sheets': sheets,
                              })


@login_required
@ensure_csrf_cookie
def account_settings(request):
    """
    Page for managing a user's account settings.
    """
    profile = UserProfile(id=request.user.id)
    return render(request,'account_settings.html',
                             {
                                'user': request.user,
                                'profile': profile,
                              })


@login_required
def enable_home_feed(request):
    resp = home(request, True)
    resp.set_cookie("home_feed", "yup", 60 * 60 * 24 * 365)
    return resp


@login_required
def disable_home_feed(request):
    resp = home(request, False)
    resp.delete_cookie("home_feed")
    return resp


@ensure_csrf_cookie
def home(request):
    """
    Homepage
    """
    if request.user_agent.is_mobile:
        return mobile_home(request)

    if not SITE_SETTINGS["TORAH_SPECIFIC"]:
        return redirect("/texts")

    # show_feed = request.COOKIES.get("home_feed", None)
    show_feed = request.user.is_authenticated

    if show_feed:
        return redirect("/new-home")

    recent = request.COOKIES.get("recentlyViewed", None)
    last_place = request.COOKIES.get("user_history", None)
    if (recent or last_place or request.user.is_authenticated) and "home" not in request.GET:
        return redirect("/texts")

    calendar_items = get_keyed_calendar_items(request.diaspora)
    daf_today = calendar_items["Daf Yomi"]
    parasha   = calendar_items["Parashat Hashavua"]
    metrics   = db.metrics.find().sort("timestamp", -1).limit(1)[0]

    return render(request,'static/home.html',
                             {
                              "metrics": metrics,
                              "daf_today": daf_today,
                              "parasha": parasha,
                              })


@ensure_csrf_cookie
def discussions(request):
    """
    Discussions page.
    """
    discussions = LayerSet({"owner": request.user.id})
    return render(request,'discussions.html',
                                {
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
        import uuid
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
        proj={"title": 1, "flags": 1, "linksCount": 1, "content._en.percentAvailable": 1, "content._he.percentAvailable": 1}
    ).array()
    flat_toc = library.get_toc_tree().flatten()

    def toc_sort(a):
        try:
            return flat_toc.index(a["title"])
        except:
            return 9999

    states = sorted(states, key=toc_sort)

    return render(request,'dashboard.html',
                                {
                                    "states": states,
                                })


@ensure_csrf_cookie
@sanitize_get_params
def translation_requests(request, completed_only=False, featured_only=False):
    """
    Page listing all outstnading translation requests.
    """
    page              = int(request.GET.get("page", 1)) - 1
    page_size         = 100
    query             = {"completed": False, "section_level": False} if not completed_only else {"completed": True}
    query             = {"completed": True, "featured": True} if completed_only and featured_only else query
    requests          = TranslationRequestSet(query, limit=page_size, page=page, sort=[["request_count", -1]])
    request_count     = TranslationRequestSet({"completed": False, "section_level": False}).count()
    complete_count    = TranslationRequestSet({"completed": True}).count()
    featured_complete = TranslationRequestSet({"completed": True, "featured": True}).count()
    next_page         = page + 2 if True or len(requests) == page_size else 0
    featured_query    = {"featured": True, "featured_until": { "$gt": datetime.now() } }
    featured          = TranslationRequestSet(featured_query, sort=[["completed", 1], ["featured_until", 1]])
    today             = datetime.today()
    featured_end      = today + timedelta(7 - ((today.weekday()+1) % 7)) # This coming Sunday
    featured_end      = featured_end.replace(hour=0, minute=0)  # At midnight
    current           = [d.featured_until <= featured_end for d in featured]
    featured_current  = sum(current)
    show_featured     = not completed_only and not page and ((request.user.is_staff and len(featured)) or (featured_current))

    return render(request,'translation_requests.html',
                                {
                                    "featured": featured,
                                    "featured_current": featured_current,
                                    "show_featured": show_featured,
                                    "requests": requests,
                                    "request_count": request_count,
                                    "completed_only": completed_only,
                                    "complete_count": complete_count,
                                    "featured_complete": featured_complete,
                                    "featured_only": featured_only,
                                    "next_page": next_page,
                                    "page_offset": page * page_size
                                })


def completed_translation_requests(request):
    """
    Wrapper for listing completed translations requests.
    """
    return translation_requests(request, completed_only=True)


def completed_featured_translation_requests(request):
    """
    Wrapper for listing completed translations requests.
    """
    return translation_requests(request, completed_only=True, featured_only=True)


@catch_error_as_json
def translation_request_api(request, tref):
    """
    API for requesting a text segment for translation.
    """
    if not request.user.is_authenticated:
        return jsonResponse({"error": "You must be logged in to request a translation."})

    oref = Ref(tref)
    ref = oref.normal()

    if "unrequest" in request.POST:
        TranslationRequest.remove_request(ref, request.user.id)
        response = {"status": "ok"}

    elif "feature" in request.POST:
        if not request.user.is_staff:
            response = {"error": "Only admins can feature requests."}
        else:
            tr                = TranslationRequest().load({"ref": ref})
            tr.featured       = True
            tr.featured_until = dateutil.parser.parse(request.POST.get("feature"))
            tr.save()
            response = {"status": "ok"}

    elif "unfeature" in request.POST:
        if not request.user.is_staff:
            response = {"error": "Only admins can unfeature requests."}
        else:
            tr = TranslationRequest().load({"ref": ref})
            tr.featured       = False
            tr.featured_until = None
            tr.save()
            response = {"status": "ok"}

    else:
        if oref.is_text_translated():
            response = {"error": "Sefaria already has a translation for %s." % ref}
        else:
            tr = TranslationRequest.make_request(ref, request.user.id)
            response = tr.contents()

    return jsonResponse(response)


@ensure_csrf_cookie
@sanitize_get_params
def translation_flow(request, tref):
    """
    Assign a user a paritcular bit of text to translate within 'ref',
    either a text title or category.
    """
    tref = tref.replace("_", " ")
    generic_response = { "title": "Help Translate %s" % tref, "content": "" }
    categories = model.library.get_text_categories()
    next_text = None
    next_section = None

    # expire old locks before checking for a currently unlocked text
    model.expire_locks()

    try:
        oref = model.Ref(tref)
    except InputError:
        oref = False
    if oref and len(oref.sections) == 0:
        # tref is an exact text Title

        # normalize URL
        if request.path != "/translate/%s" % oref.url():
            return redirect("/translate/%s" % oref.url(), permanent=True)

        # Check for completion
        if oref.get_state_node().get_percent_available("en") == 100:
            generic_response["content"] = "<h3>Sefaria now has a complete translation of %s</h3>But you can still contribute in other ways.</h3> <a href='/contribute'>Learn More.</a>" % tref
            return render(request,'static/generic.html', generic_response)

        if "random" in request.GET:
            # choose a ref from a random section within this text
            if "skip" in request.GET:
                if oref.is_talmud():
                    skip = int(daf_to_section(request.GET.get("skip")))
                else:
                    skip = int(request.GET.get("skip"))
            else:
                skip = None
            assigned_ref = random_untranslated_ref_in_text(oref.normal(), skip=skip)

            if assigned_ref:
                next_section = model.Ref(assigned_ref).padded_ref().sections[0]

        elif "section" in request.GET:
            # choose the next ref within the specified section
            next_section = int(request.GET["section"])
            assigned_ref = next_untranslated_ref_in_text(oref.normal(), section=next_section)

        else:
            # choose the next ref in this text in order
            assigned_ref = next_untranslated_ref_in_text(oref.normal())

        if not assigned_ref:
            generic_response["content"] = "All remaining sections in %s are being worked on by other contributors. Work on <a href='/translate/%s'>another text</a> for now." % (oref.normal(), tref)
            return render(request,'static/generic.html', generic_response)

    elif oref and len(oref.sections) > 0:
        # ref is a citation to a particular location in a text
        # for now, send this to the edit_text view
        return edit_text(request, tref)

    elif tref in categories:  #todo: Fix me to work with Version State!
        # ref is a text Category
        raise InputError("This function is under repair.  Our Apologies.")
        '''
        cat = tref

        # Check for completion
        if get_percent_available(cat) == 100:
            generic_response["content"] = "<h3>Sefaria now has a complete translation of %s</h3>But you can still contribute in other ways.</h3> <a href='/contribute'>Learn More.</a>" % tref
            return render(request,'static/generic.html', generic_response)

        if "random" in request.GET:
            # choose a random text from this cateogory
            skip = int(request.GET.get("skip")) if "skip" in request.GET else None
            text = random_untranslated_text_in_category(cat, skip=skip)
            assigned_ref = next_untranslated_ref_in_text(text)
            next_text = text

        elif "text" in request.GET:
            # choose the next text requested in URL
            oref = model.Ref(request.GET["text"])
            text = oref.normal()
            next_text = text
            if oref.get_state_node().get_percent_available("en") == 100:
                generic_response["content"] = "%s is complete! Work on <a href='/translate/%s'>another text</a>." % (text, tref)
                return render(request,'static/generic.html', generic_response)

            try:
                assigned_ref = next_untranslated_ref_in_text(text)
            except InputError:
                generic_response["content"] = "All remaining sections in %s are being worked on by other contributors. Work on <a href='/translate/%s'>another text</a> for now." % (text, tref)
                return render(request,'static/generic.html', generic_response)

        else:
            # choose the next text in order
            skip = 0
            success = 0
            # TODO -- need an escape valve here
            while not success:
                try:
                    text = next_untranslated_text_in_category(cat, skip=skip)
                    assigned_ref = next_untranslated_ref_in_text(text)
                    skip += 1
                except InputError:
                    pass
                else:
                    success = 1
        '''
    else:
        # we don't know what this is
        generic_response["content"] = "<b>%s</b> isn't a known text or category.<br>But you can still contribute in other ways.</h3> <a href='/contribute'>Learn More.</a>" % (tref)
        return render(request,'static/generic.html', generic_response)

    # get the assigned text
    assigned = TextFamily(Ref(assigned_ref), context=0, commentary=False).contents()

    # Put a lock on this assignment
    user = request.user.id if request.user.is_authenticated else 0
    model.set_lock(assigned_ref, "en", "Sefaria Community Translation", user)

    # if the assigned text is actually empty, run this request again
    # but leave the new lock in place to skip over it
    if "he" not in assigned or not len(assigned["he"]):
        return translation_flow(request, tref)

    # get percentage and remaining counts
    # percent   = get_percent_available(assigned["book"])
    translated = StateNode(assigned["book"]).get_translated_count_by_unit(assigned["sectionNames"][-1])
    remaining = StateNode(assigned["book"]).get_untranslated_count_by_unit(assigned["sectionNames"][-1])
    percent    = 100 * translated / float(translated + remaining)


    return render(request,'translate_campaign.html',
                                    {"title": "Help Translate %s" % tref,
                                    "base_ref": tref,
                                    "assigned_ref": assigned_ref,
                                    "assigned_ref_url": model.Ref(assigned_ref).url(),
                                    "assigned_text": assigned["he"],
                                    "assigned_segment_name": assigned["sectionNames"][-1],
                                    "assigned": assigned,
                                    "translated": translated,
                                    "remaining": remaining,
                                    "percent": percent,
                                    "thanks": "thank" in request.GET,
                                    "random_param": "&skip={}".format(assigned["sections"][0]) if request.GET.get("random") else "",
                                    "next_text": next_text,
                                    "next_section": next_section,
                                    })


@ensure_csrf_cookie
@sanitize_get_params
def contest_splash(request, slug):
    """
    Splash page for contest.

    Example of adding a contest record to the DB:
    db.contests.save({
            "contest_start"    : datetime.strptime("3/5/14", "%m/%d/%y"),
            "contest_end"      : datetime.strptime("3/26/14", "%m/%d/%y"),
            "version"          : "Sefaria Community Translation",
            "ref_regex"        : "^Shulchan Arukh, Even HaEzer ",
            "assignment_url"   : "/translate/Shulchan_Arukh,_Even_HaEzer",
            "title"            : "Translate Shulchan Arukh, Even HaEzer",
            "slug"             : "shulchan-arukh-even-haezer"
    })
    """
    settings = db.contests.find_one({"slug": slug})
    if not settings:
        raise Http404

    settings["copy_template"] = "static/contest/%s.html" % settings["slug"]

    leaderboard_condition = make_leaderboard_condition( start     = settings["contest_start"],
                                                        end       = settings["contest_end"],
                                                        version   = settings["version"],
                                                        ref_regex = settings["ref_regex"])

    now = datetime.now()
    if now < settings["contest_start"]:
        settings["phase"] = "pre"
        settings["leaderboard"] = None
        settings["time_to_start"] = td_format(settings["contest_start"] - now)

    elif settings["contest_start"] < now < settings["contest_end"]:
        settings["phase"] = "active"
        settings["leaderboard_title"] = "Current Leaders"
        settings["leaderboard"] = make_leaderboard(leaderboard_condition)
        settings["time_to_end"] = td_format(settings["contest_end"] - now)

    elif settings["contest_end"] < now:
        settings["phase"] = "post"
        settings["leaderboard_title"] = "Contest Leaders (Unreviewed)"

        settings["leaderboard"] = make_leaderboard(leaderboard_condition)


    return render(request,"contest_splash.html",
                                settings)


@ensure_csrf_cookie
def metrics(request):
    """
    Metrics page. Shows graphs of core metrics.
    """
    metrics = db.metrics.find().sort("timestamp", 1)
    metrics_json = dumps(metrics)
    return render(request,'metrics.html',
                                {
                                    "metrics_json": metrics_json,
                                })


@ensure_csrf_cookie
def digitized_by_sefaria(request):
    """
    Metrics page. Shows graphs of core metrics.
    """
    texts = VersionSet({"digitizedBySefaria": True}, sort=[["title", 1]])
    return render(request,'static/digitized-by-sefaria.html',
                                {
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
        all_indexes = [x for x in library.all_index_records() if x.title in titles or (x.get_primary_category() in categories)]
    else:
        all_indexes = library.all_index_records()
    # picking by text first biases towards short texts
    index = choice(all_indexes)
    try:
        ref = choice(index.all_segment_refs()).normal() # check for orphaned texts
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
    return render(request,'random.html', {})


def random_text_api(request):
    """
    Return Texts API data for a random ref.
    """
    categories = set(request.GET.get('categories', '').split('|'))
    titles = set(request.GET.get('titles', '').split('|'))
    response = redirect(iri_to_uri("/api/texts/" + random_ref(categories, titles)) + "?commentary=0&context=0", permanent=False)
    return response


def random_by_topic_api(request):
    """
    Returns Texts API data for a random text taken from popular topic tags
    """
    cb = request.GET.get("callback", None)
    topics_filtered = [x for x in get_topics().list() if x['good_to_promote']]
    if len(topics_filtered) == 0:
        resp = jsonResponse({"ref": None, "topic": None, "url": None}, callback=cb)
        resp['Content-Type'] = "application/json; charset=utf-8"
        return resp
    random_topic = choice(topics_filtered)['tag']
    term = Term().load_by_title(random_topic)
    random_source = choice(get_topics().get(random_topic).contents()['sources'])[0]
    try:
        oref = Ref(random_source)
        tref = oref.normal()
        url = oref.url()
    except Exception:
        return random_by_topic_api(request)
    resp = jsonResponse({"ref": tref, "topic": random_topic, "url": url}, callback=cb)
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
                        "order":"A00000100220030"
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


@csrf_exempt
def search_wrapper_api(request):
    if request.method == "POST":
        if "json" in request.POST:
            j = request.POST.get("json")  # using form-urlencoded
        else:
            j = request.body  # using content-type: application/json
        j = json.loads(j)
        es_client = Elasticsearch(SEARCH_ADMIN)
        search_obj = Search(using=es_client, index=j.get("type")).params(request_timeout=5)
        search_obj = get_query_obj(search_obj=search_obj, **{k: v for k, v in list(j.items())})
        response = search_obj.execute()
        if response.success():
            return jsonResponse(response.to_dict(), callback=request.GET.get("callback", None))
        return jsonResponse({"error": "Error with connection to Elasticsearch. Total shards: {}, Shards successful: {}, Timed out: {}".format(response._shards.total, response._shards.successful, response.timed_out)}, callback=request.GET.get("callback", None))
    return jsonResponse({"error": "Unsupported HTTP method."}, callback=request.GET.get("callback", None))


@ensure_csrf_cookie
def serve_static(request, page):
    """
    Serve a static page whose template matches the URL
    """
    return render(request,'static/%s.html' % page, {})


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

    (topCat, bottomCat) = [x.replace("-","") for x in (topCat, bottomCat)]

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
            "shapeParam": "Talmud/Bavli",
            "linkCountParam": "Bavli",
            "talmudAddressed": True,
        },
        "Yerushalmi": {
            "title": "Jerusalem Talmud",
            "heTitle": "התלמוד ירושלמי",
            "shapeParam": "Talmud/Yerushalmi",
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
            "shapeParam": "Tanaitic/Tosefta",
            "linkCountParam": "Tosefta",
        },
        "MidrashRabbah": {
            "title": "Midrash Rabbah",
            "heTitle": "מדרש רבה",
            "shapeParam": "Midrash/Aggadic Midrash/Midrash Rabbah",
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

    template_vars =  {
        "books": json.dumps(books),
        "categories": json.dumps(categories),
        "topCat": topCat,
        "bottomCat": bottomCat,
        "topCatTitle": categories[topCat]["heTitle"] if request.interfaceLang == "hebrew" else categories[topCat]["title"],
        "bottomCatTitle": categories[bottomCat]["heTitle"] if request.interfaceLang == "hebrew" else categories[bottomCat]["title"],
        "urlRoot": urlRoot,
    }
    if lang == "he": # Override language settings if 'he' is in URL
        request.contentLang = "hebrew"

    return render(request,'explore.html', template_vars)

@staff_member_required
def visualize_timeline(request):
    return render(request, 'timeline.html', {})


def person_page(request, name):
    person = Person().load({"key": name})

    if not person:
        raise Http404
    assert isinstance(person, Person)

    template_vars = person.contents()
    if request.interfaceLang == "hebrew":
        template_vars["name"] = person.primary_name("he")
        template_vars["bio"]= getattr(person, "heBio", _("Learn about %(name)s - works written, biographies, dates and more.") % {"name": person.primary_name("he")})
    else:
        template_vars["name"] = person.primary_name("en")
        template_vars["bio"]= getattr(person, "enBio", _("Learn about %(name)s - works written, biographies, dates and more.")  % {"name": person.primary_name("en")})

    template_vars["primary_name"] = {
        "en": person.primary_name("en"),
        "he": person.primary_name("he")
    }
    template_vars["secondary_names"] = {
        "en": person.secondary_names("en"),
        "he": person.secondary_names("he")
    }
    template_vars["time_period_name"] = {
        "en": person.mostAccurateTimePeriod().primary_name("en"),
        "he": person.mostAccurateTimePeriod().primary_name("he")
    }
    template_vars["time_period"] = {
        "en": person.mostAccurateTimePeriod().period_string("en"),
        "he": person.mostAccurateTimePeriod().period_string("he")
    }
    template_vars["relationships"] = person.get_grouped_relationships()
    template_vars["indexes"] = person.get_indexes()
    template_vars["post_talmudic"] = person.is_post_talmudic()
    template_vars["places"] = person.get_places()

    return render(request,'person.html', template_vars)


def person_index(request):

    eras = ["GN", "RI", "AH", "CO"]
    template_vars = {
        "eras": []
    }
    for era in eras:
        tp = TimePeriod().load({"symbol": era})
        template_vars["eras"].append(
            {
                "name_en": tp.primary_name("en"),
                "name_he": tp.primary_name("he"),
                "years_en": tp.period_string("en"),
                "years_he": tp.period_string("he"),
                "people": [p for p in PersonSet({"era": era}, sort=[('deathYear', 1)]) if p.has_indexes()]
            }
        )

    return render(request,'people.html', template_vars)


def talmud_person_index(request):
    gens = TimePeriodSet.get_generations()
    template_vars = {
        "gens": []
    }
    for gen in gens:
        people = gen.get_people_in_generation()
        template_vars["gens"].append({
            "name_en": gen.primary_name("en"),
            "name_he": gen.primary_name("he"),
            "years_en": gen.period_string("en"),
            "years_he": gen.period_string("he"),
            "people": [p for p in people]
        })
    return render(request,'talmud_people.html', template_vars)


def _get_sheet_tag_garden(tag):
    garden_key = "sheets.tagged.{}".format(tag)
    g = Garden().load({"key": garden_key})
    if not g:
        g = Garden({"key": garden_key, "title": "Sources from Sheets Tagged {}".format(tag), "heTitle": "מקורות מדפים מתויגים:" + " " + str(tag)})
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

    return render(request,'garden.html', template_vars)


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

    return render(request,'visual_garden.html', template_vars)



@requires_csrf_token
def custom_server_error(request, template_name='500.html'):
    """
    500 error handler.

    Templates: `500.html`
    """
    t = get_template(template_name) # You need to create a 500.html template.
    return http.HttpResponseServerError(t.render({'request_path': request.path}, request))

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

def application_health_api(request):
    """
    Defines the /healthz API endpoint which responds with
        200 if the appliation is ready for requests,
        500 if the application is not ready for requests
    """
    if library.is_initialized():
        return http.HttpResponse("Healthy", status="200")
    else:
        return http.HttpResponse("Unhealthy", status="500")
