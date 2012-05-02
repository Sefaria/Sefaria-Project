from django.template import Context, loader, RequestContext
from django.shortcuts import render_to_response, get_object_or_404
from django.http import HttpResponse, HttpResponseRedirect
from django.core.urlresolvers import reverse
from django.utils import simplejson

from sefaria.texts import *

def home(request):
	return HttpResponse("home")

def reader(request, ref=None):
	ref = ref or "Genesis 1"
	initJSON = json.dumps(getText(ref))
	titles = json.dumps(get_text_titles())
	return render_to_response('reader.html', {'titles': titles, 'initJSON': initJSON})

def texts_api(request, ref):
	return jsonResponse(getText(ref))

def table_of_contents_api(request):
	return jsonResponse(table_of_contents())

def text_titles_api(request):
	return HttpResponse("text titles api")

def index_api(request, title):
	return HttpResponse("index api")

def links_api(request, link_id):
	return HttpResponse("links api")

def notes_api(request, note_id):
	return HttpResponse("note api")



def jsonResponse(data):
	return HttpResponse(json.dumps(data), mimetype="application/json")




