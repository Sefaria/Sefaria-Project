from functools import wraps
# import os

from django.http import HttpResponseRedirect
# from oauth2client.client import flow_from_clientsecrets
# from oauth2client.contrib import xsrfutil
from oauth2client.contrib.django_orm import Storage

from gauth.models import CredentialsModel
# from sefaria import settings


def gauth_required(func):
    """
    Decorator that requires the user to authenticate
    with Google and authorize Sefaria to act on their behalf.
    If the user has already authenticated, it will call the wrapped function
    with the kwarg `credential` set to the obtained credentials.
    If not, it will start the OAuth 2.0 flow.
    At the moment, only used for sheets.views.export_to_drive.
    """
    @wraps(func)
    def inner(request, *args, **kwargs):
        storage = Storage(CredentialsModel, 'id', request.user, 'credential')
        credential = storage.get()

        if credential is None or credential.invalid:
            request.session['next_view'] = request.path
            return HttpResponseRedirect('/gauth')

        return func(request, *args, credential=credential, **kwargs)
    return inner


# def gauth_required(func):
#     """
#     Decorator that requires the user to authenticate
#     with Google and authorize Sefaria to act on their behalf.
#     If the user has already authenticated, it will call the wrapped function
#     with the kwarg `credential` set to the obtained credentials.
#     If not, it will start the OAuth 2.0 flow.
#     At the moment, only used for sheets.views.export_to_drive.
#     """
#     @wraps(func)
#     def inner(*args, **kwargs):
#         request = args[0]
#
#         storage = Storage(CredentialsModel, 'id', request.user, 'credential')
#         credential = storage.get()
#
#         if credential is None or credential.invalid == True:
#             # CLIENT_SECRETS, name of a file containing the OAuth 2.0
#             # information for this application, including client_id and
#             # client_secret, which are found on the API Access tab on the
#             # Google APIs Console <http://code.google.com/apis/console>
#             CLIENT_SECRETS = os.path.join(os.path.dirname(__file__),
#                                           'client_secrets.json')
#
#             FLOW = flow_from_clientsecrets(
#                 CLIENT_SECRETS,
#                 scope='https://www.googleapis.com/auth/drive',
#                 redirect_uri='/gauthcallback')
#                 # redirect_uri='http://localhost:8000/gauthcallback')
#
#             FLOW.params['state'] = xsrfutil.generate_token(settings.SECRET_KEY,
#                                                            request.user)
#             request.session['next_view'] = request.path
#             authorize_url = FLOW.step1_get_authorize_url()
#             return HttpResponseRedirect(authorize_url)
#
#         return func(*args, credential=credential, **kwargs)
#
#     return inner
