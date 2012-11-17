from django.template import Context, loader, RequestContext
from django.shortcuts import render_to_response, get_object_or_404
from django.http import HttpResponse, HttpResponseRedirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.core.urlresolvers import reverse
from django.utils import simplejson as json
from django.contrib.auth.models import User
from sefaria.texts import *
from sefaria.sheets import *
from sefaria.util import *


@ensure_csrf_cookie
def new_sheet(request):
	return render_to_response('sheets.html', {"can_edit": True,
												"new_sheet": True,
											    "current_url": request.get_full_path,
											    "toc": get_toc(), },
											     RequestContext(request))


@ensure_csrf_cookie
def view_sheet(request, sheet_id):
	sheet = get_sheet(sheet_id)
	can_edit = sheet["owner"] == request.user.id or sheet["status"] in EDITABLE_SHEETS
	try:
		owner = User.objects.get(id=sheet["owner"])
		author = owner.first_name + " " + owner.last_name
		owner_groups = owner.groups.all() if sheet["owner"] == request.user.id else None
	except User.DoesNotExist:
		author = "Someone Mysterious"
		owner_groups = None
	group = sheet["group"].replace(" ", "-") if sheet["status"] == PARTNER_SHEET else None
	return render_to_response('sheets.html', {"sheetJSON": json.dumps(sheet), 
												"can_edit": can_edit, 
												"title": sheet["title"],
												"author": author,
												"owner_groups": owner_groups,
												"group":  group,
												"current_url": request.get_full_path,
												"toc": get_toc(),},
												 RequestContext(request))


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
			if existing["owner"] != request.user.id and not existing["status"] in (LINK_SHEET_EDIT, PUBLIC_SHEET_EDIT):
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


def add_to_sheet_api(request, sheet_id):
	ref = request.POST.get("ref")
	if not ref:
		return jsonResponse({"error": "No ref given in post data."})
	return jsonResponse(add_to_sheet(int(sheet_id), ref))
