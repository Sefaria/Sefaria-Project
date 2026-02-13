"""
Newsletter API Views

Functional views for newsletter operations via ActiveCampaign integration.
"""

import json
import logging
from django.core.cache import cache
from django.views.decorators.csrf import csrf_exempt
from sefaria.client.util import jsonResponse
from sefaria.system.exceptions import InputError
from api.newsletter_service import (
    ActiveCampaignError,
    get_newsletter_list,
    subscribe_with_union,
    fetch_user_subscriptions_impl,
    update_user_preferences_impl,
    update_learning_level_impl,
)

logger = logging.getLogger(__name__)


def get_newsletter_lists(request):
    """
    GET /api/newsletter/lists

    Returns all available newsletters with their metadata from ActiveCampaign.

    Query Parameters:
        None

    Returns (200):
        {
            "newsletters": [
                {
                    "id": "1",
                    "stringid": "sefaria_news",
                    "displayName": "Sefaria News & Resources",
                    "icon": "news-and-resources.svg",
                    "language": "english",
                    "acListId": "1"
                },
                ...
            ]
        }

    Errors (500):
        {
            "error": "Error message describing what went wrong"
        }

    Notes:
        - Only returns newsletters that have complete metadata (LIST_{id}_META variable)
        - Numeric list ID should be used as the form field value for subscriptions
        - Results are cached for 1 hour for performance
    """
    if request.method != 'GET':
        return jsonResponse({'error': 'Only GET method is supported'}, status=405)

    try:
        newsletters = get_newsletter_list()
        return jsonResponse({'newsletters': newsletters})
    except ActiveCampaignError as e:
        return jsonResponse({'error': str(e)}, status=500)
    except Exception as e:
        logger.exception(f"Unexpected error in get_newsletter_lists: {e}")
        return jsonResponse({'error': 'An unexpected error occurred'}, status=500)


# ============================================================================
# Caching Wrapper for Newsletter List (used for validation during subscription)
# ============================================================================

NEWSLETTER_LIST_CACHE_KEY = 'newsletter_list_from_ac'
NEWSLETTER_LIST_CACHE_TTL = 60 * 60  # 1 hour


def get_cached_newsletter_list():
    """
    Get cached newsletter list, fetching from ActiveCampaign if not cached.

    Returns:
        list: Cached list of newsletters
    """
    cached = cache.get(NEWSLETTER_LIST_CACHE_KEY)
    if cached is not None:
        return cached

    newsletters = get_newsletter_list()
    cache.set(NEWSLETTER_LIST_CACHE_KEY, newsletters, NEWSLETTER_LIST_CACHE_TTL)
    return newsletters


# ============================================================================
# Subscription Endpoint
# ============================================================================

@csrf_exempt
def subscribe_newsletter(request):
    """
    POST /api/newsletter/subscribe

    Subscribe a new (logged-out) user to one or more newsletters.

    Uses union-based subscription: merges new selections with existing subscriptions.
    If the email already exists in ActiveCampaign, the user's existing newsletter
    subscriptions are preserved and the new selections are added.

    Request Body:
        {
            "firstName": string (required),
            "lastName": string (optional),
            "email": string (required),
            "newsletters": {
                "sefaria_news": boolean,
                "educator_resources": boolean,
                "text_updates": boolean,
                "parashah_series": boolean,
                "tech_updates": boolean,
                "timeless_topics": boolean
            }
        }

    Returns (200 OK):
        {
            "success": true,
            "message": "Successfully subscribed to newsletters",
            "email": "user@example.com",
            "subscribedNewsletters": [
                "sefaria_news",
                "text_updates",
                "parashah_series"
            ]
        }

    Errors (400 Bad Request):
        {
            "error": "First name and email are required."
        }
        OR
        {
            "error": "Please select at least one newsletter."
        }

    Errors (500 Internal Server Error):
        {
            "error": "Failed to connect to ActiveCampaign API"
        }

    Notes:
        - Validates newsletter selections against cached list of available newsletters
        - Uses AC contact lookup/create pattern for managing subscribers
        - Subscriptions are union-based: new selections are added to existing, never removed
        - Response includes all current subscriptions (existing + newly added)
    """
    if request.method != 'POST':
        return jsonResponse({'error': 'Only POST method is supported'}, status=405)

    try:
        # Parse request body
        body = json.loads(request.body)
        first_name = body.get('firstName', '').strip()
        last_name = body.get('lastName', '').strip()
        email = body.get('email', '').strip()
        newsletters_dict = body.get('newsletters', {})

        # Validate required fields
        if not first_name or not email:
            return jsonResponse({
                'error': 'First name and email are required.'
            }, status=400)

        # Extract selected newsletter stringids
        selected_newsletters = [key for key, selected in newsletters_dict.items() if selected]

        # Validate at least one newsletter selected
        if not selected_newsletters:
            return jsonResponse({
                'error': 'Please select at least one newsletter.'
            }, status=400)

        # Get cached valid newsletters for validation
        try:
            valid_newsletters = get_cached_newsletter_list()
        except Exception as e:
            logger.exception(f"Error fetching cached newsletter list: {e}")
            return jsonResponse({
                'error': 'Failed to validate newsletter options'
            }, status=500)

        # Subscribe using union behavior
        logger.info(f"Processing subscription for {email} with newsletters: {selected_newsletters}")
        result = subscribe_with_union(email, first_name, last_name, selected_newsletters, valid_newsletters)

        # Return success response
        return jsonResponse({
            'success': True,
            'message': 'Successfully subscribed to newsletters',
            'email': email,
            'subscribedNewsletters': result['all_subscriptions']
        }, status=200)

    except ActiveCampaignError as e:
        logger.warning(f"ActiveCampaign error during subscription: {e}")
        return jsonResponse({'error': str(e)}, status=500)

    except json.JSONDecodeError:
        return jsonResponse({
            'error': 'Invalid JSON in request body'
        }, status=400)

    except Exception as e:
        logger.exception(f"Unexpected error in subscribe_newsletter: {e}")
        return jsonResponse({
            'error': 'An unexpected error occurred'
        }, status=500)


# ============================================================================
# Authenticated Newsletter Endpoints
# ============================================================================

def get_user_subscriptions(request):
    """
    GET /api/newsletter/subscriptions

    Fetch current newsletter subscriptions for the authenticated user.

    Authentication: Required (must be logged in)

    Returns (200 OK):
        {
            "success": true,
            "email": "user@example.com",
            "subscribedNewsletters": [
                "sefaria_news",
                "text_updates",
                "parashah_series"
            ]
        }

    Errors (401 Unauthorized):
        {
            "error": "Authentication required"
        }

    Errors (500 Internal Server Error):
        {
            "error": "Failed to connect to ActiveCampaign API"
        }

    Notes:
        - Requires authenticated user via Django session/auth
        - Returns empty array if user has no subscriptions yet
        - Returns empty array if user email not found in ActiveCampaign
    """
    if request.method != 'GET':
        return jsonResponse({'error': 'Only GET method is supported'}, status=405)

    # Check authentication
    if not request.user.is_authenticated:
        return jsonResponse({'error': 'Authentication required'}, status=401)

    try:
        email = request.user.email
        logger.info(f"Fetching subscriptions for authenticated user: {email}")

        # Get cached valid newsletters for mapping
        try:
            valid_newsletters = get_cached_newsletter_list()
        except Exception as e:
            logger.exception(f"Error fetching cached newsletter list: {e}")
            return jsonResponse({
                'error': 'Failed to validate newsletter options'
            }, status=500)

        # Fetch user subscriptions (pass user for UserProfile lookup)
        result = fetch_user_subscriptions_impl(email, valid_newsletters, user=request.user)

        return jsonResponse({
            'success': True,
            'email': email,
            'subscribedNewsletters': result['subscribed_newsletters'],
            'wantsMarketingEmails': result.get('wants_marketing_emails', True),
            'learningLevel': result.get('learning_level'),
        }, status=200)

    except ActiveCampaignError as e:
        logger.warning(f"ActiveCampaign error fetching subscriptions: {e}")
        return jsonResponse({'error': str(e)}, status=500)

    except Exception as e:
        logger.exception(f"Unexpected error in get_user_subscriptions: {e}")
        return jsonResponse({
            'error': 'An unexpected error occurred'
        }, status=500)


def update_user_preferences(request):
    """
    POST /api/newsletter/preferences

    Update newsletter preferences for the authenticated user.

    Uses REPLACE behavior: The user's selected newsletters become their new
    complete subscription list. Anything not selected is unsubscribed.

    Authentication: Required (must be logged in)

    Request Body:
        {
            "newsletters": {
                "sefaria_news": true,
                "text_updates": false,
                "parashah_series": true
            }
        }

    Returns (200 OK):
        {
            "success": true,
            "message": "Preferences updated successfully",
            "email": "user@example.com",
            "subscribedNewsletters": [
                "sefaria_news",
                "parashah_series"
            ]
        }

    Errors (401 Unauthorized):
        {
            "error": "Authentication required"
        }

    Errors (500 Internal Server Error):
        {
            "error": "Failed to connect to ActiveCampaign API"
        }

    Notes:
        - Requires authenticated user via Django session/auth
        - REPLACE behavior: unselected newsletters are unsubscribed
        - Empty selection (all false) is allowed: unsubscribes from all newsletters
        - Idempotent: calling multiple times with same selections produces same result
    """
    if request.method != 'POST':
        return jsonResponse({'error': 'Only POST method is supported'}, status=405)

    # Check authentication
    if not request.user.is_authenticated:
        return jsonResponse({'error': 'Authentication required'}, status=401)

    try:
        # Parse request body
        body = json.loads(request.body)
        newsletters_dict = body.get('newsletters', {})
        marketing_opt_out = body.get('marketingOptOut', False)  # Informational flag for intent tracking

        # Extract selected newsletter stringids
        selected_newsletters = [key for key, selected in newsletters_dict.items() if selected]

        email = request.user.email
        first_name = request.user.first_name or 'User'
        last_name = request.user.last_name or ''

        # Log the intent for analytics/debugging (no validation - all selections valid for logged-in users)
        if marketing_opt_out:
            logger.info(f"User {email} explicitly opted out of marketing emails")

        logger.info(f"Updating preferences for {email} with selections: {selected_newsletters}, marketingOptOut: {marketing_opt_out}")

        # Get cached valid newsletters for validation
        try:
            valid_newsletters = get_cached_newsletter_list()
        except Exception as e:
            logger.exception(f"Error fetching cached newsletter list: {e}")
            return jsonResponse({
                'error': 'Failed to validate newsletter options'
            }, status=500)

        # Update preferences using replace behavior (or opt-out if marketing_opt_out=True)
        result = update_user_preferences_impl(email, first_name, last_name,
                                              selected_newsletters, valid_newsletters,
                                              marketing_opt_out=marketing_opt_out,
                                              user=request.user)

        # Return success response
        return jsonResponse({
            'success': True,
            'message': 'Preferences updated successfully',
            'email': email,
            'subscribedNewsletters': result['subscribed_newsletters'],
            'marketingOptOut': marketing_opt_out,
        }, status=200)

    except ActiveCampaignError as e:
        logger.warning(f"ActiveCampaign error updating preferences: {e}")
        return jsonResponse({'error': str(e)}, status=500)

    except json.JSONDecodeError:
        return jsonResponse({
            'error': 'Invalid JSON in request body'
        }, status=400)

    except Exception as e:
        logger.exception(f"Unexpected error in update_user_preferences: {e}")
        return jsonResponse({
            'error': 'An unexpected error occurred'
        }, status=500)


# ============================================================================
# Learning Level Endpoint (Authenticated or Email-Based for Logged-Out Users)
# ============================================================================

@csrf_exempt
def update_learning_level(request):
    """
    POST /api/newsletter/learning-level

    Update a user's learning level (1-5 scale representing proficiency with Sefaria).

    For authenticated users:
        - Email is automatically retrieved from request.user.email
        - Request body: {learningLevel: 1-5 or null}

    For logged-out users:
        - Email must be provided in request body
        - Request body: {email: string, learningLevel: 1-5 or null}

    Learning level is saved to:
        - UserProfile (MongoDB) if user has a Sefaria account
        - ActiveCampaign custom field if user doesn't have an account
        - Both systems if user has an account (for consistency)

    Request Body (Authenticated):
        {
            "learningLevel": 1-5 or null
        }

    Request Body (Logged-Out):
        {
            "email": "user@example.com",
            "learningLevel": 1-5 or null
        }

    Returns (200 OK):
        {
            "success": true,
            "message": "Learning level updated successfully",
            "email": "user@example.com",
            "learningLevel": 3,
            "userId": 12345 or null  # null if no account exists
        }

    Errors (400 Bad Request):
        - Email missing (for logged-out users)
        - Invalid learning level (not 1-5 or null)
        - Invalid JSON in request body

    Errors (405 Method Not Allowed):
        - Request method is not POST

    Errors (500 Internal Server Error):
        - ActiveCampaign API error
        - Profile save error

    Notes:
        - Learning level defaults to null (not set)
        - Setting to null clears the learning level
        - Optional for users - can be skipped
        - For logged-out users, creates AC contact even if no account exists
    """
    if request.method != 'POST':
        return jsonResponse({'error': 'Only POST method is supported'}, status=405)

    try:
        # Parse request body
        body = json.loads(request.body)

        # Determine email source based on authentication status
        if request.user.is_authenticated:
            # For authenticated users, use their email from the session
            email = request.user.email
            is_authenticated = True
        else:
            # For logged-out users, email must be provided in request
            email = body.get('email', '').strip()
            is_authenticated = False

            if not email:
                return jsonResponse({
                    'error': 'Email is required for logged-out users.'
                }, status=400)

        # Get learning level from request body
        learning_level = body.get('learningLevel')

        # Validate learning_level type if provided
        # Allow null/None (optional field), or integer 1-5
        if learning_level is not None:
            if not isinstance(learning_level, int) or learning_level < 1 or learning_level > 5:
                return jsonResponse({
                    'error': 'Learning level must be an integer between 1 and 5, or null.'
                }, status=400)

        # Update learning level using service function
        logger.info(f"Processing learning level update for {email}")
        result = update_learning_level_impl(email, learning_level)

        # Return success response
        return jsonResponse({
            'success': True,
            'message': result['message'],
            'email': email,
            'learningLevel': result['learning_level'],
            'userId': result['user_id']  # Will be None if no account exists
        }, status=200)

    except InputError as e:
        logger.warning(f"Validation error in learning level update: {e}")
        return jsonResponse({'error': str(e)}, status=400)

    except ActiveCampaignError as e:
        logger.warning(f"ActiveCampaign error during learning level update: {e}")
        return jsonResponse({'error': str(e)}, status=500)

    except json.JSONDecodeError:
        return jsonResponse({
            'error': 'Invalid JSON in request body'
        }, status=400)

    except Exception as e:
        logger.exception(f"Unexpected error in update_learning_level: {e}")
        return jsonResponse({
            'error': 'An unexpected error occurred'
        }, status=500)
