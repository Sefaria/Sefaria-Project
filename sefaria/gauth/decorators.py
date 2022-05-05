from functools import wraps
import datetime

from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import redirect

from sefaria.model.user_profile import UserProfile

import google.auth
import google.oauth2
import google_auth_oauthlib.flow

import structlog
logger = structlog.get_logger(__name__)

def gauth_required(scope, ajax=False):
    """
    Decorator that requires the user to authenticate
    with Google and authorize Sefaria to act on their behalf.
    If the user has already authenticated, it will call the wrapped function
    with the kwarg `credential` set to the obtained credentials.
    If not, it will start the OAuth 2.0 flow.
    At the moment, only used for sheets.views.export_to_drive.
    """
    def decorator(func):
        @login_required
        @wraps(func)
        def inner(request, *args, **kwargs):
            # Try grabbing credential from storage
            profile = UserProfile(user_obj=request.user)
            credentials_dict = profile.gauth_token

            if credentials_dict is None or not set(scope).issubset(set(credentials_dict['scopes'])):
                request.session['next_view'] = request.path
                request.session['gauth_scope'] = scope
                return (HttpResponse('Unauthorized', status=401)
                    if ajax else redirect('gauth_index'))
           
            credentials = google.oauth2.credentials.Credentials(
                credentials_dict['token'],
                refresh_token=credentials_dict['refresh_token'],
                id_token=credentials_dict['id_token'],
                token_uri=credentials_dict['token_uri'],
                client_id=credentials_dict['client_id'],
                client_secret=credentials_dict['client_secret'],
                scopes=[credentials_dict['scopes']],
            )

            expiry = datetime.datetime.strptime(credentials_dict['expiry'], '%Y-%m-%d %H:%M:%S')
            credentials.expiry = expiry
            auth_request = google.auth.transport.requests.Request()
            if credentials.expired:
                try:
                    credentials.refresh(auth_request)
                except:
                    request.session['next_view'] = request.path
                    request.session['gauth_scope'] = scope
                    return (HttpResponse('Unauthorized', status=401)
                            if ajax else redirect('gauth_index'))

            # Everything went well, call wrapped view and give credential to it
            kwargs['credential'] = credentials
            return func(request, *args, **kwargs)
        return inner
    return decorator
