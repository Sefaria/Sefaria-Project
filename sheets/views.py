from django.template import Context, loader, RequestContext
from django.shortcuts import render_to_response, get_object_or_404
from django.http import HttpResponse, HttpResponseRedirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.core.urlresolvers import reverse
from django.utils import simplejson

from sefaria.texts import *
from sefaria.sheets import *

@ensure_csrf_cookie
def new_sheet(request):
	return render_to_response('sheets.html', {}, RequestContext(request))


@ensure_csrf_cookie
def view_sheet(request, sheet_id):
	return render_to_response('sheets.html', {"sheetJSON": json.dumps(get_sheet(sheet_id))}, RequestContext(request))


def sheet_list_api(request):
	# Show list of available sheets
	if request.method == "GET":
		return jsonResponse(sheet_list())

	# Save a sheet
	if request.method == "POST":
		j = request.POST.get("json")
		if not request.user.is_authenticated():
			return jsonResponse({"error": "You must be logged in to save."})
		if not j:
			return jsonResponse({"error": "No JSON given in post data."})
		return jsonResponse(save_sheet(json.loads(j), request.user.id))


def user_sheet_list_api(request, user_id):
	if int(user_id) != request.user.id:
		return jsonResponse({"error": "You are not authorized to view that"})
	return jsonResponse(sheet_list(user_id))


def sheet_api(request, sheet_id):
	if request.method == "GET":
		return jsonResponse(get_sheet(int(sheet_id)))

	if request.method == "POST":
		return jsonResponse({"error": "TODO - save to sheet by id"})


def add_to_sheet_api(request, sheet_id):
	ref = request.POST.get("ref")
	if not ref:
		return jsonResponse({"error": "No ref given in post data."})
	return jsonResponse(add_to_sheet(int(sheetId), ref))


def jsonResponse(data):
	if "_id" in data:
		data["_id"] = str(data["_id"])
	return HttpResponse(json.dumps(data), mimetype="application/json")


def jsonpResponse(data, callback):
	if "_id" in data:
		data["_id"] = str(data["_id"])
	return HttpResponse("%s(%s)" % (callback, json.dumps(data)), mimetype="application/javascript")



