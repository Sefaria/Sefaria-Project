"""
Newsletter API Views

Views for newsletter operations via ActiveCampaign integration.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from enum import Enum
from functools import wraps
from typing import Any, ParamSpec, cast

from django.http import HttpRequest, HttpResponse
from django.views.decorators.csrf import csrf_protect
from sefaria.client.util import jsonResponse
from sefaria.system.exceptions import InputError
from api.newsletter_service import (
    NewsletterInfo,
    NewsletterListUnavailableError,
    NewsletterServiceError,
    NewsletterServiceNotConfiguredError,
    get_newsletters,
    is_newsletter_service_configured,
    is_valid_learning_level,
    normalize_and_validate_email,
    sign_learning_level_token,
    verify_learning_level_token,
    add_newsletter_subscriptions,
    fetch_user_subscriptions,
    replace_user_preferences,
    set_learning_level,
)

logger: logging.Logger = logging.getLogger(__name__)
P = ParamSpec("P")

# Sent with a 401 when a logged-in user's session ended while the page was open (for
# example, they logged out in another tab), so the page can show a translated
# "please log in again" message.
AUTHENTICATION_REQUIRED_CODE: str = "authentication_required"


class NewsletterViewAction(Enum):
    """What a newsletter view was doing when it failed. The value goes in the log message."""
    GET_LISTS = "getting newsletter lists"
    SUBSCRIBE = "during subscription"
    FETCH_SUBSCRIPTIONS = "fetching subscriptions"
    UPDATE_PREFERENCES = "updating preferences"
    UPDATE_LEARNING_LEVEL = "during learning level update"


def parse_json_object(request: HttpRequest) -> dict[str, Any]:
    """
    Parse the request body, which must be a JSON object.

    Text that isn't JSON raises json.JSONDecodeError, which the views already turn
    into a 400. Valid JSON that isn't an object ([], "x", 5, null) would otherwise
    crash on the first body.get() and show up as a 500.

    Raises:
        InputError: If the body is valid JSON but not an object
    """
    body: Any = json.loads(cast(bytes, request.body))
    if not isinstance(body, dict):
        raise InputError("Request body must be a JSON object.")
    return body


def read_text_field(body: dict[str, Any], name: str) -> str:
    """
    Return body[name] with surrounding whitespace removed, or "" if it's missing.

    The default in body.get(name, "") only covers a missing key. A null or a
    number would crash on .strip() and show up as a 500, so those are rejected.

    Raises:
        InputError: If the value is present but isn't a string
    """
    value: Any = body.get(name, "")
    if not isinstance(value, str):
        raise InputError(f"{name} must be a string.")
    return value.strip()


def parse_selected_newsletters(body: dict[str, Any]) -> list[str]:
    """
    Return the stringids of the newsletters marked true in body["newsletters"].

    The page always sends an object of true/false values, like
    {"sefaria_news": true, "educator_newsletter": false}. We check that shape
    because a value is only ever used for its truthiness, and in Python the
    string "false" is truthy. Without the check, {"sefaria_news": "false"} would
    subscribe the person, and a list instead of an object would crash on
    .items() and show up as a 500.

    Raises:
        InputError: If newsletters isn't an object of true/false values
    """
    newsletters: Any = body.get("newsletters", {})
    if not isinstance(newsletters, dict) or not all(
        isinstance(selected, bool) for selected in newsletters.values()
    ):
        raise InputError("newsletters must be an object of true/false values.")
    return [key for key, selected in newsletters.items() if selected]


def handle_newsletter_view_errors(
    action: NewsletterViewAction,
) -> Callable[[Callable[P, HttpResponse]], Callable[P, HttpResponse]]:
    """Convert newsletter view exceptions into consistent JSON responses."""

    def decorator(view_func: Callable[P, HttpResponse]) -> Callable[P, HttpResponse]:
        @wraps(view_func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> HttpResponse:
            try:
                return view_func(*args, **kwargs)
            except json.JSONDecodeError:
                return jsonResponse(
                    {"error": "Invalid JSON in request body"}, status=400
                )
            except InputError as e:
                logger.warning(f"Validation error {action.value}: {e}")
                body: dict[str, str] = {"error": str(e)}
                # Errors the person can fix (like InvalidEmailError) carry a code, so
                # the page can show a translated message instead of this English text
                code: str | None = getattr(e, "code", None)
                if code:
                    body["code"] = code
                return jsonResponse(body, status=400)
            except NewsletterListUnavailableError as e:
                logger.warning(f"Newsletter list unavailable {action.value}: {e}")
                return jsonResponse({"error": str(e)}, status=503)
            except NewsletterServiceNotConfiguredError as e:
                # Must come before NewsletterServiceError, which it subclasses. The
                # message names the missing settings, so it only goes in the log.
                logger.warning(f"Newsletter service not configured {action.value}: {e}")
                return jsonResponse({"error": "newsletter_service_not_configured"}, status=503)
            except NewsletterServiceError as e:
                logger.warning(f"ActiveCampaign error {action.value}: {e}")
                ac_body: dict[str, str] = {"error": str(e)}
                # Failures that submitting again would fix (NewsletterUpdateIncompleteError)
                # carry a code, so the page can show a translated "please try again"
                ac_code: str | None = getattr(e, "code", None)
                if ac_code:
                    ac_body["code"] = ac_code
                return jsonResponse(ac_body, status=500)
            except Exception as e:
                logger.exception(f"Unexpected error {action.value}: {e}")
                return jsonResponse(
                    {"error": "An unexpected error occurred"}, status=500
                )

        return wrapper

    return decorator


@handle_newsletter_view_errors(NewsletterViewAction.GET_LISTS)
def get_newsletter_lists(request: HttpRequest) -> HttpResponse:
    """
    GET /api/newsletter/lists

    Returns all available managed newsletters with their metadata from ActiveCampaign.

    Query Parameters:
        None

    Returns (200):
        {
            "newsletters": [
                {
                    "id": "1",
                    "stringid": "sefaria_news",
                    "displayName": {"en": "Sefaria News & Resources", "he": null},
                    "icon": "news-and-resources.svg",
                    "language": "english"
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
        - The frontend submits stringid values; the service maps them to ActiveCampaign list IDs
        - Results are cached in newsletter_service for 1 hour
    """
    if request.method != "GET":
        return jsonResponse({"error": "Only GET method is supported"}, status=405)

    if not is_newsletter_service_configured():
        return jsonResponse({"error": "newsletter_service_not_configured"}, status=503)

    newsletters: list[NewsletterInfo] = get_newsletters()
    return jsonResponse({"newsletters": newsletters})


# ============================================================================
# Subscription Endpoint
# ============================================================================


@csrf_protect
@handle_newsletter_view_errors(NewsletterViewAction.SUBSCRIBE)
def subscribe_newsletter(request: HttpRequest) -> HttpResponse:
    """
    POST /api/newsletter/subscribe

    Subscribe a new (logged-out) user to one or more newsletters.

    Uses union-based subscription: merges new selections with existing subscriptions.
    If the email already exists in ActiveCampaign, the user's existing newsletter
    subscriptions are preserved and the new selections are added.

    Request Body:
        {
            "firstName": string (required),
            "lastName": string (required),
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
            ],
            "learningLevelToken": "<signed token>"
        }

        learningLevelToken: send this back to POST /api/newsletter/learning-level
        to save a learning level for this email while logged out. It expires after
        24 hours.

    Errors (400 Bad Request):
        {
            "error": "First name, last name, and email are required."
        }
        OR
        {
            "error": "Please select at least one newsletter."
        }
        OR
        {
            "error": "newsletters must be an object of true/false values."
        }
        OR
        {
            "error": "Invalid email address.",
            "code": "invalid_email"
        }

    Errors (500 Internal Server Error):
        {
            "error": "Failed to connect to ActiveCampaign API"
        }

    Notes:
        - The service validates newsletter selections against the cached managed newsletter list
        - Uses AC contact lookup/create pattern for managing subscribers
        - Subscriptions are union-based: new selections are added to existing, never removed
        - subscribedNewsletters lists only the newsletters selected in this request,
          not the contact's existing subscriptions. This endpoint doesn't require
          login, so it must not reveal what an email address is already subscribed to.
    """
    if request.method != "POST":
        return jsonResponse({"error": "Only POST method is supported"}, status=405)

    # Parse request body
    body: dict[str, Any] = parse_json_object(request)
    first_name: str = read_text_field(body, "firstName")
    last_name: str = read_text_field(body, "lastName")
    email: str = read_text_field(body, "email")

    # Validate required fields
    if not first_name or not last_name or not email:
        return jsonResponse(
            {"error": "First name, last name, and email are required."}, status=400
        )
    email = normalize_and_validate_email(email)

    # Extract selected newsletter stringids
    selected_newsletters: list[str] = parse_selected_newsletters(body)

    # Validate at least one newsletter selected
    if not selected_newsletters:
        return jsonResponse(
            {"error": "Please select at least one newsletter."}, status=400
        )

    # Subscribe using union behavior
    logger.info(
        f"Processing subscription for {email} with newsletters: {selected_newsletters}"
    )
    add_newsletter_subscriptions(email, first_name, last_name, selected_newsletters)

    # Return only what this request selected, not result["all_subscriptions"].
    # Anyone can call this endpoint with any email address, so returning the
    # contact's full list would tell them which newsletters that person was
    # already subscribed to.
    return jsonResponse(
        {
            "success": True,
            "message": "Successfully subscribed to newsletters",
            "email": email,
            "subscribedNewsletters": selected_newsletters,
            "learningLevelToken": sign_learning_level_token(email),
        },
        status=200,
    )


# ============================================================================
# Authenticated Newsletter Endpoints
# ============================================================================


@handle_newsletter_view_errors(NewsletterViewAction.FETCH_SUBSCRIPTIONS)
def get_user_subscriptions(request: HttpRequest) -> HttpResponse:
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
            "error": "Authentication required",
            "code": "authentication_required"
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
    if request.method != "GET":
        return jsonResponse({"error": "Only GET method is supported"}, status=405)

    # Extract user from middleware-injected attribute (not on base HttpRequest type)
    user: Any = getattr(request, "user")

    # Check authentication
    if not user.is_authenticated:
        return jsonResponse(
            {"error": "Authentication required", "code": AUTHENTICATION_REQUIRED_CODE},
            status=401,
        )

    email: str = user.email
    logger.info(f"Fetching subscriptions for authenticated user: {email}")

    # Fetch user subscriptions (pass user for UserProfile lookup)
    result = fetch_user_subscriptions(email, user=user)

    return jsonResponse(
        {
            "success": True,
            "email": email,
            "subscribedNewsletters": result["subscribed_newsletters"],
            "wantsMarketingEmails": result.get("wants_marketing_emails", True),
            "learningLevel": result.get("learning_level"),
        },
        status=200,
    )


@csrf_protect
@handle_newsletter_view_errors(NewsletterViewAction.UPDATE_PREFERENCES)
def update_user_preferences(request: HttpRequest) -> HttpResponse:
    """
    POST /api/newsletter/preferences

    Update newsletter preferences for the authenticated user.

    Uses REPLACE behavior: The user's selected newsletters become their new
    complete managed subscription list. Anything not selected is unsubscribed.

    Authentication: Required (must be logged in)

    Request Body:
        {
            "newsletters": {
                "sefaria_news": true,
                "text_updates": false,
                "parashah_series": true
            },
            "marketingOptOut": false  // optional; true unsubscribes from ALL lists
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

    Errors (400 Bad Request):
        {
            "error": "newsletters must be an object of true/false values."
        }
        OR
        {
            "error": "marketingOptOut must be true or false."
        }

    Errors (401 Unauthorized):
        {
            "error": "Authentication required",
            "code": "authentication_required"
        }

    Errors (500 Internal Server Error):
        {
            "error": "Failed to connect to ActiveCampaign API"
        }

    Notes:
        - Requires authenticated user via Django session/auth
        - REPLACE behavior: unselected newsletters are unsubscribed
        - Empty selection (all false) is allowed: unsubscribes from all managed newsletters
        - Idempotent: calling multiple times with same selections produces same result
    """
    if request.method != "POST":
        return jsonResponse({"error": "Only POST method is supported"}, status=405)

    # Extract user from middleware-injected attribute (not on base HttpRequest type)
    user: Any = getattr(request, "user")

    # Check authentication
    if not user.is_authenticated:
        return jsonResponse(
            {"error": "Authentication required", "code": AUTHENTICATION_REQUIRED_CODE},
            status=401,
        )

    # Parse request body
    body: dict[str, Any] = parse_json_object(request)

    # Extract selected newsletter stringids
    selected_newsletters: list[str] = parse_selected_newsletters(body)

    # Opting out unsubscribes the person from every list, so only a real true
    # counts. The string "false" is truthy in Python and would otherwise opt them out.
    marketing_opt_out: Any = body.get("marketingOptOut", False)
    if not isinstance(marketing_opt_out, bool):
        raise InputError("marketingOptOut must be true or false.")

    email: str = user.email
    first_name: str = user.first_name or "User"
    last_name: str = user.last_name or ""

    # Log the intent for analytics/debugging (no validation - all selections valid for logged-in users)
    if marketing_opt_out:
        logger.info(f"User {email} explicitly opted out of marketing emails")

    logger.info(
        f"Updating preferences for {email} with selections: {selected_newsletters}, marketingOptOut: {marketing_opt_out}"
    )

    # Update preferences using replace behavior (or opt-out if marketing_opt_out=True)
    result = replace_user_preferences(
        email,
        first_name,
        last_name,
        selected_newsletters,
        marketing_opt_out=marketing_opt_out,
    )

    # Return success response
    return jsonResponse(
        {
            "success": True,
            "message": "Preferences updated successfully",
            "email": email,
            "subscribedNewsletters": result["subscribed_newsletters"],
            "marketingOptOut": marketing_opt_out,
        },
        status=200,
    )


# ============================================================================
# Learning Level Endpoint (Authenticated or Token-Based for Logged-Out Users)
# ============================================================================

# Sent with a 400 when a logged-out caller's token is missing, changed, or expired,
# so the frontend can show a translated "please sign up again" message.
LEARNING_LEVEL_TOKEN_INVALID_CODE: str = "learning_level_token_invalid"


@csrf_protect
@handle_newsletter_view_errors(NewsletterViewAction.UPDATE_LEARNING_LEVEL)
def update_learning_level(request: HttpRequest) -> HttpResponse:
    """
    POST /api/newsletter/learning-level

    Update a user's learning level (1-5 scale representing proficiency with Sefaria).

    For authenticated users:
        - Email is automatically retrieved from request.user.email
        - Request body: {learningLevel: 1-5 or null}

    For logged-out users:
        - Must send the learningLevelToken returned by POST /api/newsletter/subscribe
        - The email comes from that token; any email in the body is ignored
        - Request body: {token: string, learningLevel: 1-5 or null}

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
            "token": "<learningLevelToken from subscribe>",
            "learningLevel": 1-5 or null
        }

    Returns (200 OK):
        {
            "success": true,
            "message": "Learning level updated successfully",
            "email": "user@example.com",
            "learningLevel": 3
        }

    Errors (400 Bad Request):
        - Token missing, changed, or expired (for logged-out users);
          the response includes "code": "learning_level_token_invalid"
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
        - The token only proves the caller went through subscribe first (which is
          itself public); it does not prove they own the email
    """
    if request.method != "POST":
        return jsonResponse({"error": "Only POST method is supported"}, status=405)

    # Extract user from middleware-injected attribute (not on base HttpRequest type)
    user: Any = getattr(request, "user")

    # Parse request body
    body: dict[str, Any] = parse_json_object(request)

    # Get learning level from request body
    learning_level: int | None = body.get("learningLevel")

    # Validate learning_level type if provided
    # Allow null/None (optional field), or integer 1-5
    if learning_level is not None and not is_valid_learning_level(learning_level):
        return jsonResponse(
            {"error": "Learning level must be an integer between 1 and 5, or null."},
            status=400,
        )

    # Work out whose learning level this is
    if user.is_authenticated:
        # Logged in: use the email from their session
        email: str = user.email
    else:
        # Logged out: the email comes from the token that subscribe gave them, so a
        # single request can't set the learning level for any email it likes.
        token_email: str | None = verify_learning_level_token(body.get("token"))
        if token_email is None:
            return jsonResponse(
                {
                    "error": "This page has expired. Please sign up again to save your learning level.",
                    "code": LEARNING_LEVEL_TOKEN_INVALID_CODE,
                },
                status=400,
            )
        email = token_email

    # Update learning level using service function
    logger.info(f"Processing learning level update for {email}")
    result = set_learning_level(email, learning_level)

    # Return success response. The user ID is left out on purpose: the page doesn't
    # need it, and sending it back would tell the caller which Sefaria account
    # belongs to this email.
    return jsonResponse(
        {
            "success": True,
            "message": result["message"],
            "email": result["email"],
            "learningLevel": result["learning_level"],
        },
        status=200,
    )
