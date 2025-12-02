import os
import datetime
import json

from django.contrib.auth.decorators import login_required
from django.urls import reverse
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
    logger.info("=== GAUTH INDEX (Step 1) START ===")
    logger.info(f"Request host: {request.get_host()}")
    logger.info(f"Request scheme: {request.scheme}")
    logger.info(f"Full request URL: {request.build_absolute_uri()}")
    
    # Session and cookie diagnostics
    logger.info("=== SESSION/COOKIE DIAGNOSTICS (Step 1) ===")
    logger.info(f"Session ID: {request.session.session_key}")
    logger.info(f"Session exists: {request.session.exists(request.session.session_key) if request.session.session_key else False}")
    logger.info(f"Session modified: {request.session.modified}")
    logger.info(f"All session keys: {list(request.session.keys())}")
    logger.info(f"All session data: {dict(request.session.items())}")
    
    # Cookie settings
    from django.conf import settings
    logger.info(f"SESSION_COOKIE_DOMAIN: {getattr(settings, 'SESSION_COOKIE_DOMAIN', 'NOT SET')}")
    logger.info(f"SESSION_COOKIE_SECURE: {getattr(settings, 'SESSION_COOKIE_SECURE', 'NOT SET')}")
    logger.info(f"SESSION_COOKIE_HTTPONLY: {getattr(settings, 'SESSION_COOKIE_HTTPONLY', 'NOT SET')}")
    logger.info(f"SESSION_COOKIE_SAMESITE: {getattr(settings, 'SESSION_COOKIE_SAMESITE', 'NOT SET')}")
    
    # Request cookies
    logger.info(f"Cookies in request: {list(request.COOKIES.keys())}")
    session_cookie_name = getattr(settings, 'SESSION_COOKIE_NAME', 'sessionid')
    if session_cookie_name in request.COOKIES:
        logger.info(f"Session cookie ({session_cookie_name}) present: {request.COOKIES[session_cookie_name][:20]}...")
    else:
        logger.warning(f"Session cookie ({session_cookie_name}) NOT present in request!")
    
    logger.info(f"Session gauth_scope: {request.session.get('gauth_scope', 'NOT SET')}")
    logger.info(f"Session next_view: {request.session.get('next_view', 'NOT SET')}")
    logger.info(f"GET next param: {request.GET.get('next', 'NOT SET')}")
    
    # Log the client secrets file info
    secrets_filepath = settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH
    logger.info(f"GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH: {secrets_filepath}")
    logger.info(f"File exists: {os.path.exists(secrets_filepath)}")
    
    if os.path.exists(secrets_filepath):
        try:
            with open(secrets_filepath, 'r') as f:
                secrets_content = json.load(f)
                # Log only non-sensitive parts
                if 'web' in secrets_content:
                    logger.info(f"OAuth client_id: {secrets_content['web'].get('client_id', 'NOT FOUND')}")
                    logger.info(f"OAuth redirect_uris configured: {secrets_content['web'].get('redirect_uris', 'NOT FOUND')}")
                    logger.info(f"OAuth javascript_origins: {secrets_content['web'].get('javascript_origins', 'NOT FOUND')}")
                elif 'installed' in secrets_content:
                    logger.info(f"OAuth client_id (installed): {secrets_content['installed'].get('client_id', 'NOT FOUND')}")
                else:
                    logger.info(f"Secrets file keys: {list(secrets_content.keys())}")
        except Exception as e:
            logger.error(f"Error reading secrets file: {e}")
    else:
        logger.error(f"Secrets file does NOT exist at: {secrets_filepath}")

    # Get scopes from session - ensure it's always a list, not an empty string
    gauth_scope = request.session.get('gauth_scope')
    if gauth_scope is None:
        logger.error("gauth_scope missing from session - redirecting to gauth_index")
        return redirect('gauth_index')
    
    # Ensure scopes is a list (handle case where it might be stored as a string)
    if isinstance(gauth_scope, str):
        gauth_scope = [gauth_scope] if gauth_scope else []
    elif not isinstance(gauth_scope, list):
        logger.error(f"gauth_scope has unexpected type: {type(gauth_scope)} - redirecting to gauth_index")
        return redirect('gauth_index')
    
    logger.info(f"Using scopes for Flow: {gauth_scope} (type: {type(gauth_scope)})")
    
    # get authorization url
    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH,
        scopes=gauth_scope
    )

    # Build redirect URL
    reverse_url = reverse('gauth_callback')
    logger.info(f"reverse('gauth_callback') returned: {reverse_url}")
    
    absolute_uri = request.build_absolute_uri(reverse_url)
    logger.info(f"build_absolute_uri result: {absolute_uri}")
    
    redirect_url = absolute_uri.replace("http:", "https:")
    logger.info(f"Final redirect_url (after https replace): {redirect_url}")
    
    flow.redirect_uri = redirect_url

    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scope='true',
    )
    logger.info(f"Authorization URL: {authorization_url}")
    logger.info(f"OAuth state: {state}")

    try:
        request.session['next_view'] = request.GET['next']
        logger.info(f"Set session next_view to: {request.GET['next']}")
    except KeyError:
        logger.info("No 'next' param in GET, keeping existing session next_view")
    
    # Ensure session is saved before redirect
    request.session.save()
    logger.info(f"Session saved. Session ID after save: {request.session.session_key}")
    logger.info(f"Session data after save: {dict(request.session.items())}")

    logger.info("=== GAUTH INDEX (Step 1) END - Redirecting to Google ===")
    return redirect(authorization_url)

@login_required
def auth_return(request):
    """
    Step 2 of Google OAuth 2.0 flow.
    """
    logger.info("=== GAUTH AUTH_RETURN (Step 2) START ===")
    logger.info(f"Request host: {request.get_host()}")
    logger.info(f"Request scheme: {request.scheme}")
    logger.info(f"Full request URL: {request.build_absolute_uri()}")
    
    # Session and cookie diagnostics - CRITICAL: Check if session persisted
    logger.info("=== SESSION/COOKIE DIAGNOSTICS (Step 2) ===")
    logger.info(f"Session ID: {request.session.session_key}")
    logger.info(f"Session exists: {request.session.exists(request.session.session_key) if request.session.session_key else False}")
    logger.info(f"Session modified: {request.session.modified}")
    logger.info(f"All session keys: {list(request.session.keys())}")
    logger.info(f"All session data: {dict(request.session.items())}")
    
    # Cookie settings (should match Step 1)
    from django.conf import settings
    logger.info(f"SESSION_COOKIE_DOMAIN: {getattr(settings, 'SESSION_COOKIE_DOMAIN', 'NOT SET')}")
    logger.info(f"SESSION_COOKIE_SECURE: {getattr(settings, 'SESSION_COOKIE_SECURE', 'NOT SET')}")
    
    # Request cookies
    logger.info(f"Cookies in request: {list(request.COOKIES.keys())}")
    session_cookie_name = getattr(settings, 'SESSION_COOKIE_NAME', 'sessionid')
    if session_cookie_name in request.COOKIES:
        logger.info(f"Session cookie ({session_cookie_name}) present: {request.COOKIES[session_cookie_name][:20]}...")
        logger.info(f"Session cookie matches session ID: {request.COOKIES[session_cookie_name] == request.session.session_key}")
    else:
        logger.error(f"Session cookie ({session_cookie_name}) NOT present in request!")
        logger.error("This means the session was lost during the Google redirect!")
    
    # Check if critical session data is present
    gauth_scope_raw = request.session.get('gauth_scope')
    next_view = request.session.get('next_view', 'NOT SET')
    logger.info(f"Session gauth_scope: {gauth_scope_raw if gauth_scope_raw is not None else 'NOT SET'}")
    logger.info(f"Session next_view: {next_view}")
    
    if gauth_scope_raw is None or next_view == 'NOT SET':
        logger.error("CRITICAL: Session data lost! gauth_scope or next_view is missing.")
        logger.error("This likely means cookies aren't persisting across the Google redirect.")
        logger.error(f"Possible causes:")
        logger.error(f"  1. SESSION_COOKIE_DOMAIN doesn't match the domain Google redirects to")
        logger.error(f"  2. Cookies are being blocked")
        logger.error(f"  3. Domain mismatch between Step 1 and Step 2")
        return redirect('gauth_index')
    
    logger.info(f"GET params: {dict(request.GET)}")
    
    state = request.GET.get('state', None)
    logger.info(f"OAuth state from GET: {state}")

    if not state:
        logger.error("No state parameter - redirecting to gauth_index")
        return redirect('gauth_index')

    # Ensure scopes is a list (handle case where it might be stored as a string)
    gauth_scope = gauth_scope_raw
    if isinstance(gauth_scope, str):
        gauth_scope = [gauth_scope] if gauth_scope else []
    elif not isinstance(gauth_scope, list):
        logger.error(f"gauth_scope has unexpected type: {type(gauth_scope)} - redirecting to gauth_index")
        return redirect('gauth_index')
    
    logger.info(f"Using scopes for Flow: {gauth_scope} (type: {type(gauth_scope)})")

    try:
        flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
            settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH,
            scopes=gauth_scope,
            state=state
        )
        logger.info("Flow created successfully from client secrets")
    except Exception as e:
        logger.error(f"Error creating flow: {e}")
        raise

    # Build redirect URL - must match what was sent in Step 1
    reverse_url = reverse('gauth_callback')
    logger.info(f"reverse('gauth_callback') returned: {reverse_url}")
    
    absolute_uri = request.build_absolute_uri(reverse_url)
    logger.info(f"build_absolute_uri result: {absolute_uri}")
    
    redirect_url = absolute_uri.replace("http:", "https:")
    logger.info(f"Final redirect_url for flow: {redirect_url}")
    
    flow.redirect_uri = redirect_url

    authorization_response = request.build_absolute_uri().replace("http:", "https:")
    logger.info(f"Authorization response URL: {authorization_response}")
    
    try:
        flow.fetch_token(authorization_response=authorization_response)
        logger.info("Token fetched successfully!")
    except Exception as e:
        logger.error(f"Error fetching token: {e}")
        logger.error(f"This usually means the redirect_uri doesn't match what Google expects")
        raise
        
    credentials = flow.credentials
    logger.info(f"Credentials obtained - has token: {bool(credentials.token)}")
    logger.info(f"Credentials scopes: {credentials.scopes}")

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
    logger.info(f"Credentials dict created - has refresh_token: {bool(credentials_dict['refresh_token'])}")

    profile = UserProfile(user_obj=request.user)
    logger.info(f"User profile loaded for user: {request.user.id}")
    logger.info(f"Existing gauth_token in profile: {bool(profile.gauth_token)}")

    if profile.gauth_token and profile.gauth_token["refresh_token"] and credentials_dict["refresh_token"] is None:
        credentials_dict["refresh_token"] = profile.gauth_token["refresh_token"]
        logger.info("Preserved existing refresh_token from profile")

    profile.update({"gauth_token": credentials_dict})
    profile.save()
    logger.info("Profile saved with new gauth_token")

    next_view = request.session.get('next_view', '/')
    logger.info(f"=== GAUTH AUTH_RETURN (Step 2) END - Redirecting to: {next_view} ===")
    return redirect(next_view)
