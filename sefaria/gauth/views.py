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


# Error codes for OAuth failures - used to communicate specific errors to frontend
GAUTH_ERROR_CODES = [
    'access_denied',      # User clicked "Deny" on consent screen
    'invalid_grant',      # Authorization code expired or already used
    'scope_mismatch'   # Scope mismatch error
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
    # get authorization url

    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH,
        scopes=request.session.get('gauth_scope', '')
    )

    redirect_url = request.build_absolute_uri(reverse('gauth_callback')).replace("http:", "https:")
    flow.redirect_uri = redirect_url

    authorization_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scope='true',
    )

    try:
        request.session['next_view'] = request.GET['next']
    except KeyError:
        pass


    return redirect(authorization_url)

def _redirect_with_error(request, error_code):
    """Helper to redirect back to the original destination with a specific error code."""
    next_view = request.session.get('next_view', '/')
    separator = '&' if '?' in next_view else '?'
    return redirect(f"{next_view}{separator}gauth_error={error_code}")


@login_required
def auth_return(request):
    """
    Step 2 of Google OAuth 2.0 flow.
    """
    # Check for OAuth errors from Google (user denied access, server error, etc.)
    oauth_error = request.GET.get('error', None)
    if oauth_error in GAUTH_ERROR_CODES:
        return _redirect_with_error(request, oauth_error)

    state = request.GET.get('state', None)

    if not state:
        return redirect('gauth_index')

    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH,
        scopes=request.session.get('gauth_scope', ''),
        state=state
    )

    redirect_url = request.build_absolute_uri(reverse('gauth_callback')).replace("http:", "https:")
    flow.redirect_uri = redirect_url

    # flow.redirect_uri = request.session.get('next_view', '/')

    authorization_response = request.build_absolute_uri().replace("http:", "https:")
    try:
        flow.fetch_token(authorization_response=authorization_response)
    except InvalidGrantError:
        # Authorization code expired or already used (e.g., user refreshed the callback page)
        return _redirect_with_error(request, 'invalid_grant')
    except Warning:
        # Scope mismatch - typically happens when session scope is empty but Google returns actual scopes
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

    profile = UserProfile(user_obj=request.user)

    if profile.gauth_token and profile.gauth_token["refresh_token"] and credentials_dict["refresh_token"] is None:
        credentials_dict["refresh_token"] = profile.gauth_token["refresh_token"]

    profile.update({"gauth_token": credentials_dict})
    profile.save()

    # return credentials

    return redirect(request.session.get('next_view', '/'))
