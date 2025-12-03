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
            logger.info("=== GAUTH_REQUIRED DECORATOR START ===")
            logger.info(f"Function being decorated: {func.__name__}")
            logger.info(f"Required scopes: {scope}")
            logger.info(f"Ajax mode: {ajax}")
            logger.info(f"Request host: {request.get_host()}")
            logger.info(f"Request path: {request.path}")
            logger.info(f"Request full URL: {request.build_absolute_uri()}")
            logger.info(f"User: {request.user} (id: {request.user.id if request.user.is_authenticated else 'anon'})")
            
            # Try grabbing credential from storage
            profile = UserProfile(user_obj=request.user)
            credentials_dict = profile.gauth_token
            
            logger.info(f"Profile gauth_token exists: {credentials_dict is not None}")
            if credentials_dict:
                logger.info(f"Stored scopes: {credentials_dict.get('scopes', 'NOT SET')}")
                logger.info(f"Stored expiry: {credentials_dict.get('expiry', 'NOT SET')}")
                scopes_match = set(scope).issubset(set(credentials_dict.get('scopes', [])))
                logger.info(f"Required scopes are subset of stored: {scopes_match}")
            else:
                logger.info("No gauth_token in profile - need to authenticate")

            if credentials_dict is None or not set(scope).issubset(set(credentials_dict['scopes'])):
                logger.info("=== SETTING GAUTH_SCOPE IN SESSION (Decorator) ===")
                logger.info(f"Scope being set: {scope}")
                logger.info(f"Scope type: {type(scope)}")
                logger.info(f"Scope is list: {isinstance(scope, list)}")
                logger.info(f"Session ID before setting: {request.session.session_key}")
                logger.info(f"Session exists before: {request.session.exists(request.session.session_key) if request.session.session_key else False}")
                
                request.session['next_view'] = request.path
                request.session['gauth_scope'] = scope
                
                logger.info(f"Session keys after setting gauth_scope: {list(request.session.keys())}")
                logger.info(f"Session gauth_scope value after setting: {request.session.get('gauth_scope')}")
                logger.info(f"Session gauth_scope type after setting: {type(request.session.get('gauth_scope'))}")
                
                request.session.save()  # Ensure session is saved
                logger.info(f"Session saved. Session ID after save: {request.session.session_key}")
                logger.info(f"Session exists after save: {request.session.exists(request.session.session_key) if request.session.session_key else False}")
                logger.info(f"All session data after save: {dict(request.session.items())}")
                
                # Verify the value persisted
                verify_scope = request.session.get('gauth_scope')
                logger.info(f"VERIFICATION: Retrieved gauth_scope immediately after save: {verify_scope}")
                logger.info(f"VERIFICATION: Retrieved gauth_scope type: {type(verify_scope)}")
                logger.info(f"VERIFICATION: Retrieved gauth_scope matches original: {verify_scope == scope}")
                
                if ajax:
                    logger.info("Returning 401 Unauthorized (ajax mode)")
                    logger.warning("NOTE: JavaScript will redirect to /gauth, which may use a different session!")
                    logger.warning("This could cause gauth_scope to be missing in the next request")
                    return HttpResponse('Unauthorized', status=401)
                else:
                    logger.info("Redirecting to gauth_index (non-ajax mode)")
                    logger.info(f"Redirect URL will be: /gauth")
                    return redirect('gauth_index')
           
            logger.info("Creating credentials object from stored token...")
            # DIAGNOSTIC: Log scopes before using them
            stored_scopes_raw = credentials_dict['scopes']
            logger.info("=== CREDENTIALS SCOPES DIAGNOSTICS ===")
            logger.info(f"stored_scopes_raw value: {stored_scopes_raw}")
            logger.info(f"stored_scopes_raw type: {type(stored_scopes_raw)}")
            logger.info(f"stored_scopes_raw is list: {isinstance(stored_scopes_raw, list)}")
            logger.info(f"stored_scopes_raw is str: {isinstance(stored_scopes_raw, str)}")
            if isinstance(stored_scopes_raw, list):
                logger.info(f"stored_scopes_raw length: {len(stored_scopes_raw)}")
                logger.info(f"stored_scopes_raw items: {stored_scopes_raw}")
                # Check if it's already nested
                if stored_scopes_raw and isinstance(stored_scopes_raw[0], list):
                    logger.warning("WARNING: stored_scopes_raw is already a nested list!")
                    logger.warning("This suggests scopes were stored incorrectly")
            
            # Revert to original behavior: wrap in list (as it was before ce797cc5e)
            scopes_for_credentials = [stored_scopes_raw]
            logger.info(f"Scopes being passed to Credentials (wrapped): {scopes_for_credentials}")
            logger.info(f"Scopes type: {type(scopes_for_credentials)}")
            logger.info(f"First element type: {type(scopes_for_credentials[0]) if scopes_for_credentials else 'N/A'}")
            
            credentials = google.oauth2.credentials.Credentials(
                credentials_dict['token'],
                refresh_token=credentials_dict['refresh_token'],
                id_token=credentials_dict['id_token'],
                token_uri=credentials_dict['token_uri'],
                client_id=credentials_dict['client_id'],
                client_secret=credentials_dict['client_secret'],
                scopes=scopes_for_credentials,
            )
            
            # DIAGNOSTIC: Verify what Credentials actually stored
            logger.info(f"Credentials.scopes after creation: {credentials.scopes}")
            logger.info(f"Credentials.scopes type: {type(credentials.scopes)}")

            expiry = datetime.datetime.strptime(credentials_dict['expiry'], '%Y-%m-%d %H:%M:%S')
            credentials.expiry = expiry
            logger.info(f"Credentials expiry: {expiry}")
            logger.info(f"Credentials expired: {credentials.expired}")
            
            auth_request = google.auth.transport.requests.Request()
            if credentials.expired:
                logger.info("Credentials are expired - attempting refresh...")
                try:
                    credentials.refresh(auth_request)
                    logger.info("Credentials refreshed successfully!")
                except Exception as e:
                    logger.error(f"Failed to refresh credentials: {e}")
                    request.session['next_view'] = request.path
                    request.session['gauth_scope'] = scope
                    if ajax:
                        logger.info("Returning 401 Unauthorized after refresh failure (ajax mode)")
                        return HttpResponse('Unauthorized', status=401)
                    else:
                        logger.info("Redirecting to gauth_index after refresh failure (non-ajax mode)")
                        return redirect('gauth_index')

            # Everything went well, call wrapped view and give credential to it
            logger.info("=== GAUTH_REQUIRED DECORATOR END - Calling wrapped function ===")
            kwargs['credential'] = credentials
            return func(request, *args, **kwargs)
        return inner
    return decorator
