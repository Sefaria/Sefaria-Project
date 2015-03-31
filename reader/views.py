# noinspection PyUnresolvedReferences
from datetime import datetime, timedelta
from sets import Set
from random import choice
from pprint import pprint
import json

from bson.json_util import dumps
from django.template import RequestContext
from django.shortcuts import render_to_response, get_object_or_404, redirect
from django.http import Http404
from django.contrib.auth.decorators import login_required
from django.utils.http import urlquote
from django.utils.encoding import iri_to_uri
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt, csrf_protect
from django.contrib.auth.models import User
from sefaria.client.wrapper import format_object_for_client, format_note_object_for_client, get_notes, get_links
from sefaria.system.exceptions import InputError, PartialRefInputError
# noinspection PyUnresolvedReferences
from sefaria.client.util import jsonResponse
from sefaria.history import text_history, get_maximal_collapsed_activity, top_contributors, make_leaderboard, make_leaderboard_condition, text_at_revision
from sefaria.system.decorators import catch_error_as_json, catch_error_as_http
from sefaria.workflows import *
from sefaria.reviews import *
from sefaria.summaries import get_toc, flatten_toc, get_or_make_summary_node
from sefaria.model import *
from sefaria.sheets import LISTED_SHEETS, get_sheets_for_ref
from sefaria.utils.users import user_link, user_started_text
from sefaria.utils.util import list_depth, text_preview
from sefaria.utils.hebrew import hebrew_plural, hebrew_term, encode_hebrew_numeral, encode_hebrew_daf
from sefaria.utils.talmud import section_to_daf, daf_to_section
import sefaria.utils.calendars
import sefaria.tracker as tracker

import logging
logger = logging.getLogger(__name__)


@ensure_csrf_cookie
def reader(request, tref, lang=None, version=None):
    # Redirect to standard URLs
    # Let unknown refs pass through
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
        uref = oref.url()
        if uref and tref != uref:
            reader_redirect(uref, lang, version)

        # Return Text TOC if this is a bare text title
        if (not getattr(oref.index_node, "depth", None)) or (oref.sections == [] and oref.index_node.depth > 1):
            return text_toc(request, oref)

        # BANDAID - for spanning refs, return the first section
        oref = oref.padded_ref()
        if oref.is_spanning():
            first_oref = oref.split_spanning_ref()[0]
            reader_redirect(first_oref.url(), lang, version)

        version = version.replace("_", " ") if version else None

        layer_name = request.GET.get("layer", None)
        if layer_name:
            #text = get_text(tref, lang=lang, version=version, commentary=False)
            text = TextFamily(Ref(tref), lang=lang, version=version, commentary=False, alts=True).contents()
            if not "error" in text:
                layer = Layer().load({"urlkey": layer_name})
                if not layer:
                    raise InputError("Layer not found.")
                layer_content      = [format_note_object_for_client(n) for n in layer.all(tref=tref)]
                text["layer"]      = layer_content
                text["layer_name"] = layer_name
                text["commentary"] = []
                text["notes"]      = []
                text["sheets"]     = []
                text["_loadSources"] = True
                hasSidebar = True if len(text["layer"]) else False
        else:
            text = TextFamily(Ref(tref), lang=lang, version=version, commentary=True, alts=True).contents()
            hasSidebar = True if len(text["commentary"]) else False
            if not "error" in text:
                text["notes"]  = get_notes(oref, uid=request.user.id)
                text["sheets"] = get_sheets_for_ref(tref)
                hasSidebar = True if len(text["notes"]) or len(text["sheets"]) else hasSidebar
        text["next"] = oref.next_section_ref().normal() if oref.next_section_ref() else None
        text["prev"] = oref.prev_section_ref().normal() if oref.prev_section_ref() else None
        text["ref"] = Ref(text["ref"]).normal()

    except PartialRefInputError as e:
        logger.warning(u'{}'.format(e))
        matched_ref = Ref(e.matched_part)
        reader_redirect(matched_ref.url(), lang, version)

    except InputError, e:
        logger.exception(u'{}'.format(e))
        text = {"error": unicode(e)}
        hasSidebar = False

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
    lines       = request.GET.get("layout", None) or "lines" if "error" in text or text["type"] not in ('Tanach', 'Talmud') or text["book"] == "Psalms" else "block"
    layout      = request.GET.get("layout") if request.GET.get("layout") in ("heLeft", "heRight") else "heLeft"
    sidebarLang = request.GET.get('sidebarLang', None) or request.COOKIES.get('sidebarLang', "all")
    sidebarLang = {"all": "sidebarAll", "he": "sidebarHebrew", "en": "sidebarEnglish"}.get(sidebarLang, "sidebarAll");

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


@catch_error_as_http
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
                initJSON = json.dumps(text)
        except:
            index = get_index(ref)
            if index: # a commentator titlein
                ref = None
                initJSON = json.dumps({"mode": "add new", "newTitle": index.contents()['title']})
    else:
        initJSON = json.dumps({"mode": "add new"})

    titles = json.dumps(model.library.full_title_list())
    page_title = "%s %s" % (mode, ref) if ref else "Add a New Text"

    return render_to_response('reader.html',
                             {'titles': titles,
                             'initJSON': initJSON,
                             'page_title': page_title,
                             },
                             RequestContext(request))

@catch_error_as_http
@ensure_csrf_cookie
def edit_text_info(request, title=None, new_title=None):
    """
    Opens the Edit Text Info page.
    """
    if title:
        # Edit Existing
        title = title.replace("_", " ")
        i = get_index(title)
        indexJSON = json.dumps(i.contents(v2=True) if "toc" in request.GET else i.contents())
        versions = VersionSet({"title": title})
        text_exists = versions.count() > 0
        new = False
    elif new_title:
        # Add New
        new_title = new_title.replace("_", " ")
        try: # Redirect to edit path if this title already exists
            i = get_index(new_title)
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


@ensure_csrf_cookie
def text_toc(request, oref):
    """
    Page representing a single text, showing it's table of contents.
    """
    index         = oref.index
    req_node      = oref.index_node
    title         = index.title
    heTitle       = index.get_title(lang='he')
    state         = StateNode(title)
    versions      = VersionSet({"title": title}, sort=[["language", -1]])
    cats          = index.categories[:] # Make a list of categories which will let us pull a commentary node from TOC
    cats.insert(1, "Commentary")
    cats.append(index.title)
    toc           = get_toc()
    commentaries  = get_or_make_summary_node(toc, cats)

    def make_complex_toc_html(index):

        def node_line(node, depth, **kwargs):
            if depth == 0:
                return ""
            linked = "linked" if node.is_leaf() and node.depth == 1 else ""
            url = "/" + node.ref().url()
            en_icon = '<i class="schema-node-control fa ' + ('fa-angle-right' if linked else 'fa-angle-down') + '"></i>'
            he_icon = '<i class="schema-node-control fa ' + ('fa-angle-left' if linked else 'fa-angle-down') + '"></i>'
            html = '<a href="' + urlquote(url) + '"' if linked else "<div "
            html += ' class="schema-node-toc depth' + str(depth) + ' ' + linked + '">'
            html += '<span class="schema-node-title">'
            html +=    '<span class="en">' + node.primary_title() + en_icon + '</span>'
            html +=    '<span class="he">' + node.primary_title(lang='he') + he_icon + '</span>'
            html += '</span>'
            if node.is_leaf():
                focused = node is req_node
                html += '<div class="schema-node-contents ' + ('open' if focused else 'closed') + '">'
                node_state = StateNode(snode=node)
                #Todo, handle Talmud and other address types, as well as commentary
                zoom = 0 if node.depth == 1 else 1
                zoom = int(request.GET.get("zoom", zoom))
                he_counts, en_counts = node_state.var("he", "availableTexts"), node_state.var("en", "availableTexts")
                content = make_toc_html(he_counts, en_counts, node.sectionNames, node.full_title(), talmud=False, zoom=zoom)
                content = content or "<div class='emptyMessage'>No text here.</div>"
                html += content + '</div>'
            html += "</a>" if linked else "</div>"
            return html

        html = index.nodes.traverse_to_string(node_line)
        return html

    def make_toc_html(he_toc, en_toc, labels, ref, talmud=False, zoom=1):
        """
        Returns HTML corresponding to jagged count arrays he_toc and en_toc.
        Runs recursively.
        :param he_toc - jagged int array of available counts in hebrew
        :param en_toc - jagged int array of available counts in english
        :param labels - list of section names for levels corresponding to toc
        :param ref - text to prepend to final links. Starts with text title, recursively adding sections.
        :param talmud = whether to create final refs with daf numbers
        :param zoom - sets how many levels of final depth to summarize 
        (e.g., 1 will hide verses and only show chapter level)
        """
        he_toc = [] if isinstance(he_toc, int) else he_toc
        en_toc = [] if isinstance(en_toc, int) else en_toc
        assert(len(he_toc) == len(en_toc))
        length = len(he_toc)
        assert(list_depth(he_toc, deep=True) == list_depth(en_toc, deep=True))
        depth = list_depth(he_toc, deep=True)

        html = ""
        if depth == zoom + 1:
            # We're at the terminal level, list sections links
            for i in range(length):
                klass = "he%s en%s" %(available_class(he_toc[i]), available_class(en_toc[i]))
                if klass == "heNone enNone":
                    continue
                en_section   = section_to_daf(i+1) if talmud else str(i+1)
                he_section   = encode_hebrew_daf(en_section) if talmud else encode_hebrew_numeral(int(en_section), punctuation=False)
                section_html = "<span class='en'>%s</span><span class='he'>%s</span>" % (en_section, he_section)
                path = "%s.%s" % (ref, en_section)
                if zoom > 1:  # Make links point to first available content
                    prev_section = section_to_daf(i) if talmud else str(i)
                    path = Ref(ref + "." + prev_section).next_section_ref().url()
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
                section = section_to_daf(i + 1) if talmud else str(i + 1)
                # Talmud is set to false because we only ever use Talmud numbering at top (daf) level
                section_html = make_toc_html(he_toc[i], en_toc[i], labels[1:], ref + "." + section, talmud=False, zoom=zoom)
                if section_html:
                    he_section = encode_hebrew_daf(section) if talmud else encode_hebrew_numeral(int(section), punctuation=False)
                    html += "<div class='tocSection'>"
                    html += "<div class='sectionName'>"
                    html += "<span class='en'>" + labels[0] + " " + section + "</span>"
                    html += "<span class='he'>" + hebrew_term(labels[0]) + " " + he_section + "</span>"
                    html += "</div>" + section_html + "</div>"

        html = "<div class='tocLevel'>" + html + "</div>" if html else ""
        return html

    def available_class(toc):
        """
        Returns the string of a class name in ("All", "Some", "None") 
        according to how much content is available in toc, 
        which may be either a list of ints or an int representing available counts.
        """
        if isinstance(toc, int):
            return "All" if toc else "None"
        else:
            counts = set([available_class(x) for x in toc])
            if counts == set(["All"]):
                return "All"
            elif "Some" in counts or counts == set(["All", "None"]):
                return "Some"
            else:
                return "None"

    if index.is_complex():
        toc_html = make_complex_toc_html(index)
        count_strings = False
        complex = True
        zoom = False  # placeholder - zoom isn't used in the template for complex texts

    else: # simple text
        complex = False
        talmud = Ref(index.title).is_talmud()
        zoom = 0 if index.nodes.depth == 1 else 2 if "Commentary" in index.categories else 1
        zoom = int(request.GET.get("zoom", zoom))
        he_counts, en_counts = state.var("he", "availableTexts"), state.var("en", "availableTexts")
        toc_html = make_toc_html(he_counts, en_counts, index.nodes.sectionNames, title, talmud=talmud, zoom=zoom)

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

    return render_to_response('text_toc.html',
                             {
                             "index":         index.contents(v2 = True),
                             "versions":      versions,
                             "commentaries":  commentaries,
                             "heComplete":    state.get_flag("heComplete"),
                             "enComplete":    state.get_flag("enComplete"),
                             "count_strings": count_strings,
                             "zoom":          zoom,
                             "toc_html":      toc_html,
                             "complex":       complex,
                             },
                             RequestContext(request))


@ensure_csrf_cookie
def texts_list(request):
    return render_to_response('texts.html',
                             {},
                             RequestContext(request))

@ensure_csrf_cookie
def search(request):
    return render_to_response('search.html',
                             {},
                             RequestContext(request))


#todo: is this used elsewhere? move it?
def count_and_index(c_oref, c_lang, vtitle, to_count=1, to_index=1):
    # count available segments of text
    if to_count:
        summaries.update_summaries_on_change(c_oref.book)

    from sefaria.settings import SEARCH_INDEX_ON_SAVE
    if SEARCH_INDEX_ON_SAVE and to_index:
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
        cb         = request.GET.get("callback", None)
        context    = int(request.GET.get("context", 1))
        commentary = bool(int(request.GET.get("commentary", True)))
        pad        = bool(int(request.GET.get("pad", 1)))
        version    = version.replace("_", " ") if version else None
        layer_name = request.GET.get("layer", None)
        alts       = bool(int(request.GET.get("alts", True)))

        #text = get_text(tref, version=version, lang=lang, commentary=commentary, context=context, pad=pad)
        text = TextFamily(oref, version=version, lang=lang, commentary=commentary, context=context, pad=pad, alts=alts).contents()

        # Use a padded ref for calculating next and prev
        # TODO: what if pad is false and the ref is of an entire book?
        # Should next_section_ref return None in that case?
        oref               = oref.padded_ref() if pad else oref
        text["next"]       = oref.next_section_ref().normal() if oref.next_section_ref() else None
        text["prev"]       = oref.prev_section_ref().normal() if oref.prev_section_ref() else None
        text["commentary"] = text.get("commentary", [])
        text["notes"]      = get_notes(oref, uid=request.user.id) if int(request.GET.get("notes", 0)) else []
        text["sheets"]     = get_sheets_for_ref(tref) if int(request.GET.get("sheets", 0)) else []

        if layer_name:
            layer = Layer().load({"urlkey": layer_name})
            if not layer:
                raise InputError("Layer not found.")
            layer_content        = [format_note_object_for_client(n) for n in layer.all(tref=tref)]
            text["layer"]        = layer_content
            text["layer_name"]   = layer_name
            text["_loadSources"] = True
        else:
            text["layer"] = []

        return jsonResponse(text, cb)

    if request.method == "POST":
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})

        # Parameters to suppress some costly operations after save
        count_after = int(request.GET.get("count_after", 1))
        index_after = int(request.GET.get("index_after", 1))

        if not request.user.is_authenticated():
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to save texts."})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            t = json.loads(j)
            chunk = tracker.modify_text(apikey["uid"], oref, t["versionTitle"], t["language"], t["text"], t["versionSource"], method="API")
            count_and_index(oref, chunk.lang, chunk.vtitle, count_after, index_after)
            return jsonResponse({"status": "ok"})
        else:
            @csrf_protect
            def protected_post(request):
                t = json.loads(j)
                chunk = tracker.modify_text(request.user.id, oref, t["versionTitle"], t["language"], t["text"], t["versionSource"])
                count_and_index(oref, chunk.lang, chunk.vtitle, count_after, index_after)
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
    return jsonResponse(get_toc(), callback=request.GET.get("callback", None))


@catch_error_as_json
def text_titles_api(request):
    return jsonResponse({"books": model.library.full_title_list(with_commentary=True)}, callback=request.GET.get("callback", None))


@catch_error_as_json
@csrf_exempt
def index_node_api(request, title):
    pass

@catch_error_as_json
@csrf_exempt
def index_api(request, title):
    """
    API for manipulating text index records (aka "Text Info")
    """
    if request.method == "GET":
        try:
            i = model.get_index(title).contents()
        except InputError:
            i = library.get_schema_node(title).as_index_contents()
        return jsonResponse(i, callback=request.GET.get("callback", None))

    if request.method == "POST":
        # use the update function if update is in the params
        func = tracker.update if request.GET.get("update", False) else tracker.add
        j = json.loads(request.POST.get("json"))
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})
        j["title"] = title.replace("_", " ")
        if not request.user.is_authenticated():
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to save texts."})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            return jsonResponse(func(apikey["uid"], model.Index, j, method="API").contents())
        elif j.get("oldTitle"):
            if not request.user.is_staff and not user_started_text(request.user.id, j["oldTitle"]):
                return jsonResponse({"error": "Title of '{}' is protected from change.<br/><br/>See a mistake?<br/>Email hello@sefaria.org.".format(j["oldTitle"])})
        @csrf_protect
        def protected_index_post(request):
            return jsonResponse(
                func(request.user.id, model.Index, j).contents()
            )
        return protected_index_post(request)

    if request.method == "DELETE":
        if not request.user.is_staff:
            return jsonResponse({"error": "Only moderators can delete texts indices."})

        title = title.replace("_", " ")

        i = get_index(title)

        i.delete()

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

    if not oref.index_node.has_children():
        text = TextFamily(oref, pad=False, commentary=False)

        if oref.index_node.depth == 1:
            # Give deeper previews for texts with depth 1 (boring to look at otherwise)
            text.text, text.he = [[i] for i in text.text], [[i] for i in text.he]
        preview = text_preview(text.text, text.he) if (text.text or text.he) else []
        response['preview'] = preview if isinstance(preview, list) else [preview]

    return jsonResponse(response, callback=request.GET.get("callback", None))


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
                res.append(post_single_link(request, i))
            return jsonResponse(res)

        else:
            return jsonResponse(post_single_link(request, j))

    if request.method == "DELETE":
        if not link_id_or_ref:
            return jsonResponse({"error": "No link id given for deletion."})

        return jsonResponse(
            tracker.delete(request.user.id, model.Link, link_id_or_ref)
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
        response = format_object_for_client(
            func(apikey["uid"], model.Link, link, method="API")
        )
    else:
        @csrf_protect
        def protected_link_post(req):
            resp = format_object_for_client(
                func(req.user.id, model.Link, link)
            )
            return resp
        response = protected_link_post(request)
    return response

@catch_error_as_json
@csrf_exempt
def notes_api(request, note_id):
    """
    API for user notes.
    Currently only handles deleting. Adding and editing are handled throughout the links API.
    """
    if request.method == "POST":
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})
        note = json.loads(j)
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
            tracker.delete(request.user.id, model.Note, note_id)
        )

    return jsonResponse({"error": "Unsuported HTTP method."})

@catch_error_as_json
def versions_api(request, tref):
    """
    API for retrieving available text versions list of a ref.
    """
    oref = model.Ref(tref)
    versions = model.VersionSet({"title": oref.book})
    results = []
    for v in versions:
        results.append({
            "title": v.versionTitle,
            "source": v.versionSource,
            "langauge": v.language
        })

    return jsonResponse(results, callback=request.GET.get("callback", None))

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

        return jsonResponse({"status": "ok"})

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

@catch_error_as_http
@ensure_csrf_cookie
def segment_history(request, tref, lang, version):
    """
    View revision history for the text segment named by ref / lang / version.
    """
    oref = model.Ref(tref)
    nref = oref.normal()

    version = version.replace("_", " ")
    filter_type = request.GET.get("type", None)
    history = text_history(oref, version, lang, filter_type=filter_type)

    email = request.user.email if request.user.is_authenticated() else False
    return render_to_response('activity.html',
                             {'activity': history,
                               "single": True,
                               "ref": nref,
                               "lang": lang,
                               "version": version,
                               'email': email,
                               'filter_type': filter_type,
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
    query          = {"user": profile.id}
    filter_type    = request.GET["type"] if "type" in request.GET else None
    activity, apage= get_maximal_collapsed_activity(query=query, page_size=page_size, page=page, filter_type=filter_type)
    notes, npage   = get_maximal_collapsed_activity(query=query, page_size=page_size, page=page, filter_type="add_note")

    contributed    = activity[0]["date"] if activity else None
    scores         = db.leaders_alltime.find_one({"_id": profile.id})
    score          = int(scores["count"]) if scores else 0
    user_texts     = scores.get("texts", None) if scores else None
    sheets         = db.sheets.find({"owner": profile.id, "status": {"$in": LISTED_SHEETS }}, {"id": 1, "datePublished": 1}).sort([["datePublished", -1]])

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


@login_required
@ensure_csrf_cookie
def edit_profile(request):
    """
    Page for managing a user's account settings.
    """
    profile = UserProfile(id=request.user.id)
    sheets  = db.sheets.find({"owner": profile.id, "status": {"$in": LISTED_SHEETS }}, {"id": 1, "datePublished": 1}).sort([["datePublished", -1]])

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
def splash(request):
    """
    Homepage a.k.a. Splash page.
    """
    daf_today          = sefaria.utils.calendars.daf_yomi(datetime.now())
    daf_tomorrow       = sefaria.utils.calendars.daf_yomi(datetime.now() + timedelta(1))
    parasha            = sefaria.utils.calendars.this_weeks_parasha(datetime.now())
    metrics            = db.metrics.find().sort("timestamp", -1).limit(1)[0]
    activity, page     = get_maximal_collapsed_activity(query={}, page_size=5, page=1)

    return render_to_response('static/splash.html',
                             {
                              "activity": activity,
                              "metrics": metrics,
                              "daf_today": daf_today,
                              "daf_tomorrow": daf_tomorrow,
                              "parasha": parasha,
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


@catch_error_as_http
@ensure_csrf_cookie
def dashboard(request):
    """
    Dashboard page -- table view of all content
    """
    #counts = db.counts.find({"title": {"$exists": 1}},
    #    {"title": 1, "flags": 1, "linksCount": 1, "percentAvailable": 1})

    states = VersionStateSet(
        {},
        proj={"title": 1, "flags": 1, "linksCount": 1, "content._en.percentAvailable": 1, "content._he.percentAvailable": 1}
    ).array()
    toc = get_toc()
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


@catch_error_as_http
@ensure_csrf_cookie
def translation_requests(request, completed=False):
    """
    Page listing all outstnading translation requests.
    """
    page           = int(request.GET.get("page", 1)) - 1
    page_size      = 100
    query          = {"completed": False, "section_level": False} if not completed else {"completed": True}
    requests       = TranslationRequestSet(query, limit=page_size, page=page, sort=[["request_count", -1]])
    request_count  = TranslationRequestSet({"completed": False, "section_level": False}).count()
    complete_count = TranslationRequestSet({"completed": True}).count()
    next_page     = page + 2 if True or requests.count() == page_size else 0

    return render_to_response('translation_requests.html',
                                {
                                    "requests": requests,
                                    "request_count": request_count,
                                    "complete_count": complete_count,
                                    "next_page": next_page,
                                    "page_offset": page * page_size
                                },
                                RequestContext(request))


def completed_translation_requests(request):
    """
    Wrapper for listing completed translations requests.
    """
    return translation_requests(request, completed=True)

def translation_request_api(request, tref):
    """
    API for requesting a text segment for translation.
    """
    if not request.user.is_authenticated():
        return jsonResponse({"error": "You must be logged in to request a translation."})

    oref = Ref(tref)
    ref = oref.normal()
    if oref.is_text_translated():
        return jsonResponse({"error": "Sefaria already has a transltion for %s." % ref})
    if ("unrequest" in request.POST):
        TranslationRequest.remove_request(ref, request.user.id)
        return jsonResponse({"status": "ok"})
    else: 
        tr = TranslationRequest.make_request(ref, request.user.id)
        return jsonResponse(tr.contents())


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
