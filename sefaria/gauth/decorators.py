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
            user_id = request.user.id
            func_name = func.__name__
            
            logger.info("[GAuth Decorator] Checking credentials",
                        user_id=user_id,
                        function=func_name,
                        required_scopes=scope,
                        ajax=ajax)
            
            # Try grabbing credential from storage
            profile = UserProfile(user_obj=request.user)
            credentials_dict = profile.gauth_token

            if credentials_dict is None:
                logger.info("[GAuth Decorator] No credentials found, returning 401",
                            user_id=user_id,
                            function=func_name)
                request.session['next_view'] = request.path
                request.session['gauth_scope'] = scope
                return (HttpResponse('Unauthorized', status=401)
                    if ajax else redirect('gauth_index'))
            
            stored_scopes = credentials_dict.get('scopes', [])
            has_required_scopes = set(scope).issubset(set(stored_scopes))
            
            if not has_required_scopes:
                logger.info("[GAuth Decorator] Scope mismatch, returning 401",
                            user_id=user_id,
                            function=func_name,
                            required_scopes=scope,
                            stored_scopes=stored_scopes)
                request.session['next_view'] = request.path
                request.session['gauth_scope'] = scope
                return (HttpResponse('Unauthorized', status=401)
                    if ajax else redirect('gauth_index'))
           
            logger.info("[GAuth Decorator] Found valid credentials with matching scopes",
                        user_id=user_id,
                        function=func_name,
                        stored_scopes=stored_scopes,
                        expiry=credentials_dict.get('expiry'))
            
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
                logger.info("[GAuth Decorator] Credentials expired, attempting refresh",
                            user_id=user_id,
                            function=func_name,
                            expiry=credentials_dict['expiry'])
                try:
                    credentials.refresh(auth_request)
                    logger.info("[GAuth Decorator] Successfully refreshed credentials",
                                user_id=user_id,
                                function=func_name)
                except Exception as e:
                    logger.error("[GAuth Decorator] Failed to refresh credentials",
                                 user_id=user_id,
                                 function=func_name,
                                 error=str(e),
                                 error_type=type(e).__name__)
                    request.session['next_view'] = request.path
                    request.session['gauth_scope'] = scope
                    return (HttpResponse('Unauthorized', status=401)
                            if ajax else redirect('gauth_index'))

            logger.info("[GAuth Decorator] Credentials valid, proceeding to function",
                        user_id=user_id,
                        function=func_name)
            
            # Everything went well, call wrapped view and give credential to it
            kwargs['credential'] = credentials
            return func(request, *args, **kwargs)
        return inner
    return decorator
