from django.template import Context, loader, RequestContext
from django.shortcuts import render_to_response, get_object_or_404
from django.http import HttpResponse, HttpResponseRedirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.core.urlresolvers import reverse
from django.utils import simplejson
from django.contrib.auth.models import User
from sefaria.texts import *

def home(request):
	return HttpResponse("home")

@ensure_csrf_cookie
def reader(request, ref=None):
	ref = ref or "Genesis 1"
	initJSON = json.dumps(get_text(ref))
	titles = json.dumps(get_text_titles())
	email = request.user.email if request.user.is_authenticated() else ""

	return render_to_response('reader.html', 
							 {'titles': titles,
							 'initJSON': initJSON, 
							 'ref': norm_ref(ref),
							 'email': email}, 
							 RequestContext(request))


def texts_api(request, ref):
	if request.method == "GET":
		cb = request.GET.get("callback")
		if cb:
			return jsonpResponse(get_text(ref), cb)
		else:
			return jsonResponse(get_text(ref))

	if request.method == "POST":
		if not request.user.is_authenticated():
			return jsonResponse({"error": "You must be logged in to save texts."})
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "No postdata."})
		response = save_text(ref, json.loads(j), request.user.id)
		if 'revisionDate' in response:
			del response['revisionDate']
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
	if request.method == "POST":
		if not request.user.is_authenticated():
			return jsonResponse({"error": "You must be logged in to add links."})
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "No post JSON."})
		j = json.loads(j)
		if "type" in j and j["type"] == "note":
			return jsonResponse(save_note(j, request.user.id))
		else:
			return jsonResponse(save_link(j, request.user.id))
	
	if request.method == "DELETE":
		if not request.user.is_authenticated():
			return jsonResponse({"error": "You must be logged in to delete links."})
		return jsonResponse(delete_link(link_id, request.user.id))

	return jsonResponse({"error": "Unsuported HTTP method."})


def notes_api(request, note_id):
	if request.method == "DELETE":
		if not request.user.is_authenticated():
			return jsonResponse({"error": "You must be logged in to delete notes."})
		return jsonResponse(delete_note(note_id, request.user.id))

	return jsonResponse({"error": "Unsuported HTTP method."})


def activity(request):
	activity = list(db.history.find().sort([['revision', -1]]).limit(100))

	for i in range(len(activity)):
		email = request.user.email if request.user.is_authenticated() else ""
		activity[i]["text"] = text_at_revision(activity[i]["ref"], activity[i]["version"], activity[i]["language"], activity[i]["revision"])
		uid = activity[i]["user"]
		user = User.objects.get(id=uid)
		activity[i]["firstname"] = user.first_name
		
	return render_to_response('activity.html', 
							 {'activity': activity,
							 'email': email}, 
							 RequestContext(request))


def contribute_page(request):
	return render_to_response('static/contribute.html')


def forum(request):
	return render_to_response('static/forum.html')



def jsonResponse(data):
	if "_id" in data:
		data["_id"] = str(data["_id"])
	return HttpResponse(json.dumps(data), mimetype="application/json")


def jsonpResponse(data, callback):
	if "_id" in data:
		data["_id"] = str(data["_id"])
	return HttpResponse("%s(%s)" % (callback, json.dumps(data)), mimetype="application/javascript")




