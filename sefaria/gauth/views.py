import os
import datetime
import json

from django.contrib.auth.decorators import login_required
from django.core.urlresolvers import reverse
from django.http import HttpResponseBadRequest
from django.shortcuts import redirect

from sefaria.model.user_profile import UserProfile

import google.auth
import google.oauth2
import google_auth_oauthlib.flow
from oauthlib.oauth2.rfc6749.errors import InvalidGrantError

from sefaria import settings

import structlog
logger = structlog.get_logger(__name__)


# Error codes for OAuth failures - used to communicate specific errors to frontend
GAUTH_ERROR_CODES = [
    'access_denied',      # User clicked "Deny" on consent screen
    'invalid_grant',      # Authorization code expired or already used
    'scope_mismatch'      # Scope mismatch error occurs often when session scope is empty but Google returns actual scopes
]

# CLIENT_SECRETS, name of a file containing the OAuth 2.0 information for this
# application, including client_id and client_secret, which are found
# on the API Access tab on the Google APIs
# Console <http://code.google.com/apis/console>
# CLIENT_SECRETS = os.path.join(os.path.dirname(__file__), 'client_secrets.json')

@login_required
def index(request):
    """
    Step 1 of Google OAuth 2.0 flow.
    """
    user_id = request.user.id
    scopes = request.session.get('gauth_scope', '')
    next_view = request.GET.get('next', None)
    
    logger.info("[GAuth Step 1] Starting OAuth flow",
                user_id=user_id,
                scopes=scopes,
                next_view=next_view)

    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH,
        scopes=scopes
    )

    redirect_url = request.build_absolute_uri(reverse('gauth_callback')).replace("http:", "https:")
    flow.redirect_uri = redirect_url
    
    logger.info("[GAuth Step 1] Built redirect URL",
                user_id=user_id,
                redirect_url=redirect_url)

    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scope='true',
    )

    try:
        request.session['next_view'] = request.GET['next']
    except KeyError:
        pass

    logger.info("[GAuth Step 1] Redirecting to Google authorization",
                user_id=user_id,
                authorization_url=authorization_url[:100] + "...",  # Truncate for readability
                state=state)

    return redirect(authorization_url)

def _redirect_with_error(request, error_code):
    """Helper to redirect back to the original destination with a specific error code."""
    next_view = request.session.get('next_view', '/')
    separator = '&' if '?' in next_view else '?'
    redirect_url = f"{next_view}{separator}gauth_error={error_code}"
    
    logger.warning("[GAuth] Redirecting with error",
                   user_id=request.user.id,
                   error_code=error_code,
                   redirect_url=redirect_url)
    
    return redirect(redirect_url)


@login_required
def auth_return(request):
    """
    Step 2 of Google OAuth 2.0 flow.
    """
    user_id = request.user.id
    
    logger.info("[GAuth Step 2] Received callback from Google",
                user_id=user_id,
                query_params=dict(request.GET))
    
    # Check for OAuth errors from Google (user denied access, server error, etc.)
    oauth_error = request.GET.get('error', None)
    if oauth_error:
        logger.warning("[GAuth Step 2] Google returned OAuth error",
                       user_id=user_id,
                       oauth_error=oauth_error,
                       error_in_known_codes=oauth_error in GAUTH_ERROR_CODES)
        if oauth_error in GAUTH_ERROR_CODES:
            return _redirect_with_error(request, oauth_error)

    state = request.GET.get('state', None)

    if not state:
        logger.warning("[GAuth Step 2] No state parameter, redirecting to gauth_index",
                       user_id=user_id)
        return redirect('gauth_index')

    session_scopes = request.session.get('gauth_scope', '')
    logger.info("[GAuth Step 2] Building OAuth flow",
                user_id=user_id,
                state=state,
                session_scopes=session_scopes)

    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH,
        scopes=session_scopes,
        state=state
    )

    redirect_url = request.build_absolute_uri(reverse('gauth_callback')).replace("http:", "https:")
    flow.redirect_uri = redirect_url

    authorization_response = request.build_absolute_uri().replace("http:", "https:")
    
    logger.info("[GAuth Step 2] Fetching token from Google",
                user_id=user_id,
                redirect_url=redirect_url)
    
    try:
        flow.fetch_token(authorization_response=authorization_response)
        logger.info("[GAuth Step 2] Successfully fetched token",
                    user_id=user_id)
    except InvalidGrantError as e:
        logger.error("[GAuth Step 2] InvalidGrantError - authorization code expired or already used",
                     user_id=user_id,
                     error=str(e))
        return _redirect_with_error(request, 'invalid_grant')
    except Warning as e:
        logger.error("[GAuth Step 2] Scope mismatch warning",
                     user_id=user_id,
                     error=str(e))
        return _redirect_with_error(request, 'scope_mismatch')
        
    credentials = flow.credentials

    credentials_dict = {
        'token': credentials.token,
        'refresh_token': credentials.refresh_token,
        'id_token':credentials.id_token,
        'token_uri': credentials.token_uri,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
        'scopes': credentials.scopes,
        'expiry': datetime.datetime.strftime(credentials.expiry, '%Y-%m-%d %H:%M:%S')
    }

    logger.info("[GAuth Step 2] Credentials obtained",
                user_id=user_id,
                scopes=credentials.scopes,
                expiry=credentials_dict['expiry'],
                has_refresh_token=credentials.refresh_token is not None)

    profile = UserProfile(user_obj=request.user)

    if profile.gauth_token and profile.gauth_token["refresh_token"] and credentials_dict["refresh_token"] is None:
        logger.info("[GAuth Step 2] Using existing refresh token from profile",
                    user_id=user_id)
        credentials_dict["refresh_token"] = profile.gauth_token["refresh_token"]

    profile.update({"gauth_token": credentials_dict})
    profile.save()
    
    next_view = request.session.get('next_view', '/')
    logger.info("[GAuth Step 2] OAuth complete, redirecting to next view",
                user_id=user_id,
                next_view=next_view)

    return redirect(next_view)
