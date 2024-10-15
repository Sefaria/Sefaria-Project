# -*- coding: utf-8 -*-
import json
import httplib2
from urllib3.exceptions import NewConnectionError
from urllib.parse import unquote
from elasticsearch.exceptions import AuthorizationException
from datetime import datetime
from io import StringIO, BytesIO
from django.contrib.admin.views.decorators import staff_member_required

import structlog

from sefaria.app_analytic import track_page_to_mp, add_sheet_data

logger = structlog.get_logger(__name__)

from django.template.loader import render_to_string
from django.shortcuts import render, redirect
from django.http import Http404

from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt, csrf_protect
from django.contrib.auth.decorators import login_required

# noinspection PyUnresolvedReferences
from django.contrib.auth.models import User
from rest_framework.decorators import api_view

from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from sefaria.google_storage_manager import GoogleStorageManager

from sefaria.client.util import jsonResponse, HttpResponse
from sefaria.model import *
from sefaria.sheets import *
from sefaria.model.user_profile import *
from sefaria.model.notification import process_sheet_deletion_in_notifications
from sefaria.model.collection import Collection, CollectionSet, process_sheet_deletion_in_collections
from sefaria.system.decorators import catch_error_as_json
from sefaria.utils.util import strip_tags

from reader.views import render_template, catchall
from sefaria.sheets import clean_source, bleach_text
from bs4 import BeautifulSoup

# sefaria.model.dependencies makes sure that model listeners are loaded.
# noinspection PyUnresolvedReferences
import sefaria.model.dependencies

from sefaria.gauth.decorators import gauth_required


def annotate_user_links(sources):
    """
    Search a sheet for any addedBy fields (containg a UID) and add corresponding user links.
    """
    for source in sources:
        if "addedBy" in source:
            source["userLink"] = user_link(source["addedBy"])
        if "subsources" in source:
            source["subsources"] = annotate_user_links(source["subsources"])

    return sources


@login_required
@ensure_csrf_cookie
def new_sheet(request):
	profile = UserProfile(id=request.user.id)
    #if getattr(profile, "uses_new_editor", False):
	if True:
		sheet = {
				'status': 'unlisted',
				'title': '',
				'sources': [],
				'nextNode': 1,
				'options': {
					'layout':    "stacked",
					'boxed':  0,
					'language':    "bilingual",
					'numbered':    0,
					'assignable':    0,
					'divineNames':    "noSub",
					'collaboration':    "none",
					'highlightMode':    0,
					'langLayout':    "heRight",
					'bsd':    0,
				}
		}

		responseSheet = save_sheet(sheet, request.user.id)
		return catchall(request, str(responseSheet["id"]), True)

	"""
	View an new, empty source sheet.
	"""
	if "assignment" in request.GET:
		sheet_id  = int(request.GET["assignment"])

		query = { "owner": request.user.id or -1, "assignment_id": sheet_id }
		existingAssignment = db.sheets.find_one(query) or []
		if "id" in existingAssignment:
			return view_sheet(request,str(existingAssignment["id"]),True)

		if "assignable" in db.sheets.find_one({"id": sheet_id})["options"]:
			if db.sheets.find_one({"id": sheet_id})["options"]["assignable"] == 1:
				return assigned_sheet(request, sheet_id)

	query         = {"owner": request.user.id or -1 }
	hide_video    = db.sheets.count_documents(query) > 2

	return render_template(request,'sheets.html', None, {
        "can_edit": True,
        "new_sheet": True,
        "is_owner": True,
        "hide_video": hide_video,
        "current_url": request.get_full_path,
    })


def can_edit(user, sheet):
    """
    Returns True if user can edit sheet.
    """
    if sheet["owner"] == user.id:
        return True
    if "collaboration" not in sheet["options"]:
        return False
    if sheet["options"]["collaboration"] == "anyone-can-edit":
        return True

    return False


def can_add(user, sheet):
    """
    Returns True if user has adding persmission on sheet.
    Returns False if user has the higher permission "can_edit"
    """
    if not user.is_authenticated:
        return False
    if can_edit(user, sheet):
        return False
    if "assigner_id" in sheet:
        if sheet["assigner_id"] == user.id:
            return True
    if "collaboration" not in sheet["options"]:
        return False
    if sheet["options"]["collaboration"] == "anyone-can-add":
        return True

    return False


def get_user_collections(uid, private=True):
    """
    Returns a list of Collections that user belongs to.
    """
    if not uid:
        return None
    collections = CollectionSet().for_user(uid, private=private)
    collections = [collection.listing_contents(uid) for collection in collections]
    return collections


def get_user_collections_for_sheet(uid, sheet_id):
    """
    Returns a list of `uid`'s collections that `sheet_id` is included in.
    """
    collections = CollectionSet({"$or": [{"admins": uid, "sheets": sheet_id}, {"members": uid, "sheets": sheet_id}]})
    collections = [collection.listing_contents(uid) for collection in collections]
    return collections


def make_sheet_class_string(sheet):
    """
    Returns a string of class names corresponding to the options of sheet.
    """
    o = sheet["options"]
    classes = []
    classes.append(o.get("language", "bilingual"))
    classes.append(o.get("layout", "sideBySide"))
    classes.append(o.get("langLayout", "heRight"))

    if o.get("numbered", False):  classes.append("numbered")
    if o.get("boxed", False):     classes.append("boxed")

    if sheet["status"] == "public":
        classes.append("public")

    return " ".join(classes)


@ensure_csrf_cookie
def view_sheet(request, sheet_id, editorMode=False):
    """
    View the sheet with sheet_id.
    """
    track_page_to_mp(request=request, page_title='Sheets', text_ref=sheet_id)
    editor = request.GET.get('editor', '0')
    embed = request.GET.get('embed', '0')

    if editor != '1' and embed != '1' and editorMode is False:
        return catchall(request, sheet_id, True)

    sheet_id = int(sheet_id)
    sheet = get_sheet(sheet_id)

    if "error" in sheet and sheet["error"] != "Sheet updated.":
        return HttpResponse(sheet["error"])

    sheet["sources"] = annotate_user_links(sheet["sources"])

    # Count this as a view
    db.sheets.update({"id": sheet_id}, {"$inc": {"views": 1}})

    try:
        owner = User.objects.get(id=sheet["owner"])
        author = owner.first_name + " " + owner.last_name
    except User.DoesNotExist:
        author = "Someone Mysterious"

    sheet_class = make_sheet_class_string(sheet)
    sheet_collections = get_user_collections_for_sheet(request.user.id, sheet_id) if sheet[
                                                                                         "owner"] == request.user.id else None
    displayed_collection = Collection().load({"slug": sheet["displayedCollection"]}) if sheet.get("displayedCollection",
                                                                                                  None) else None
    embed_flag = "embed" in request.GET
    likes = sheet.get("likes", [])
    like_count = len(likes)
    if request.user.is_authenticated:
        can_edit_flag = can_edit(request.user, sheet)
        can_add_flag = can_add(request.user, sheet)
        viewer_is_liker = request.user.id in likes
    else:
        can_edit_flag = False
        can_add_flag = False
        viewer_is_liker = False

    canonical_url = request.get_full_path().replace("?embed=1", "").replace("&embed=1", "")
    add_sheet_data(request=request, title=sheet["title"], action_type='View', owner=sheet["owner"])
    return render_template(request, 'sheets.html', None, {
        "sheetJSON": json.dumps(sheet),
        "sheet": sheet,
        "sheet_class": sheet_class,
        "can_edit": can_edit_flag,
        "can_add": can_add_flag,
        "title": sheet["title"],
        "author": author,
        "is_owner": request.user.id == sheet["owner"],
        "sheet_collections": sheet_collections,
        "displayed_collection": displayed_collection,
        "like_count": like_count,
        "viewer_is_liker": viewer_is_liker,
        "current_url": request.get_full_path,
        "canonical_url": canonical_url,
        "assignments_from_sheet": assignments_from_sheet(sheet_id),
    })


def assignments_from_sheet(sheet_id):
    try:
        query = {"assignment_id": int(sheet_id)}
        return db.sheets.find(query)
    except:
        return None


def view_visual_sheet(request, sheet_id):
    """
    View the sheet with sheet_id.
    """
    sheet = get_sheet(sheet_id)
    if "error" in sheet:
        return HttpResponse(sheet["error"])

    sheet["sources"] = annotate_user_links(sheet["sources"])

    # Count this as a view
    db.sheets.update({"id": int(sheet_id)}, {"$inc": {"views": 1}})

    try:
        owner = User.objects.get(id=sheet["owner"])
        author = owner.first_name + " " + owner.last_name
    except User.DoesNotExist:
        author = "Someone Mysterious"

    sheet_class = make_sheet_class_string(sheet)
    can_edit_flag = can_edit(request.user, sheet)
    can_add_flag = can_add(request.user, sheet)

    return render_template(request, 'sheets_visual.html', None, {
        "sheetJSON": json.dumps(sheet),
        "sheet": sheet,
        "sheet_class": sheet_class,
        "can_edit": can_edit_flag,
        "can_add": can_add_flag,
        "title": sheet["title"],
        "author": author,
        "is_owner": request.user.id == sheet["owner"],
        "is_public": sheet["status"] == "public",
        "current_url": request.get_full_path,
    })


@ensure_csrf_cookie
def assigned_sheet(request, assignment_id):
    """
    A new sheet prefilled with an assignment.
    """
    sheet = get_sheet(assignment_id)
    if "error" in sheet:
        return HttpResponse(sheet["error"])

    sheet["sources"] = annotate_user_links(sheet["sources"])

    # Remove keys from we don't want transferred
    for key in ("id", "like", "views", "displayedCollection"):
        if key in sheet:
            del sheet[key]

    assigner = UserProfile(id=sheet["owner"])
    assigner_id = assigner.id
    sheet_class = make_sheet_class_string(sheet)
    can_edit_flag = True
    can_add_flag = can_add(request.user, sheet)
    embed_flag = "embed" in request.GET
    likes = sheet.get("likes", [])
    like_count = len(likes)
    viewer_is_liker = request.user.id in likes

    return render_template(request, 'sheets.html', None, {
        "sheetJSON": json.dumps(sheet),
        "sheet": sheet,
        "assignment_id": assignment_id,
        "assigner_id": assigner_id,
        "new_sheet": True,
        "sheet_class": sheet_class,
        "can_edit": can_edit_flag,
        "can_add": can_add_flag,
        "title": sheet["title"],
        "is_owner": True,
        "is_public": sheet["status"] == "public",
        "sheet_collections": [],
        "displayed_collection": None,
        "like_count": like_count,
        "viewer_is_liker": viewer_is_liker,
        "current_url": request.get_full_path,
    })


@csrf_exempt
def delete_sheet_api(request, sheet_id):
    """
    Deletes sheet with id, only if the requester is the sheet owner.
    """
    import sefaria.search as search
    id = int(sheet_id)
    sheet = db.sheets.find_one({"id": id})
    if not sheet:
        return jsonResponse({"error": "Sheet %d not found." % id})

    if not request.user.is_authenticated:
        key = request.POST.get("apikey")
        if not key:
            return jsonResponse({"error": "You must be logged in or use an API key to delete a sheet."})
        apikey = db.apikeys.find_one({"key": key})
        if not apikey:
            return jsonResponse({"error": "Unrecognized API key."})
    else:
        apikey = None

    if apikey:
        user = User.objects.get(id=apikey["uid"])
    else:
        user = request.user

    if user.id != sheet["owner"]:
        return jsonResponse({"error": "Only the sheet owner may delete a sheet."})

    db.sheets.remove({"id": id})
    process_sheet_deletion_in_collections(id)
    process_sheet_deletion_in_notifications(id)

    try:
        es_index_name = search.get_new_and_current_index_names("sheet")['current']
        search.delete_sheet(es_index_name, id)
    except NewConnectionError as e:
        logger.warn("Failed to connect to elastic search server on sheet delete.")
    except AuthorizationException as e:
        logger.warn("Failed to connect to elastic search server on sheet delete.")

    return jsonResponse({"status": "ok"})


@csrf_exempt
def collections_api(request, slug=None):
    if request.method == "GET":
        return collections_get_api(request, slug)
    else:
        if not request.user.is_authenticated and request.method == "POST":
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse({"error": _("You must be logged in to create a new collection.")})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
            else:
                user_id = apikey["uid"]
            return collections_post_api(request, user_id, slug=slug)
        else:
            user_id = request.user.id
            return protected_collections_post_api(request, user_id, slug=slug)


@csrf_protect
@login_required
def protected_collections_post_api(request, user_id, slug=None):
    return collections_post_api(request, user_id, slug)


@csrf_protect
def collections_get_api(request, slug=None):
    if not slug:
        return jsonResponse(CollectionSet.get_collection_listing(request.user.id))
    uslug = unquote(slug)
    collection_obj = Collection().load({"$or": [{"slug": uslug}, {"privateSlug": uslug}]})
    if not collection_obj:
        return jsonResponse({"error": "No collection with slug '{}'".format(slug)})
    is_member = request.user.is_authenticated and collection_obj.is_member(request.user.id)
    collection_content = collection_obj.contents(with_content=True, authenticated=is_member)
    return jsonResponse(collection_content)


@csrf_exempt
@catch_error_as_json
def collections_post_api(request, user_id, slug=None):
    if request.method == "POST":
        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "No JSON given in post data."})
        collection_data = json.loads(j)
        if "slug" in collection_data:
            collection = Collection().load({"slug": collection_data["slug"]})
            if not collection:
                return jsonResponse({"error": "Collection with slug `{}` not found.".format(collection["slug"])})
            # check poster is a collection admin
            if user_id not in collection.admins:
                return jsonResponse({"error": "You do not have permission to edit this collection."})

            collection.load_from_dict(collection_data)
            collection.save()
        else:
            collection_data["admins"] = [user_id]
            collection = Collection(collection_data)
            collection.save()
        return jsonResponse({"status": "ok", "collection": collection.listing_contents(request.user.id)})

    elif request.method == "DELETE":
        if not slug:
            return jsonResponse({"error": "Please specify a collection in the URL."})
        existing = Collection().load({"slug": slug})
        if existing:
            if user_id not in existing.admins:
                return jsonResponse({"error": "You do not have permission to delete this collection."})
            else:
                CollectionSet({"slug": slug}).delete()
                return jsonResponse({"status": "ok"})
        else:
            return jsonResponse({"error": "Collection with the slug `{}` does not exist".format(slug)})

    else:
        return jsonResponse({"error": "Unsupported HTTP method."})


@csrf_exempt
def user_collections_api(request, user_id):
    from sefaria.system.database import db
    if request.method == "GET":
        is_me = request.user.id == int(user_id)
        collections_serialized = get_user_collections(int(user_id), is_me)
        return jsonResponse(collections_serialized)
    return jsonResponse({"error": "Unsupported HTTP method."})


@login_required
def collections_inclusion_api(request, slug, action, sheet_id):
    """
    API for adding or removing a sheet from a collection
    """
    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."})
    collection = Collection().load({"slug": slug})
    if not collection:
        return jsonResponse({"error": "No collection with slug `{}`.".format(slug)})
    if not collection.is_member(request.user.id):
        return jsonResponse({"error": "Only members of this collection my change its contents."})
    sheet_id = int(sheet_id)
    sheet = db.sheets.find_one({"id": sheet_id})
    if not sheet:
        return jsonResponse({"error": "No sheet with id {}.".format(sheet_id)})

    if action == "remove":
        if sheet_id in collection.sheets:
            collection.sheets.remove(sheet_id)
            if request.user.id == sheet["owner"] and sheet.get("displayedCollection", None) == collection.slug:
                sheet["displayedCollection"] = None
                db.sheets.find_one_and_replace({"id": sheet["id"]}, sheet)
        else:
            return jsonResponse({"error": "Sheet with id {} is not in this collection.".format(sheet_id)})
    if action == "add":
        if sheet_id not in collection.sheets:
            collection.sheets.append(sheet_id)
            # If a sheet's owner adds it to a collection, and the sheet is not highlighted
            # in another collection, set it to highlight this collection.
            if request.user.id == sheet["owner"] and not sheet.get("displayedCollection", None):
                sheet["displayedCollection"] = collection.slug
                db.sheets.find_one_and_replace({"id": sheet["id"]}, sheet)

    collection.save()
    is_member = request.user.is_authenticated and collection.is_member(request.user.id)
    sheet = get_sheet_for_panel(int(sheet_id))
    sheet_listing = annotate_user_collections([sheet_to_dict(sheet)], request.user.id)[0]
    return jsonResponse({
        "status": "ok",
        "action": action,
        "collectionListing": collection.listing_contents(request.user.id),
        "collection": collection.contents(with_content=True, authenticated=is_member),
        "sheet": sheet,
        "sheetListing": sheet_listing,
    })


@login_required
def collections_for_sheet_api(request, sheet_id):
    """
    API for determining which collections that a user is a member of contain `sheet_id`.
    """
    sheet_id = int(sheet_id)
    uid = request.user.id
    collections = get_user_collections_for_sheet(uid, sheet_id)

    return jsonResponse(collections)


@login_required
def collections_role_api(request, slug, uid, role):
    """
    API for setting a collection members role, or removing them from a collection.
    """
    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."})
    collection = Collection().load({"slug": slug})
    if not collection:
        return jsonResponse({"error": "No collection with slug `{}`.".format(slug)})
    uid = int(uid)
    if request.user.id not in collection.admins:
        if not (uid == request.user.id and role == "remove"):  # non admins can remove themselves
            return jsonResponse({"error": "You must be a collection owner to change contributor roles."})
    user = UserProfile(id=uid)
    if not user.exists():
        return jsonResponse({"error": "No user with the specified ID exists."})
    if role not in ("member", "publisher", "admin", "remove"):
        return jsonResponse({"error": "Unknown collection contributor role."})
    if uid == request.user.id and collection.admins == [request.user.id] and role != "admin":
        return jsonResponse({"error": _(
            "Leaving this collection would leave it without any owners. Please appoint another owner before leaving, or delete the collection.")})
    if role == "remove":
        collection.remove_member(uid)
    else:
        collection.add_member(uid, role)

    collection_content = collection.contents(with_content=True, authenticated=True)
    return jsonResponse(collection_content)


@login_required
def collections_invite_api(request, slug, uid_or_email, uninvite=False):
    """
    API for adding or removing collection members, or collection invitations
    """
    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."})
    collection = Collection().load({"slug": slug})
    if not collection:
        return jsonResponse({"error": "No collection with slug {}.".format(slug)})
    if request.user.id not in collection.admins:
        return jsonResponse({"error": "You must be a collection owner to invite new members."})

    user = UserProfile(email=uid_or_email)
    if not user.exists():
        if uninvite:
            collection.remove_invitation(uid_or_email)
            message = "Invitation removed."
        else:
            collection.invite_member(uid_or_email, request.user.id)
            message = "Invitation sent."
    else:
        is_new_member = not collection.is_member(user.id)

        if is_new_member:
            collection.add_member(user.id)
            from sefaria.model.notification import Notification
            notification = Notification({"uid": user.id})
            notification.make_collection_add(adder_id=request.user.id, collection_slug=collection.slug)
            notification.save()
            message = "Collection editor added."
        else:
            message = "%s is already a editor of this collection." % user.full_name

    collection_content = collection.contents(with_content=True, authenticated=True)
    del collection_content["lastModified"]
    return jsonResponse({"collection": collection_content, "message": message})


@login_required
def collections_pin_sheet_api(request, slug, sheet_id):
    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."})
    collection = Collection().load({"slug": slug})
    if not collection:
        return jsonResponse({"error": "No collection with slug `{}`.".format(slug)})
    if not collection.is_member(request.user.id):
        return jsonResponse({"error": "You must be a collection editor to pin sheets."})

    sheet_id = int(sheet_id)
    collection.pin_sheet(sheet_id)
    collection_content = collection.contents(with_content=True, authenticated=True)
    del collection_content["lastModified"]
    return jsonResponse({"collection": collection_content, "status": "success"})


def sheet_stats(request):
    pass


@csrf_exempt
def save_sheet_api(request):
    """
    API for listing available sheets
    """
    if request.method == "GET":
        return jsonResponse({"error": "Unsupported HTTP method."})

    # Save a sheet
    if request.method == "POST":
        if not request.user.is_authenticated:
            key = request.POST.get("apikey")
            if not key:
                return jsonResponse(
                    {"error": "You must be logged in or use an API key to save.", "errorAction": "loginRedirect"})
            apikey = db.apikeys.find_one({"key": key})
            if not apikey:
                return jsonResponse({"error": "Unrecognized API key."})
        else:
            apikey = None

        j = request.POST.get("json")
        if not j:
            return jsonResponse({"error": "No JSON given in post data."})
        sheet = json.loads(j)

        if apikey:
            if "id" in sheet:
                sheet["lastModified"] = get_sheet(sheet["id"])[
                    "dateModified"]  # Usually lastModified gets set on the frontend, so we need to set it here to match with the previous dateModified so that the check in `save_sheet` returns properly
            user = User.objects.get(id=apikey["uid"])
        else:
            user = request.user

        if "id" in sheet:
            existing = get_sheet(sheet["id"])
            if "error" not in existing and \
                    not can_edit(user, existing) and \
                    not can_add(request.user, existing):
                return jsonResponse({"error": "You don't have permission to edit this sheet."})
        else:
            existing = None

        cleaned_sources = []
        for source in sheet["sources"]:
            cleaned_sources.append(clean_source(source))
        sheet["sources"] = cleaned_sources

        sheet["title"] = bleach_text(sheet["title"])

        if "summary" in sheet:
            sheet["summary"] = bleach_text(sheet["summary"])

        if sheet.get("displayedCollection", None):
            # Don't allow non collection members to set displayedCollection
            if sheet["displayedCollection"] not in [g["slug"] for g in get_user_collections(user.id)]:
                sheet["displayedCollection"] = None

        rebuild_nodes = request.POST.get('rebuildNodes', False)
        responseSheet = save_sheet(sheet, user.id, rebuild_nodes=rebuild_nodes)
        if "rebuild" in responseSheet and responseSheet["rebuild"]:
            # Don't bother adding user links if this data won't be used to rebuild the sheet
            responseSheet["sources"] = annotate_user_links(responseSheet["sources"])

        return jsonResponse(responseSheet)


def bulksheet_api(request, sheet_id_list):
    if request.method == "GET":
        cb = request.GET.get("callback", None)
        only_public = bool(int(request.GET.get("public", True)))
        sheet_id_list = [int(sheet_id) for sheet_id in set(sheet_id_list.split("|"))]
        response = jsonResponse(
            {s['sheet_id']: s for s in sheet_list_to_story_list(request, sheet_id_list, only_public)}, cb)
        return response


@api_view(["GET"])
def user_sheet_list_api(request, user_id, sort_by="date", limiter=0, offset=0):
    sort_by = sort_by if sort_by else "date"
    limiter = int(limiter) if limiter else 0
    offset = int(offset) if offset else 0
    private = int(user_id) == request.user.id
    return jsonResponse(user_sheets(user_id, sort_by, private=private, limit=limiter, skip=offset),
                        callback=request.GET.get("callback", None))


def sheet_api(request, sheet_id):
    """
    API for accessing and individual sheet.
    """
    if request.method == "GET":
        more_data = request.GET.get('more_data', '0')
        if more_data == '1':
            sheet = get_sheet_for_panel(int(sheet_id))
        else:
            sheet = get_sheet(int(sheet_id))
        return jsonResponse(sheet, callback=request.GET.get("callback", None))

    if request.method == "POST":
        return jsonResponse({"error": "TODO - save to sheet by id"})


def sheet_node_api(request, sheet_id, node_id):
    if request.method == "GET":
        sheet_node = get_sheet_node(int(sheet_id), int(node_id))
        return jsonResponse(sheet_node, callback=request.GET.get("callback", None))

    if request.method == "POST":
        return jsonResponse({"error": "Unsupported HTTP method."})


def check_sheet_modified_api(request, sheet_id, timestamp):
    """
    Check if sheet_id has been modified since timestamp.
    If modified, return the new sheet.
    """
    sheet_id = int(sheet_id)
    callback = request.GET.get("callback", None)
    last_mod = get_last_updated_time(sheet_id)
    if not last_mod:
        return jsonResponse({"error": "Couldn't find last modified time."}, callback)

    if timestamp >= last_mod:
        return jsonResponse({"modified": False}, callback)

    sheet = get_sheet(sheet_id)
    if "error" in sheet:
        return jsonResponse(sheet, callback)

    sheet["modified"] = True
    sheet["sources"] = annotate_user_links(sheet["sources"])
    return jsonResponse(sheet, callback)


def add_source_to_sheet_api(request, sheet_id):
    """
    API to add a fully formed source (posted as JSON) to sheet_id.

    The contents of the "source" field will be a dictionary.
    The input format is similar to, but differs slightly from, the internal format for sources on source sheets.
    This method reformats the source to the format expected by add_source_to_sheet().

    Fields of input dictionary:
        either `refs` - an array of string refs, indicating a range
            or `ref` - a string ref
            or `outsideText` - a string
            or `outsideBiText` - a dictionary with string fields "he" and "en"
            or `comment` - a string
            or `media` - a URL string

        If the `ref` or `refs` fields are present, the `version`, `he` or `en` fields
        can further specify the origin or content of text for that ref.

    """

    def remove_footnotes(txt):
        # removes all i tags that are of class "footnote" as well as the preceding "sup" tag
        soup = BeautifulSoup(txt, parser='lxml')
        for el in soup.find_all("i", {"class": "footnote"}):
            if el.previousSibling.name == "sup":
                el.previousSibling.decompose()
            el.decompose()
        return bleach.clean(str(soup), tags=Version.ALLOWED_TAGS, attributes=Version.ALLOWED_ATTRS, strip=True)

    # Internal func that does the same thing for each language to get text for the source
    def get_correct_text_from_source_obj(source_obj, ref_obj, lang):

        if lang in source_obj:  # if there's actual content passed in, that tkaes precedence as the source text
            lang_tc = source_obj[lang]
            del source_obj[lang]
            return lang_tc
        else:  # otherwise get the text chunk for the prvided ref, either with a version (if provided) or the default.
            lang_tc = TextChunk(ref_obj, lang, source["version-" + lang]) if source.get("version-" + lang,
                                                                                        None) else TextChunk(ref_obj,
                                                                                                             lang)
            lang_tc = lang_tc.ja().flatten_to_string()
            if "version-" + lang in source_obj:
                del source_obj["version-" + lang]
            return lang_tc if lang_tc != "" else "..."

    sheet = db.sheets.find_one({"id": int(sheet_id)})
    if not sheet:
        return {"error": "No sheet with id %s." % (id)}
    if sheet["owner"] != request.user.id:
        return jsonResponse({"error": "User can only edit their own sheet"})

    source = json.loads(request.POST.get("source"))
    if not source:
        return jsonResponse({"error": "No source to copy given."})

    if "refs" in source and source["refs"]:
        ref = Ref(source["refs"][0]).to(Ref(source["refs"][-1]))
        source["ref"] = ref.normal()
        del source["refs"]

    if "ref" in source and source["ref"]:
        text = {}
        ref = Ref(source["ref"])
        source["heRef"] = ref.he_normal()
        text["en"] = get_correct_text_from_source_obj(source, ref, "en")
        text["en"] = remove_footnotes(text["en"])
        text["he"] = get_correct_text_from_source_obj(source, ref, "he")
        text["he"] = remove_footnotes(text["he"])
        source["text"] = text

    note = request.POST.get("note", None)
    source.pop("node", None)
    response = add_source_to_sheet(int(sheet_id), source, note=note)

    return jsonResponse(response)


@login_required
def copy_source_to_sheet_api(request, sheet_id):
    """
    API to copy a source from one sheet to another.
    """
    from sefaria.system.database import db
    copy_sheet = request.POST.get("sheetID")
    copy_source = request.POST.get("nodeID")
    if not copy_sheet and copy_source:
        return jsonResponse({"error": "Need both a sheet and source node ID to copy."})
    sheet = db.sheets.find_one({"id": int(sheet_id)})
    if not sheet:
        return {"error": "No sheet with id %s." % (id)}
    if sheet["owner"] != request.user.id:
        return jsonResponse({"error": "User can only edit their own sheet"})
    source = get_sheet_node(int(copy_sheet), int(copy_source))
    del source["node"]
    response = add_source_to_sheet(int(sheet_id), source)

    return jsonResponse(response)


@login_required
def add_ref_to_sheet_api(request, sheet_id):
    """
    API to add a source to a sheet using only a ref.
    """
    ref = request.POST.get("ref")
    if not ref:
        return jsonResponse({"error": "No ref given in post data."})
    return jsonResponse(add_ref_to_sheet(int(sheet_id), ref, request))


@login_required
def update_sheet_topics_api(request, sheet_id):
    """
    API to update tags for sheet_id.
    """
    topics = json.loads(request.POST.get("topics"))
    sheet = db.sheets.find_one({"id": int(sheet_id)}, {"topics": 1})
    if sheet["owner"] != request.user.id:
        return jsonResponse({"error": "user can only add topics to their own sheet"})
    old_topics = sheet.get("topics", [])
    return jsonResponse(update_sheet_topics(int(sheet_id), topics, old_topics))


def visual_sheet_api(request, sheet_id):
    """
    API for visual source sheet layout
    """
    if not request.user.is_authenticated:
        return {"error": "You must be logged in to save a sheet layout."}
    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."})

    visualNodes = json.loads(request.POST.get("visualNodes"))
    zoomLevel = json.loads(request.POST.get("zoom"))
    add_visual_data(int(sheet_id), visualNodes, zoomLevel)
    return jsonResponse({"status": "ok"})


def like_sheet_api(request, sheet_id):
    """
    API to like sheet_id.
    """
    if not request.user.is_authenticated:
        return {"error": "You must be logged in to like sheets."}
    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."})

    add_like_to_sheet(int(sheet_id), request.user.id)
    return jsonResponse({"status": "ok"})


def unlike_sheet_api(request, sheet_id):
    """
    API to unlike sheet_id.
    """
    if not request.user.is_authenticated:
        return jsonResponse({"error": "You must be logged in to like sheets."})
    if request.method != "POST":
        return jsonResponse({"error": "Unsupported HTTP method."})

    remove_like_from_sheet(int(sheet_id), request.user.id)
    return jsonResponse({"status": "ok"})


def sheet_likers_api(request, sheet_id):
    """
    API to retrieve the list of people who like sheet_id.
    """
    response = {"likers": likers_list_for_sheet(sheet_id)}
    return jsonResponse(response, callback=request.GET.get("callback", None))


def tag_list_api(request, sort_by="count"):
    """
    API to retrieve the list of public tags ordered by count.
    """
    response = public_tag_list(sort_by)
    response = jsonResponse(response, callback=request.GET.get("callback", None))
    response["Cache-Control"] = "max-age=5"
    return response


def user_tag_list_api(request, user_id):
    """
    API to retrieve the list of public tags ordered by count.
    """
    # if int(user_id) != request.user.id:
    # return jsonResponse({"error": "You are not authorized to view that."})
    response = sheet_topics_counts({"owner": int(user_id)})
    response = jsonResponse(response, callback=request.GET.get("callback", None))
    response["Cache-Control"] = "max-age=5"
    return response


def trending_tags_api(request):
    """
    API to retrieve the list of trending tags.
    """
    response = trending_topics(ntags=18)
    response = jsonResponse(response, callback=request.GET.get("callback", None))
    response["Cache-Control"] = "max-age=5"
    return response


def all_sheets_api(request, limiter, offset=0):
    limiter = int(limiter)
    offset = int(offset)
    lang = request.GET.get("lang")
    filtered = request.GET.get("filtered", False)
    response = public_sheets(limit=limiter, skip=offset, lang=lang, filtered=filtered)
    response = jsonResponse(response, callback=request.GET.get("callback", None))
    return response


def sheet_to_story_dict(request, sid):
    from sefaria.model.story import Story
    d = Story.sheet_metadata(sid, return_id=True)
    d.update(Story.publisher_metadata(d["publisher_id"]))

    if request.user.is_authenticated:
        d["publisher_followed"] = d["publisher_id"] in following.FolloweesSet(request.user.id).uids

    return d


def sheet_list_to_story_list(request, sid_list, public=True):
    """
    :param request:
    :param sid_list: list of sheet ids
    :param public: if True, return only public sheets
    :return:
    """
    from sefaria.model.story import Story
    dict_list = Story.sheet_metadata_bulk(sid_list, return_id=True, public=public)
    followees_set = following.FolloweesSet(request.user.id).uids
    for d in dict_list:
        d.update(Story.publisher_metadata(d["publisher_id"]))
        if request.user.is_authenticated:
            d["publisher_followed"] = d["publisher_id"] in followees_set

    return dict_list


def story_form_sheets_by_tag(request, tag):
    sheets = get_sheets_by_topic(tag, public=True)
    sheets = [sheet_to_story_dict(request, s["id"]) for s in sheets]
    response = {"tag": tag, "sheets": sheets}
    response = jsonResponse(response, callback=request.GET.get("callback", None))
    response["Cache-Control"] = "max-age=5"
    return response


def sheets_by_tag_api(request, tag):
    """
    API to get a list of sheets by `tag`.
    """
    sheets = get_sheets_by_topic(tag, public=True)
    sheets = [sheet_to_dict(s) for s in sheets]
    response = {"tag": tag, "sheets": sheets}
    response = jsonResponse(response, callback=request.GET.get("callback", None))
    response["Cache-Control"] = "max-age=5"
    return response


def sheets_by_ref_api(request, ref):
    """
    API to get public sheets by ref.
    """
    return jsonResponse(get_sheets_for_ref(ref))


def get_aliyot_by_parasha_api(request, parasha):
    response = {"ref": []};

    if parasha == "V'Zot HaBerachah":
        return jsonResponse({"ref": ["Deuteronomy 33:1-7", "Deuteronomy 33:8-12", "Deuteronomy 33:13-17",
                                     "Deuteronomy 33:18-21", "Deuteronomy 33:22-26", "Deuteronomy 33:27-29",
                                     "Deuteronomy 34:1-12"]}, callback=request.GET.get("callback", None))

    else:
        p = db.parshiot.find({"parasha": parasha}, limit=1).sort([("date", 1)])
        p = next(p)

        for aliyah in p["aliyot"]:
            response["ref"].append(aliyah)
        return jsonResponse(response, callback=request.GET.get("callback", None))


@login_required
def make_sheet_from_text_api(request, ref, sources=None):
    """
    API to generate a sheet from a ref with optional sources.
    """
    sources = sources.replace("_", " ").split("+") if sources else None
    sheet = make_sheet_from_text(ref, sources=sources, uid=request.user.id, generatedBy=None, title=None)
    return redirect("/sheets/%d" % sheet["id"])


def sheet_to_html_string(sheet):
    """
    Create the html string of sheet with sheet_id.
    """
    sheet["sources"] = annotate_user_links(sheet["sources"])
    sheet = resolve_options_of_sources(sheet)

    try:
        owner = User.objects.get(id=sheet["owner"])
        author = owner.first_name + " " + owner.last_name
    except User.DoesNotExist:
        author = "Someone Mysterious"

    context = {
        "sheetJSON": json.dumps(sheet),
        "sheet": sheet,
        "sheet_class": make_sheet_class_string(sheet),
        "can_edit": False,
        "can_add": False,
        "title": sheet["title"],
        "author": author,
        "is_owner": False,
        "is_public": sheet["status"] == "public",
        "like_count": len(sheet.get("likes", [])),
        "viewer_is_liker": False,
        "assignments_from_sheet": assignments_from_sheet(sheet['id']),
    }

    return render_to_string('gdocs_sheet.html', context)


def resolve_options_of_sources(sheet):
    for source in sheet['sources']:
        if 'text' not in source:
            continue
        options = source.setdefault('options', {})
        if not options.get('sourceLanguage'):
            source['options']['sourceLanguage'] = sheet['options'].get(
                'language', 'bilingual')
        if not options.get('sourceLayout'):
            source['options']['sourceLayout'] = sheet['options'].get(
                'layout', 'sideBySide')
        if not options.get('sourceLangLayout'):
            source['options']['sourceLangLayout'] = sheet['options'].get(
                'langLayout', 'heRight')
    return sheet


@gauth_required(
    scope=['openid', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'],
    ajax=True)
def export_to_drive(request, credential, sheet_id):
    """
    Export a sheet to Google Drive.
    """
    # Using credentials in google-api-python-client.
    service = build('drive', 'v3', credentials=credential, cache_discovery=False)
    user_info_service = build('oauth2', 'v2', credentials=credential, cache_discovery=False)

    sheet = get_sheet(sheet_id)
    if 'error' in sheet:
        return jsonResponse({'error': {'message': sheet["error"]}})

    file_metadata = {
        'name': strip_tags(sheet['title'].strip()),
        'mimeType': 'application/vnd.google-apps.document'
    }

    html_string = bytes(sheet_to_html_string(sheet), "utf8")

    media = MediaIoBaseUpload(
        BytesIO(html_string),
        mimetype='text/html',
        resumable=True)

    new_file = service.files().create(body=file_metadata,
                                      media_body=media,
                                      fields='webViewLink').execute()

    user_info = user_info_service.userinfo().get().execute()

    profile = UserProfile(id=request.user.id)
    profile.update({"gauth_email": user_info['email']})
    profile.save()

    return jsonResponse(new_file)


@catch_error_as_json
def upload_sheet_media(request):
    if not request.user.is_authenticated:
        return jsonResponse({"error": _("You must be logged in to access this api.")})
    if request.method == "POST":
        from PIL import Image
        from io import BytesIO
        import uuid
        import base64
        import imghdr

        bucket_name = GoogleStorageManager.UGC_SHEET_BUCKET
        max_img_size = [1024, 1024]

        img_file_in_mem = BytesIO(base64.b64decode(request.POST.get('file')))

        if imghdr.what(img_file_in_mem) == "gif":
            img_url = GoogleStorageManager.upload_file(img_file_in_mem, f"{request.user.id}-{uuid.uuid1()}.gif",
                                                       bucket_name)

        else:
            im = Image.open(img_file_in_mem)
            img_file = BytesIO()
            im.thumbnail(max_img_size, Image.LANCZOS)
            im.save(img_file, format=im.format)
            img_file.seek(0)

            img_url = GoogleStorageManager.upload_file(img_file,
                                                       f"{request.user.id}-{uuid.uuid1()}.{im.format.lower()}",
                                                       bucket_name)

        return jsonResponse({"url": img_url})
    return jsonResponse({"error": "Unsupported HTTP method."})


@staff_member_required
@api_view(["PUT"])
def next_untagged(request):
    from sefaria.sheets import update_sheet_tags_categories, get_sheet_categorization_info
    body_unicode = request.body.decode('utf-8')
    body = json.loads(body_unicode)
    if ("sheetId" in body):
        update_sheet_tags_categories(body, request.user.id)
    return jsonResponse(get_sheet_categorization_info("topics", body['skipIds']))


@staff_member_required
@api_view(["PUT"])
def next_uncategorized(request):
    from sefaria.sheets import update_sheet_tags_categories, get_sheet_categorization_info
    body_unicode = request.body.decode('utf-8')
    body = json.loads(body_unicode)
    if ("sheetId" in body):
        update_sheet_tags_categories(body, request.user.id)
    return jsonResponse(get_sheet_categorization_info("categories", body['skipIds']))
