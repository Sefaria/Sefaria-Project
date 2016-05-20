import os
import logging
import httplib2

from googleapiclient.discovery import build
from django.contrib.auth.decorators import login_required
from django.core.urlresolvers import reverse
from django.http import (
    HttpResponse,
    HttpResponseBadRequest,
    HttpResponseRedirect)
from django.shortcuts import (render,
                              redirect)
from models import CredentialsModel
from sefaria import settings
from oauth2client.contrib import xsrfutil
from oauth2client.client import flow_from_clientsecrets
from oauth2client.contrib.django_orm import Storage

from functools import wraps
from django.template.loader import render_to_string
from django.views.decorators.csrf import ensure_csrf_cookie
from sefaria.sheets import get_sheet
from sefaria.model.user_profile import (
    annotate_user_list,
    public_user_data,
    user_link)

# CLIENT_SECRETS, name of a file containing the OAuth 2.0 information for this
# application, including client_id and client_secret, which are found
# on the API Access tab on the Google APIs
# Console <http://code.google.com/apis/console>
CLIENT_SECRETS = os.path.join(os.path.dirname(
    __file__), '..', 'client_secrets.json')

FLOW = flow_from_clientsecrets(
    CLIENT_SECRETS,
    scope='https://www.googleapis.com/auth/drive',
    redirect_uri='http://localhost:8000/gauthcallback')


def gauth_required(func):
    @wraps(func)
    def inner(*args, **kwargs):
        storage = Storage(CredentialsModel, 'id', request.user, 'credential')
        credential = storage.get()

        if credential is None or credential.invalid == True:
            FLOW.params['state'] = xsrfutil.generate_token(settings.SECRET_KEY,
                                                           request.user)
            authorize_url = FLOW.step1_get_authorize_url()
            return HttpResponseRedirect(authorize_url)  # add next_view

    return inner

# @login_required


# def index(request):
#     storage = Storage(CredentialsModel, 'id', request.user, 'credential')
#     credential = storage.get()
#     if credential is None or credential.invalid == True:
#         FLOW.params['state'] = xsrfutil.generate_token(settings.SECRET_KEY,
#                                                        request.user)
#         authorize_url = FLOW.step1_get_authorize_url()
#         return HttpResponseRedirect(authorize_url)
#     else:
#         http = credential.authorize(httplib2.Http())
#         service = build('drive', 'v3', http=http)


# import json
#
# from sefaria.sheets import get_sheet
# from sefaria.sheets.views import make_sheet_class_string
# from sefaria.model.group import Group
#
#
# @ensure_csrf_cookie
# def sheet_to_html(sheet_id):
#     """
#     Create the html with sheet_id.
#     """
#     sheet = get_sheet(sheet_id)
#     if "error" in sheet:
#         return HttpResponse(sheet["error"])
#
#     sheet["sources"] = annotate_user_links(sheet["sources"])
#
#     try:
#         owner = User.objects.get(id=sheet["owner"])
#         author = owner.first_name + " " + owner.last_name
#     except User.DoesNotExist:
#         author = "Someone Mysterious"
#
#     sheet_group = (Group().load({"name": sheet["group"]})
#                    if "group" in sheet and sheet["group"] != "None" else None)
#
#     return render_to_string('sheets.html', {
#         "sheetJSON": json.dumps(sheet),
#         "sheet": sheet,
#         "sheet_class": make_sheet_class_string(sheet),
#         "can_edit": False,
#         "can_add": False,
#         "title": sheet["title"],
#         "author": author,
#         "is_owner": False,
#         "is_public": sheet["status"] == "public",
#         "owner_groups": None,
#         "sheet_group":  sheet_group,
#         "like_count": len(sheet.get("likes", [])),
#         "viewer_is_liker": False,
#         "assignments_from_sheet": assignments_from_sheet(sheet_id),
#     }, RequestContext(request))


@login_required
def auth_return(request):
    if not xsrfutil.validate_token(settings.SECRET_KEY,
                                   str(request.REQUEST['state']),
                                   request.user):
        return HttpResponseBadRequest()

    credential = FLOW.step2_exchange(request.REQUEST)
    storage = Storage(CredentialsModel, 'id', request.user, 'credential')
    storage.put(credential)

    return redirect(request.session.get('next_view', '/'))
