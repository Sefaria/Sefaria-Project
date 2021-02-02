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

from sefaria import settings

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

@login_required
def auth_return(request):
    """
    Step 2 of Google OAuth 2.0 flow.
    """
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
    flow.fetch_token(authorization_response=authorization_response)
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
