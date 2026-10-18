"""Exceptions raised by the newsletter service, and the decorator that converts unexpected errors."""

from __future__ import annotations

import functools
import logging

from sefaria.system.exceptions import InputError

logger: logging.Logger = logging.getLogger(__name__)


class ActiveCampaignError(Exception):
    """Custom exception for ActiveCampaign API errors"""

    pass


class NewsletterListUnavailableError(ActiveCampaignError):
    """Raised when managed newsletter metadata cannot be loaded for a user flow."""

    pass


class NewsletterServiceNotConfiguredError(ActiveCampaignError):
    """
    Raised when the ActiveCampaign credentials aren't set (common in local dev and CI).
    The views answer 503 for it instead of the 500 a real AC failure gets. It's a
    subclass so code that already catches ActiveCampaignError still catches it.
    """

    pass


class NewsletterUpdateIncompleteError(ActiveCampaignError):
    """
    Raised when an update was only partly applied: a list change or the profile
    save failed after the other steps were tried. Submitting again finishes it,
    so the views send `code` with the error and the page shows a translated
    "please try again" message instead of this English text.
    """

    code: str = "preferences_update_incomplete"


class InvalidEmailError(InputError):
    """
    Raised when an email address isn't valid. The person can fix this by correcting
    the address, so it carries a code the page uses to show a translated message.
    The page checks emails too, but its check accepts some addresses this one
    rejects (for example, Hebrew letters before the @).
    """

    code: str = "invalid_email"


def wraps_ac_errors(func):
    """
    Wrap unexpected exceptions raised by `func` as ActiveCampaignError.

    Behavior:
        - `ActiveCampaignError` and `InputError` propagate unchanged so callers
          can still distinguish them. The lower layer (NewsletterClient.make_request)
          already logs ActiveCampaignError detail, so we don't re-log here.
        - Anything else (KeyError, TypeError, network errors that escaped the
          client, etc.) is logged with a full traceback via `logger.exception`
          and re-raised as ActiveCampaignError, so callers only need to handle
          one exception type.

    Composition:
        When combined with `@requires_ac_client`, put `@requires_ac_client`
        outermost (above) so its "not configured" ActiveCampaignError doesn't
        get re-wrapped — the pass-through clause below handles it harmlessly
        either way, but the outer placement reads more naturally.

        @requires_ac_client
        @wraps_ac_errors
        def my_service_fn(...): ...
    """

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except (ActiveCampaignError, InputError):
            raise
        except Exception as e:
            logger.exception(f"Error in {func.__name__}: {e}")
            raise ActiveCampaignError(f"Error in {func.__name__}: {str(e)}")

    return wrapper
