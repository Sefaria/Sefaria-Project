import json
from bson.son import SON
from datetime import datetime, timedelta

from django.template import RequestContext
from django.shortcuts import render_to_response, redirect

# noinspection PyUnresolvedReferences
from django.http import HttpResponse, HttpResponseRedirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.contrib.auth.decorators import login_required
from django.contrib.admin.views.decorators import staff_member_required

# noinspection PyUnresolvedReferences
from django.contrib.auth.models import User
from django.contrib.auth.models import Group as DjangoGroup


# noinspection PyUnresolvedReferences
from sefaria.client.util import jsonResponse, HttpResponse
from sefaria.sheets import *
from sefaria.model.user_profile import *
from sefaria.model.group import Group, GroupSet
from sefaria.utils.users import user_link
from sefaria.system.exceptions import InputError

# sefaria.model.dependencies makes sure that model listeners are loaded.
# noinspection PyUnresolvedReferences
import sefaria.model.dependencies


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
	query         = {"owner": request.user.id or -1 }
	hide_video    = db.sheets.find(query).count() > 2
	return render_to_response('sheets.html', {"can_edit": True,
												"new_sheet": True,
												"is_owner": True,
												"hide_video": hide_video,
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
	groups = [g.name for g in user.groups.all()]
	return GroupSet({"name": {"$in": groups }})


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


def sheet_tag_counts(query):
	"""
	Returns tags ordered by count for sheets matching query.
	"""
	tags = db.sheets.aggregate([
		{"$match": query },
		{"$unwind": "$tags"},
		{"$group": {"_id": "$tags", "count": {"$sum": 1}}},
		{"$sort": SON([("count", -1), ("_id", -1)])},
		{"$project": { "_id": 0, "tag": "$_id", "count": "$count" }}
	])
	return tags["result"]


def order_tags_for_user(tag_counts, uid):
	"""
	Returns of list of tag/count dicts order according to user's preference,
	Adds empty tags if any appear in user's sort list but not in tags passed in
	"""
	profile   = UserProfile(id=uid)
	tag_order = getattr(profile, "tag_order", None)
	if tag_order:
		empty_tags = tag_order[:]
		tags = [tag_count["tag"] for tag_count in tag_counts]		
		empty_tags = [tag for tag in tag_order if tag not in tags]
		
		for tag in empty_tags:
			tag_counts.append({"tag": tag, "count": 0})
		try:
			tag_counts = sorted(tag_counts, key=lambda x: tag_order.index(x["tag"]))
		except:
			pass
	print tag_counts
	return tag_counts


def recent_public_tags(days=14, ntags=10):
	"""
	Returns list of tag/counts on public sheets modified in the last 'days'.
	"""
	cutoff      = datetime.now() - timedelta(days=days)
	query       = {"status": {"$in": LISTED_SHEETS}, "dateModified": { "$gt": cutoff.isoformat() } }
	tags        = sheet_tag_counts(query)[:ntags]

	return tags


def sheets_list(request, type=None):
	"""
	List of all public/your/all sheets
	either as a full page or as an HTML fragment
	"""
	if not type:
		# Sheet Splash page
		query       = {"status": {"$in": LISTED_SHEETS}}
		public      = db.sheets.find(query).sort([["dateModified", -1]]).limit(32)
		public_tags = recent_public_tags()

		if request.user.is_authenticated():
			query       = {"owner": request.user.id}
			your        = db.sheets.find(query).sort([["dateModified", -1]]).limit(3)
			your_tags   = sheet_tag_counts(query)
			your_tags   = order_tags_for_user(your_tags, request.user.id)
			collapse    = your.count() > 3
		else:
			your = your_tags = collapse = None

		return render_to_response('sheets_splash.html',
									{
										"public_sheets": public,
										"public_tags": public_tags,
										"your_sheets": your,
										"your_tags":   your_tags,
										"collapse_private": collapse,
										"groups": get_viewer_groups(request.user)
									}, 
									RequestContext(request))

	response = { "status": 0 }

	if type == "public":
		query              = {"status": {"$in": LISTED_SHEETS}}
		response["title"]  = "Public Source Sheets"
		response["public"] = True
		tags               = recent_public_tags()

	elif type == "private":
		query              = {"owner": request.user.id or -1 }
		response["title"]  = "Your Source Sheets"
		response["groups"] = get_viewer_groups(request.user)
		tags               = sheet_tag_counts(query)
		tags               = order_tags_for_user(tags, request.user.id)

	elif type == "allz":
		query              = {}
		response["title"]  = "All Source Sheets"
		response["public"] = True
		tags               = []

	sheets = db.sheets.find(query).sort([["dateModified", -1]])
	if "fragment" in request.GET:
		return render_to_response('elements/sheet_table.html', {"sheets": sheets})

	response["sheets"] = sheets
	response["tags"]   = tags

	return render_to_response('sheets_list.html', response, RequestContext(request))


def partner_page(request, partner):
	"""
	Views the partner page for 'partner' which lists sheets in the partner group.
	"""
	partner = partner.replace("-", " ").replace("_", " ")
	group = Group().load({"name": partner})
	if not group:
		return redirect("home")

	if not request.user.is_authenticated() or group.name not in request.user.groups.all():
		in_group = False
		query = {"status": 7, "group": group.name}
	else:
		in_group = True
		query = {"status": {"$in": [6,7]}, "group": group.name}


	sheets = db.sheets.find(query).sort([["title", 1]])
	tags   = sheet_tag_counts(query)
	return render_to_response('sheets_list.html', {"sheets": sheets,
												"tags": tags,
												"status": 6,
												"group": group,
												"in_group": in_group,
												"title": "%s on Sefaria" % group.name,
											}, RequestContext(request))


def groups_page(request):
    groups = GroupSet(sort=[["name", 1]])
    return render_to_response("groups.html",
                                {"groups": groups},
                                RequestContext(request))


@staff_member_required
def groups_api(request):
	j = request.POST.get("json")
	if not j:
		return jsonResponse({"error": "No JSON given in post data."})
	group = json.loads(j)
	if request.method == "POST":
		existing = GroupSet({"name": group["name"]})
		if len(existing):
			existing.update(group)
			existing.save()
		else:
			Group(group).save()
			DjangoGroup.objects.create(name=group["name"])
		return jsonResponse({"status": "ok"})

	elif request.method == "DELETE":
		GroupSet(group).delete()
		return jsonResponse({"status": "ok"})
	
	else:
		return jsonResponse({"error": "Unsupported HTTP method."})


def sheet_stats(request):
	pass


def sheets_tags_list(request):
	"""
	View public sheets organied by tags.
	"""
	tags_list = make_sheet_list_by_tag()
	return render_to_response('sheet_tags.html', {"tags_list": tags_list, }, RequestContext(request))	


def sheets_tag(request, tag, public=True, group=None):
	"""
	View sheets for a particular tag.
	"""
	if public:
		sheets = get_sheets_by_tag(tag)
	elif group:
		sheets = get_sheets_by_tag(tag, group=group)
	else:
		sheets = get_sheets_by_tag(tag, uid=request.user.id)

	in_group = request.user.is_authenticated() and group in request.user.groups.all()
	groupCover = Group().load({"name": group}).coverUrl if Group().load({"name": group}) else None
	
	return render_to_response('tag.html', {
											"tag": tag,
											"sheets": sheets,
											"public": public,
											"group": group,
											"groupCover": groupCover,
											"in_group": in_group,
										 }, RequestContext(request))	

	return render_to_response('sheet_tags.html', {"tags_list": tags_list, }, RequestContext(request))	


@login_required
def private_sheets_tag(request, tag):
	"""
	Wrapper for sheet_tag for user tags
	"""
	return sheets_tag(request, tag, public=False)


def partner_sheets_tag(request, partner, tag):
	"""
	Wrapper for sheet_tag for partner tags
	"""
	group = partner.replace("_", " ")
	return sheets_tag(request, tag, public=False, group=group)


def sheet_list_api(request):
	"""
	API for listing available sheets
	"""
	if request.method == "GET":
		return jsonResponse(sheet_list(), callback=request.GET.get("callback", None))

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
	return jsonResponse(sheet_list(user_id), callback=request.GET.get("callback", None))


def sheet_api(request, sheet_id):
	"""
	API for accessing and individual sheet.
	"""
	if request.method == "GET":
		sheet = get_sheet(int(sheet_id))
		return jsonResponse(sheet, callback=request.GET.get("callback", None))

	if request.method == "POST":
		return jsonResponse({"error": "TODO - save to sheet by id"})


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


@login_required
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
	return jsonResponse(response, callback=request.GET.get("callback", None))
