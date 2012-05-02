from django.template import Context, loader, RequestContext
from django.shortcuts import render_to_response, get_object_or_404
from django.http import HttpResponse, HttpResponseRedirect
from django.core.urlresolvers import reverse
from django.utils import simplejson

from sefaria.texts import *
from sefaria.sheets import *


def new_sheet(request):
	return HttpResponse("new sheet")

def view_sheet(request, sheet_id):
	return HttpResponse("view sheet")

def sheet_api(request, sheet_id):
	return HttpResponse("sheet api")

def add_to_sheet_api(request, sheet_id):
	return HttpResponse("add to sheet api")




