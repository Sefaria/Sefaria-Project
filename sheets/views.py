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


@ensure_csrf_cookie
def new_sheet(request):
	"""
	View an new, empty source sheet.
	"""
	viewer_groups = get_viewer_groups(request.user)
	return render_to_response('sheets.html', {"can_edit": True,
												"new_sheet": True,
												"is_owner": True,
												"viewer_groups": viewer_groups,
												"owner_groups": viewer_groups,
											    "current_url": request.get_full_path,
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


def can_add(user, sheet):
	"""
	Returns true if user has adding persmission on sheet.
	Returns false if user has the higher permission "can_edit"
	"""
	if not user.is_authenticated():
		return False
	if can_edit(user, sheet):
		return False
	if "collaboration" not in sheet["options"]:
		return False
	if sheet["options"]["collaboration"] == "anyone-can-add":
		return True

	return False


def get_viewer_groups(user):
	"""
	Returns a list of names of groups that user belongs to.
	"""
	return [g.name for g in user.groups.all()] if user.is_authenticated() else None


def make_sheet_class_string(sheet):
	"""
	Returns a string of class names corresponding to the options of sheet.
	"""
	o = sheet["options"]
	classes = []
	classes.append(o.get("language", "bilingual"))
	classes.append(o.get("layout", "sideBySide"))
	classes.append(o.get("langLayout", ""))

	if o.get("numbered", False):  classes.append("numbered")
	if o.get("boxed", False):     classes.append("boxed")

	if sheet["status"] in LISTED_SHEETS: classes.append("public")

	return " ".join(classes)


@ensure_csrf_cookie
def view_sheet(request, sheet_id):
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
		owner_groups = [g.name for g in owner.groups.all()] if sheet["owner"] == request.user.id else None
	except User.DoesNotExist:
		author = "Someone Mysterious"
		owner_groups = None

	sheet_class     = make_sheet_class_string(sheet)
	can_edit_flag   = can_edit(request.user, sheet)
	can_add_flag    = can_add(request.user, sheet)
	sheet_group     = sheet["group"] if sheet["status"] in GROUP_SHEETS and sheet["group"] != "None" else None
	viewer_groups   = get_viewer_groups(request.user)
	embed_flag      = "embed" in request.GET
	likes           = sheet.get("likes", [])
	like_count      = len(likes)
	viewer_is_liker = request.user.id in likes

	return render_to_response('sheets.html', {"sheetJSON": json.dumps(sheet), 
												"sheet": sheet,
												"sheet_class": sheet_class,
												"can_edit": can_edit_flag, 
												"can_add": can_add_flag,
												"title": sheet["title"],
												"author": author,
												"is_owner": request.user.id == sheet["owner"],
												"is_public": sheet["status"] in LISTED_SHEETS,
												"owner_groups": owner_groups,
												"sheet_group":  sheet_group,
												"viewer_groups": viewer_groups,
												"like_count": like_count,
												"viewer_is_liker": viewer_is_liker,
												"current_url": request.get_full_path,
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
	View a single Topic sheet (OUTDATED)
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
											}, RequestContext(request))


def topics_list(request):
	"""
	Show index of all topics (OUTDATED)
	"""
	topics = db.sheets.find({"status": 5}).sort([["title", 1]])
	return render_to_response('topics.html', {"topics": topics,
												"status": 5,
												"group": "topics",
												"title": "Torah Sources by Topic",
											}, RequestContext(request))


def sheets_list(request, type=None):
	"""
	List of all public/your/all sheets
	either as a full page or as an HTML fragment
	"""
	response = {
		"status": 0,
	}

	if not type:
		# Sheet Splash page
		query = {"status": {"$in": LISTED_SHEETS}}
		public = db.sheets.find(query).sort([["dateModified", -1]])

		query = {"owner": request.user.id}
		your = db.sheets.find(query).sort([["dateModified", -1]])
		return render_to_response('sheets_splash.html', {"public_sheets": public,
															"your_sheets": your,
															"collapse_private": your.count() > 3,
															"groups": get_viewer_groups(request.user)
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
	"""
	Views the partner page for 'partner' which lists sheets in the partner group.
	"""

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
											}, RequestContext(request))

def sheet_stats(request):
	pass



def sheets_tags_list(request):
	"""
	View public sheets organied by tags.
	"""
	tags_list = make_sheet_list_by_tag()
	return render_to_response('sheet_tags.html', {"tags_list": tags_list, }, RequestContext(request))	


def sheet_list_api(request):
	"""
	API for listing available sheets
	"""
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
			if "error" not in existing  and \
				not can_edit(request.user, existing) and \
				not can_add(request.user, existing):
				
				return jsonResponse({"error": "You don't have permission to edit this sheet."})
		
		responseSheet = save_sheet(sheet, request.user.id)
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
	return jsonResponse(sheet_list(user_id))


def sheet_api(request, sheet_id):
	"""
	API for accessing and individual sheet.
	"""
	if request.method == "GET":
		sheet = get_sheet(int(sheet_id))
		return jsonResponse(sheet)

	if request.method == "POST":
		return jsonResponse({"error": "TODO - save to sheet by id"})


def check_sheet_modified_api(request, sheet_id, timestamp):
	"""
	Check if sheet_id has been modified since timestamp.
	If modified, return the new sheet. 
	"""
	sheet_id = int(sheet_id)
	last_mod = get_last_updated_time(sheet_id)
	if not last_mod:
		return jsonResponse({"error": "Couldn't find last modified time."})

	if timestamp >= last_mod:
		return jsonResponse({"modified": False})

	sheet = get_sheet(sheet_id)
	if "error" in sheet:
		return jsonResponse(sheet)

	sheet["modified"] = True
	sheet["sources"] = annotate_user_links(sheet["sources"])
	return jsonResponse(sheet)	


def add_source_to_sheet_api(request, sheet_id):
	"""
	API to add a fully formed source (posted as JSON) to sheet_id.
	"""
	source = json.loads(request.POST.get("source"))
	if not source:
		return jsonResponse({"error": "No source to copy given."})
	return jsonResponse(add_source_to_sheet(int(sheet_id), source))


def copy_source_to_sheet_api(request, sheet_id):
	"""
	API to copy a source from one sheet to another. 
	"""
	copy_sheet = request.POST.get("sheet")
	copy_source = request.POST.get("source")
	if not copy_sheet and copy_source:
		return jsonResponse({"error": "Need both a sheet and source number to copy."})
	return jsonResponse(copy_source_to_sheet(int(sheet_id), int(copy_sheet), int(copy_source)))


def add_ref_to_sheet_api(request, sheet_id):
	"""
	API to add a source to a sheet using only a ref.
	"""
	ref = request.POST.get("ref")
	if not ref:
		return jsonResponse({"error": "No ref given in post data."})
	return jsonResponse(add_ref_to_sheet(int(sheet_id), ref))


def update_sheet_tags_api(request, sheet_id):
	"""
	API to update tags for sheet_id. 
	"""
	tags = json.loads(request.POST.get("tags"))
	return jsonResponse(update_sheet_tags(int(sheet_id), tags))


def like_sheet_api(request, sheet_id):
	"""
	API to like sheet_id.
	"""
	if not request.user.is_authenticated():
		return {"error": "You must be logged in to like sheets."}
	if request.method != "POST":
		return jsonResponse({"error": "Unsupported HTTP method."})

	add_like_to_sheet(int(sheet_id), request.user.id)
	return jsonResponse({"status": "ok"})


def unlike_sheet_api(request, sheet_id):
	"""
	API to unlike sheet_id.
	"""
	if not request.user.is_authenticated():
		return jsonResponse({"error": "You must be logged in to like sheets."})
	if request.method != "POST":
		return jsonResponse({"error": "Unsupported HTTP method."})

	remove_like_from_sheet(int(sheet_id), request.user.id)
	return jsonResponse({"status": "ok"})


def sheet_likers_api(request, sheet_id):
	"""
	API to retrieve the list of peopke who like sheet_id.
	"""
	response = {"likers": likers_list_for_sheet(sheet_id)}
	return jsonResponse(response)