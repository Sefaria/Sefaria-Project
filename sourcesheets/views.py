# -*- coding: utf-8 -*-
import json
import httplib2
from urllib3.exceptions import NewConnectionError

from datetime import datetime, timedelta
from StringIO import StringIO

import logging
logger = logging.getLogger(__name__)

from django.template.loader import render_to_string
from django.shortcuts import render, redirect
from django.http import Http404

# noinspection PyUnresolvedReferences
from django.http import HttpResponse, HttpResponseRedirect
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.contrib.auth.decorators import login_required
from django.contrib.admin.views.decorators import staff_member_required

# noinspection PyUnresolvedReferences
from django.contrib.auth.models import User

from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

# noinspection PyUnresolvedReferences
from sefaria.client.util import jsonResponse, HttpResponse
from sefaria.model import *
from sefaria.sheets import *
from sefaria.model.user_profile import *
from sefaria.model.group import Group, GroupSet
from sefaria.system.exceptions import InputError
from sefaria.system.decorators import catch_error_as_json
from sefaria.utils.util import strip_tags

from reader.views import catchall
from sefaria.sheets import clean_source

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

	owner_groups  = get_user_groups(request.user.id)
	query         = {"owner": request.user.id or -1 }
	hide_video    = db.sheets.find(query).count() > 2


	return render(request,'sheets.html', {"can_edit": True,
												"new_sheet": True,
												"is_owner": True,
												"hide_video": hide_video,
												"owner_groups": owner_groups,
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
	if sheet["options"]["collaboration"] == "group-can-edit":
		if "group" in sheet:
			try:
				return Group().load({"name": sheet["group"]}).is_member(user.id)
			except:
				return False

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
	if sheet["options"]["collaboration"] == "group-can-add":
		if "group" in sheet:
			try:
				return Group().load({"name": sheet["group"]}).is_member(user.id)
			except:
				return False

	return False


def can_publish(user, sheet):
	"""
	Returns True if user and sheet both belong to the same Group, and user has publish rights in that group
	Returns False otherwise, including if the sheet is not in a Group at all
	"""
	if "group" in sheet:
		try:
			return Group().load({"name": sheet["group"]}).can_publish(user.id)
		except:
			return False
	return False


def get_user_groups(uid):
	"""
	Returns a list of Groups that user belongs to.
	"""
	if not uid:
		return None
	groups = GroupSet().for_user(uid)
	groups = [ {
					"name": group.name,
					"headerUrl": getattr(group, "headerUrl", ""),
					"canPublish": group.can_publish(uid),
				}
				for group in groups]
	return groups


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
def view_sheet(request, sheet_id, editorMode = False):
	"""
	View the sheet with sheet_id.
	"""
	editor = request.GET.get('editor', '0')
	embed = request.GET.get('embed', '0')

	if editor != '1' and embed !='1' and editorMode is False:
		return catchall(request, sheet_id, True)

	sheet = get_sheet(sheet_id)
	if "error" in sheet:
		return HttpResponse(sheet["error"])

	sheet["sources"] = annotate_user_links(sheet["sources"])

	# Count this as a view
	db.sheets.update({"id": int(sheet_id)}, {"$inc": {"views": 1}})

	try:
		owner = User.objects.get(id=sheet["owner"])
		author = owner.first_name + " " + owner.last_name
		owner_groups = get_user_groups(request.user.id) if sheet["owner"] == request.user.id else None
	except User.DoesNotExist:
		author = "Someone Mysterious"
		owner_groups = None

	sheet_class      = make_sheet_class_string(sheet)
	sheet_group      = Group().load({"name": sheet["group"]}) if "group" in sheet and sheet["group"] != "None" else None
	embed_flag       = "embed" in request.GET
	likes            = sheet.get("likes", [])
	like_count       = len(likes)
	if request.user.is_authenticated:
		can_edit_flag    = can_edit(request.user, sheet)
		can_add_flag     = can_add(request.user, sheet)
		can_publish_flag = sheet_group.can_publish(request.user.id) if sheet_group else False
		viewer_is_liker  = request.user.id in likes
	else:
		can_edit_flag    = False
		can_add_flag     = False
		can_publish_flag = False
		viewer_is_liker  = False

	canonical_url = request.get_full_path().replace("?embed=1", "").replace("&embed=1", "")

	return render(request,'sheets.html', {"sheetJSON": json.dumps(sheet),
												"sheet": sheet,
												"sheet_class": sheet_class,
												"can_edit": can_edit_flag,
												"can_add": can_add_flag,
												"can_publish": can_publish_flag,
												"title": sheet["title"],
												"author": author,
												"is_owner": request.user.id == sheet["owner"],
												"is_public": sheet["status"] == "public",
												"owner_groups": owner_groups,
												"sheet_group":  sheet_group,
												"like_count": like_count,
												"viewer_is_liker": viewer_is_liker,
												"current_url": request.get_full_path,
												"canonical_url": canonical_url,
											  	"assignments_from_sheet":assignments_from_sheet(sheet_id),
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
		owner_groups = get_user_groups(request.user.id) if sheet["owner"] == request.user.id else None
	except User.DoesNotExist:
		author = "Someone Mysterious"
		owner_groups = None

	sheet_class     = make_sheet_class_string(sheet)
	can_edit_flag   = can_edit(request.user, sheet)
	can_add_flag    = can_add(request.user, sheet)
	sheet_group     = Group().load({"name": sheet["group"]}) if "group" in sheet and sheet["group"] != "None" else None
	embed_flag      = "embed" in request.GET
	likes           = sheet.get("likes", [])
	like_count      = len(likes)
	viewer_is_liker = request.user.id in likes


	return render(request,'sheets_visual.html',{"sheetJSON": json.dumps(sheet),
													"sheet": sheet,
													"sheet_class": sheet_class,
													"can_edit": can_edit_flag,
													"can_add": can_add_flag,
													"title": sheet["title"],
													"author": author,
													"is_owner": request.user.id == sheet["owner"],
													"is_public": sheet["status"] == "public",
													"owner_groups": owner_groups,
													"sheet_group":  sheet_group,
													"like_count": like_count,
													"viewer_is_liker": viewer_is_liker,
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
	for key in ("id", "like", "views"):
		if key in sheet:
			del sheet[key]

	assigner        = UserProfile(id=sheet["owner"])
	assigner_id	    = assigner.id
	owner_groups    = get_user_groups(request.user.id)

	sheet_class     = make_sheet_class_string(sheet)
	can_edit_flag   = True
	can_add_flag    = can_add(request.user, sheet)
	sheet_group     = Group().load({"name": sheet["group"]}) if "group" in sheet and sheet["group"] != "None" else None
	embed_flag      = "embed" in request.GET
	likes           = sheet.get("likes", [])
	like_count      = len(likes)
	viewer_is_liker = request.user.id in likes

	return render(request,'sheets.html', {"sheetJSON": json.dumps(sheet),
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
												"owner_groups": owner_groups,
												"sheet_group":  sheet_group,
												"like_count": like_count,
												"viewer_is_liker": viewer_is_liker,
												"current_url": request.get_full_path,
											})

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

	try:
		es_index_name = search.get_new_and_current_index_names("sheet")['current']
		search.delete_sheet(es_index_name, id)
	except NewConnectionError as e:
		logger.warn("Failed to connect to elastic search server on sheet delete.")


	return jsonResponse({"status": "ok"})


def groups_api(request, group=None):
	if request.method == "GET":
		if not group:
			return jsonResponse({
				"private": [g.listing_contents() for g in GroupSet().for_user(request.user.id)],
				"public": [g.listing_contents() for g in GroupSet({"listed": True, "moderationStatus": {"$ne": "nolist"}}, sort=[("name", 1)])]
			})
		group = Group().load({"name": group})
		if not group:
			return jsonResponse({"error": "No group named '%s'" % group})
		is_member = request.user.is_authenticated and group.is_member(request.user.id)
		group_content = group.contents(with_content=True, authenticated=is_member)
		return jsonResponse(group_content)
	else:
		return groups_post_api(request, group_name=group)


@login_required
@catch_error_as_json
def groups_post_api(request, group_name=None):
	if request.method == "POST":
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "No JSON given in post data."})
		group = json.loads(j)
		existing = Group().load({"name": group.get("previousName", group["name"])})
		if existing:
			# Don't overwrite existing group when posting to create a new group
			if "new" in group:
				return jsonResponse({"error": "A group with this name already exists."})
			# check poster is a group admin
			if request.user.id not in existing.admins:
				return jsonResponse({"error": "You do not have permission to edit this group."})

			from pprint import pprint
			pprint(group)
			existing.load_from_dict(group)
			existing.save()
		else:
			reservedChars = ['-', '_', '|']
			if any([c in group["name"] for c in reservedChars]):
				return jsonResponse({"error": 'Group names may not contain the following characters: {}'.format(', '.join(reservedChars))})
			del group["new"]
			group["admins"] = [request.user.id]
			group["publishers"] = []
			group["members"] = []
			Group(group).save()
		return jsonResponse({"status": "ok"})

	elif request.method == "DELETE":
		if not group_name:
			return jsonResponse({"error": "Please specify a group name in the URL."})
		existing = Group().load({"name": group_name})
		if existing:
			if request.user.id not in existing.admins:
				return jsonResponse({"error": "You do not have permission to delete this group."})
			else:
				GroupSet({"name": group_name}).delete()
				return jsonResponse({"status": "ok"})
		else:
			return jsonResponse({"error": "Group named %s does not exist" % group_name})

	else:
		return jsonResponse({"error": "Unsupported HTTP method."})


@login_required
def groups_role_api(request, group_name, uid, role):
	"""
	API for setting a group members role, or removing them from a group.
	"""
	if request.method != "POST":
		return jsonResponse({"error": "Unsupported HTTP method."})
	group = Group().load({"name": group_name})
	if not group:
		return jsonResponse({"error": "No group named %s." % group_name})
	uid = int(uid)
	if request.user.id not in group.admins:
		if not (uid == request.user.id and role == "remove"): # non admins can remove themselves
			return jsonResponse({"error": "You must be a group admin to change member roles."})
	user = UserProfile(uid)
	if not user.exists():
		return jsonResponse({"error": "No user with the specified ID exists."})
	if role not in ("member", "publisher", "admin", "remove"):
		return jsonResponse({"error": "Unknown group member role."})
	if uid == request.user.id and group.admins == [request.user.id] and role != "admin":
		return jsonResponse({"error": "This action would leave the group without any admins. Please appoint another admin first."})
	if role == "remove":
		group.remove_member(uid)
	else:
		group.add_member(uid, role)

	group_content = group.contents(with_content=True, authenticated=True)
	return jsonResponse(group_content)


@login_required
def groups_invite_api(request, group_name, uid_or_email, uninvite=False):
	"""
	API for adding or removing group members, or group invitations
	"""
	if request.method != "POST":
		return jsonResponse({"error": "Unsupported HTTP method."})
	group = Group().load({"name": group_name})
	if not group:
		return jsonResponse({"error": "No group named %s." % group_name})
	if request.user.id not in group.admins:
		return jsonResponse({"error": "You must be a group admin to invite new members."})

	user = UserProfile(email=uid_or_email)
	if not user.exists():
		if uninvite:
			group.remove_invitation(uid_or_email)
			message = "Invitation removed."
		else:
			group.invite_member(uid_or_email, request.user.id)
			message = "Invitation sent."
	else:
		is_new_member = not group.is_member(user.id)

		if is_new_member:
			group.add_member(user.id)
			from sefaria.model.notification import Notification
			notification = Notification({"uid": user.id})
			notification.make_group_add(adder_id=request.user.id, group_name=group_name)
			notification.save()
			message = "Group member added."
		else:
			message = "%s is already a member of this group." % user.full_name

	group_content = group.contents(with_content=True, authenticated=True)
	return jsonResponse({"group": group_content, "message": message})


@login_required
def groups_pin_sheet_api(request, group_name, sheet_id):
	if request.method != "POST":
		return jsonResponse({"error": "Unsupported HTTP method."})
	group = Group().load({"name": group_name})
	if not group:
		return jsonResponse({"error": "No group named %s." % group_name})
	if request.user.id not in group.admins:
		return jsonResponse({"error": "You must be a group admin to invite new members."})

	sheet_id = int(sheet_id)
	group.pin_sheet(sheet_id)
	group_content = group.contents(with_content=True, authenticated=True)
	return jsonResponse({"group": group_content, "status": "success"})


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
				return jsonResponse({"error": "You must be logged in or use an API key to save."})
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
				sheet["lastModified"] = get_sheet(sheet["id"])["dateModified"] # Usually lastModified gets set on the frontend, so we need to set it here to match with the previous dateModified so that the check in `save_sheet` returns properly
			user = User.objects.get(id=apikey["uid"])
		else:
			user = request.user

		if "id" in sheet:
			existing = get_sheet(sheet["id"])
			if "error" not in existing  and \
				not can_edit(user, existing) and \
				not can_add(request.user, existing) and \
				not can_publish(request.user, existing):

				return jsonResponse({"error": "You don't have permission to edit this sheet."})
		else:
			existing = None

		cleaned_sources = []
		for source in sheet["sources"]:
			cleaned_sources.append(clean_source(source))
		sheet["sources"] = cleaned_sources

		if sheet.get("group", None):
			# Quietly enforce group permissions
			if sheet["group"] not in [g["name"] for g in get_user_groups(user.id)]:
				# Don't allow non Group members to add a sheet to a group
				sheet["group"] = None

			if not can_publish(user, sheet):
				if not existing:
					sheet["status"] = "unlisted"
				else:
					if existing.get("group", None) != sheet["group"]:
						# Don't allow non Group publishers to add a new public sheet
						sheet["status"] = "unlisted"
					elif existing["status"] != sheet["status"]:
						# Don't allow non Group publishers from changing status of an existing sheet
						sheet["status"] = existing["status"]

		responseSheet = save_sheet(sheet, user.id)
		if "rebuild" in responseSheet and responseSheet["rebuild"]:
			# Don't bother adding user links if this data won't be used to rebuild the sheet
			responseSheet["sources"] = annotate_user_links(responseSheet["sources"])

		return jsonResponse(responseSheet)


def user_sheet_list_api(request, user_id):
	"""
	API for listing the sheets that belong to user_id.
	"""
	if int(user_id) != request.user.id:
		return jsonResponse({"error": "You are not authorized to view that."})
	return jsonResponse(user_sheets(user_id), callback=request.GET.get("callback", None))


def user_sheet_list_api_with_sort(request, user_id, sort_by="date", limiter=0, offset=0):
	limiter  = int(limiter)
	offset   = int(offset)

	if int(user_id) != request.user.id:
		return jsonResponse({"error": "You are not authorized to view that."})
	return jsonResponse(user_sheets(user_id, sort_by, limit=limiter, skip=offset), callback=request.GET.get("callback", None))


def private_sheet_list_api(request, group):
	group = group.replace("-", " ").replace("_", " ")
	group   = Group().load({"name": group})
	if not group:
		raise Http404
	if request.user.is_authenticated and group.is_member(request.user.id):
		return jsonResponse(group_sheets(group, True), callback=request.GET.get("callback", None))
	else:
		return jsonResponse(group_sheets(group, False), callback=request.GET.get("callback", None))


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
		sheet_node = get_sheet_node(int(sheet_id),int(node_id))
		return jsonResponse(sheet_node, callback=request.GET.get("callback", None))

	if request.method == "POST":
		return jsonResponse({"error": "Unsupported HTTP method."})

def check_sheet_modified_api(request, sheet_id, timestamp):
	"""
	Check if sheet_id has been modified since timestamp.
	If modified, return the new sheet.
	"""
	sheet_id = int(sheet_id)
	callback=request.GET.get("callback", None)
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
	source = json.loads(request.POST.get("source"))
	if not source:
		return jsonResponse({"error": "No source to copy given."})

	if "refs" in source and source["refs"]:
		ref = Ref(source["refs"][0]).to(Ref(source["refs"][-1]))
		source["ref"] = ref.normal()
		del source["refs"]

	if "ref" in source and source["ref"]:
		ref = Ref(source["ref"])
		source["heRef"] = ref.he_normal()

		if "version" in source or "en" in source or "he" in source:
			text = {}
			if "en" in source:
				text["en"] = source["en"]
				tc = TextChunk(ref, "he", source["version"]) if source.get("versionLanguage") == "he" else TextChunk(ref, "he")
				text["he"] = tc.ja().flatten_to_string()
				del source["en"]
			elif "he" in source:
				text["he"] = source["he"]
				tc = TextChunk(ref, "en", source["version"]) if source.get("versionLanguage") == "en" else TextChunk(ref, "en")
				text["en"] = tc.ja().flatten_to_string()
				del source["he"]
			else:  # "version" in source
				text[source["versionLanguage"]] = TextChunk(ref, source["versionLanguage"], source["version"]).ja().flatten_to_string()
				other = "he" if source["versionLanguage"] == "en" else "en"
				text[other] = TextChunk(ref, other).ja().flatten_to_string()
			source.pop("version", None)
			source.pop("versionLanguage", None)
			source["text"] = text

		else:
			text = {}
			tc_eng = TextChunk(ref, "en")
			tc_heb = TextChunk(ref, "he")


			if tc_eng:
				text["en"] = tc_eng.ja().flatten_to_string() if tc_eng.ja().flatten_to_string() != "" else "..."
			if tc_heb:
				text["he"] = tc_heb.ja().flatten_to_string() if tc_heb.ja().flatten_to_string() != "" else "..."
			source["text"] = text
	note = request.POST.get("note", None)
	source.pop("node", None)
	response = add_source_to_sheet(int(sheet_id), source, note=note)

	return jsonResponse(response)


def copy_source_to_sheet_api(request, sheet_id):
	"""
	API to copy a source from one sheet to another.
	"""
	copy_sheet = request.POST.get("sheetID")
	copy_source = request.POST.get("nodeID")
	if not copy_sheet and copy_source:
		return jsonResponse({"error": "Need both a sheet and source node ID to copy."})

	source = get_sheet_node(int(copy_sheet), int(copy_source))
	del source["node"]
	response = add_source_to_sheet(int(sheet_id), source)

	return jsonResponse(response)



def add_ref_to_sheet_api(request, sheet_id):
	"""
	API to add a source to a sheet using only a ref.
	"""
	ref = request.POST.get("ref")
	if not ref:
		return jsonResponse({"error": "No ref given in post data."})
	return jsonResponse(add_ref_to_sheet(int(sheet_id), ref))


@login_required
def update_sheet_tags_api(request, sheet_id):
	"""
	API to update tags for sheet_id.
	"""
	tags = json.loads(request.POST.get("tags"))
	return jsonResponse(update_sheet_tags(int(sheet_id), tags))


def visual_sheet_api(request, sheet_id):
	"""
	API for visual source sheet layout
	"""
	if not request.user.is_authenticated:
		return {"error": "You must be logged in to save a sheet layout."}
	if request.method != "POST":
		return jsonResponse({"error": "Unsupported HTTP method."})

	visualNodes = json.loads(request.POST.get("visualNodes"))
	zoomLevel =  json.loads(request.POST.get("zoom"))
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
	response["Cache-Control"] = "max-age=3600"
	return response


def user_tag_list_api(request, user_id):
	"""
	API to retrieve the list of public tags ordered by count.
	"""
	#if int(user_id) != request.user.id:
		#return jsonResponse({"error": "You are not authorized to view that."})
	response = sheet_tag_counts({ "owner": int(user_id) })
	response = jsonResponse(response, callback=request.GET.get("callback", None))
	response["Cache-Control"] = "max-age=3600"
	return response


def group_tag_list_api(request, group):
	"""
	API to retrieve the list of public tags ordered by count.
	"""
	group = group.replace("-", " ").replace("_", " ")
	response = sheet_tag_counts({ "group": group })
	response = jsonResponse(response, callback=request.GET.get("callback", None))
	response["Cache-Control"] = "max-age=3600"
	return response


def trending_tags_api(request):
	"""
	API to retrieve the list of peopke who like sheet_id.
	"""
	response = recent_public_tags(days=14, ntags=18)
	response = jsonResponse(response, callback=request.GET.get("callback", None))
	response["Cache-Control"] = "max-age=3600"
	return response


def all_sheets_api(request, limiter, offset=0):
	limiter  = int(limiter)
	offset   = int(offset)
	response = public_sheets(limit=limiter, skip=offset)
	response = jsonResponse(response, callback=request.GET.get("callback", None))
	response["Cache-Control"] = "max-age=3600"
	return response


def sheets_by_tag_api(request, tag):
	"""
	API to get a list of sheets by `tag`.
	"""
	sheets   = get_sheets_by_tag(tag, public=True)
	sheets   = [sheet_to_dict(s) for s in sheets]
	response = {"tag": tag, "sheets": sheets}
	response = jsonResponse(response, callback=request.GET.get("callback", None))
	response["Cache-Control"] = "max-age=3600"
	return response


def get_aliyot_by_parasha_api(request, parasha):
	response = {"ref":[]};

	if parasha == "V'Zot HaBerachah":
		return jsonResponse({"ref":["Deuteronomy 33:1-7","Deuteronomy 33:8-12","Deuteronomy 33:13-17","Deuteronomy 33:18-21","Deuteronomy 33:22-26","Deuteronomy 33:27-29","Deuteronomy 34:1-12"]}, callback=request.GET.get("callback", None))

	else:
		p = db.parshiot.find({"parasha": parasha}, limit=1).sort([("date", 1)])
		p = p.next()

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

	sheet_group = (Group().load({"name": sheet["group"]})
				   if "group" in sheet and sheet["group"] != "None" else None)

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
		"owner_groups": None,
		"sheet_group":  sheet_group,
		"like_count": len(sheet.get("likes", [])),
		"viewer_is_liker": False,
		"assignments_from_sheet": assignments_from_sheet(sheet['id']),
	}

	return render_to_string('gdocs_sheet.html', context).encode('utf-8')


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



@gauth_required(scope='https://www.googleapis.com/auth/drive.file', ajax=True)
def export_to_drive(request, credential, sheet_id):
	"""
	Export a sheet to Google Drive.
	"""

	http = credential.authorize(httplib2.Http())
	service = build('drive', 'v3', http=http)

	sheet = get_sheet(sheet_id)
	if 'error' in sheet:
		return jsonResponse({'error': {'message': sheet["error"]}})

	file_metadata = {
		'name': strip_tags(sheet['title'].strip()),
		'mimeType': 'application/vnd.google-apps.document'
	}

	html_string = sheet_to_html_string(sheet)

	media = MediaIoBaseUpload(
		StringIO(html_string),
		mimetype='text/html',
		resumable=True)

	new_file = service.files().create(body=file_metadata,
									  media_body=media,
									  fields='webViewLink').execute()

	return jsonResponse(new_file)
