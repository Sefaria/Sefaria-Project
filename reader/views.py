# Create your views here.
from django.template import Context, loader, RequestContext
from django.shortcuts import render_to_response, get_object_or_404
from django.http import HttpResponse, HttpResponseRedirect
from django.core.urlresolvers import reverse
from django.utils import simplejson

from sefaria.texts import *

def home(request):
	 return HttpResponse(getText("Gen.1"))