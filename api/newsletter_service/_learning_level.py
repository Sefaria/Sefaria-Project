"""The learning-level flow, the signed learning-level token, and the copy to a new account at registration."""

from __future__ import annotations

import logging
from typing import Any

from django.core import signing

from sefaria.system.exceptions import InputError
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db
from api.newsletter_service._ac_client import requires_ac_client
from api.newsletter_service._contacts import (
    get_learning_level_for_email,
    update_learning_level_in_ac,
)
from api.newsletter_service._profiles import _load_user_profile
from api.newsletter_service._results import LearningLevelResult
from api.newsletter_service._validation import (
    is_valid_learning_level,
    normalize_and_validate_email,
)

logger: logging.Logger = logging.getLogger(__name__)


# ============================================================================
# Learning Level Management
# ============================================================================


@requires_ac_client
def update_learning_level_impl(
    email: str, learning_level: int | None
) -> LearningLevelResult:
    """
    Update a user's learning level, handling both authenticated and unauthenticated users.

    For users WITH existing Sefaria accounts:
        - Updates their UserProfile in MongoDB
        - Also updates AC for consistency across systems

    For users WITHOUT accounts:
        - Only updates AC (no profile to use or create)
        - AC custom field stores their learning level preference, which will sync with Salesforce

    Args:
        email (str): User email address
        learning_level (int or None): Integer 1-5 or None to unset

    Returns:
        dict: {
            'email': str,
            'learning_level': int or None,
            'user_id': int or None,  # Set if account exists, None if no account
            'message': str
        }

    Raises:
        InputError: If learning_level is invalid (not 1-5 or None)
        ActiveCampaignError: If AC update fails
    """
    email = normalize_and_validate_email(email)

    # Validate learning_level
    if learning_level is not None and not is_valid_learning_level(learning_level):
        logger.warning(f"Invalid learning level {learning_level} for {email}")
        raise InputError(
            "Learning level must be an integer between 1 and 5, or null/None"
        )

    logger.info(f"Updating learning level for {email}: {learning_level}")

    # Step 1: Try to load the user profile using the shared newsletter helper.
    profile: UserProfile | None = _load_user_profile(email)

    user_id: int | None = profile.id if profile is not None else None
    updated_profile: bool = False

    # Step 2: Always update in ActiveCampaign (for logged-out users or consistency)
    # This ensures learning level is available in the newsletter system even without an account.
    #
    # AC goes first so that a failed AC write leaves nothing changed and the error is accurate.
    # If AC succeeds and the profile save below fails, AC is ahead of the profile, which
    # fetch_user_subscriptions_impl already handles: it reads AC and lets AC's value win.
    try:
        update_learning_level_in_ac(email, learning_level)
    except Exception as e:
        logger.exception(f"Error updating learning level in AC for {email}: {e}")
        raise

    # Step 3: If account exists, update the UserProfile
    if profile is not None:
        logger.info(f"Found existing user account for {email} (ID: {user_id})")

        try:
            profile.learning_level = learning_level  # type: ignore[assignment]
            profile.save()
            updated_profile = True
            logger.info(f"Updated UserProfile for user {user_id}")
        except Exception as e:
            logger.exception(f"Error updating UserProfile for {email}: {e}")
            # Don't raise - AC already has the new value

    else:
        logger.info(f"No existing user account for {email}")

    message: str = "Learning level updated successfully"
    if updated_profile:
        message += " (and saved to profile)"

    return {
        "email": email,
        "learning_level": learning_level,
        "user_id": user_id,
        "message": message,
    }


# ============================================================================
# Learning Level Token (ties a logged-out learning-level save to a subscribe)
# ============================================================================

# The salt keeps these tokens separate from anything else Django signs with the
# same SECRET_KEY, so a signed value made for another purpose can't be used here.
LEARNING_LEVEL_TOKEN_SALT: str = "newsletter.learning-level"
LEARNING_LEVEL_TOKEN_MAX_AGE: int = 60 * 60 * 24  # 24 hours, in seconds


def make_learning_level_token(email: str) -> str:
    """
    Create a signed token that says "this email just subscribed".

    The subscribe endpoint returns it, and a logged-out visitor sends it back when
    they save their learning level. Without it, anyone could set the learning level
    for any email with a single request.

    The token is signed, not encrypted: anyone can read the email inside it, but
    nobody can change it or make a new one without our SECRET_KEY. It only goes back
    to the visitor who typed that email, so that's fine.
    """
    return signing.dumps({"email": email}, salt=LEARNING_LEVEL_TOKEN_SALT)


def read_learning_level_token(token: Any) -> str | None:
    """
    Return the email inside a learning-level token, or None if the token can't be trusted.

    None covers every bad case: no token, not a string, changed or made up (bad
    signature), older than LEARNING_LEVEL_TOKEN_MAX_AGE, or no valid email inside.
    """
    if not isinstance(token, str) or not token:
        return None
    try:
        payload: Any = signing.loads(
            token, salt=LEARNING_LEVEL_TOKEN_SALT, max_age=LEARNING_LEVEL_TOKEN_MAX_AGE
        )
    except signing.BadSignature:  # SignatureExpired is a kind of BadSignature
        return None
    email: Any = payload.get("email") if isinstance(payload, dict) else None
    try:
        return normalize_and_validate_email(email)
    except InputError:
        return None


# ============================================================================
# Learning Level at Registration
# ============================================================================

# Only used when Celery is off and the copy runs during registration (see
# api/tasks.py). The new user waits for those AC calls, so keep them short. If AC
# is slow, we skip the copy instead of making the user wait.
REGISTRATION_AC_TIMEOUT: float = 3


def copy_learning_level_from_ac(uid: int, timeout: float | None = None) -> int | None:
    """
    Fill in a new account's learning level from ActiveCampaign.

    People can answer the newsletter learning-level question before they have a
    Sefaria account. That answer is only stored in AC, so after they register we
    copy it onto their new profile. This usually runs in a Celery task (see
    api/tasks.py), so registration never waits for AC.

    Only the learning_level field is written, and only while it's still empty.
    UserProfile.save() would overwrite the whole profile, which could undo a
    change the person made in the meantime (or put back an empty level).

    Args:
        uid (int): The new user's ID
        timeout (float or None): Seconds to wait for AC; None uses the client default

    Returns:
        int or None: The level that was copied, or None if nothing was copied

    Raises:
        ActiveCampaignError: If AC can't be reached (so the task can try again)
    """
    profile: UserProfile = UserProfile(id=uid)
    # Keep a level the profile already has. A "seed" account (created before the
    # person registered) may already have one saved from the newsletter page.
    if profile.id is None or profile.learning_level is not None:
        return None

    learning_level: int | None = get_learning_level_for_email(profile.email, timeout=timeout)
    if learning_level is None:
        return None

    # "learning_level": None also matches a profile with no learning_level field yet
    db.profiles.update_one(
        {"id": uid, "learning_level": None},
        {"$set": {"learning_level": learning_level}},
    )
    logger.info(f"Copied learning level {learning_level} from AC to user {uid}")
    return learning_level
