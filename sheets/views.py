from django.template import Context, loader, RequestContext
from django.shortcuts import render_to_response, get_object_or_404, redirect
from django.http import HttpResponse, HttpResponseRedirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.core.urlresolvers import reverse
from django.utils import simplejson as json
from django.contrib.auth.models import User, Group
from sefaria.texts import *
from sefaria.sheets import *
from sefaria.util import *


@ensure_csrf_cookie
def new_sheet(request):
	viewer_groups = get_viewer_groups(request.user)
	return render_to_response('sheets.html', {"can_edit": True,
												"new_sheet": True,
												"viewer_groups": viewer_groups,
												"owner_groups": viewer_groups,
											    "current_url": request.get_full_path,
											    "toc": get_toc(),
												"titlesJSON": json.dumps(get_text_titles()),
											    },
											     RequestContext(request))


def can_edit(user, sheet):
	"""
	Returns true if user can edit sheet.
	"""

	if sheet["owner"] == user.id or \
		sheet["status"] in EDITABLE_SHEETS or \
		sheet["status"] in GROUP_SHEETS and sheet["group"] in [group.name for group in user.groups.all()]:
	
		return True

	return False


def get_viewer_groups(user):
	"""
	Returns a list of names of groups that user belongs to.
	"""
	return [g.name for g in user.groups.all()] if user.is_authenticated() else None


@ensure_csrf_cookie
def view_sheet(request, sheet_id):
	sheet = get_sheet(sheet_id)
	if "error" in sheet:
		return HttpResponse(sheet["error"])
	
	# Count this as a view
	db.sheets.update({"id": int(sheet_id)}, {"$inc": {"views": 1}})

	try:
		owner = User.objects.get(id=sheet["owner"])
		author = owner.first_name + " " + owner.last_name
		owner_groups = [g.name for g in owner.groups.all()] if sheet["owner"] == request.user.id else None
	except User.DoesNotExist:
		author = "Someone Mysterious"
		owner_groups = None

	can_edit_flag =  can_edit(request.user, sheet)
	sheet_group = sheet["group"] if sheet["status"] in GROUP_SHEETS else None
	viewer_groups = get_viewer_groups(request.user)



	return render_to_response('sheets.html', {"sheetJSON": json.dumps(sheet), 
												"sheet": sheet,
												"can_edit": can_edit_flag, 
												"title": sheet["title"],
												"author": author,
												"is_owner": request.user.id == sheet["owner"],
												"owner_groups": owner_groups,
												"sheet_group":  sheet_group,
												"viewer_groups": viewer_groups,
												"current_url": request.get_full_path,
												"toc": get_toc(),
												"titlesJSON": json.dumps(get_text_titles()),
											}, RequestContext(request))


def delete_sheet_api(request, sheet_id):
	"""
	Deletes sheet with id, only if the requester is the sheet owner. 
	"""
	id = int(sheet_id)
	sheet = db.sheets.find_one({"id": id})
	if not sheet:
		return jsonResponse({"error": "Sheet %d not found." % id})

	if request.user.id != sheet["owner"]:
		return jsonResponse({"error": "Only the sheet owner may delete a sheet."})

	db.sheets.remove({"id": id})

	return jsonResponse({"status": "ok"})


@ensure_csrf_cookie
def topic_view(request, topic):
	"""
	View a single Topic sheet
	"""
	sheet = get_topic(topic)
	if "error" in sheet:
		return HttpResponse(sheet["error"])
	can_edit = request.user.is_authenticated()
	try:
		owner = User.objects.get(id=sheet["owner"])
		author = owner.first_name + " " + owner.last_name
	except User.DoesNotExist:
		author = "Someone Mysterious"
	return render_to_response('sheets.html', {"sheetJSON": json.dumps(sheet), 
												"can_edit": can_edit, 
												"title": sheet["title"],
												"author": author,
												"topic": True,
												"current_url": request.get_full_path,
												"toc": get_toc(),
												"titlesJSON": json.dumps(get_text_titles()),
											}, RequestContext(request))


def topics_list(request):
	"""
	Show index of all topics
	"""
	topics = db.sheets.find({"status": 5}).sort([["title", 1]])
	return render_to_response('topics.html', {"topics": topics,
												"status": 5,
												"group": "topics",
												"title": "Torah Sources by Topic",
												"toc": get_toc(),
												"titlesJSON": json.dumps(get_text_titles()),
											}, RequestContext(request))


def sheets_list(request, type=None):
	"""
	List of all public/your/all sheets
	either as a full page or as an HTML fragment
	"""
	response = {
		"status": 0,
		"toc": get_toc(),
		"titlesJSON": json.dumps(get_text_titles()),
	}

	if not type:
		# Sheet Splash page
		query = {"status": {"$in": LISTED_SHEETS}}
		public = db.sheets.find(query).sort([["dateModified", -1]])

		query = {"owner": request.user.id}
		your = db.sheets.find(query).sort([["dateModified", -1]]) if request.user.is_authenticated() else []
		return render_to_response('sheets_splash.html', {"public_sheets": public,
															"your_sheets": your,
														}, 
													RequestContext(request))

	if type == "public":
		query = {"status": {"$in": LISTED_SHEETS}}
		response["title"] = "Public Source Sheets"
	elif type == "private":
		query = {"owner": request.user.id or -1 }
		response["title"] = "Your Source Sheets"

	elif type == "allz":
		query = {}
		response["title"] = "All Source Sheets"


	topics = db.sheets.find(query).sort([["dateModified", -1]])
	if "fragment" in request.GET:
		return render_to_response('elements/sheet_table.html', {"sheets": topics})
	else:
		response["topics"] = topics
		return render_to_response('topics.html', response, RequestContext(request))


def partner_page(request, partner):
	# Show Partner Page 

	partner = partner.replace("-", " ").replace("_", " ")
	try:
		group = Group.objects.get(name__iexact=partner)
	except Group.DoesNotExist:
		return redirect("home")

	if not request.user.is_authenticated() or group not in request.user.groups.all():
		in_group = False
		query = {"status": 7, "group": partner}
	else:
		in_group = True
		query = {"status": {"$in": [6,7]}, "group": partner}


	topics = db.sheets.find(query).sort([["title", 1]])
	return render_to_response('topics.html', {"topics": topics,
												"status": 6,
												"group": group.name,
												"in_group": in_group,
												"title": "%s's Topics" % group.name,
												"toc": get_toc(),
												"titlesJSON": json.dumps(get_text_titles()),
											}, RequestContext(request))


def sheet_list_api(request):
	# Show list of available sheets
	if request.method == "GET":
		return jsonResponse(sheet_list())

	# Save a sheet
	if request.method == "POST":
		if not request.user.is_authenticated():
			return jsonResponse({"error": "You must be logged in to save."})
		
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "No JSON given in post data."})
		sheet = json.loads(j)
		if "id" in sheet:
			existing = get_sheet(sheet["id"])
			if not can_edit(request.user, existing):
				return jsonResponse({"error": "You don't have permission to edit this sheet."})
		
		return jsonResponse(save_sheet(sheet, request.user.id))


def user_sheet_list_api(request, user_id):
	if int(user_id) != request.user.id:
		return jsonResponse({"error": "You are not authorized to view that."})
	return jsonResponse(sheet_list(user_id))


def sheet_api(request, sheet_id):
	if request.method == "GET":
		sheet = get_sheet(int(sheet_id))
		can_edit = sheet["owner"] == request.user.id or sheet["status"] in (PUBLIC_SHEET_VIEW, PUBLIC_SHEET_EDIT)
		return jsonResponse(sheet, {"can_edit": can_edit})

	if request.method == "POST":
		return jsonResponse({"error": "TODO - save to sheet by id"})


def add_source_to_sheet_api(request, sheet_id):
	source = json.loads(request.POST.get("source"))
	if not source:
		return jsonResponse({"error": "No source to copy given."})
	return jsonResponse(add_source_to_sheet(int(sheet_id), source))


def copy_source_to_sheet_api(request, sheet_id):
	copy_sheet = request.POST.get("sheet")
	copy_source = request.POST.get("source")
	if not copy_sheet and copy_source:
		return jsonResponse({"error": "Need both a sheet and source number to copy."})
	return jsonResponse(copy_source_to_sheet(int(sheet_id), int(copy_sheet), int(copy_source)))


def add_ref_to_sheet_api(request, sheet_id):
	ref = request.POST.get("ref")
	if not ref:
		return jsonResponse({"error": "No ref given in post data."})
	return jsonResponse(add_ref_to_sheet(int(sheet_id), ref))
