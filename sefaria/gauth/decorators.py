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

            logger.info("gauth_decorator_check",
                user_id=request.user.id,
                required_scope=scope,
                required_scope_type=type(scope).__name__,
                has_credentials=credentials_dict is not None,
                stored_scopes=credentials_dict.get('scopes') if credentials_dict else None,
                stored_scopes_type=type(credentials_dict.get('scopes')).__name__ if credentials_dict and credentials_dict.get('scopes') else None,
            )

            if credentials_dict is None or not set(scope).issubset(set(credentials_dict['scopes'])):
                logger.warning("gauth_decorator_insufficient_scope",
                    user_id=request.user.id,
                    required_scope=scope,
                    stored_scopes=credentials_dict.get('scopes') if credentials_dict else None,
                    missing_scopes=list(set(scope) - set(credentials_dict.get('scopes', []))) if credentials_dict else scope,
                )
                request.session['next_view'] = request.path
                request.session['gauth_scope'] = scope
                logger.info("gauth_decorator_set_session",
                    user_id=request.user.id,
                    session_gauth_scope=request.session.get('gauth_scope'),
                    session_gauth_scope_type=type(request.session.get('gauth_scope')).__name__,
                )
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
