import os
import datetime
import json
from urllib.parse import urlparse, urlunparse

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


def build_gauth_callback_url(request):
    """
    Build the OAuth callback URL, optionally overriding the domain.
    
    If GAUTH_CALLBACK_DOMAIN is set in environment or settings, use that domain instead of the request's host.
    This is useful when the OAuth redirect URI registered with Google uses a different
    subdomain than where the user is browsing (e.g., using gauth.cauldron.sefaria.org
    instead of voices.gauth.cauldron.sefaria.org).
    """
    reverse_url = reverse('gauth_callback')
    absolute_uri = request.build_absolute_uri(reverse_url)
    
    # Check if we should override the domain - try environment first, then settings
    override_domain = os.environ.get('GAUTH_CALLBACK_DOMAIN') or getattr(settings, 'GAUTH_CALLBACK_DOMAIN', None)
    if override_domain:
        parsed = urlparse(absolute_uri)
        # Replace the netloc (host:port) with the override domain
        new_uri = urlunparse((
            'https',  # Always use HTTPS for OAuth callbacks
            override_domain,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment
        ))
        logger.info(f"GAUTH_CALLBACK_DOMAIN override: {override_domain}")
        logger.info(f"Original URI: {absolute_uri} -> Overridden URI: {new_uri}")
        return new_uri
    
    # Default behavior: just ensure HTTPS
    return absolute_uri.replace("http:", "https:")

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

    # DIAGNOSTIC: Check gauth_scope in session - this is critical for understanding the malformed URL error
    logger.info("=== GAUTH_SCOPE DIAGNOSTICS (Step 1) ===")
    logger.info("=== SESSION SERIALIZATION DIAGNOSTICS ===")
    logger.info(f"Session backend: {request.session.__class__.__name__}")
    logger.info(f"Session engine: {getattr(settings, 'SESSION_ENGINE', 'NOT SET')}")
    logger.info(f"Session serializer: {getattr(settings, 'SESSION_SERIALIZER', 'NOT SET')}")
    
    # Check session cookie settings that affect persistence
    logger.info("=== SESSION COOKIE SETTINGS ===")
    logger.info(f"SESSION_COOKIE_DOMAIN: {getattr(settings, 'SESSION_COOKIE_DOMAIN', 'NOT SET')}")
    logger.info(f"SESSION_COOKIE_SECURE: {getattr(settings, 'SESSION_COOKIE_SECURE', 'NOT SET')}")
    logger.info(f"SESSION_COOKIE_HTTPONLY: {getattr(settings, 'SESSION_COOKIE_HTTPONLY', 'NOT SET')}")
    logger.info(f"SESSION_COOKIE_SAMESITE: {getattr(settings, 'SESSION_COOKIE_SAMESITE', 'NOT SET')}")
    logger.info(f"SESSION_COOKIE_PATH: {getattr(settings, 'SESSION_COOKIE_PATH', 'NOT SET')}")
    
    # Check request environment
    logger.info("=== REQUEST ENVIRONMENT ===")
    logger.info(f"Request host: {request.get_host()}")
    logger.info(f"Request scheme: {request.scheme}")
    logger.info(f"Request META HTTP_HOST: {request.META.get('HTTP_HOST', 'NOT SET')}")
    logger.info(f"Request META SERVER_NAME: {request.META.get('SERVER_NAME', 'NOT SET')}")
    logger.info(f"Request META SERVER_PORT: {request.META.get('SERVER_PORT', 'NOT SET')}")
    
    gauth_scope_raw = request.session.get('gauth_scope', '')
    logger.info("=== GAUTH_SCOPE VALUE DIAGNOSTICS ===")
    logger.info(f"gauth_scope exists in session: {'gauth_scope' in request.session}")
    logger.info(f"gauth_scope raw value: {gauth_scope_raw}")
    logger.info(f"gauth_scope repr: {repr(gauth_scope_raw)}")
    logger.info(f"gauth_scope type: {type(gauth_scope_raw)}")
    logger.info(f"gauth_scope is None: {gauth_scope_raw is None}")
    logger.info(f"gauth_scope is empty string: {gauth_scope_raw == ''}")
    logger.info(f"gauth_scope is list: {isinstance(gauth_scope_raw, list)}")
    logger.info(f"gauth_scope is str: {isinstance(gauth_scope_raw, str)}")
    
    # Check if gauth_scope looks like it was corrupted during serialization
    if isinstance(gauth_scope_raw, str):
        logger.warning("gauth_scope is a string - this might indicate serialization issue")
        logger.warning(f"String value: {gauth_scope_raw}")
        # Check if it looks like a stringified list
        if gauth_scope_raw.startswith('[') and gauth_scope_raw.endswith(']'):
            logger.error("CRITICAL: gauth_scope appears to be a stringified list!")
            logger.error("This could cause malformed URLs when passed to Flow.from_client_secrets_file()")
            logger.error("This suggests Django session serialization is converting list to string")
    elif isinstance(gauth_scope_raw, list):
        logger.info(f"gauth_scope is a list with {len(gauth_scope_raw)} items")
        for i, item in enumerate(gauth_scope_raw):
            logger.info(f"  Item {i}: {item} (type: {type(item)})")
    
    # Check how request arrived
    referer = request.META.get('HTTP_REFERER', 'NOT SET')
    logger.info(f"Request referer: {referer}")
    logger.info(f"Request path: {request.path}")
    logger.info(f"GET params: {dict(request.GET)}")
    logger.info(f"Has 'next' param: {'next' in request.GET}")
    
    # Check if this might be from AJAX flow (direct navigation without decorator)
    if 'next' in request.GET and 'gauth_scope' not in request.session:
        logger.warning("POTENTIAL ISSUE: Request has 'next' param but no gauth_scope in session")
        logger.warning("This suggests direct navigation to /gauth without going through decorator")
        logger.warning("This can happen when JavaScript redirects after 401 response")
    
    # Check session state
    logger.info(f"All session keys: {list(request.session.keys())}")
    logger.info(f"Session modified: {request.session.modified}")
    logger.info(f"Session exists: {request.session.exists(request.session.session_key) if request.session.session_key else False}")
    
    # Check if empty string default was used (this causes the malformed URL error)
    if gauth_scope_raw == '':
        logger.error("CRITICAL: gauth_scope is empty string (default value used)")
        logger.error("This means gauth_scope was NOT set in session before reaching this view")
        logger.error("Possible causes:")
        logger.error("  1. Direct navigation to /gauth without going through @gauth_required decorator")
        logger.error("  2. JavaScript redirect after 401 response (bypasses decorator session setup)")
        logger.error("  3. Session cookie not persisting (SESSION_COOKIE_DOMAIN mismatch, cookies blocked, etc.)")
        logger.error("  4. Session expired between decorator setting and view reading")
        logger.error("  5. Different session being used (session ID mismatch)")
        logger.error("Flow.from_client_secrets_file() expects list or None, not empty string!")
        logger.error("Passing empty string will cause malformed redirect_uri: /gauth/callback'%5D\"")
    
    # get authorization url
    logger.info(f"About to create Flow with scopes={gauth_scope_raw} (type: {type(gauth_scope_raw)})")
    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH,
        scopes=gauth_scope_raw
    )

    # Build redirect URL - use helper that supports domain override
    logger.info("=== BUILDING REDIRECT URL (Step 1) ===")
    redirect_url = build_gauth_callback_url(request)
    logger.info(f"Final redirect_url: {redirect_url}")
    
    # Check for malformed characters that could cause the error
    if "'" in redirect_url or ']' in redirect_url or '%5D' in redirect_url:
        logger.error(f"MALFORMED REDIRECT URL DETECTED: {redirect_url}")
        logger.error("This contains characters that should not be in a URL!")
    
    flow.redirect_uri = redirect_url
    logger.info(f"flow.redirect_uri set to: {flow.redirect_uri}")

    logger.info("About to call flow.authorization_url()...")
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scope='true',
    )
    logger.info(f"Authorization URL returned: {authorization_url}")
    logger.info(f"Authorization URL type: {type(authorization_url)}")
    logger.info(f"Authorization URL repr: {repr(authorization_url)}")
    logger.info(f"OAuth state: {state}")
    
    # Check if authorization URL is malformed
    if "'" in authorization_url or '%5D' in authorization_url:
        logger.error(f"MALFORMED AUTHORIZATION URL DETECTED: {authorization_url}")
        logger.error("This URL contains characters that will cause 404 errors!")

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
    
    # DIAGNOSTIC: Check if critical session data is present
    logger.info("=== GAUTH_SCOPE DIAGNOSTICS (Step 2) ===")
    logger.info("=== SESSION SERIALIZATION DIAGNOSTICS (Step 2) ===")
    logger.info(f"Session backend: {request.session.__class__.__name__}")
    logger.info(f"Session ID: {request.session.session_key}")
    logger.info(f"Session exists: {request.session.exists(request.session.session_key) if request.session.session_key else False}")
    
    # Check if session persisted across Google redirect
    logger.info("=== SESSION PERSISTENCE CHECK ===")
    logger.info(f"All session keys: {list(request.session.keys())}")
    logger.info(f"Session modified: {request.session.modified}")
    
    # Check cookies in request
    logger.info("=== COOKIE DIAGNOSTICS ===")
    session_cookie_name = getattr(settings, 'SESSION_COOKIE_NAME', 'sessionid')
    logger.info(f"Session cookie name: {session_cookie_name}")
    logger.info(f"Session cookie in request: {session_cookie_name in request.COOKIES}")
    if session_cookie_name in request.COOKIES:
        cookie_value = request.COOKIES[session_cookie_name]
        logger.info(f"Session cookie value (first 20 chars): {cookie_value[:20]}...")
        logger.info(f"Session cookie matches session ID: {cookie_value == request.session.session_key}")
    else:
        logger.error("CRITICAL: Session cookie NOT present in request!")
        logger.error("This means session was lost during Google redirect")
    
    gauth_scope_raw = request.session.get('gauth_scope', '')
    next_view = request.session.get('next_view', 'NOT SET')
    
    logger.info("=== GAUTH_SCOPE VALUE DIAGNOSTICS (Step 2) ===")
    logger.info(f"gauth_scope exists in session: {'gauth_scope' in request.session}")
    logger.info(f"gauth_scope raw value: {gauth_scope_raw}")
    logger.info(f"gauth_scope repr: {repr(gauth_scope_raw)}")
    logger.info(f"gauth_scope type: {type(gauth_scope_raw)}")
    logger.info(f"gauth_scope is None: {gauth_scope_raw is None}")
    logger.info(f"gauth_scope is empty string: {gauth_scope_raw == ''}")
    logger.info(f"gauth_scope is list: {isinstance(gauth_scope_raw, list)}")
    logger.info(f"gauth_scope is str: {isinstance(gauth_scope_raw, str)}")
    logger.info(f"Session next_view: {next_view}")
    
    # Check if gauth_scope looks corrupted
    if isinstance(gauth_scope_raw, str):
        logger.warning("gauth_scope is a string - this might indicate serialization issue")
        logger.warning(f"String value: {gauth_scope_raw}")
        if gauth_scope_raw.startswith('[') and gauth_scope_raw.endswith(']'):
            logger.error("CRITICAL: gauth_scope appears to be a stringified list!")
            logger.error("This could cause malformed URLs when passed to Flow.from_client_secrets_file()")
            logger.error("This suggests Django session serialization converted list to string during storage/retrieval")
    
    # Check if empty string default was used
    if gauth_scope_raw == '':
        logger.error("CRITICAL: gauth_scope is empty string (default value used)")
        logger.error("This means gauth_scope was NOT set in session")
        logger.error("Possible causes:")
        logger.error("  1. Session cookie not persisting across Google redirect")
        logger.error("  2. SESSION_COOKIE_DOMAIN mismatch between Step 1 and Step 2")
        logger.error("  3. Cookies being blocked by browser")
        logger.error("  4. Session expired between Step 1 and Step 2")
        logger.error("  5. Different session being used (session ID mismatch)")
        logger.error("Flow.from_client_secrets_file() expects list or None, not empty string!")
        logger.error("Passing empty string will cause malformed redirect_uri: /gauth/callback'%5D\"")
    
    if gauth_scope_raw == '' or next_view == 'NOT SET':
        logger.error("CRITICAL: Session data lost! gauth_scope or next_view is missing.")
        logger.error("This likely means cookies aren't persisting across the Google redirect.")
        logger.error(f"Possible causes:")
        logger.error(f"  1. SESSION_COOKIE_DOMAIN doesn't match the domain Google redirects to")
        logger.error(f"  2. Cookies are being blocked")
        logger.error(f"  3. Domain mismatch between Step 1 and Step 2")
    
    logger.info(f"GET params: {dict(request.GET)}")
    
    state = request.GET.get('state', None)
    logger.info(f"OAuth state from GET: {state}")

    if not state:
        logger.error("No state parameter - redirecting to gauth_index")
        return redirect('gauth_index')

    # Check what we're about to pass to Flow
    logger.info(f"About to create Flow with scopes={gauth_scope_raw} (type: {type(gauth_scope_raw)}), state={state}")
    
    try:
        flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
            settings.GOOGLE_OAUTH2_CLIENT_SECRET_FILEPATH,
            scopes=gauth_scope_raw,
            state=state
        )
        logger.info("Flow created successfully from client secrets")
    except Exception as e:
        logger.error(f"Error creating flow: {e}")
        raise

    # Build redirect URL - must match what was sent in Step 1
    logger.info("=== BUILDING REDIRECT URL (Step 2) ===")
    redirect_url = build_gauth_callback_url(request)
    logger.info(f"Final redirect_url for flow: {redirect_url}")
    
    # Check for malformed characters
    if "'" in redirect_url or ']' in redirect_url or '%5D' in redirect_url:
        logger.error(f"MALFORMED REDIRECT URL DETECTED: {redirect_url}")
        logger.error("This contains characters that should not be in a URL!")
    
    flow.redirect_uri = redirect_url
    logger.info(f"flow.redirect_uri set to: {flow.redirect_uri}")

    authorization_response = request.build_absolute_uri().replace("http:", "https:")
    logger.info(f"Authorization response URL: {authorization_response}")
    logger.info(f"Authorization response URL type: {type(authorization_response)}")
    logger.info(f"Authorization response URL repr: {repr(authorization_response)}")
    
    # Check if authorization response URL is malformed (this is what Google redirects back to)
    if "'" in authorization_response or '%5D' in authorization_response:
        logger.error(f"MALFORMED AUTHORIZATION RESPONSE URL DETECTED: {authorization_response}")
        logger.error("This is the URL Google will redirect back to - it's malformed!")
        logger.error("This will cause a 404 error when Django tries to route it!")
    
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
