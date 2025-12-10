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

import structlog
logger = structlog.get_logger(__name__)

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
    session_scope = request.session.get('gauth_scope', '')
    logger.info("gauth_index_start",
        user_id=request.user.id,
        session_gauth_scope=session_scope,
        session_gauth_scope_type=type(session_scope).__name__,
        session_keys=list(request.session.keys()),
    )

    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH,
        scopes=session_scope
    )
    
    logger.info("gauth_index_flow_created",
        user_id=request.user.id,
        flow_scopes=flow.scopes if hasattr(flow, 'scopes') else None,
    )

    redirect_url = request.build_absolute_uri(reverse('gauth_callback')).replace("http:", "https:")
    flow.redirect_uri = redirect_url

    authorization_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scope='true',
    )
    
    logger.info("gauth_index_authorization_url",
        user_id=request.user.id,
        authorization_url=authorization_url,
        url_contains_drive_file='drive.file' in authorization_url,
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
    callback_scope_param = request.GET.get('scope', '')
    
    logger.info("gauth_callback_start",
        user_id=request.user.id,
        state=state,
        callback_scope_param=callback_scope_param,
        callback_url=request.build_absolute_uri(),
    )

    if not state:
        logger.warning("gauth_callback_no_state", user_id=request.user.id)
        return redirect('gauth_index')

    session_scope = request.session.get('gauth_scope', '')
    logger.info("gauth_callback_session_scope",
        user_id=request.user.id,
        session_gauth_scope=session_scope,
        session_gauth_scope_type=type(session_scope).__name__,
        session_keys=list(request.session.keys()),
    )

    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH,
        scopes=session_scope,
        state=state
    )
    
    logger.info("gauth_callback_flow_created",
        user_id=request.user.id,
        flow_scopes=flow.scopes if hasattr(flow, 'scopes') else None,
    )

    redirect_url = request.build_absolute_uri(reverse('gauth_callback')).replace("http:", "https:")
    flow.redirect_uri = redirect_url

    # flow.redirect_uri = request.session.get('next_view', '/')

    authorization_response = request.build_absolute_uri().replace("http:", "https:")
    
    try:
        flow.fetch_token(authorization_response=authorization_response)
    except Exception as e:
        logger.error("gauth_callback_fetch_token_error",
            user_id=request.user.id,
            error=str(e),
            error_type=type(e).__name__,
            session_scope=session_scope,
            callback_scope_param=callback_scope_param,
        )
        raise
    
    credentials = flow.credentials
    
    logger.info("gauth_callback_credentials_received",
        user_id=request.user.id,
        credentials_scopes=credentials.scopes,
        credentials_scopes_type=type(credentials.scopes).__name__,
        expected_scopes=session_scope,
        scopes_match=set(session_scope) == set(credentials.scopes) if isinstance(session_scope, list) else False,
    )

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
    
    logger.info("gauth_callback_storing_credentials",
        user_id=request.user.id,
        stored_scopes=credentials_dict['scopes'],
    )

    profile = UserProfile(user_obj=request.user)

    if profile.gauth_token and profile.gauth_token["refresh_token"] and credentials_dict["refresh_token"] is None:
        credentials_dict["refresh_token"] = profile.gauth_token["refresh_token"]

    profile.update({"gauth_token": credentials_dict})
    profile.save()

    # return credentials

    return redirect(request.session.get('next_view', '/'))
