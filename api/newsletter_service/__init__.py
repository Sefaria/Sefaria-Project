"""
Newsletter service: the public API the newsletter views and Celery tasks use.

This file is the only public module of the package. Import from here, not from the
underscored modules next to it, which are internal (PEP 8: a module whose name starts
with an underscore is internal, and so is everything in it).
"""

from api.newsletter_service._errors import (
    ActiveCampaignError,
    InvalidEmailError,
    NewsletterListUnavailableError,
    NewsletterServiceNotConfiguredError,
    NewsletterUpdateIncompleteError,
)
from api.newsletter_service._results import (
    LearningLevelResult,
    NewsletterInfo,
    PreferencesResult,
    SubscribeResult,
    UserSubscriptions,
)
from api.newsletter_service._validation import (
    is_valid_learning_level,
    normalize_and_validate_email,
)
from api.newsletter_service._ac_client import is_newsletter_service_configured
from api.newsletter_service._catalog import get_cached_newsletter_list
from api.newsletter_service._subscriptions import (
    fetch_user_subscriptions_impl,
    subscribe_with_union,
    update_user_preferences_impl,
)
from api.newsletter_service._learning_level import (
    LEARNING_LEVEL_TOKEN_MAX_AGE,
    LEARNING_LEVEL_TOKEN_SALT,
    REGISTRATION_AC_TIMEOUT,
    copy_learning_level_from_ac,
    make_learning_level_token,
    read_learning_level_token,
    update_learning_level_impl,
)

__all__ = [
    # Flows
    "subscribe_with_union",
    "fetch_user_subscriptions_impl",
    "update_user_preferences_impl",
    "update_learning_level_impl",
    "copy_learning_level_from_ac",
    "get_cached_newsletter_list",
    # Learning-level token
    "make_learning_level_token",
    "read_learning_level_token",
    "LEARNING_LEVEL_TOKEN_SALT",
    "LEARNING_LEVEL_TOKEN_MAX_AGE",
    "REGISTRATION_AC_TIMEOUT",
    # Checks
    "is_newsletter_service_configured",
    "is_valid_learning_level",
    "normalize_and_validate_email",
    # Errors
    "ActiveCampaignError",
    "InvalidEmailError",
    "NewsletterListUnavailableError",
    "NewsletterServiceNotConfiguredError",
    "NewsletterUpdateIncompleteError",
    # Result shapes
    "NewsletterInfo",
    "SubscribeResult",
    "UserSubscriptions",
    "PreferencesResult",
    "LearningLevelResult",
]
