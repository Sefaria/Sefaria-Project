from django.template import Context, loader, RequestContext
from django.shortcuts import render_to_response, get_object_or_404
from django.http import HttpResponse, HttpResponseRedirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.core.urlresolvers import reverse
from django.utils import simplejson
from django.contrib.auth.models import User
from sefaria.texts import *


@ensure_csrf_cookie
def reader(request, ref=None, lang=None, version=None):
	ref = ref or "Genesis 1"
	version = version.replace("_", " ") if version else None
	initJSON = json.dumps(get_text(ref, lang=lang, version=version))
	titles = json.dumps(get_text_titles())
	email = request.user.email if request.user.is_authenticated() else ""

	return render_to_response('reader.html', 
							 {'titles': titles,
							 'initJSON': initJSON, 
							 'ref': norm_ref(ref),
							 'email': email}, 
							 RequestContext(request))


def texts_api(request, ref, lang=None, version=None):
	if request.method == "GET":
		cb = request.GET.get("callback", None)
		version = version.replace("_", " ") if version else None
		return jsonResponse(get_text(ref, version=version, lang=lang), cb)

	if request.method == "POST":
		if not request.user.is_authenticated():
			return jsonResponse({"error": "You must be logged in to save texts."})
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "No postdata."})
		response = save_text(ref, json.loads(j), request.user.id)

		return jsonResponse(response)

	return jsonResponse({"error": "Unsuported HTTP method."})


def table_of_contents_api(request):
	return jsonResponse(table_of_contents())


def text_titles_api(request):
	return jsonResponse({"books": get_text_titles()})


def index_api(request, title):
	if request.method == "GET":
		i = get_index(title)
		return jsonResponse(i)
	
	if request.method == "POST":
		if not request.user.is_authenticated():
			return jsonResponse({"error": "You must be logged in to edit text information."})
		j = json.loads(request.POST.get("json"))
		if not j:
			return jsonResponse({"error": "No post JSON."})
		j["title"] = title.replace("_", " ")
		return jsonResponse(save_index(j, request.user.id))	

	return jsonResponse({"error": "Unsuported HTTP method."})


def links_api(request, link_id):
	if not request.user.is_authenticated():
		return jsonResponse({"error": "You must be logged in to add, edit or delete links."})
	if request.method == "POST":
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "No post JSON."})
		j = json.loads(j)
		if "type" in j and j["type"] == "note":
			return jsonResponse(save_note(j, request.user.id))
		else:
			return jsonResponse(save_link(j, request.user.id))
	
	if request.method == "DELETE":
		return jsonResponse(delete_link(link_id, request.user.id))

	return jsonResponse({"error": "Unsuported HTTP method."})


def notes_api(request, note_id):
	if request.method == "DELETE":
		if not request.user.is_authenticated():
			return jsonResponse({"error": "You must be logged in to delete notes."})
		return jsonResponse(delete_note(note_id, request.user.id))

	return jsonResponse({"error": "Unsuported HTTP method."})


def global_activity(request, page=1):
	page_size = 100
	page = int(page)

	activity = list(db.history.find().sort([['revision', -1]]).skip((page-1)*page_size).limit(page_size))
	next_page = page + 1 if len(activity) else 0

	for i in range(len(activity)):
		a = activity[i]
		if a["rev_type"].endswith("text"):
			a["text"] = text_at_revision(a["ref"], a["version"], a["language"], a["revision"])
			a["history_url"] = "/activity/%s/%s/%s" % (url_ref(a["ref"]), a["language"], a["version"].replace(" ", "_"))
		uid = a["user"]
		user = User.objects.get(id=uid)
		a["firstname"] = user.first_name

	email = request.user.email if request.user.is_authenticated() else False
	return render_to_response('activity.html', 
							 {'activity': activity,
							 'email': email,
							 'next_page': next_page }, 
							 RequestContext(request))


@ensure_csrf_cookie
def segment_history(request, ref, lang, version):
	ref = norm_ref(ref)
	if not ref:
		return HttpResponse("There was an error in your text referene: %s" % parse_ref(ref)["error"])
	version = version.replace("_", " ")

	history = text_history(ref, version, lang)

	for i in range(len(history)):
		uid = history[i]["user"]
		if isinstance(uid, int):
			user = User.objects.get(id=uid)
			history[i]["firstname"] = user.first_name
		else:
			# For reversions before history where user is 'Unknown'
			history[i]["firstname"] = uid

	url = "%s/%s/%s" % (url_ref(ref), lang, version.replace(" ", "_"))	
	email = request.user.email if request.user.is_authenticated() else False
	return render_to_response('activity.html', 
							 {'activity': history,
							  "single": True, "ref": ref, "lang": lang, "version": version,
							 'url': url,
							 'email': email}, 
							 RequestContext(request))


def revert_api(request, ref, lang, version, revision):
	if not request.user.is_authenticated():
		return jsonResponse({"error": "You must be logged in to revert changes."})

	if request.method != "POST":
		return jsonResponse({"error": "Unsupported HTTP method."})

	revision = int(revision)
	version = version.replace("_", " ")
	ref = norm_ref(ref)
	if not ref:
		return jsonResponse(parse_ref(ref)) # pass along the error message


	text = {
		"versionTitle": version,
		"language": lang,
		"text": text_at_revision(ref, version, lang, revision)
	}

	return jsonResponse(save_text(ref, text, request.user.id, type="revert text"))


def splash(request):
	return render_to_response('static/splash.html', {"books": json.dumps(get_text_titles())}, RequestContext(request))


def contribute_page(request):
	return render_to_response('static/contribute.html', {}, RequestContext(request))


def forum(request):
	return render_to_response('static/forum.html',  {}, RequestContext(request))



def jsonResponse(data, callback=None):
	if callback:
		return jsonpResponse(data, callback)
	if "_id" in data:
		data["_id"] = str(data["_id"])
	return HttpResponse(json.dumps(data), mimetype="application/json")


def jsonpResponse(data, callback):
	if "_id" in data:
		data["_id"] = str(data["_id"])
	return HttpResponse("%s(%s)" % (callback, json.dumps(data)), mimetype="application/javascript")




