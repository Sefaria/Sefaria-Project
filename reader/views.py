# -*- coding: utf-8 -*-

# noinspection PyUnresolvedReferences
from datetime import datetime, timedelta, date
from sets import Set
from random import choice
from pprint import pprint
import json
import urlparse
import urllib2
import urllib
import dateutil.parser
import base64
import zlib
from bson.json_util import dumps
import p929
import socket

from django.views.decorators.cache import cache_page
from django.template import RequestContext
from django.template.loader import render_to_string
from django.shortcuts import render_to_response, get_object_or_404, redirect
from django.http import Http404, HttpResponse
from django.contrib.auth.decorators import login_required
from django.utils.http import urlquote
from django.utils.encoding import iri_to_uri
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt, csrf_protect
from django.contrib.auth.models import User

from sefaria.model import *
from sefaria.workflows import *
from sefaria.reviews import *
from sefaria.model.user_profile import user_link, user_started_text, unread_notifications_count_for_user
from sefaria.client.wrapper import format_object_for_client, format_note_object_for_client, get_notes, get_links
from sefaria.system.exceptions import InputError, PartialRefInputError, BookNameError, NoVersionFoundError, DuplicateRecordError
# noinspection PyUnresolvedReferences
from sefaria.client.util import jsonResponse
from sefaria.history import text_history, get_maximal_collapsed_activity, top_contributors, make_leaderboard, make_leaderboard_condition, text_at_revision, record_version_deletion, record_index_deletion
from sefaria.system.decorators import catch_error_as_json
from sefaria.summaries import flatten_toc, get_or_make_summary_node, REORDER_RULES
from sefaria.sheets import get_sheets_for_ref, get_public_sheets, get_sheets_by_tag, user_sheets, user_tags, recent_public_tags, sheet_to_dict, get_top_sheets, make_tag_list
from sefaria.utils.util import list_depth, text_preview
from sefaria.utils.hebrew import hebrew_plural, hebrew_term, encode_hebrew_numeral, encode_hebrew_daf, is_hebrew, strip_cantillation, has_cantillation
from sefaria.utils.talmud import section_to_daf, daf_to_section
from sefaria.datatype.jagged_array import JaggedArray
import sefaria.utils.calendars
import sefaria.tracker as tracker
from sefaria.system.cache import django_cache_decorator
from sefaria.settings import USE_VARNISH, USE_NODE, NODE_HOST
if USE_VARNISH:
    from sefaria.system.sf_varnish import invalidate_ref, invalidate_linked

import logging
logger = logging.getLogger(__name__)


@ensure_csrf_cookie
def reader(request, tref, lang=None, version=None):
    # Redirect to standard URLs
    def reader_redirect(uref, lang, version):
        url = "/" + uref
        if lang and version:
            url += "/%s/%s" % (lang, version)

        response = redirect(iri_to_uri(url), permanent=True)
        params = request.GET.urlencode()
        response['Location'] += "?%s" % params if params else ""
        return response

    try:
        oref = model.Ref(tref)
    except PartialRefInputError as e:
        logger.warning(u'{}'.format(e))
        matched_ref = Ref(e.matched_part)
        return reader_redirect(matched_ref.url(), lang, version)
    except InputError:
        raise Http404

    uref = oref.url()
    if uref and tref != uref:
        return reader_redirect(uref, lang, version)

    # Return Text TOC if this is a bare text title
    if oref.sections == [] and (oref.index.title == oref.normal() or getattr(oref.index_node, "depth", 0) > 1):
        return text_toc(request, oref)
    # or if this is a schema node with multiple sections underneath it
    if (not getattr(oref.index_node, "depth", None)):
        return text_toc(request, oref)

    if not request.COOKIES.get('s1'):
        return s2(request, ref=tref, lang=lang, version=version)


    # TODO Everything below is S1 and will be removed

    # BANDAID - for spanning refs, return the first section
    oref = oref.padded_ref()
    if oref.is_spanning():
        first_oref = oref.first_spanned_ref()
        return reader_redirect(first_oref.url(), lang, version)

    version = version.replace("_", " ") if version else None
    try:
        text = TextFamily(oref, lang=lang, version=version, commentary=False, alts=True).contents()
    except NoVersionFoundError:
        raise Http404

    text.update({"commentary": [], "notes": [], "sheets": [], "layer": [], "connectionsLoadNeeded": True})
    hasSidebar = True

    layer_name = request.GET.get("layer", None)
    if layer_name and not "error" in text:
        layer = Layer().load({"urlkey": layer_name})
        if not layer:
            raise InputError("Layer not found.")
        text["layer"]        = [format_note_object_for_client(n) for n in layer.all(tref=tref)]
        text["_loadSourcesFromDiscussion"] = True

    text["next"] = oref.next_section_ref().normal() if oref.next_section_ref() else None
    text["prev"] = oref.prev_section_ref().normal() if oref.prev_section_ref() else None
    text["ref"] = Ref(text["ref"]).normal()

    if lang and version:
        text['new_preferred_version'] = {'lang': lang, 'version': version}

    zipped_text = map(None, text["text"], text["he"]) if not "error" in text else []
    if "error" not in text:
        if len(text["sections"]) == text["textDepth"]:
            section = text["sections"][-1] - 1
            en = text["text"][section] if len(text.get("text", [])) > section else ""
            en = "" if not isinstance(en, basestring) else en
            he = text["he"][section] if len(text.get("he", [])) > section else ""
            he = "" if not isinstance(he, basestring) else he
            description_text = " ".join((en, he))
        else:
            en = text.get("text", []) if isinstance(text.get("text", []), list) else []
            he = text.get("he", []) if isinstance(text.get("he", []), list) else []
            lines = [line for line in (en+he) if isinstance(line, basestring)]
            description_text = " ".join(lines)
        description_text = strip_tags(description_text)[:600] + "..."
    else:
        description_text = "Unknown Text."

    initJSON    = json.dumps(text)
    lines       = request.GET.get("layout", None) or "lines" if "error" in text or text["type"] not in ('Tanakh', 'Talmud') or text["book"] == "Psalms" else "block"
    layout      = request.GET.get("layout") if request.GET.get("layout") in ("heLeft", "heRight") else "heLeft"
    sidebarLang = request.GET.get('sidebarLang', None) or request.COOKIES.get('sidebarLang', "all")
    sidebarLang = {"all": "sidebarAll", "he": "sidebarHebrew", "en": "sidebarEnglish"}.get(sidebarLang, "sidebarAll")
    lexicon     = request.GET.get('lexicon', 0)

    template_vars = {'text': text,
                     'hasSidebar': hasSidebar,
                     'initJSON': initJSON,
                     'zipped_text': zipped_text,
                     'description_text': description_text,
                     'page_title': oref.normal() if "error" not in text else "Unknown Text",
                     'title_variants': "(%s)" % ", ".join(text.get("titleVariants", []) + text.get("heTitleVariants", [])),
                     'sidebarLang': sidebarLang,
                     'lines': lines,
                     'layout': layout,
                     'lexicon': lexicon,
                    }

    if "error" not in text:
    # Override Content Language Settings if text not available in given langauge
        if is_text_empty(text["text"]):
            template_vars["contentLang"] = "hebrew"
        if is_text_empty(text["he"]):
            template_vars["contentLang"] = "english"
    # Override if a specfic version was requested
        if lang:
            template_vars["contentLang"] = {"he": "hebrew", "en": "english"}[lang]

    return render_to_response('reader.html', template_vars, RequestContext(request))


def esi_account_box(request):
    return render_to_response('elements/accountBox.html', {}, RequestContext(request))


def switch_to_s1(request):
    """Set the S1 cookie then redirect to /"""
    next = request.GET.get("next", "/")
    response = redirect(next)
    response.set_cookie("s1", "true")
    return response


def switch_to_s2(request):
    """Set the S2 cookie then redirect to /texts"""
    next = request.GET.get("next", "/texts")
    response = redirect(next)
    response.set_cookie("s1", "")
    return response


def render_react_component(component, props):
    """
    Asks the Node Server to render `component` with `props`.
    `props` may either be JSON (to save reencoding) or a dictionary.
    Returns HTML.
    """
    if not USE_NODE:
        return render_to_string("elements/loading.html")

    from sefaria.settings import NODE_TIMEOUT, NODE_TIMEOUT_MONITOR

    propsJSON = json.dumps(props)
    cache_key = "todo" # zlib.compress(propsJSON)
    url = NODE_HOST + "/" + component + "/" + cache_key


    encoded_args = urllib.urlencode({
        "propsJSON": propsJSON,
    })
    try:
        response = urllib2.urlopen(url, encoded_args, NODE_TIMEOUT)
        html = response.read()
        return html
    except (urllib2.URLError, socket.timeout) as e:
        # Catch timeouts, however they may come.  Write to file NODE_TIMEOUT_MONITOR, which forever monitors to restart process
        if isinstance(e, socket.timeout) or (hasattr(e, "reason") and isinstance(e.reason, socket.timeout)):
            logger.exception("Node timeout: Fell back to client-side rendering.")
            with open(NODE_TIMEOUT_MONITOR, "a") as myfile:
                myfile.write("Node timeout: Fell back to client-side rendering. \nRequest Props:\n")
                myfile.write(propsJSON)
            return render_to_string("elements/loading.html")
        else:
            raise
    except Exception as e:
        # If anything else goes wrong with Node, just fall back to client-side rendering
        logger.exception("Fell back to client-side rendering.")
        return render_to_string("elements/loading.html")


def make_panel_dict(oref, version, language, filter, mode):
    """
    Returns a dictionary corresponding to the React panel state,
    additionally setting `text` field with textual content.
    """
    if oref.is_book_level():
        panel = {
            "menuOpen": "book toc",
            "bookRef": oref.normal(),
            "textTocHtml": make_toc_html(oref),
        }
    else:
        oref = oref.first_available_section_ref()
        panel = {
            "mode": mode,
            "ref": oref.normal(),
            "refs": [oref.normal()],
            "version": version,
            "versionLanguage": language,
            "filter": filter,
        }
        if mode != "Connections":
            try:
                text = TextFamily(oref, version=panel["version"], lang=panel["versionLanguage"], commentary=False, context=True, pad=True, alts=True).contents()
            except NoVersionFoundError:
                text = {}

            text["next"] = oref.next_section_ref().normal() if oref.next_section_ref() else None
            text["prev"] = oref.prev_section_ref().normal() if oref.prev_section_ref() else None
            panel["text"] = text

            if oref.is_segment_level():
                panel["highlightedRefs"] = [subref.normal() for subref in oref.range_list()]

    return panel


def make_panel_dicts(oref, version, language, filter, multi_panel):
    """
    Returns an array of panel dictionaries.
    Depending on whether `multi_panel` is True, connections set in `filter` are displayed in either 1 or 2 panels.
    """
    panels = []
    # filter may have value [], meaning "all".  Therefore we test filter with "is not None".
    if filter is not None and multi_panel:
        panels += [make_panel_dict(oref, version, language, filter, "Text")]
        panels += [make_panel_dict(oref, version, language, filter, "Connections")]
    elif filter is not None and not multi_panel:
        panels += [make_panel_dict(oref, version, language, filter, "TextAndConnections")]
    else:
        panels += [make_panel_dict(oref, version, language, filter, "Text")]

    return panels


def s2_props(request):
    """
    Returns a dictionary of props that all S2 pages get based on the request.
    """ 
    request_context = RequestContext(request)
    return {
        "multiPanel": request.flavour != "mobile" and not "mobile" in request.GET,
        "initialPath": request.get_full_path(),
        "recentlyViewed": request.COOKIES.get("recentlyViewed", None),
        "loggedIn": request.user.is_authenticated(),
        "interfaceLang": request_context.get("interfaceLang"),
        "initialSettings": {
            "language":      request_context.get("contentLang"),
            "layoutDefault": request.COOKIES.get("layoutDefault", "segmented"),
            "layoutTalmud":  request.COOKIES.get("layoutTalmud", "continuous"),
            "layoutTanakh":  request.COOKIES.get("layoutTanakh", "segmented"),
            "color":         request.COOKIES.get("color", "light"),
            "fontSize":      request.COOKIES.get("fontSize", 62.5),
        },
    }


def s2(request, ref, version=None, lang=None):
    """
    Reader App.
    """
    try:
        oref = Ref(ref)
    except InputError:
        raise Http404
   
    props = s2_props(request)

    panels = []
    multi_panel = props["multiPanel"]
    # Handle first panel which has a different signature in params & URL (`version` and `lang` if set come from URL).
    version = version.replace(u"_", " ") if version else version
    filter = request.GET.get("with").replace("_", " ").split("+") if request.GET.get("with") else None
    filter = [] if filter == ["all"] else filter

    if version and not Version().load({"versionTitle": version, "language": lang}):
        raise Http404

    panels += make_panel_dicts(oref, version, lang, filter, multi_panel)

    # Handle any panels after 1 which are identified with params like `p2`, `v2`, `l2`.
    i = 2
    while True:
        ref = request.GET.get("p{}".format(i))
        if not ref:
            break
        try:
            oref = Ref(ref)
        except InputError:
            i += 1
            continue  # Stop processing all panels?
            # raise Http404
        
        version  = request.GET.get("v{}".format(i)).replace(u"_", u" ") if request.GET.get("v{}".format(i)) else None
        language = request.GET.get("l{}".format(i))
        filter   = request.GET.get("w{}".format(i)).replace("_", " ").split("+") if request.GET.get("w{}".format(i)) else None
        filter   = [] if filter == ["all"] else filter

        if version and not Version().load({"versionTitle": version, "language": language}):
            i += 1
            continue  # Stop processing all panels?
            # raise Http404

        panels += make_panel_dicts(oref, version, language, filter, multi_panel)
        i += 1

    props.update({
        "headerMode":                  False,
        "initialRefs":                 panels[0].get("refs", []),
        "initialFilter":               panels[0].get("filter", None),   # used only for mobile, TextAndConnections case.
        "initialBookRef":              panels[0].get("bookRef", None),
        "initialPanels":               panels,
        "initialPanelCap":             len(panels),
        "initialQuery":                None,
        "initialSearchFilters":        None,
        "initialSheetsTag":            None,
        "initialNavigationCategories": None,
    })
    propsJSON = json.dumps(props)
    html = render_react_component("ReaderApp", props)
    return render_to_response('s2.html', {
        "propsJSON":      propsJSON,
        "html":           html,
    }, RequestContext(request))


def s2_texts_category(request, cats):
    """
    List of texts in a category.
    """
    cats       = cats.split("/")
    toc        = library.get_toc()
    cat_toc    = get_or_make_summary_node(toc, cats, make_if_not_found=False)
    if cat_toc is None:
        return s2_texts(request)

    props = s2_props(request)
    props.update({
        "initialMenu": "navigation",
        "initialNavigationCategories": cats,
    })
    html = render_react_component("ReaderApp", props)
    return render_to_response('s2.html', {
        "propsJSON": json.dumps(props),
        "html":      html,
    }, RequestContext(request))


def s2_search(request):
    """
    Search or Search Results page.
    """
    search_filters = request.GET.get("filters").split("|") if request.GET.get("filters") else []

    props = s2_props(request)
    props.update({
        "initialMenu": "search",
        "initialQuery": urllib.unquote(request.GET.get("q")) if request.GET.get("q") else "",
        "initialSearchFilters": search_filters,
    })
    html = render_react_component("ReaderApp", props)
    return render_to_response('s2.html', {
        "propsJSON": json.dumps(props),
        "html":      html,
    }, RequestContext(request))


def s2_sheets(request):
    """
    Source Sheets Home Page.
    """
    props = s2_props(request)
    props.update({
        "initialMenu": "sheets",
        "topSheets": [sheet_to_dict(s) for s in get_top_sheets()],
        "tagList": make_tag_list(sort_by="count"),
        "trendingTags": recent_public_tags(days=14, ntags=18)
    })
    html = render_react_component("ReaderApp", props)
    return render_to_response('s2.html', {
        "propsJSON":      json.dumps(props),
        "html":           html,
    }, RequestContext(request))

def s2_group_sheets(request, partner, authenticated):
    props = s2_props(request)
    props.update({
        "initialMenu":     "sheets",
        "initialSheetsTag": "sefaria-partners",
        "initialPartner": partner,
    })
    if authenticated == True:
        query = {"status": {"$in": ["unlisted", "public"]}, "group": partner}
    else:
        query = {"status": "public", "group": partner}

    sheets = db.sheets.find(query).sort([["title", 1]])

    props["partnerSheets"] = [sheet_to_dict(s) for s in sheets]

    html = render_react_component("ReaderApp", props)
    return render_to_response('s2.html', {
        "propsJSON": json.dumps(props),
        "html": html,
    }, RequestContext(request))


def s2_sheets_by_tag(request, tag):
    """
    Page of sheets by tag.
    Currently used to for "My Sheets" and  "All Sheets" as well.
    """
    props = s2_props(request)
    props.update({
        "initialMenu":     "sheets",
        "initialSheetsTag": tag,
    })
    if tag == "My Sheets":
        props["userSheets"]   = user_sheets(request.user.id)["sheets"]
        props["userTags"]     = user_tags(request.user.id)
    elif tag == "All Sheets":
        props["publicSheets"] = [sheet_to_dict(s) for s in get_public_sheets(0)] #TODO Pagination
    else:
        props["tagSheets"]    = [sheet_to_dict(s) for s in get_sheets_by_tag(tag)]

    html = render_react_component("ReaderApp", props)
    return render_to_response('s2.html', {
        "propsJSON":      json.dumps(props),
        "html":           html,
    }, RequestContext(request))


def s2_page(request, page):
    """
    View for any S2 page that can descripted with the `menuOpen` param in React
    """
    props = s2_props(request)
    props.update({
        "initialMenu": page,
    })
    html = render_react_component("ReaderApp", props)
    return render_to_response('s2.html', {
        "propsJSON":      json.dumps(props),
        "html":           html,
    }, RequestContext(request))


def s2_home(request):
    return s2_page(request, "home")


def s2_texts(request):
    return s2_page(request, "navigation")


def s2_account(request):
    return s2_page(request, "account")


def s2_notifications(request):
    # TODO Server Side rendering
    return s2_page(request, "notifications")


@ensure_csrf_cookie
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
                text["edit_lang"] = lang
                text["edit_version"] = version
                initJSON = json.dumps(text)
        except:
            index = library.get_index(ref)
            if index: # a commentator titlein
                ref = None
                initJSON = json.dumps({"mode": "add new", "newTitle": index.contents()['title']})
    else:
        initJSON = json.dumps({"mode": "add new"})

    titles = json.dumps(model.library.full_title_list())
    page_title = "%s %s" % (mode, ref) if ref else "Add a New Text"

    return render_to_response('edit_text.html',
                             {'titles': titles,
                              'initJSON': initJSON,
                              'page_title': page_title,
                             },
                             RequestContext(request))

@ensure_csrf_cookie
def edit_text_info(request, title=None, new_title=None):
    """
    Opens the Edit Text Info page.
    """
    if title:
        # Edit Existing
        title = title.replace("_", " ")
        i = library.get_index(title)
        if not (request.user.is_staff or user_started_text(request.user.id, title)):
            return render_to_response('static/generic.html', {"title": "Permission Denied", "content": "The Text Info for %s is locked.<br><br>Please email hello@sefaria.org if you believe edits are needed." % title}, RequestContext(request))
        indexJSON = json.dumps(i.contents(v2=True) if "toc" in request.GET else i.contents())
        versions = VersionSet({"title": title})
        text_exists = versions.count() > 0
        new = False
    elif new_title:
        # Add New
        new_title = new_title.replace("_", " ")
        try: # Redirect to edit path if this title already exists
            i = library.get_index(new_title)
            return redirect("/edit/textinfo/%s" % new_title)
        except:
            pass
        indexJSON = json.dumps({"title": new_title})
        text_exists = False
        new = True

    return render_to_response('edit_text_info.html',
                             {'title': title,
                             'indexJSON': indexJSON,
                             'text_exists': text_exists,
                             'new': new,
                             },
                             RequestContext(request))

@django_cache_decorator(6000)
def make_toc_html(oref, zoom=1):
    """
    Returns the HTML of a text's Table of Contents, including any alternate structures.
    :param oref - Ref of the text to create. Ref is used instead of Index to allow
    for a different table of contents focusing on a single node of a complex text.
    :param zoom - integar specifying the level of granularity to show. 0 = Segment level,
    1 = Section level etc. 
    """
    index = oref.index
    if index.is_complex():
        html = make_complex_toc_html(oref)
    else:
        state = StateNode(index.title)
        he_counts, en_counts = state.var("he", "availableTexts"), state.var("en", "availableTexts")
        html = make_simple_toc_html(he_counts, en_counts, index.nodes.sectionNames, index.nodes.addressTypes, index.title, zoom=zoom)

    if index.has_alt_structures():
        default_name   = index.nodes.sectionNames[0] if not index.is_complex() else "Contents"
        default_struct = getattr(index, "default_struct", default_name)
        structs        = {default_name: html } # store HTML for each structure
        alts           = index.get_alt_structures().items()
        for alt in alts:
            structs[alt[0]] = make_alt_toc_html(alt[1], index)

        items  = sorted(structs.items(), key=lambda x: 0 if x[0] == default_struct else 1)
        toggle, tocs = "", ""

        for item in items:
            toggle += "<span class='toggleDivider'>|</span>" if item[0] != default_struct else ""
            toggle += "<div class='altStructToggle" + (" active" if item[0] == default_struct else "") + "'>"
            toggle +=   "<span class='en'>" + item[0] + "</span>" 
            toggle +=   "<span class='he'>" + hebrew_term(item[0]) + "</span>" 
            toggle += "</div>"
            tocs   += "<div class='altStruct' " + ("style='display:none'" if item[0] != default_struct else "") + ">" + item[1] + "</div>"

        html = "<div id='structToggles'>" + toggle + "</div>" + tocs
    return html


def make_complex_toc_html(oref):
    """
    Returns the HTML of a complex text's Table of Contents.
    :param oref - Ref of the text to create. Ref is used instead of Index to allow
    for a different table of contents focusing on a single node.
    """
    index    = oref.index
    req_node = oref.index_node

    def node_line(node, depth, **kwargs):
        if depth == 0:
            return ""
        linked = "linked" if node.is_leaf() and node.depth == 1 else ""
        default = "default" if node.is_default() else ""
        url = "/" + node.ref().url()
        en_icon = '<i class="schema-node-control fa ' + ('fa-angle-right' if linked else 'fa-angle-down') + '"></i>'
        he_icon = '<i class="schema-node-control fa ' + ('fa-angle-left' if linked else 'fa-angle-down') + '"></i>'
        html = '<a href="' + urlquote(url) + '"' if linked else "<div "
        html += ' class="schema-node-toc depth' + str(depth) + ' ' + linked + ' ' + default + '">'
        if not default:
            html += '<span class="schema-node-title">'
            html +=    '<span class="en">' + node.primary_title() + en_icon + '</span>'
            html +=    '<span class="he">' + node.primary_title(lang='he') + he_icon + '</span>'
            html += '</span>'
        if node.is_leaf():
            focused = node is req_node
            html += '<div class="schema-node-contents ' + ('open' if focused or default else 'closed') + '">'
            node_state = kwargs["vs"].state_node(node)
            #Todo, handle Talmud and other address types, as well as commentary
            zoom = 0 if node.depth == 1 else 1
            he_counts, en_counts = node_state.var("he", "availableTexts"), node_state.var("en", "availableTexts")
            content = make_simple_toc_html(he_counts, en_counts, node.sectionNames, node.addressTypes, node.full_title(), zoom=zoom)
            content = content or "<div class='emptyMessage'>No text here.</div>"
            html += content + '</div>'
        html += "</a>" if linked else "</div>"
        return html

    vs = VersionState(index)
    html = index.nodes.traverse_to_string(node_line, vs=vs)
    return html


def make_alt_toc_html(alt, index):
    """
    Returns HTML Table of Contents for an alternate structure.
    :param alt - a TitledTreeNode representing an alternate structure.
    """
    def node_line(node, depth, **kwargs):
        if depth == 0 and node.has_children():
            return ""
        html    = ""
        refs            = getattr(node, "refs", False)
        includeSections = getattr(node, "includeSections", False)
        linked  = "linked" if (not refs and not includeSections and getattr(node, "wholeRef", None)) else ""
        default = "default" if node.is_default() else ""
        url     = "/" + Ref(node.wholeRef).url() if linked else None
        en_icon = '<i class="schema-node-control fa ' + ('fa-angle-right' if linked else 'fa-angle-down') + '"></i>'
        he_icon = '<i class="schema-node-control fa ' + ('fa-angle-left' if linked else 'fa-angle-down') + '"></i>'
        html   += '<a href="' + urlquote(url) + '"' if linked else "<div "
        html   += ' class="schema-node-toc depth' + str(depth) + ' ' + linked + ' ' + default + '" >'
        wrap_counts  = lambda counts: counts if list_depth(counts) >= 2 else wrap_counts([counts])
        # wrap counts to ensure they are as though at section level, handles segment level refs
        if not default and depth > 0:
            html += '<span class="schema-node-title">'
            html +=    '<span class="en">' + node.primary_title() + en_icon + '</span>'
            html +=    '<span class="he">' + node.primary_title(lang='he') + he_icon + '</span>'
            html += '</span>'            
        if refs:
            # todo handle refs with depth > 1
            html += "<div class='schema-node-contents"
            html += " closed" if depth > 0 else ""
            html += "'>"
            html +=   "<div class='sectionName'>"
            html +=     "<span class='en'>" + hebrew_plural(node.sectionNames[0]) + "</span>"
            html +=     "<span class='he'>" + hebrew_term(node.sectionNames[0]) + "</span>"
            html +=   "</div>" 
            for i in range(len(node.refs)):
                if not node.refs[i]:
                    continue
                target_ref = Ref(node.refs[i])
                state = kwargs["vs"].state_node(target_ref.index_node)  # "Binders" would need the slower - StateNode(snode=target_ref.index_node)
                he_counts, en_counts = state.var("he", "availableTexts"), state.var("en", "availableTexts")
                he    = wrap_counts(JaggedArray(he_counts).subarray_with_ref(target_ref).array())
                en    = wrap_counts(JaggedArray(en_counts).subarray_with_ref(target_ref).array())
                klass = "en%s he%s" % (toc_availability_class(en), toc_availability_class(he))
                html += '<a class="sectionLink %s" href="/%s">%s</a>' % (klass, urlquote(node.refs[i]), (i+1))
            html += "</div>"
        elif includeSections:
            # Display each section included in node.wholeRef
            # todo handle case where wholeRef points to complex node
            # todo handle case where wholeRef points to book name (root of simple index or commentary index)
            target_ref   = Ref(node.wholeRef)
            state        = kwargs["vs"].state_node(target_ref.index_node)  # "Binders" would need the slower - StateNode(snode=target_ref.index_node)
            he_counts, en_counts = state.var("he", "availableTexts"), state.var("en", "availableTexts")
            refs         = target_ref.split_spanning_ref()
            first, last  = refs[0], refs[-1]
            offset       = first.sections[-2]-1 if first.is_segment_level() else first.sections[-1]-1
            offset_lines = (first.normal().rsplit(":", 1)[1] if first.is_segment_level() else "", 
                            last.normal().rsplit(":", 1)[1] if last.is_segment_level() else "")
            he           = wrap_counts(JaggedArray(he_counts).subarray_with_ref(target_ref).array())
            en           = wrap_counts(JaggedArray(en_counts).subarray_with_ref(target_ref).array())
            depth        = len(target_ref.index_node.sectionNames) - 2 if len(target_ref.index_node.sectionNames) > 1 else 0
            sectionNames = first.index_node.sectionNames[depth:]
            addressTypes = first.index_node.addressTypes[depth:]
            ref          = first.context_ref(level=2) if first.is_segment_level() else first.context_ref()
            content = make_simple_toc_html(he, en, sectionNames, addressTypes, ref.url(), offset=offset, offset_lines=offset_lines)
            html += "<div class='schema-node-contents open'>" + content + "</div>"

        html += "</a>" if linked else "</div>"
        return html

    vs = VersionState(index)
    html = "<div class='tocLevel'>" + alt.traverse_to_string(node_line, vs=vs) + "</div>"
    return html


def make_simple_toc_html(he_toc, en_toc, labels, addresses, ref, zoom=1, offset=0, offset_lines=None):
    """
    Returns HTML Table of Contents corresponding to jagged count arrays he_toc and en_toc.
    Runs recursively.
    :param he_toc - jagged int array of available counts in hebrew
    :param en_toc - jagged int array of available counts in english
    :param labels - list of section names for levels corresponding to toc
    :param addresses - list of address types, from Index record
    :param ref - text to prepend to final links. Starts with text title, recursively adding sections.
    :param zoom - sets how many levels of final depth to summarize
    (e.g., 1 will hide verses and only show chapter level)
    :param offset - int to add to each listed section
    :param offset_lines - tuple of strings to be appended to the URL of the first and last
    section (allows pointing to spans inside a section).
    """
    he_toc = [] if isinstance(he_toc, int) else he_toc
    en_toc = [] if isinstance(en_toc, int) else en_toc
    assert(len(he_toc) == len(en_toc))
    length = len(he_toc)
    assert(list_depth(he_toc, deep=True) == list_depth(en_toc, deep=True))
    depth = list_depth(he_toc, deep=True)

    # todo: have this use the address classes in schema.py
    talmudBase = (len(addresses) > 0 and addresses[0] == "Talmud")

    html = ""
    if depth == zoom + 1:
        # We're at the terminal level, list sections links
        for i in range(length):
            klass = "he%s en%s" % (toc_availability_class(he_toc[i]), toc_availability_class(en_toc[i]))
            if klass == "heNone enNone":
                continue # Don't display sections with no content
            en_section   = section_to_daf(i+offset+1) if talmudBase else str(i+offset+1)
            he_section   = encode_hebrew_daf(en_section) if talmudBase else encode_hebrew_numeral(int(en_section), punctuation=False)
            section_html = "<span class='en'>%s</span><span class='he'>%s</span>" % (en_section, he_section)
            path = "%s.%s" % (ref, en_section)
            if offset_lines and i == 0 and offset_lines[0]:
                path += "." + offset_lines[0]
            elif offset_lines and (i+1) == length and offset_lines[1]:
                path += "." + offset_lines[1]
            if zoom > 1:  # Make links point to first available content
                available = Ref(ref + "." + en_section).first_available_section_ref()
                path = available.url() if available else path
            html += '<a class="sectionLink %s" href="/%s">%s</a>' % (klass, urlquote(path), section_html)
        if html:
            sectionName = "<div class='sectionName'>"
            sectionName += "<span class='en'>" + hebrew_plural(labels[0]) + "</span>"
            sectionName += "<span class='he'>" + hebrew_term(labels[0]) + "</span>"
            sectionName += "</div>" 
            html = sectionName + html
    else:
        # We're above terminal level, list sections and recur
        for i in range(length):
            section = section_to_daf(i + 1) if talmudBase else str(i + 1)
            section_html = make_simple_toc_html(he_toc[i], en_toc[i], labels[1:], addresses[1:], ref + "." + section, zoom=zoom)
            if section_html:
                he_section = encode_hebrew_daf(section) if talmudBase else encode_hebrew_numeral(int(section), punctuation=False)
                html += "<div class='tocSection'>"
                html += "<div class='sectionName'>"
                html += "<span class='en'>" + labels[0] + " " + section + "</span>"
                html += "<span class='he'>" + hebrew_term(labels[0]) + " " + he_section + "</span>"
                html += "</div>" + section_html + "</div>"

    html = "<div class='tocLevel'>" + html + "</div>" if html else ""
    return html


def toc_availability_class(toc):
    """
    Returns the string of a class name in ("All", "Some", "None") 
    according to how much content is available in toc, 
    which may be either a list of ints or an int representing available counts.
    """
    if isinstance(toc, int):
        return "All" if toc else "None"
    else:
        counts = set([toc_availability_class(x) for x in toc])
        if counts == set(["All"]):
            return "All"
        elif "Some" in counts or counts == set(["All", "None"]):
            return "Some"
        else:
            return "None"


@ensure_csrf_cookie
def text_toc(request, oref):
    """
    Page representing a single text, showing its Table of Contents and related info.
    """
    if not request.COOKIES.get('s1'):
        return s2(request, ref=oref.normal())

    index         = oref.index
    title         = index.title
    heTitle       = index.get_title(lang='he')
    state         = StateNode(title)
    versions      = VersionSet({"title": title}, sort=[["language", -1]])

    categories    = index.categories[:]
    if categories[0] in REORDER_RULES:
        categories = REORDER_RULES[categories[0]] + categories[1:]
    if categories[0] == "Commentary":
        categories = [categories[1], "Commentary", index.toc_contents()["commentator"]]
    cat_slices    = [categories[:n+1] for n in range(len(categories))]  # successive sublists of cats, for category links

    c_titles      = model.library.get_commentary_version_titles_on_book(title, with_commentary2=True)
    c_indexes     = [library.get_index(commentary) for commentary in c_titles]
    commentaries  = [i.toc_contents() for i in c_indexes]

    if index.is_complex():
        zoom = 1
    else:
        zoom = 0 if index.nodes.depth == 1 else 2 if "Commentary" in index.categories else 1
        zoom = int(request.GET.get("zoom", zoom))
    toc_html = make_toc_html(oref, zoom=zoom)

    if index.is_complex():
        count_strings = False
        complex = True
        zoom = 1
    else: # simple text
        complex = False
        talmud = Ref(index.title).is_talmud()
        count_strings = {
            "en": ", ".join([str(state.get_available_counts("en")[i]) + " " + hebrew_plural(index.nodes.sectionNames[i]) for i in range(index.nodes.depth)]),
            "he": ", ".join([str(state.get_available_counts("he")[i]) + " " + hebrew_plural(index.nodes.sectionNames[i]) for i in range(index.nodes.depth)]),
        } if state else None  #why the condition?

        if talmud and count_strings:
            count_strings["he"] = count_strings["he"].replace("Dappim", "Amudim")
            count_strings["en"] = count_strings["en"].replace("Dappim", "Amudim")
        if "Commentary" in index.categories and state.get_flag("heComplete"):
            # Because commentary text is sparse, the code in make_toc_hmtl doens't work for completeness
            # Trust a flag if its set instead
            toc_html = toc_html.replace("heSome", "heAll")

    auths = index.author_objects()
    index_contents = index.contents(v2=True)
    if index_contents["categories"][0] in REORDER_RULES:
        index_contents["categories"] = REORDER_RULES[index_contents["categories"][0]] + index_contents["categories"][1:]

    template_vars = {
         "index":         index_contents,
         "authors":       auths,
         "versions":      versions,
         "commentaries":  commentaries,
         "heComplete":    state.get_flag("heComplete"),
         "enComplete":    state.get_flag("enComplete"),
         "count_strings": count_strings,
         "zoom":          zoom,
         "toc_html":      toc_html,
         "cat_slices":    cat_slices,
         "complex":       complex,
    }

    composition_time_period = index.composition_time_period()
    publication_time_period = index.publication_time_period()
    composition_place = index.composition_place()
    publication_place = index.publication_place()

    if composition_time_period:
        template_vars["comp_time_string"] = {
            "en": composition_time_period.period_string("en"),
            "he": composition_time_period.period_string("he"),
        }
    if publication_time_period:
        template_vars["pub_time_string"] = {
            "en": publication_time_period.period_string("en"),
            "he": publication_time_period.period_string("he"),
        }
    if composition_place:
        template_vars["comp_place"] = {
            "en": composition_place.primary_name("en"),
            "he": composition_place.primary_name("he"),
        }
    if publication_place:
        template_vars["pub_place"] = {
            "en": publication_place.primary_name("en"),
            "he": publication_place.primary_name("he"),
        }

    return render_to_response('text_toc.html',
                             template_vars,
                             RequestContext(request))


def text_toc_html_fragment(request, title):
    """
    Returns an HTML fragment of the Text TOC for title
    """
    oref = Ref(title)
    zoom = 0 if not oref.index.is_complex() and oref.index_node.depth == 1 else 1
    return HttpResponse(make_toc_html(oref, zoom=zoom))    


@ensure_csrf_cookie
def texts_list(request):
    """
    Page listing every text in the library.
    """
    if not request.COOKIES.get('s1'):
        return s2_texts(request)

    return render_to_response('texts.html',
                             {},
                             RequestContext(request))


def texts_category_list(request, cats):
    """
    Page listing every text in category
    """
    if "Tanach" in cats:
        cats = cats.replace("Tanach", "Tanakh")
        return redirect("/texts/%s" % cats)

    if not request.COOKIES.get('s1'):
        return s2_texts_category(request, cats)
    
    cats       = cats.split("/")
    toc        = library.get_toc()
    cat_toc    = get_or_make_summary_node(toc, cats, make_if_not_found=False)

    if cat_toc is None:
        raise Http404

    category   = cats[-1]
    heCategory = hebrew_term(category)

    if category in ("Bavli", "Yerushalmi"):
        category = "Talmud " + category
        heCategory = hebrew_term("Talmud") + " " + heCategory
    if "Commentary" in cats:
        category   = category + " on " + cats[0]
        heCategory = heCategory + u" על " + hebrew_term(cats[0])

    return render_to_response('text_category.html',
                             {
                             "categories": cats,
                             "category":   category,
                             "heCategory": heCategory,
                             "cat_toc": cat_toc,
                             "cat_path": "/" + "/".join(cats),
                             },
                             RequestContext(request))

@ensure_csrf_cookie
def search(request):
    if not request.COOKIES.get('s1'):
        return s2_search(request)

    return render_to_response('search.html',
                             {},
                             RequestContext(request))


def interface_language_redirect(request, language):
    """Set the interfaceLang cooki"""
    next = request.GET.get("next", "/?home")
    response = redirect(next)
    response.set_cookie("interfaceLang", language)
    if request.user.is_authenticated():
        p = UserProfile(id=request.user.id)
        p.settings["interface_language"] = language
        p.save()
    return response


#todo: is this used elsewhere? move it?
def count_and_index(c_oref, c_lang, vtitle, to_count=1):
    # count available segments of text
    if to_count:
        library.recount_index_in_toc(c_oref.index)

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
def texts_api(request, tref, lang=None, version=None):
    oref = Ref(tref)

    if request.method == "GET":
        uref = oref.url()
        if uref and tref != uref:    # This is very similar to reader.reader_redirect subfunction, above.
            url = "/api/texts/" + uref
            if lang and version:
                url += "/%s/%s" % (lang, version)
            response = redirect(iri_to_uri(url), permanent=True)
            params = request.GET.urlencode()
            response['Location'] += "?%s" % params if params else ""
            return response

        cb         = request.GET.get("callback", None)
        context    = int(request.GET.get("context", 1))
        commentary = bool(int(request.GET.get("commentary", True)))
        pad        = bool(int(request.GET.get("pad", 1)))
        version    = version.replace("_", " ") if version else None
        layer_name = request.GET.get("layer", None)
        alts       = bool(int(request.GET.get("alts", True)))

        try:
            text = TextFamily(oref, version=version, lang=lang, commentary=commentary, context=context, pad=pad, alts=alts).contents()
        except AttributeError as e:
            oref = oref.default_child_ref()
            text = TextFamily(oref, version=version, lang=lang, commentary=commentary, context=context, pad=pad, alts=alts).contents()
        except NoVersionFoundError as e:
            # Extended data is used by S2 in TextList.preloadAllCommentaryText()
            return jsonResponse({"error": unicode(e), "ref": oref.normal(), "versionTitle": version, "lang": lang, "commentator": getattr(oref.index, "commentator", "")})


        # Use a padded ref for calculating next and prev
        # TODO: what if pad is false and the ref is of an entire book?
        # Should next_section_ref return None in that case?
        oref               = oref.padded_ref() if pad else oref
        text["next"]       = oref.next_section_ref().normal() if oref.next_section_ref() else None
        text["prev"]       = oref.prev_section_ref().normal() if oref.prev_section_ref() else None
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

        return jsonResponse(text, cb)

    if request.method == "POST":
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})

        oref = oref.default_child_ref()  # Make sure we're on the textual child

        if not request.user.is_authenticated():
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to save texts."})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            t = json.loads(j)
            chunk = tracker.modify_text(apikey["uid"], oref, t["versionTitle"], t["language"], t["text"], t["versionSource"], method="API")
            count_after = int(request.GET.get("count_after", 0))
            count_and_index(oref, chunk.lang, chunk.vtitle, count_after)
            return jsonResponse({"status": "ok"})
        else:
            @csrf_protect
            def protected_post(request):
                t = json.loads(j)
                chunk = tracker.modify_text(request.user.id, oref, t["versionTitle"], t["language"], t["text"], t["versionSource"])
                count_after = int(request.GET.get("count_after", 1))
                count_and_index(oref, chunk.lang, chunk.vtitle, count_after)
                return jsonResponse({"status": "ok"})
            return protected_post(request)

    if request.method == "DELETE":
        if not request.user.is_staff:
            return jsonResponse({"error": "Only moderators can delete texts."})
        if not (tref and lang and version):
            return jsonResponse({"error": "To delete a text version please specifiy a text title, version title and language."})

        tref    = tref.replace("_", " ")
        version = version.replace("_", " ")

        v = Version().load({"title": tref, "versionTitle": version, "language": lang})

        if not v:
            return jsonResponse({"error": "Text version not found."})

        v.delete()
        record_version_deletion(tref, version, lang, request.user.id)

        if USE_VARNISH:
            invalidate_linked(oref)
            invalidate_ref(oref, lang, version)

        return jsonResponse({"status": "ok"})

    return jsonResponse({"error": "Unsuported HTTP method."})


@catch_error_as_json
def parashat_hashavua_api(request):
    callback = request.GET.get("callback", None)
    p = sefaria.utils.calendars.this_weeks_parasha(datetime.now())
    p["date"] = p["date"].isoformat()
    #p.update(get_text(p["ref"]))
    p.update(TextFamily(Ref(p["ref"])).contents())
    return jsonResponse(p, callback)


@catch_error_as_json
def table_of_contents_api(request):
    return jsonResponse(library.get_toc(), callback=request.GET.get("callback", None))


@catch_error_as_json
def text_titles_api(request):
    return jsonResponse({"books": model.library.full_title_list(with_commentary=True)}, callback=request.GET.get("callback", None))


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
        if "versionTitle" in j:
            if j["versionTitle"] == "Sefaria Community Translation":
                j["license"] = "CC0"
                j["licenseVetter"] = True
        if not request.user.is_authenticated():
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to save texts."})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            return jsonResponse(func(apikey["uid"], model.Index, j, method="API", v2=v2, raw=raw).contents(v2=v2, raw=raw))
        else:
            title = j.get("oldTitle", j.get("title"))
            try:
                get_index(title) # getting the index just to tell if it exists 
                # Only allow staff and the person who submitted a text to edit
                if not request.user.is_staff and not user_started_text(request.user.id, title):
                   return jsonResponse({"error": "{} is protected from change.<br/><br/>See a mistake?<br/>Email hello@sefaria.org.".format(title)})
            except BookNameError:
                pass # if this is a new text, allow any logged in user to submit
        @csrf_protect
        def protected_index_post(request):
            return jsonResponse(
                func(request.user.id, model.Index, j, v2=v2, raw=raw).contents(v2=v2, raw=raw)
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

    return jsonResponse({"error": "Unsuported HTTP method."})


@catch_error_as_json
def bare_link_api(request, book, cat):

    if request.method == "GET":
        resp = jsonResponse(get_book_link_collection(book, cat), callback=request.GET.get("callback", None))
        resp['Content-Type'] = "application/json; charset=utf-8"
        return resp

    elif request.method == "POST":
        return jsonResponse({"error": "Not implemented."})


@catch_error_as_json
def link_count_api(request, cat1, cat2):
    """
    Return a count document with the number of links between every text in cat1 and every text in cat2
    """
    if request.method == "GET":
        resp = jsonResponse(get_link_counts(cat1, cat2))
        resp['Access-Control-Allow-Origin'] = '*'
        return resp

    elif request.method == "POST":
        return jsonResponse({"error": "Not implemented."})


@catch_error_as_json
def word_count_api(request, title, version, language):
    if request.method == "GET":
        counts = VersionSet({"title": title, "versionTitle": version, "language": language}).word_count()
        resp = jsonResponse({"wordCount": counts})
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
    """
    #TODO: can we distinguish between a link_id (mongo id) for POSTs and a ref for GETs?
    if request.method == "GET":
        callback=request.GET.get("callback", None)
        if link_id_or_ref is None:
            return jsonResponse({"error": "Missing text identifier"}, callback)
        #The Ref instanciation is just to validate the Ref and let an error bubble up.
        #TODO is there are better way to validate the ref from GET params?
        model.Ref(link_id_or_ref)
        with_text = int(request.GET.get("with_text", 1))
        return jsonResponse(get_links(link_id_or_ref, with_text), callback)

    if request.method == "POST":
        # delegate according to single/multiple objects posted
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})

        j = json.loads(j)
        if isinstance(j, list):
            #todo: this seems goofy.  It's at least a bit more expensive than need be.
            res = []
            for i in j:
                try:
                    res.append(post_single_link(request, i))
                except DuplicateRecordError as e:
                    res.append({"error": unicode(e)})

            return jsonResponse(res)

        else:
            return jsonResponse(post_single_link(request, j))

    if request.method == "DELETE":
        if not link_id_or_ref:
            return jsonResponse({"error": "No link id given for deletion."})

        return jsonResponse(
            tracker.delete(request.user.id, model.Link, link_id_or_ref, callback=revarnish_link)
        )

    return jsonResponse({"error": "Unsuported HTTP method."})


def post_single_link(request, link):
    func = tracker.update if "_id" in link else tracker.add
        # use the correct function if params indicate this is a note save
        # func = save_note if "type" in j and j["type"] == "note" else save_link

    if not request.user.is_authenticated():
        key = request.POST.get("apikey")
        if not key:
            return {"error": "You must be logged in or use an API key to add, edit or delete links."}

        apikey = db.apikeys.find_one({"key": key})
        if not apikey:
            return {"error": "Unrecognized API key."}
        obj = func(apikey["uid"], model.Link, link, method="API")
        if USE_VARNISH:
            revarnish_link(obj)
        response = format_object_for_client(obj)
    else:
        @csrf_protect
        def protected_link_post(req):
            obj=func(req.user.id, model.Link, link)
            if USE_VARNISH:
                revarnish_link(obj)
            resp = format_object_for_client(obj)
            return resp
        response = protected_link_post(request)
    return response


@catch_error_as_json
@csrf_exempt
def link_summary_api(request, ref):
    """
    Returns a summary of links available for ref.
    """
    oref    = Ref(ref)
    summary = oref.linkset().summary(oref)
    return jsonResponse(summary)


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
        if not request.user.is_authenticated():
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
        if not request.user.is_authenticated():
            return jsonResponse({"error": "You must be logged in to delete notes."})
        return jsonResponse(
            tracker.delete(request.user.id, model.Note, note_id_or_ref)
        )

    return jsonResponse({"error": "Unsuported HTTP method."})


@catch_error_as_json
def related_api(request, tref):
    """
    Single API to bundle available content related to `tref`.
    """
    oref = model.Ref(tref)
    response = {
        "links": get_links(tref, with_text=False),
        "sheets": get_sheets_for_ref(tref),
        "notes": get_notes(oref, public=True)
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
    return jsonResponse(sorted(res, key = lambda x: x["title"] + x["version"]))


def version_status_tree_api(request, lang=None):
    def simplify_toc(toc_node, path):
        simple_nodes = []
        for x in toc_node:
            node_name = x.get("category", None) or x.get("title", None)
            node_path = path + [node_name]
            simple_node = {
                "name": node_name,
                "path": node_path
            }
            if "category" in x:
                simple_node["type"] = "category"
                simple_node["children"] = simplify_toc(x["contents"], node_path)
            elif "title" in x:
                query = {"title": x["title"]}
                if lang:
                    query["language"] = lang
                simple_node["type"] = "index"
                simple_node["children"] = [{
                       "name": u"{} ({})".format(v.versionTitle, v.language),
                       "path": node_path + [u"{} ({})".format(v.versionTitle, v.language)],
                       "size": v.word_count(),
                       "type": "version"
                   } for v in VersionSet(query)]
            simple_nodes.append(simple_node)
        return simple_nodes
    return jsonResponse({
        "name": "Whole Library" + " ({})".format(lang) if lang else "",
        "path": [],
        "children": simplify_toc(library.get_toc(), [])
    })


def visualize_library(request, lang=None, cats=None):

    template_vars = {"lang": lang or "",
                     "cats": json.dumps(cats.replace("_", " ").split("/") if cats else [])}

    return render_to_response('visual_library.html', template_vars, RequestContext(request))


def visualize_toc(request):
    return render_to_response('visual_toc.html', {}, RequestContext(request))


def visualize_parasha_colors(request):
    return render_to_response('visual_parasha_colors.html', {}, RequestContext(request))


def visualize_rashi_interlinks(request):
    level = request.GET.get("level", 1)
    json_file = "../static/files/torah_rashi_torah.json" if level == 1 else "../static/files/tanach_rashi_tanach.json"
    return render_to_response('visualize_links_via_rashi.html', {"json_file": json_file}, RequestContext(request))


@catch_error_as_json
def set_lock_api(request, tref, lang, version):
    """
    API to set an edit lock on a text segment.
    """
    user = request.user.id if request.user.is_authenticated() else 0
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
        return {"error": "Only Sefaria Moderators can lock texts."}

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
    API for locking or unlocking a text as a whole.
    To unlock, include the URL parameter "action=unlock"
    """
    if not request.user.is_authenticated():
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
        for flag in vobj.optional_attrs:
            if flag in flags:
                setattr(vobj, flag, flags[flag])
        vobj.save()
        return jsonResponse({"status": "ok"})
    elif request.user.is_staff:
        @csrf_protect
        def protected_post(request):
            flags = json.loads(request.POST.get("json"))
            title   = title.replace("_", " ")
            version = version.replace("_", " ")
            vobj = Version().load({"title": title, "language": lang, "versionTitle": version})
            for flag in vobj.optional_attrs:
                if flag in flags:
                    setattr(vobj, flag, flags[flag])
            vobj.save()
            return jsonResponse({"status": "ok"})
        return protected_post(request)
    else:
        return jsonResponse({"error": "Unauthorized"})


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
            return jsonResponse(result)
    else:
        return jsonResponse({"error": "No information found for given word."})



@catch_error_as_json
def notifications_api(request):
    """
    API for retrieving user notifications.
    """
    if not request.user.is_authenticated():
        return jsonResponse({"error": "You must be logged in to access your notifications."})

    page      = int(request.GET.get("page", 1))
    page_size = int(request.GET.get("page_size", 10))

    notifications = NotificationSet().recent_for_user(request.user.id, limit=page_size, page=page)

    return jsonResponse({
                            "html": notifications.to_HTML(),
                            "page": page,
                            "page_size": page_size,
                            "count": notifications.count()
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
    if not request.user.is_authenticated():
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

    if not request.user.is_authenticated():
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
        return jsonResponse({"error": "Unsuported HTTP method."})

    tref = model.Ref(tref).normal()
    refRe = '^%s$|^%s:' % (tref, tref)
    if lang and version:
        query = {"ref": {"$regex": refRe }, "language": lang, "version": version.replace("_", " ")}
    else:
        query = {"ref": {"$regex": refRe }}
    history = db.history.find(query)

    summary = {"copiers": Set(), "translators": Set(), "editors": Set(), "reviewers": Set() }
    updated = history[0]["date"].isoformat() if history.count() else "Unknown"

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

    return jsonResponse(summary)


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
        if not request.user.is_authenticated():
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
        return jsonResponse({"error": "Unsuported HTTP method."})


@ensure_csrf_cookie
def global_activity(request, page=1):
    """
    Recent Activity page listing all recent actions and contributor leaderboards.
    """
    page = int(page)
    page_size = 100

    if page > 40:
        generic_response = { "title": "Activity Unavailable", "content": "You have requested a page deep in Sefaria's history.<br><br>For performance reasons, this page is unavailable. If you need access to this information, please <a href='mailto:dev@sefaria.org'>email us</a>." }
        return render_to_response('static/generic.html', generic_response, RequestContext(request))

    if "api" in request.GET:
        q = {}
    else:
        q = {"method": {"$ne": "API"}}

    filter_type = request.GET.get("type", None)
    activity, page = get_maximal_collapsed_activity(query=q, page_size=page_size, page=page, filter_type=filter_type)

    next_page = page + 1 if page else None
    next_page = "/activity/%d" % next_page if next_page else None
    next_page = "%s?type=%s" % (next_page, filter_type) if next_page and filter_type else next_page

    email = request.user.email if request.user.is_authenticated() else False
    return render_to_response('activity.html',
                             {'activity': activity,
                                'filter_type': filter_type,
                                'leaders': top_contributors(),
                                'leaders30': top_contributors(30),
                                'leaders7': top_contributors(7),
                                'leaders1': top_contributors(1),
                                'email': email,
                                'next_page': next_page,
                                },
                             RequestContext(request))


@ensure_csrf_cookie
def user_activity(request, slug, page=1):
    """
    Recent Activity page for a single user.
    """
    page = int(page) if page else 1
    page_size = 100

    try:
        profile = UserProfile(slug=slug)
    except Exception, e:
        raise Http404


    if page > 40:
        generic_response = { "title": "Activity Unavailable", "content": "You have requested a page deep in Sefaria's history.<br><br>For performance reasons, this page is unavailable. If you need access to this information, please <a href='mailto:dev@sefaria.org'>email us</a>." }
        return render_to_response('static/generic.html', generic_response, RequestContext(request))

    q              = {"user": profile.id}
    filter_type    = request.GET.get("type", None)
    activity, page = get_maximal_collapsed_activity(query=q, page_size=page_size, page=page, filter_type=filter_type)

    next_page = page + 1 if page else None
    next_page = "/activity/%d" % next_page if next_page else None
    next_page = "%s?type=%s" % (next_page, filter_type) if next_page and filter_type else next_page

    email = request.user.email if request.user.is_authenticated() else False
    return render_to_response('activity.html',
                             {'activity': activity,
                                'filter_type': filter_type,
                                'profile': profile,
                                'for_user': True,
                                'email': email,
                                'next_page': next_page,
                                },
                             RequestContext(request))


@ensure_csrf_cookie
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
    if not Version().load({"title":oref.index.title, "versionTitle":version, "language":lang}):
        raise Http404(u"We do not have a version of {} called '{}'.  Please use the menu to find the text you are looking for.".format(oref.index.title, version))
    filter_type = request.GET.get("type", None)
    history = text_history(oref, version, lang, filter_type=filter_type, page=page)

    next_page = page + 1 if page else None
    next_page = "/activity/%s/%s/%s/%d" % (nref, lang, version, next_page) if next_page else None
    next_page = "%s?type=%s" % (next_page, filter_type) if next_page and filter_type else next_page

    email = request.user.email if request.user.is_authenticated() else False
    return render_to_response('activity.html',
                             {'activity': history,
                               "single": True,
                               "ref": nref,
                               "lang": lang,
                               "version": version,
                               'email': email,
                               'filter_type': filter_type,
                               'next_page': next_page
                             },
                             RequestContext(request))


@catch_error_as_json
def revert_api(request, tref, lang, version, revision):
    """
    API for reverting a text segment to a previous revision.
    """
    if not request.user.is_authenticated():
        return jsonResponse({"error": "You must be logged in to revert changes."})

    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."})

    revision = int(revision)
    version = version.replace("_", " ")
    oref = model.Ref(tref)

    new_text = text_at_revision(oref.normal(), version, lang, revision)

    tracker.modify_text(request.user.id, oref, version, lang, new_text, type="revert")

    return jsonResponse({"status": "ok"})


@ensure_csrf_cookie
def user_profile(request, username, page=1):
    """
    User's profile page.
    """
    try:
        profile    = UserProfile(slug=username)
    except Exception, e:
        # Couldn't find by slug, try looking up by username (old style urls)
        # If found, redirect to new URL
        # If we no longer want to support the old URLs, we can remove this
        user       = get_object_or_404(User, username=username)
        profile    = UserProfile(id=user.id)

        return redirect("/profile/%s" % profile.slug, permanent=True)


    following      = profile.followed_by(request.user.id) if request.user.is_authenticated() else False

    page_size      = 20
    page           = int(page) if page else 1
    if page > 40:
        generic_response = { "title": "Activity Unavailable", "content": "You have requested a page deep in Sefaria's history.<br><br>For performance reasons, this page is unavailable. If you need access to this information, please <a href='mailto:dev@sefaria.org'>email us</a>." }
        return render_to_response('static/generic.html', generic_response, RequestContext(request))
    
    query          = {"user": profile.id}
    filter_type    = request.GET["type"] if "type" in request.GET else None
    activity, apage= get_maximal_collapsed_activity(query=query, page_size=page_size, page=page, filter_type=filter_type)
    notes, npage   = get_maximal_collapsed_activity(query=query, page_size=page_size, page=page, filter_type="add_note")

    contributed    = activity[0]["date"] if activity else None
    scores         = db.leaders_alltime.find_one({"_id": profile.id})
    score          = int(scores["count"]) if scores else 0
    user_texts     = scores.get("texts", None) if scores else None
    sheets         = db.sheets.find({"owner": profile.id, "status": "public"}, {"id": 1, "datePublished": 1}).sort([["datePublished", -1]])

    next_page      = apage + 1 if apage else None
    next_page      = "/profile/%s/%d" % (username, next_page) if next_page else None

    return render_to_response("profile.html",
                             {
                                'profile': profile,
                                'following': following,
                                'activity': activity,
                                'sheets': sheets,
                                'notes': notes,
                                'joined': profile.date_joined,
                                'contributed': contributed,
                                'score': score,
                                'scores': scores,
                                'user_texts': user_texts,
                                'filter_type': filter_type,
                                'next_page': next_page,
                                "single": False,
                              },
                             RequestContext(request))

@catch_error_as_json
def profile_api(request):
    """
    API for user profiles.
    """
    if not request.user.is_authenticated():
        return jsonResponse({"error": "You must be logged in to update your profile."})

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
            return jsonResponse(profile.to_DICT())
    return jsonResponse({"error": "Unsupported HTTP method."})


def profile_redirect(request, username, page=1):
    """
    Redirect to a user profile
    """
    return redirect("/profile/%s" % username, permanent=True)


@login_required
def my_profile(request):
    """"
    Redirect to the profile of the logged in user.
    """
    return redirect("/profile/%s" % UserProfile(id=request.user.id).slug)


def interrupting_messages_read_api(request, message):
    if not request.user.is_authenticated():
        return jsonResponse({"error": "You must be logged in to use this API"})
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

    return render_to_response('edit_profile.html',
                              {
                              'user': request.user,
                              'profile': profile,
                              'sheets': sheets,
                              },
                              RequestContext(request))


@login_required
@ensure_csrf_cookie
def account_settings(request):
    """
    Page for managing a user's account settings.
    """
    profile = UserProfile(id=request.user.id)
    return render_to_response('account_settings.html',
                             {
                                'user': request.user,
                                'profile': profile,
                              },
                             RequestContext(request))


@ensure_csrf_cookie
def home(request):
    """
    Homepage
    """
    recent = request.COOKIES.get("recentlyViewed", None)
    if recent and not "home" in request.GET and not request.COOKIES.get('s1'):
        # recent = json.loads(urlparse.unquote(recent))
        #return redirect("/%s" % recent[0]["ref"])
        return redirect("/texts")

    if request.flavour == "mobile":
        return s2_page(request, "home")

    today              = date.today()
    daf_today          = sefaria.utils.calendars.daf_yomi(today)
    daf_tomorrow       = sefaria.utils.calendars.daf_yomi(today + timedelta(1))
    parasha            = sefaria.utils.calendars.this_weeks_parasha(datetime.now())
    p929_chapter       = p929.Perek(date = today)
    p929_ref           = "%s %s" % (p929_chapter.book_name, p929_chapter.book_chapter)
    metrics            = db.metrics.find().sort("timestamp", -1).limit(1)[0]

    return render_to_response('static/s2_home.html' if not request.COOKIES.get('s1') else 'static/home.html',
                             {
                              "metrics": metrics,
                              "daf_today": daf_today,
                              "daf_tomorrow": daf_tomorrow,
                              "parasha": parasha,
                              "p929": p929_ref,
                              },
                              RequestContext(request))

@ensure_csrf_cookie
def discussions(request):
    """
    Discussions page. 
    """
    discussions = LayerSet({"owner": request.user.id})
    return render_to_response('discussions.html',
                                {
                                   "discussions": discussions,
                                },
                                RequestContext(request))

@catch_error_as_json
def new_discussion_api(request):
    """
    API for user profiles.
    """
    if not request.user.is_authenticated():
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

        return jsonResponse({"error": "An extremely unlikley event has occurred."})

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
    toc = library.get_toc()
    flat_toc = flatten_toc(toc)

    def toc_sort(a):
        try:
            return flat_toc.index(a["title"])
        except:
            return 9999

    states = sorted(states, key=toc_sort)

    return render_to_response('dashboard.html',
                                {
                                    "states": states,
                                },
                                RequestContext(request))


@ensure_csrf_cookie
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
    next_page         = page + 2 if True or requests.count() == page_size else 0
    featured_query    = {"featured": True, "featured_until": { "$gt": datetime.now() } }
    featured          = TranslationRequestSet(featured_query, sort=[["completed", 1], ["featured_until", 1]])
    today             = datetime.today()
    featured_end      = today + timedelta(7 - ((today.weekday()+1) % 7)) # This coming Sunday
    featured_end      = featured_end.replace(hour=0, minute=0)  # At midnight
    current           = [d.featured_until <= featured_end for d in featured]
    featured_current  = sum(current)
    show_featured     = not completed_only and not page and ((request.user.is_staff and featured.count()) or (featured_current))

    return render_to_response('translation_requests.html',
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
                                },
                                RequestContext(request))


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
    if not request.user.is_authenticated():
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
            return render_to_response('static/generic.html', generic_response, RequestContext(request))

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
            return render_to_response('static/generic.html', generic_response, RequestContext(request))

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
            return render_to_response('static/generic.html', generic_response, RequestContext(request))

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
                return render_to_response('static/generic.html', generic_response, RequestContext(request))

            try:
                assigned_ref = next_untranslated_ref_in_text(text)
            except InputError:
                generic_response["content"] = "All remaining sections in %s are being worked on by other contributors. Work on <a href='/translate/%s'>another text</a> for now." % (text, tref)
                return render_to_response('static/generic.html', generic_response, RequestContext(request))

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
        return render_to_response('static/generic.html', generic_response, RequestContext(request))

    # get the assigned text
    assigned = TextFamily(Ref(assigned_ref), context=0, commentary=False).contents()

    # Put a lock on this assignment
    user = request.user.id if request.user.is_authenticated() else 0
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


    return render_to_response('translate_campaign.html',
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
                                    },
                                    RequestContext(request))

@ensure_csrf_cookie
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


    return render_to_response("contest_splash.html",
                                settings,
                                RequestContext(request))

@ensure_csrf_cookie
def metrics(request):
    """
    Metrics page. Shows graphs of core metrics.
    """
    metrics = db.metrics.find().sort("timestamp", 1)
    metrics_json = dumps(metrics)
    return render_to_response('metrics.html',
                                {
                                    "metrics_json": metrics_json,
                                },
                                RequestContext(request))

@ensure_csrf_cookie
def connectPage(request):
    """
    Connect page - mailing list sign up, social media etc
    """
    # TODO update this for S2
    return redirect(iri_to_uri("/#homeConnect"), permanent=False)



@ensure_csrf_cookie
def digitized_by_sefaria(request):
    """
    Metrics page. Shows graphs of core metrics.
    """
    texts = VersionSet({"digitizedBySefaria": True}, sort=[["title", 1]])
    return render_to_response('static/digitized-by-sefaria.html',
                                {
                                    "texts": texts,
                                },
                                RequestContext(request))


def random_ref():
    """
    Returns a valid random ref within the Sefaria library.
    """

    # refs = library.ref_list()
    # ref  = choice(refs)

    # picking by text first biases towards short texts
    text = choice(VersionSet().distinct("title"))
    try:
        # ref  = choice(VersionStateSet({"title": text}).all_refs()) # check for orphaned texts
        ref = Ref(text).normal()
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
    return render_to_response('random.html', {}, RequestContext(request))


def random_text_api(request):
    """
    Return Texts API data for a random ref.
    """
    response = redirect(iri_to_uri("/api/texts/" + random_ref()) + "?commentary=0", permanent=False)
    return response


@ensure_csrf_cookie
def serve_static(request, page):
    """
    Serve a static page whose template matches the URL
    """
    return render_to_response('static/%s.html' % page, {}, RequestContext(request))


@ensure_csrf_cookie
def explore(request, book1, book2, lang=None):
    """
    Serve the explorer, with the provided deep linked books
    """
    books = []
    for book in [book1, book2]:
        if book:
            books.append(book)

    template_vars =  {"books": json.dumps(books)}
    if lang == "he": # Override language settings if 'he' is in URL
        template_vars["contentLang"] = "hebrew"

    return render_to_response('explore.html', template_vars, RequestContext(request))


def person_page(request, name):
    person = Person().load({"key": name})

    if not person:
        raise Http404
    assert isinstance(person, Person)

    template_vars = person.contents()
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

    return render_to_response('person.html', template_vars, RequestContext(request))


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

    return render_to_response('people.html', template_vars, RequestContext(request))


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
    return render_to_response('talmud_people.html', template_vars, RequestContext(request))


def _get_sheet_tag_garden(tag):
    garden_key = u"sheets.tagged.{}".format(tag)
    g = Garden().load({"key": garden_key})
    if not g:
        g = Garden({"key": garden_key, "title": u"Sources from Sheets Tagged {}".format(tag), "heTitle": u"מקורות מדפים מתויגים:" + u" " + unicode(tag)})
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
    garden_key = u"search.query.{}".format(q)
    g = Garden().load({"key": garden_key})
    if not g:
        g = Garden({"key": garden_key, "title": u"Search: {}".format(q), "heTitle": u"חיפוש:" + u" " + unicode(q)})
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

    return render_to_response('garden.html', template_vars, RequestContext(request))


def visual_garden_page(request, g):
    template_vars = {
        'title': g.title,
        'heTitle': g.heTitle,
        'key': g.key,
        'stopCount': g.stopSet().count(),
        'stops': json.dumps(g.stopData()),
        'places': g.placeSet().asGeoJson(as_string=True),
        'config': json.dumps(getattr(g, "config", {}))
    }

    return render_to_response('visual_garden.html', template_vars, RequestContext(request))
