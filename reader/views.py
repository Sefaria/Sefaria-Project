from django.template import Context, loader, RequestContext
from django.shortcuts import render_to_response, get_object_or_404
from django.http import HttpResponse, HttpResponseRedirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.core.urlresolvers import reverse
from django.utils import simplejson

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
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "No postdata."})
		response = save_text(ref, json.loads(j))
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
		j = json.loads(request.POST.get("json"))
		if not j:
			return jsonResponse({"error": "No post JSON."})
		j["title"] = title.replace("_", " ")
		return jsonResponse(saveIndex(j))	

	return jsonResponse({"error": "Unsuported HTTP method."})


def links_api(request, link_id):
	if request.method == "POST":
		j = request.POST.get("json")
		if not j:
			return jsonResponse({"error": "No post JSON."})
		j = json.loads(j)
		if "type" in j and j["type"] == "note":
			return jsonResponse(save_note(j))
		else:
			return jsonResponse(save_link(j))
	
	if request.method == "DELETE":
		return jsonResponse(delete_link(link_id))

	return jsonResponse({"error": "Unsuported HTTP method."})


def notes_api(request, note_id):
	if request.method == "DELETE":
		return jsonResponse(delete_note(note_id))

	return jsonResponse({"error": "Unsuported HTTP method."})


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




