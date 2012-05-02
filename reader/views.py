from django.template import Context, loader, RequestContext
from django.shortcuts import render_to_response, get_object_or_404
from django.http import HttpResponse, HttpResponseRedirect
from django.core.urlresolvers import reverse
from django.utils import simplejson

from sefaria.texts import *

def home(request):
	return HttpResponse("home")

def reader(request, ref=None):
	return HttpResponse("reader! %s" % ref)

def texts_api(request, ref):
	return HttpResponse("texts api")

def table_of_contents_api(request):
	return HttpResponse("toc api")

def text_titles_api(request):
	return HttpResponse("text titles api")

def index_api(request, title):
	return HttpResponse("index api")

def links_api(request, link_id):
	return HttpResponse("links api")

def notes_api(request, note_id):
	return HttpResponse("note api")






