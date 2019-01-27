# -*- coding: utf-8 -*-
import io
import os
import zipfile
import json
import re
import bleach
from datetime import datetime, timedelta
from urlparse import urlparse
from collections import defaultdict
from random import choice
from webpack_loader import utils as webpack_utils

from django.utils.translation import ugettext as _
from django.conf import settings
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import render, redirect
from django.template.loader import render_to_string
from django.template.response import TemplateResponse
from django.utils.http import is_safe_url
from django.contrib.auth import authenticate
from django.contrib.auth import REDIRECT_FIELD_NAME, login as auth_login, logout as auth_logout
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth.decorators import login_required
from django.contrib.sites.shortcuts import get_current_site
from django.contrib.admin.views.decorators import staff_member_required
from django.views.decorators.debug import sensitive_post_parameters
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect, csrf_exempt

import sefaria.model as model
import sefaria.system.cache as scache
from sefaria.client.util import jsonResponse, subscribe_to_list, send_email
from sefaria.forms import NewUserForm
from sefaria.settings import MAINTENANCE_MESSAGE, USE_VARNISH, MULTISERVER_ENABLED, relative_to_abs_path
from sefaria.model.user_profile import UserProfile
from sefaria.model.group import GroupSet
from sefaria.model.translation_request import count_completed_translation_requests
from sefaria.export import export_all as start_export_all
from sefaria.datatype.jagged_array import JaggedTextArray
# noinspection PyUnresolvedReferences
from sefaria.system.exceptions import InputError
from sefaria.system.database import db
from sefaria.system.decorators import catch_error_as_http
from sefaria.utils.hebrew import is_hebrew, strip_nikkud
from sefaria.utils.util import strip_tags
from sefaria.helper.text import make_versions_csv, get_library_stats, get_core_link_stats, dual_text_diff
from sefaria.clean import remove_old_counts
from sefaria.search import index_sheets_by_timestamp as search_index_sheets_by_timestamp
from sefaria.model import *
from sefaria.system.multiserver.coordinator import server_coordinator

if USE_VARNISH:
    from sefaria.system.varnish.wrapper import invalidate_index, invalidate_title, invalidate_ref, invalidate_counts

import logging
logger = logging.getLogger(__name__)


def register(request):
    if request.user.is_authenticated:
        return redirect("login")

    next = request.GET.get('next', '')

    if request.method == 'POST':
        form = NewUserForm(request.POST)
        if form.is_valid():
            new_user = form.save()
            user = authenticate(email=form.cleaned_data['email'],
                                password=form.cleaned_data['password1'])
            auth_login(request, user)
            p = UserProfile(id=user.id)
            p.assign_slug()
            p.join_invited_groups()
            p.settings["interface_language"] = request.interfaceLang
            p.save()
            if "noredirect" in request.POST:
                return HttpResponse("ok")
            elif "new?assignment=" in request.POST.get("next",""):
                next = request.POST.get("next", "")
                return HttpResponseRedirect(next)
            else:
                next = request.POST.get("next", "/")
                if "?" in next:
                    next += "&welcome=to-sefaria"
                else:
                    next += "?welcome=to-sefaria"
                return HttpResponseRedirect(next)
    else:
        if request.GET.get('educator', ''):
            form = NewUserForm(initial={'subscribe_educator': True})
        else:
            form = NewUserForm()

    return render(request, "registration/register.html", {'form': form, 'next': next})


def maintenance_message(request):
    resp = render(request,"static/maintenance.html",
                                {"message": MAINTENANCE_MESSAGE})
    resp.status_code = 503
    return resp


def accounts(request):
    return render(request,"registration/accounts.html",
                                {"createForm": UserCreationForm(),
                                "loginForm": AuthenticationForm()})


def subscribe(request, email):
    """
    API for subscribg is mailing lists, in `lists` url param.
    Currently active lists are:
    "Announcements_General", "Announcements_General_Hebrew", "Announcements_Edu", "Announcements_Edu_Hebrew"
    """
    lists = request.GET.get("lists", "")
    lists = lists.split("|")
    if len(lists) == 0:
        return jsonResponse({"error": "Please specifiy a list."})
    if subscribe_to_list(lists + ["Newsletter_Sign_Up"], email, direct_sign_up=True):
        return jsonResponse({"status": "ok"})
    else:
        return jsonResponse({"error": _("Sorry, there was an error.")})

def generate_feedback(request):

    data = json.loads(request.POST.get('json', {}))

    fb_type = data.get('type', None)
    refs = data.get('refs', None)
    url = data.get('url', None)
    versions = data.get('currVersions', None)
    uid = data.get('uid', None)
    from_email = data.get('email', None)
    msg = data.get('msg', None)

    if not from_email:
        from_email = model.user_profile.UserProfile(id=uid).email

    if fb_type == "content_issue":
        to_email = "corrections@sefaria.org"
        subject = "Correction from website - " + ' / '.join(refs)
        message_html = msg + "\n\n" + "refs: " + ' / '.join(refs) + "\n" + "versions: " + str(versions) + "\n\n" + "URL: " + url
    else:
        to_email = "hello@sefaria.org"
        subject = "Feedback from website - " + fb_type.replace("_"," ")
        message_html = msg + "\n\n" + "URL: " + url



    try:
        send_email(subject, message_html, from_email, to_email)
        return jsonResponse({"status": "ok"})
    except:
        return jsonResponse({"error": _("Sorry, there was an error.")})



def data_js(request):
    """
    JavaScript populating dynamic data like book lists, toc.
    """
    return render(request, "js/data.js", content_type="text/javascript")


def sefaria_js(request):
    """
    Packaged Sefaria.js.
    """
    data_js = render_to_string("js/data.js",context={}, request=request)
    webpack_files = webpack_utils.get_files('main', config="SEFARIA_JS")
    bundle_path = relative_to_abs_path('..' + webpack_files[0]["url"])
    with open(bundle_path, 'r') as file:
        sefaria_js=file.read()
    attrs = {
        "data_js": data_js,
        "sefaria_js": sefaria_js,
    }

    return render(request,"js/sefaria.js", attrs, content_type= "text/javascript")


def linker_js(request,linker_version=None):
    """
    JavaScript of Linker plugin.
    """
    attrs = {
        "book_titles": json.dumps(model.library.citing_title_list("en")
                      + model.library.citing_title_list("he"))
    }
    linker_link = "js/linker.js" if linker_version is None else "js/linker.v"+linker_version+".js"

    return render(request,linker_link, attrs, content_type= "text/javascript")

def old_linker_js(request):
    """
    JavaScript of Linker plugin.
    """
    attrs = {
        "book_titles": json.dumps(model.library.citing_title_list("en")
                      + model.library.citing_title_list("he"))
    }
    return render(request,"js/linker.v1.js", attrs, content_type= "text/javascript")


def title_regex_api(request, titles):
    if request.method == "GET":
        cb = request.GET.get("callback", None)
        titles = set(titles.split("|"))
        res = {}
        errors = []
        for title in titles:
            lang = "he" if is_hebrew(title) else "en"
            try:
                re_string = model.library.get_regex_string(title, lang, anchored=False, for_js=True)
                res[title] = re_string
            except (AttributeError, AssertionError) as e:
                # There are normal errors here, when a title matches a schema node, the chatter fills up the logs.
                # logger.warning(u"Library._build_ref_from_string() failed to create regex for: {}.  {}".format(title, e))
                errors.append(u"{} : {}".format(title, e))
        if len(errors):
            res["error"] = errors
        resp = jsonResponse(res, cb)
        return resp


def bulktext_api(request, refs):
    """
    Used by the linker.
    :param request:
    :param refs:
    :return:
    """
    if request.method == "GET":
        cb = request.GET.get("callback", None)
        useTextFamily = request.GET.get("useTextFamily", None)
        refs = set(refs.split("|"))
        res = {}
        for tref in refs:
            try:
                oref = model.Ref(tref)
                lang = "he" if is_hebrew(tref) else "en"
                if useTextFamily:
                    text_fam = model.TextFamily(oref, commentary=0, context=0, pad=False)
                    he = text_fam.he
                    en = text_fam.text
                    res[tref] = {
                        'he': he,
                        'en': en,
                        'lang': lang,
                        'ref': oref.normal(),
                        'primary_category': text_fam.contents()['primary_category'],
                        'heRef': oref.he_normal(),
                        'url': oref.url()
                    }
                else:
                    he = model.TextChunk(oref, "he").text
                    en = model.TextChunk(oref, "en").text
                    res[tref] = {
                        'he': he if isinstance(he, basestring) else JaggedTextArray(he).flatten_to_string(),  # these could be flattened on the client, if need be.
                        'en': en if isinstance(en, basestring) else JaggedTextArray(en).flatten_to_string(),
                        'lang': lang,
                        'ref': oref.normal(),
                        'heRef': oref.he_normal(),
                        'url': oref.url()
                    }
            except (InputError, ValueError, AttributeError, KeyError) as e:
                # referer = request.META.get("HTTP_REFERER", "unknown page")
                # This chatter fills up the logs.  todo: put in it's own file
                # logger.warning(u"Linker failed to parse {} from {} : {}".format(tref, referer, e))
                res[tref] = {"error": 1}
        resp = jsonResponse(res, cb)
        return resp


@login_required
def file_upload(request, resize_image=True):
    from PIL import Image
    from tempfile import NamedTemporaryFile
    from sefaria.s3 import HostedFile
    if request.method == "POST":
        MAX_FILE_MB = 2
        MAX_FILE_SIZE = MAX_FILE_MB * 1024 * 1024
        MAX_FILE_DIMENSIONS = (1048, 1048)
        uploaded_file = request.FILES['file']
        if uploaded_file.size > MAX_FILE_SIZE:
            return jsonResponse({"error": "Uploaded files must be smaller than %dMB." % MAX_FILE_MB})
        name, extension = os.path.splitext(uploaded_file.name)
        with NamedTemporaryFile(suffix=extension) as temp_uploaded_file:
            temp_uploaded_file.write(uploaded_file.read())

            with NamedTemporaryFile(suffix=extension) as temp_resized_file:
                image = Image.open(temp_uploaded_file)
                if resize_image:
                    image.thumbnail(MAX_FILE_DIMENSIONS, Image.ANTIALIAS)
                image.save(temp_resized_file, optimize=True, quality=70)

                name, extension = os.path.splitext(temp_resized_file.name)
                hosted_file = HostedFile(filepath=temp_resized_file.name, content_type=uploaded_file.content_type)
                try:
                    url = hosted_file.upload()
                    return jsonResponse({"status": "success", "url": url})
                except:
                    return jsonResponse({"error": "There was an error uploading your file."})
    else:
        return jsonResponse({"error": "Unsupported HTTP method."})


@staff_member_required
def reset_cache(request):
    model.library.rebuild()

    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("library", "rebuild")

    return HttpResponseRedirect("/?m=Cache-Reset")


@staff_member_required
def reset_index_cache_for_text(request, title):

    index = model.library.get_index(title)
    model.library.refresh_index_record_in_cache(index)

    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("library", "refresh_index_record_in_cache", [index.title])
    elif USE_VARNISH:
        invalidate_title(index.title)

    return HttpResponseRedirect("/%s?m=Cache-Reset" % model.Ref(title).url())


"""@staff_member_required
def view_cached_elem(request, title):
    return HttpResponse(get_template_cache('texts_list'), status=200)


@staff_member_required
def del_cached_elem(request, title):
    delete_template_cache('texts_list')
    toc_html = get_template_cache('texts_list')
    return HttpResponse(toc_html, status=200)"""


@staff_member_required
def reset_counts(request, title=None):
    if title:
        try:
            i = model.library.get_index(title)
        except:
            return HttpResponseRedirect("/dashboard?m=Unknown-Book")
        vs = model.VersionState(index=i)
        vs.refresh()

        return HttpResponseRedirect("/%s?m=Counts-Rebuilt" % model.Ref(i.title).url())
    else:
        model.refresh_all_states()

        if MULTISERVER_ENABLED:
            server_coordinator.publish_event("library", "rebuild_toc")

        return HttpResponseRedirect("/?m=Counts-Rebuilt")


@staff_member_required
def delete_orphaned_counts(request):
    remove_old_counts()
    scache.delete_template_cache("texts_dashboard")

    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("scache", "delete_template_cache", ["texts_dashboard"])

    return HttpResponseRedirect("/dashboard?m=Orphaned-counts-deleted")


@staff_member_required
def rebuild_toc(request):
    model.library.rebuild_toc()

    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("library", "rebuild_toc")

    return HttpResponseRedirect("/?m=TOC-Rebuilt")


@staff_member_required
def rebuild_auto_completer(request):
    library.build_full_auto_completer()
    library.build_ref_auto_completer()
    library.build_lexicon_auto_completers()
    library.build_cross_lexicon_auto_completer()

    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("library", "build_full_auto_completer")
        server_coordinator.publish_event("library", "build_ref_auto_completer")
        server_coordinator.publish_event("library", "build_lexicon_auto_completers")
        server_coordinator.publish_event("library", "build_cross_lexicon_auto_completer")

    return HttpResponseRedirect("/?m=auto-completer-Rebuilt")


'''
# No usages found
@staff_member_required
def rebuild_counts_and_toc(request):
    model.refresh_all_states()
    return HttpResponseRedirect("/?m=Counts-&-TOC-Rebuilt")
'''

@staff_member_required
def rebuild_topics(request):
    from sefaria.model.topic import update_topics
    update_topics()

    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("topic", "update_topics")

    return HttpResponseRedirect("/topics?m=topics-rebuilt")


@staff_member_required
def reset_varnish(request, tref):
    if USE_VARNISH:
        oref = model.Ref(tref)
        if oref.is_book_level():
            invalidate_index(oref.index)
            invalidate_counts(oref.index)
        invalidate_ref(oref)
        return HttpResponseRedirect("/?m=Varnish-Reset-For-{}".format(oref.url()))
    return HttpResponseRedirect("/?m=Varnish-Not-Enabled")


@staff_member_required
def reset_ref(request, tref):
    """
    resets cache, versionstate, toc, varnish, & book TOC template
    :param tref:
    :return:
    """
    oref = model.Ref(tref)
    if oref.is_book_level():
        model.library.refresh_index_record_in_cache(oref.index)
        vs = model.VersionState(index=oref.index)
        vs.refresh()
        model.library.update_index_in_toc(oref.index)

        if MULTISERVER_ENABLED:
            server_coordinator.publish_event("library", "refresh_index_record_in_cache", [oref.index.title])
            server_coordinator.publish_event("library", "update_index_in_toc", [oref.index.title])
        elif USE_VARNISH:
            invalidate_title(oref.index.title)

        return HttpResponseRedirect("/{}?m=Reset-Index".format(oref.url()))

    elif USE_VARNISH:
        invalidate_ref(oref)
        return HttpResponseRedirect("/{}?m=Reset-Ref".format(oref.url()))

    else:
        return HttpResponseRedirect("/?m=Nothing-to-Reset")


@staff_member_required
def rebuild_auto_links(request, title):
    from sefaria.helper.link import rebuild_links_for_title as rebuild
    rebuild(title, request.user.id)
    return HttpResponseRedirect("/?m=Automatic-Links-Rebuilt-on-%s" % title)


@staff_member_required
def rebuild_citation_links(request, title):
    from sefaria.helper.link import rebuild_links_from_text as rebuild
    rebuild(title, request.user.id)
    return HttpResponseRedirect("/?m=Citation-Links-Rebuilt-on-%s" % title)


@staff_member_required
def delete_citation_links(request, title):
    from sefaria.helper.link import delete_links_from_text
    delete_links_from_text(title, request.user.id)
    return HttpResponseRedirect("/?m=Citation-Links-Deleted-on-%s" % title)


@staff_member_required
def cache_stats(request):
    import resource
    from sefaria.utils.util import get_size
    from sefaria.model.user_profile import public_user_data_cache
    # from sefaria.sheets import last_updated
    resp = {
        'ref_cache_size': model.Ref.cache_size(),
        # 'ref_cache_bytes': model.Ref.cache_size_bytes(), # This pretty expensive, not sure if it should run on prod.
        'public_user_data_size': len(public_user_data_cache),
        'public_user_data_bytes': get_size(public_user_data_cache),
        # 'sheets_last_updated_size': len(last_updated),
        # 'sheets_last_updated_bytes': get_size(last_updated),
        'memory usage': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    }
    return jsonResponse(resp)


@staff_member_required
def cache_dump(request):
    resp = {
        'ref_cache_dump': model.Ref.cache_dump()
    }
    return jsonResponse(resp)


@staff_member_required
def export_all(request):
    start = datetime.now()
    try:
        start_export_all()
        resp = {"status": "ok"}
    except Exception, e:
        resp = {"error": str(e)}
    resp["time"] = (datetime.now()-start).seconds
    return jsonResponse(resp)


@staff_member_required
def cause_error(request):
    resp = {}
    logger.error("This is a simple error")
    try:
        erorr = excepting
    except Exception as e:
        logger.exception('An Exception has occurred in the code')
    erorr = error
    return jsonResponse(resp)


@staff_member_required
def list_contest_results(request):
    """
    List results for last week's mini contest on translation requests.
    """
    today            = datetime.today()
    end_month        = today.month if today.day >= 28 else today.month - 1
    end_month        = 12 if end_month == 0 else end_month
    contest_end      = today.replace(month=end_month, day=28, hour=0, minute=0)
    start_month      = end_month - 1 if end_month > 1 else 12
    contest_start    = contest_end.replace(month=start_month)
    requests_query   = {"completed": True, "featured": True, "completed_date": { "$gt": contest_start, "$lt": contest_end } }
    requests         = model.TranslationRequestSet(requests_query, sort=[["featured", 1]])
    user_points      = defaultdict(int)
    user_requests    = defaultdict(int)
    total_points     = 0
    total_requests   = len(requests)
    results          = "Contest Results for %s to %s<br>" % (str(contest_start), str(contest_end))
    lottery          = []

    for request in requests:
        points = 5 if getattr(request, "featured", False) else 1
        user_points[request.completer] += points
        user_requests[request.completer] += 1
        total_points += points

    results += "%d participants completed %d requests<br><br>" % (len(user_requests.keys()), total_requests)

    for user in user_points.keys():
        profile = model.user_profile.UserProfile(id=user)
        results += "%s: completed %d requests for %d points (%s)<br>" % (profile.full_name, user_requests[user], user_points[user], profile.email)
        lottery += ([user] * user_points[user])

    if len(lottery):
        winner = choice(lottery)
        winner = model.user_profile.UserProfile(id=winner)

        results += "<br>The winner is: %s (%s)" % (winner.full_name, winner.email)

    return HttpResponse(results)


@staff_member_required
def translation_requests_stats(request):
    return HttpResponse(count_completed_translation_requests().replace("\n", "<br>"))


@staff_member_required
def sheet_stats(request):
    from dateutil.relativedelta import relativedelta
    html  = ""

    html += "Total Sheets: %d\n" % db.sheets.find().count()
    html += "Public Sheets: %d\n" % db.sheets.find({"status": "public"}).count()


    html += "\nUnique Source Sheet creators per month:\n\n"
    start = datetime.today().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    months = 30
    for i in range(months):
        end   = start
        start = end - relativedelta(months=1)
        query = {"dateCreated": {"$gt": start.isoformat(), "$lt": end.isoformat()}}
        n = db.sheets.find(query).distinct("owner")
        html += "%s: %d\n" % (start.strftime("%b %y"), len(n))

    html += "\n\nAll time contributors:\n\n"
    all_sheet_makers = db.sheets.distinct("owner")
    public_sheet_makers = db.sheets.find({"status": "public"}).distinct("owner")
    public_contributors = set(db.history.distinct("user")+public_sheet_makers)
    all_contributors = set(db.history.distinct("user")+all_sheet_makers)

    html += "Public Sheet Makers: %d\n" % len(public_sheet_makers)
    html += "All Sheet Makers: %d\n" % len(all_sheet_makers)
    html += "Public Contributors: %d\n" % len(public_contributors)
    html += "Public Contributors and Source Sheet Makers: %d\n" % len(all_contributors)

    return HttpResponse("<pre>" + html + "<pre>")


@staff_member_required
def untagged_sheets(request):
    html = ""
    page = int(request.GET.get("page", 0))
    page_size = 100
    sheets = db.sheets.find({"status": "public", "tags": []}, {"id": 1, "title": 1}).limit(page_size).skip(page_size*page)

    for sheet in sheets:
        html += "<li><a href='/sheets/%d' target='_blank'>%s</a></li>" % (sheet["id"], strip_tags(sheet["title"]))
    html += u"<br><a href='/admin/untagged-sheets?page=%d'>More ›</a>" % (page + 1)

    return HttpResponse("<html><h1>Untagged Public Sheets</h1><ul>" + html + "</ul></html>")


@staff_member_required
def versions_csv(request):
    return HttpResponse(make_versions_csv(), content_type="text/csv")

@csrf_exempt
def index_sheets_by_timestamp(request):
    import dateutil.parser
    from django.contrib.auth.models import User

    key = request.POST.get("apikey")
    if not key:
        return jsonResponse({"error": "You must be logged in or use an API key to index sheets by timestamp."})
    apikey = db.apikeys.find_one({"key": key})
    if not apikey:
        return jsonResponse({"error": "Unrecognized API key."})
    user = User.objects.get(id=apikey["uid"])
    if not user.is_staff:
        return jsonResponse({"error": "Only Sefaria Moderators can add or edit terms."})

    timestamp = request.POST.get('timestamp')
    try:
        dateutil.parser.parse(timestamp)
    except ValueError:
        return jsonResponse({"error": "Timestamp {} not valid".format(timestamp)})
    response_str = search_index_sheets_by_timestamp(timestamp)
    return jsonResponse({"success": response_str})

def library_stats(request):
    return HttpResponse(get_library_stats(), content_type="text/csv")


def core_link_stats(request):
    return HttpResponse(get_core_link_stats(), content_type="text/csv")


def run_tests(request):
    # This was never fully developed, methinks
    from subprocess import call
    from local_settings import DEBUG
    if not DEBUG:
        return
    call(["/var/bin/run_tests.sh"])


@catch_error_as_http
def text_download_api(request, format, title, lang, versionTitle):

    content = _get_text_version_file(format, title, lang, versionTitle)

    content_types = {
        "json": "application/json; charset=utf-8",
        "csv": "text/csv; charset=utf-8",
        "txt": "text/plain; charset=utf-8",
        "plain.txt": "text/plain; charset=utf-8"
    }
    response = HttpResponse(content, content_type=content_types[format])
    response["Content-Disposition"] = "attachment"
    return response


@staff_member_required
@catch_error_as_http
def bulk_download_versions_api(request):

    format = request.GET.get("format")
    title_pattern = request.GET.get("title_pattern")
    version_title_pattern = request.GET.get("version_title_pattern")
    language = request.GET.get("language")

    error = None
    if not format:
        error = "A value is required for 'format'"
    if not title_pattern and not version_title_pattern:
        error = "A value is required for either 'title_pattern' or 'version_title_pattern'"
    if error:
        return jsonResponse({"error": error})

    query = {}
    if title_pattern:
        query["title"] = {"$regex": title_pattern}
    if version_title_pattern:
        query["versionTitle"] = {"$regex": version_title_pattern}
    if language:
        query["language"] = language

    vs = VersionSet(query)

    if vs.count() == 0:
        return jsonResponse({"error": "No versions found to match query"})

    file_like_object = io.BytesIO()
    with zipfile.ZipFile(file_like_object, "a", zipfile.ZIP_DEFLATED) as zfile:
        for version in vs:
            filebytes = _get_text_version_file(format, version.title, version.language, version.versionTitle)
            name = u'{} - {} - {}.{}'.format(version.title, version.language, version.versionTitle, format).encode('utf-8')
            if isinstance(filebytes, unicode):
                filebytes = filebytes.encode('utf-8')
            zfile.writestr(name, filebytes)

    content = file_like_object.getvalue()
    response = HttpResponse(content, content_type="application/zip")
    filename = u"{}-{}-{}-{}.zip".format(filter(str.isalnum, str(title_pattern)), filter(str.isalnum, str(version_title_pattern)), language, format).encode('utf-8')
    response["Content-Disposition"] = 'attachment; filename="{}"'.format(filename)
    return response


def _get_text_version_file(format, title, lang, versionTitle):
    from sefaria.export import text_is_copyright, make_json, make_text, prepare_merged_text_for_export, prepare_text_for_export, export_merged_csv, export_version_csv

    assert lang in ["en", "he"]
    assert format in ["json", "csv", "txt", "plain.txt"]
    merged = versionTitle == "merged"
    index = library.get_index(title)

    if merged:
        if format == "csv" and merged:
            content = export_merged_csv(index, lang)

        elif format == "json" and merged:
            content = make_json(prepare_merged_text_for_export(title, lang=lang))

        elif format == "txt" and merged:
            content = make_text(prepare_merged_text_for_export(title, lang=lang))

        elif format == "plain.txt" and merged:
            content = make_text(prepare_merged_text_for_export(title, lang=lang), strip_html=True)

    else:
        version_query = {"title": title, "language": lang, "versionTitle": versionTitle}

        if format == "csv":
            version = Version().load(version_query)
            assert version, "Can not find version of {} in {}: {}".format(title, lang, versionTitle)
            assert not version.is_copyrighted(), "Cowardly refusing to export copyrighted text."
            content = export_version_csv(index, [version])
        else:
            version_object = db.texts.find_one(version_query)
            assert version_object, "Can not find version of {} in {}: {}".format(title, lang, versionTitle)
            assert not text_is_copyright(version_object), "Cowardly refusing to export copyrighted text."

            if format == "json":
                content = make_json(prepare_text_for_export(version_object))

            elif format == "txt":
                content = make_text(prepare_text_for_export(version_object))

            elif format == "plain.txt":
                content = make_text(prepare_text_for_export(version_object), strip_html=True)

    return content



@staff_member_required
def text_upload_api(request):
    if request.method != "POST":
        return jsonResponse({"error": "Unsupported Method: {}".format(request.method)})

    from sefaria.export import import_versions_from_stream
    message = ""
    files = request.FILES.getlist("texts[]")
    for f in files:
        try:
            import_versions_from_stream(f, [1], request.user.id)
            message += "Imported: {}.  ".format(f.name)
        except Exception as e:
            return jsonResponse({"error": e.message, "message": message})

    message = "Successfully imported {} versions".format(len(files))
    return jsonResponse({"status": "ok", "message": message})


def compare(request, secRef=None, lang=None, v1=None, v2=None):
    if secRef and Ref.is_ref(secRef):
        secRef = Ref(secRef).first_available_section_ref()
        if not secRef.is_section_level():
            secRef = secRef.section_ref()
        secRef = secRef.normal()
    if v1:
        v1 = v1.replace(u"_", u" ")
    if v2:
        v2 = v2.replace(u"_", u" ")

    return render(request,'compare.html', {"JSON_PROPS": json.dumps({
        'secRef': secRef,
        'v1': v1, 'v2': v2,
        'lang': lang,})})
