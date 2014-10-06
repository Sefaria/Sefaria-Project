# noinspection PyUnresolvedReferences
from datetime import datetime, timedelta
from sets import Set
from random import randint

from bson.json_util import dumps
from django.template import RequestContext
from django.shortcuts import render_to_response, get_object_or_404, redirect

# noinspection PyUnresolvedReferences
from django.http import HttpResponse, Http404
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt, csrf_protect
# noinspection PyUnresolvedReferences
import json
# noinspection PyUnresolvedReferences
from django.contrib.auth.models import User

import sefaria.model as model

from sefaria.client.util import jsonResponse
# noinspection PyUnresolvedReferences
from sefaria.model.user_profile import UserProfile
# noinspection PyUnresolvedReferences
from sefaria.texts import get_text, get_book_link_collection, format_note_for_client
# noinspection PyUnresolvedReferences
from sefaria.history import text_history, get_maximal_collapsed_activity, top_contributors, make_leaderboard, make_leaderboard_condition, text_at_revision
# noinspection PyUnresolvedReferences
# from sefaria.utils.util import *
from sefaria.system.decorators import catch_error_as_json, catch_error_as_http
from sefaria.system.exceptions import BookNameError, InputError
from sefaria.workflows import *
from sefaria.reviews import *
from sefaria.summaries import get_toc, flatten_toc
from sefaria.counts import get_percent_available, get_translated_count_by_unit, get_untranslated_count_by_unit, set_counts_flag, get_link_counts
from sefaria.model.notifications import Notification, NotificationSet
from sefaria.model.following import FollowRelationship, FollowersSet, FolloweesSet
from sefaria.model.user_profile import annotate_user_list
from sefaria.utils.users import user_link, user_started_text
from sefaria.model.layer import Layer
from sefaria.sheets import LISTED_SHEETS, get_sheets_for_ref
import sefaria.utils.calendars
import sefaria.tracker as tracker



@ensure_csrf_cookie
def reader(request, tref, lang=None, version=None):
    # Redirect to standard URLs
    # Let unknown refs pass through
    try:
        oref = model.Ref(tref)
        uref = oref.url()
        if uref and tref != uref:
            url = "/" + uref
            if lang and version:
                url += "/%s/%s" % (lang, version)

            response = redirect(url, permanent=True)
            params = request.GET.urlencode()
            response['Location'] += "?%s" % params if params else ""
            return response

        # BANDAID - return the first section only of a spanning ref
        oref = oref.padded_ref()
        if oref.is_spanning():
            first_oref = oref.split_spanning_ref()[0]
            url = "/" + first_oref.url()
            if lang and version:
                url += "/%s/%s" % (lang, version)
            response = redirect(url)
            params = request.GET.urlencode()
            response['Location'] += "?%s" % params if params else ""
            return response

        version = version.replace("_", " ") if version else None

        layer = request.GET.get("layer", None)
        if layer:
            text = get_text(tref, lang=lang, version=version, commentary=False)
            if not "error" in text:
                layer = [format_note_for_client(l) for l in Layer().load({"urlkey": layer}).all(ref=tref)]
                text["layer"]      = layer
                text["commentary"] = []
                text["notes"]      = []
                text["sheets"]     = []
                text["_loadSources"] = True
                hasSidebar = True if len(text["layer"]) else False
        else:
            text = get_text(tref, lang=lang, version=version, commentary=True)
            hasSidebar = True if len(text["commentary"]) else False
            if not "error" in text:
                text["notes"]  = get_notes(oref, uid=request.user.id)
                text["sheets"] = get_sheets_for_ref(tref)
                hasSidebar = True if len(text["notes"]) or len(text["sheets"]) else False
        text["next"] = model.Ref(tref).next_section_ref().normal() if model.Ref(tref).next_section_ref() else None
        text["prev"] = model.Ref(tref).prev_section_ref().normal() if model.Ref(tref).prev_section_ref() else None
    except InputError, e:
        text = {"error": unicode(e)}
        hasSidebar = False

    initJSON = json.dumps(text)

    lines = True if "error" in text or text["type"] not in ('Tanach', 'Talmud') or text["book"] == "Psalms" else False
    email = request.user.email if request.user.is_authenticated() else ""

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

    # Pull language setting from cookie or Accept-Lanugage header
    langMode = request.COOKIES.get('langMode') or request.LANGUAGE_CODE or 'en'
    langMode = 'he' if langMode == 'he-il' else langMode
    # URL parameter trumps cookie
    langMode = request.GET.get("lang", langMode)
    langMode = "bi" if langMode in ("he-en", "en-he") else langMode
    # Don't allow languages other than what we currently handle
    langMode = 'en' if langMode not in ('en', 'he', 'bi') else langMode
    # Substitue language mode if text not available in that language
    if not "error" in text:
        if is_text_empty(text["text"]) and not langMode == "he":
            langMode = "he"
        if is_text_empty(text["he"]) and not langMode == "en":
            langMode = "en"
    langClass = {"en": "english", "he": "hebrew", "bi": "bilingual heLeft"}[langMode]

    return render_to_response('reader.html',
                             {'text': text,
                              'hasSidebar': hasSidebar,
                             'initJSON': initJSON,
                             'zipped_text': zipped_text,
                             'description_text': description_text,
                             'langClass': langClass,
                             'page_title': oref.normal() if "error" not in text else "Unknown Text",
                             'title_variants': "(%s)" % ", ".join(text.get("titleVariants", []) + [text.get("heTitle", "")]),
                             'email': email},
                             RequestContext(request))


@ensure_csrf_cookie
def edit_text(request, ref=None, lang=None, version=None, new_name=None):
    """
    Opens a view directly to adding, editing or translating a given text.
    """
    if ref is not None:
        version = version.replace("_", " ") if version else None
        text = get_text(ref, lang=lang, version=version)
        text["mode"] = request.path.split("/")[1]
        initJSON = json.dumps(text)
    else:
        new_name = new_name.replace("_", " ") if new_name else new_name
        initJSON = json.dumps({"mode": "add new", "title": new_name})

    titles = json.dumps(model.get_text_titles())
    page_title = "%s %s" % (text["mode"].capitalize(), ref) if ref else "Add a New Text"
    email = request.user.email if request.user.is_authenticated() else ""


    return render_to_response('reader.html',
                             {'titles': titles,
                             'initJSON': initJSON,
                             'page_title': page_title,
                             'email': email},
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

@catch_error_as_json
@csrf_exempt
def texts_api(request, tref, lang=None, version=None):
    if request.method == "GET":
        cb         = request.GET.get("callback", None)
        context    = int(request.GET.get("context", 1))
        commentary = bool(int(request.GET.get("commentary", True)))
        version    = version.replace("_", " ") if version else None
        layer      = request.GET.get("layer", None)

        text = get_text(tref, version=version, lang=lang, commentary=commentary, context=context)

        if "error" in text:
            return jsonResponse(text, cb)

        oref = model.Ref(tref)
        text["next"] = oref.next_section_ref().normal() if oref.next_section_ref() else None
        text["prev"] = oref.prev_section_ref().normal() if oref.prev_section_ref() else None
        text["commentary"] = text.get("commentary", [])
        text["notes"]  = get_notes(oref, uid=request.user.id) if int(request.GET.get("notes", 0)) else []
        text["sheets"] = get_sheets_for_ref(tref) if int(request.GET.get("sheets", 0)) else []

        if layer:
            layer = [format_note_for_client(l) for l in Layer().load({"urlkey": layer}).all(ref=tref)]
            text["layer"]        = layer
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
            response = save_text(tref, json.loads(j), apikey["uid"], method="API", count_after=count_after, index_after=index_after)
            return jsonResponse(response)
        else:
            @csrf_protect
            def protected_post(request):
                response = save_text(tref, json.loads(j), request.user.id, count_after=count_after, index_after=index_after)
                return jsonResponse(response)
            return protected_post(request)

    return jsonResponse({"error": "Unsuported HTTP method."})


@catch_error_as_json
def parashat_hashavua_api(request):
    callback = request.GET.get("callback", None)
    p = sefaria.utils.calendars.this_weeks_parasha(datetime.now())
    p["date"] = p["date"].isoformat()
    p.update(get_text(p["ref"]))
    return jsonResponse(p, callback)

@catch_error_as_json
def table_of_contents_api(request):
    return jsonResponse(get_toc())

@catch_error_as_json
def text_titles_api(request):
    return jsonResponse({"books": model.get_text_titles()})


@catch_error_as_json
@csrf_exempt
def index_api(request, title):
    """
    API for manipulating text index records (aka "Text Info")
    """
    if request.method == "GET":
        i = model.get_index(title).contents()
        return jsonResponse(i)

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
            return jsonResponse(func(request.user.id, model.Index, j).contents()
            )
        return protected_index_post(request)

    return jsonResponse({"error": "Unsuported HTTP method."})

@catch_error_as_json
def bare_link_api(request, book, cat):

    if request.method == "GET":
        resp = jsonResponse(get_book_link_collection(book, cat))
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
    API for retrieving the counts document for a given text.
    """
    if request.method == "GET":
        return jsonResponse(model.Ref(title).get_count().contents())

    elif request.method == "POST":
        if not request.user.is_staff:
            return jsonResponse({"error": "Not permitted."})

        if "update" in request.GET:
            flag = request.GET.get("flag", None)
            if not flag:
                return jsonResponse({"error": "'flag' parameter missing."})
            val  = request.GET.get("val", None)
            val = True if val == "true" else False

            set_counts_flag(title, flag, val)

            return jsonResponse({"status": "ok"})

        return jsonResponse({"error": "Not implemented."})


@catch_error_as_json
@csrf_exempt
def links_api(request, link_id_or_ref=None):
    """
    API for textual links.
    Currently also handles post notes.
    """
    #TODO: can we distinguish between a link_id (mongo id) for POSTs and a ref for GETs?
    if request.method == "GET":
        if link_id_or_ref is None:
            return jsonResponse({"error": "Missing text identifier"})
        #The Ref instanciation is just to validate the Ref and let an error bubble up.
        #TODO is there are better way to validate the ref from GET params?
        model.Ref(link_id_or_ref)
        with_text = int(request.GET.get("with_text", 1))
        return jsonResponse(get_links(link_id_or_ref, with_text))

    if request.method == "POST":
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "Missing 'json' parameter in post data."})
        j = json.loads(j)
        if isinstance(j, list):
            func = save_link_batch
        else:
            # use the correct function if params indicate this is a note save
            func = save_note if "type" in j and j["type"] == "note" else save_link

        if not request.user.is_authenticated():
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": "You must be logged in or use an API key to add, edit or delete links."})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            return jsonResponse(func(j, apikey["uid"], method="API"))
        else:
            @csrf_protect
            def protected_link_post(request):
                response = func(j, request.user.id)
                return jsonResponse(response)
            return protected_link_post(request)

    if request.method == "DELETE":
        if not link_id_or_ref:
            return jsonResponse({"error": "No link id given for deletion."})

        return jsonResponse(
            tracker.delete(request.user.id, model.Link, link_id_or_ref)
        )

    return jsonResponse({"error": "Unsuported HTTP method."})


@catch_error_as_json
def notes_api(request, note_id):
    """
    API for user notes.
    Currently only handles deleting. Adding and editing are handled throughout the links API.
    """
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

    return jsonResponse(results)

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

    if request.GET.get("action", None) == "unlock":
        return jsonResponse(set_text_version_status(title, lang, version, status=None))
    else:
        return jsonResponse(set_text_version_status(title, lang, version, status="locked"))

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
                            "count": notifications.count
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
            notification = Notification(_id=id)
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

        Notification(uid=j["recipient"]).make_message(sender_id=request.user.id, message=j["message"]).save()
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

        return jsonResponse(response)

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
    nref = model.Ref(tref).normal()

    version = version.replace("_", " ")
    filter_type = request.GET.get("type", None)
    history = text_history(nref, version, lang, filter_type=filter_type)

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
    tref = model.Ref(tref).normal()

    existing = get_text(tref, commentary=0, version=version, lang=lang)
    if "error" in existing:
        return jsonResponse(existing)

    text = {
        "versionTitle": version,
        "versionSource": existing["versionSource"] if lang == "en" else existing["heVersionSource"],
        "language": lang,
        "text": text_at_revision(tref, version, lang, revision)
    }

    return jsonResponse(save_text(tref, text, request.user.id, type="revert text"))


@ensure_csrf_cookie
def user_profile(request, username, page=1):
    """
    User's profile page.
    """
    try:
        profile    = UserProfile(slug=username)
    except Exception, e:
        print e
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

    # Pull language setting from Accept-Lanugage header
    langClass = 'hebrew' if request.LANGUAGE_CODE in ('he', 'he-il') else 'english'

    return render_to_response('static/splash.html',
                             {
                              "activity": activity,
                              "metrics": metrics,
                              "headline": randint(1,3), #random choice of 3 headlines
                              "daf_today": daf_today,
                              "daf_tomorrow": daf_tomorrow,
                              "parasha": parasha,
                              "langClass": langClass,
                              },
                              RequestContext(request))


@ensure_csrf_cookie
def dashboard(request):
    """
    Dashboard page -- table view of all content
    """
    counts = db.counts.find({"title": {"$exists": 1}},
        {"title": 1, "flags": 1, "linksCount": 1, "percentAvailable": 1})

    toc = get_toc()
    flat_toc = flatten_toc(toc)

    def toc_sort(a):
        try:
            return flat_toc.index(a["title"])
        except:
            return 9999

    counts = sorted(counts, key=toc_sort)

    return render_to_response('dashboard.html',
                                {
                                    "counts": counts,
                                },
                                RequestContext(request))


@ensure_csrf_cookie
def translation_flow(request, tref):
    """
    Assign a user a paritcular bit of text to translate within 'ref',
    either a text title or category.
    """
    tref = tref.replace("_", " ")
    generic_response = { "title": "Help Translate %s" % tref, "content": "" }
    categories = model.get_text_categories()
    next_text = None
    next_section = None

    # expire old locks before checking for a currently unlocked text
    model.expire_locks()

    try:
        oref = model.Ref(tref)
    except BookNameError:
        oref = False
    if oref and len(oref.sections) == 0:
        # tref is an exact text Title

        # normalize URL
        if request.path != "/translate/%s" % oref.url():
            return redirect("/translate/%s" % oref.url(), permanent=True)

        # Check for completion
        if get_percent_available(oref.normal()) == 100:
            generic_response["content"] = "<h3>Sefaria now has a complete translation of %s</h3>But you can still contribute in other ways.</h3> <a href='/contribute'>Learn More.</a>" % tref
            return render_to_response('static/generic.html', generic_response, RequestContext(request))

        if "random" in request.GET:
            # choose a ref from a random section within this text
            skip = int(request.GET.get("skip")) if "skip" in request.GET else None
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

    elif tref in categories:
        # ref is a text Category
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
            text = model.Ref(request.GET["text"]).normal()
            next_text = text
            if get_percent_available(text) == 100:
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

    else:
        # we don't know what this is
        generic_response["content"] = "<b>%s</b> isn't a known text or category.<br>But you can still contribute in other ways.</h3> <a href='/contribute'>Learn More.</a>" % (tref)
        return render_to_response('static/generic.html', generic_response, RequestContext(request))

    # get the assigned text
    assigned = get_text(assigned_ref, context=0, commentary=False)

    # Put a lock on this assignment
    user = request.user.id if request.user.is_authenticated() else 0
    model.set_lock(assigned_ref, "en", "Sefaria Community Translation", user)

    # if the assigned text is actually empty, run this request again
    # but leave the new lock in place to skip over it
    if "he" not in assigned or not len(assigned["he"]):
        return translation_flow(request, tref)

    # get percentage and remaining counts
    # percent   = get_percent_available(assigned["book"])
    translated = get_translated_count_by_unit(assigned["book"], unit=assigned["sectionNames"][-1])
    remaining = get_untranslated_count_by_unit(assigned["book"], unit=assigned["sectionNames"][-1])
    percent = 100 * translated / float(translated + remaining)


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
                                    "random_param": "&skip=%d" % assigned["sections"][0] if request.GET.get("random") else "",
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

    if lang != "he":
        lang = "en"

    return render_to_response('explore.html',
                              {
                                "books": json.dumps(books),
                                "lang": lang
                              },
                              RequestContext(request)
    )
