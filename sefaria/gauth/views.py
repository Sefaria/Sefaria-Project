import os
import datetime
import json
import logging

from django.contrib.auth.decorators import login_required
from django.core.urlresolvers import reverse
from django.http import HttpResponseBadRequest
from django.shortcuts import redirect

from sefaria.model.user_profile import UserProfile

import google.auth
import google.oauth2
import google_auth_oauthlib.flow

from sefaria import settings

logger = logging.getLogger(__name__)

# Error codes for OAuth failures - used to communicate specific errors to frontend
GAUTH_ERROR_CODES = ['access_denied', 'invalid_grant', 'scope_mismatch']

def _redirect_with_error(next_view, error_code):
    """
    Redirect to next_view with gauth_error appended to the URL fragment.
    This keeps the error in the client-side state alongside afterLoading.
    
    """
    separator = '&' if '#' in next_view else '#'
    redirect_url = f"{next_view}{separator}gauth_error={error_code}"
    logger.info(f"[GAuth] Redirecting with error: {error_code} -> {redirect_url}")
    return redirect(redirect_url)

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
    
    logger.info(f"[GAuth Step 1] Starting OAuth flow for user {user_id}, scopes={scopes}, next={next_view}")

    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH,
        scopes=scopes
    )

    redirect_url = request.build_absolute_uri(reverse('gauth_callback')).replace("http:", "https:")
    flow.redirect_uri = redirect_url
    
    logger.info(f"[GAuth Step 1] Callback URL: {redirect_url}")

    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scope='true',
    )

    try:
        request.session['next_view'] = request.GET['next']
    except KeyError:
        pass

    logger.info(f"[GAuth Step 1] Redirecting to Google authorization (state={state})")
    return redirect(authorization_url)

@login_required
def auth_return(request):
    """
    Step 2 of Google OAuth 2.0 flow.
    """
    user_id = request.user.id
    logger.info(f"[GAuth Step 2] Callback received for user {user_id}, params={dict(request.GET)}")
    
    # Check for OAuth errors from Google (e.g., user denied access)
    oauth_error = request.GET.get('error', None)
    if oauth_error:
        logger.warning(f"[GAuth Step 2] OAuth error from Google: {oauth_error}")
        if oauth_error in GAUTH_ERROR_CODES:
            return _redirect_with_error(request.session.get('next_view', '/'), oauth_error)

    state = request.GET.get('state', None)

    if not state:
        logger.warning(f"[GAuth Step 2] No state parameter, redirecting to gauth_index")
        return redirect('gauth_index')

    session_scopes = request.session.get('gauth_scope', '')
    logger.info(f"[GAuth Step 2] Building flow with state={state}, scopes={session_scopes}")
    
    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH,
        scopes=session_scopes,
        state=state
    )

    redirect_url = request.build_absolute_uri(reverse('gauth_callback')).replace("http:", "https:")
    flow.redirect_uri = redirect_url

    authorization_response = request.build_absolute_uri().replace("http:", "https:")
    
    logger.info(f"[GAuth Step 2] Fetching token from Google")
    flow.fetch_token(authorization_response=authorization_response)
    credentials = flow.credentials
    
    logger.info(f"[GAuth Step 2] Token received, scopes={credentials.scopes}, expiry={credentials.expiry}")

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

    profile = UserProfile(user_obj=request.user)

    if profile.gauth_token and profile.gauth_token["refresh_token"] and credentials_dict["refresh_token"] is None:
        logger.info(f"[GAuth Step 2] Using existing refresh token from profile")
        credentials_dict["refresh_token"] = profile.gauth_token["refresh_token"]

    profile.update({"gauth_token": credentials_dict})
    profile.save()

    next_view = request.session.get('next_view', '/')
    logger.info(f"[GAuth Step 2] OAuth complete, redirecting to {next_view}")
    return redirect(next_view)
