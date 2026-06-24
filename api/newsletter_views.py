"""
Newsletter API Views

Views for newsletter operations via ActiveCampaign integration.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from functools import wraps
from typing import Any, ParamSpec, cast

from django.http import HttpRequest, HttpResponse
from django.views.decorators.csrf import csrf_protect
from sefaria.client.util import jsonResponse
from sefaria.system.exceptions import InputError
from api.newsletter_service import (
    ActiveCampaignError,
    NewsletterInfo,
    NewsletterListUnavailableError,
    get_cached_newsletter_list,
    is_newsletter_service_configured,
    normalize_and_validate_email,
    subscribe_with_union,
    fetch_user_subscriptions_impl,
    update_user_preferences_impl,
    update_learning_level_impl,
)

logger: logging.Logger = logging.getLogger(__name__)
P = ParamSpec("P")


def handle_newsletter_view_errors(
    action: str,
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
                logger.warning(f"Validation error {action}: {e}")
                return jsonResponse({"error": str(e)}, status=400)
            except NewsletterListUnavailableError as e:
                logger.warning(f"Newsletter list unavailable {action}: {e}")
                return jsonResponse({"error": str(e)}, status=503)
            except ActiveCampaignError as e:
                logger.warning(f"ActiveCampaign error {action}: {e}")
                return jsonResponse({"error": str(e)}, status=500)
            except Exception as e:
                logger.exception(f"Unexpected error {action}: {e}")
                return jsonResponse(
                    {"error": "An unexpected error occurred"}, status=500
                )

        return wrapper

    return decorator


@handle_newsletter_view_errors("getting newsletter lists")
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

    newsletters: list[NewsletterInfo] = get_cached_newsletter_list()
    return jsonResponse({"newsletters": newsletters})


# ============================================================================
# Subscription Endpoint
# ============================================================================


@csrf_protect
@handle_newsletter_view_errors("during subscription")
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
            ]
        }

    Errors (400 Bad Request):
        {
            "error": "First name, last name, and email are required."
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
        - The service validates newsletter selections against the cached managed newsletter list
        - Uses AC contact lookup/create pattern for managing subscribers
        - Subscriptions are union-based: new selections are added to existing, never removed
        - Response includes all current subscriptions (existing + newly added)
    """
    if request.method != "POST":
        return jsonResponse({"error": "Only POST method is supported"}, status=405)

    # Parse request body
    body: dict[str, Any] = json.loads(cast(bytes, request.body))
    first_name: str = body.get("firstName", "").strip()
    last_name: str = body.get("lastName", "").strip()
    email: str = body.get("email", "").strip()
    newsletters_dict: dict[str, bool] = body.get("newsletters", {})

    # Validate required fields
    if not first_name or not last_name or not email:
        return jsonResponse(
            {"error": "First name, last name, and email are required."}, status=400
        )
    email = normalize_and_validate_email(email)

    # Extract selected newsletter stringids
    selected_newsletters: list[str] = [
        key for key, selected in newsletters_dict.items() if selected
    ]

    # Validate at least one newsletter selected
    if not selected_newsletters:
        return jsonResponse(
            {"error": "Please select at least one newsletter."}, status=400
        )

    # Subscribe using union behavior
    logger.info(
        f"Processing subscription for {email} with newsletters: {selected_newsletters}"
    )
    result = subscribe_with_union(email, first_name, last_name, selected_newsletters)

    # Return success response
    return jsonResponse(
        {
            "success": True,
            "message": "Successfully subscribed to newsletters",
            "email": email,
            "subscribedNewsletters": result["all_subscriptions"],
        },
        status=200,
    )


# ============================================================================
# Authenticated Newsletter Endpoints
# ============================================================================


@handle_newsletter_view_errors("fetching subscriptions")
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
    if request.method != "GET":
        return jsonResponse({"error": "Only GET method is supported"}, status=405)

    # Extract user from middleware-injected attribute (not on base HttpRequest type)
    user: Any = getattr(request, "user")

    # Check authentication
    if not user.is_authenticated:
        return jsonResponse({"error": "Authentication required"}, status=401)

    email: str = user.email
    logger.info(f"Fetching subscriptions for authenticated user: {email}")

    # Fetch user subscriptions (pass user for UserProfile lookup)
    result = fetch_user_subscriptions_impl(email, user=user)

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
@handle_newsletter_view_errors("updating preferences")
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
        - Empty selection (all false) is allowed: unsubscribes from all managed newsletters
        - Idempotent: calling multiple times with same selections produces same result
    """
    if request.method != "POST":
        return jsonResponse({"error": "Only POST method is supported"}, status=405)

    # Extract user from middleware-injected attribute (not on base HttpRequest type)
    user: Any = getattr(request, "user")

    # Check authentication
    if not user.is_authenticated:
        return jsonResponse({"error": "Authentication required"}, status=401)

    # Parse request body
    body: dict[str, Any] = json.loads(cast(bytes, request.body))
    newsletters_dict: dict[str, bool] = body.get("newsletters", {})
    marketing_opt_out: bool = body.get(
        "marketingOptOut", False
    )  # Informational flag for intent tracking

    # Extract selected newsletter stringids
    selected_newsletters: list[str] = [
        key for key, selected in newsletters_dict.items() if selected
    ]

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
    result = update_user_preferences_impl(
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
# Learning Level Endpoint (Authenticated or Email-Based for Logged-Out Users)
# ============================================================================


@csrf_protect
@handle_newsletter_view_errors("during learning level update")
def update_learning_level(request: HttpRequest) -> HttpResponse:
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
    if request.method != "POST":
        return jsonResponse({"error": "Only POST method is supported"}, status=405)

    # Extract user from middleware-injected attribute (not on base HttpRequest type)
    user: Any = getattr(request, "user")

    # Parse request body
    body: dict[str, Any] = json.loads(cast(bytes, request.body))

    # Determine email source based on authentication status
    if user.is_authenticated:
        # For authenticated users, use their email from the session
        email: str = user.email
    else:
        # For logged-out users, email must be provided in request
        email = body.get("email", "").strip()

        if not email:
            return jsonResponse(
                {"error": "Email is required for logged-out users."}, status=400
            )
        email = normalize_and_validate_email(email)

    # Get learning level from request body
    learning_level: int | None = body.get("learningLevel")

    # Validate learning_level type if provided
    # Allow null/None (optional field), or integer 1-5
    if learning_level is not None:
        if (
            not isinstance(learning_level, int)
            or learning_level < 1
            or learning_level > 5
        ):
            return jsonResponse(
                {
                    "error": "Learning level must be an integer between 1 and 5, or null."
                },
                status=400,
            )

    # Update learning level using service function
    logger.info(f"Processing learning level update for {email}")
    result = update_learning_level_impl(email, learning_level)

    # Return success response
    return jsonResponse(
        {
            "success": True,
            "message": result["message"],
            "email": result["email"],
            "learningLevel": result["learning_level"],
            "userId": result["user_id"],  # Will be None if no account exists
        },
        status=200,
    )
