"""Exceptions raised by the newsletter service, and the decorator that converts unexpected errors."""

from __future__ import annotations

import functools
import logging

from sefaria.system.exceptions import InputError

logger: logging.Logger = logging.getLogger(__name__)


class NewsletterServiceError(Exception):
    """
    Base class for the errors the newsletter service raises.

    Raised directly when ActiveCampaign fails or something unexpected goes wrong
    (see reraise_as_newsletter_service_error). The subclasses below are the cases
    the views answer differently. Catching this class catches all of them.
    """

    pass


class NewsletterListUnavailableError(NewsletterServiceError):
    """Raised when managed newsletter metadata cannot be loaded for a user flow."""

    pass


class NewsletterServiceNotConfiguredError(NewsletterServiceError):
    """
    Raised when the ActiveCampaign credentials aren't set (common in local dev and CI).
    The views answer 503 for it instead of the 500 a real AC failure gets. It's a
    subclass so code that already catches NewsletterServiceError still catches it.
    """

    pass


class NewsletterUpdateIncompleteError(NewsletterServiceError):
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


def reraise_as_newsletter_service_error(func):
    """
    Wrap unexpected exceptions raised by `func` as NewsletterServiceError.

    Behavior:
        - `NewsletterServiceError` and `InputError` propagate unchanged so callers
          can still distinguish them. The lower layer (ActiveCampaignClient.make_request)
          already logs NewsletterServiceError detail, so we don't re-log here.
        - Anything else (KeyError, TypeError, network errors that escaped the
          client, etc.) is logged with a full traceback via `logger.exception`
          and re-raised as NewsletterServiceError, so callers only need to handle
          one exception type.

    Composition:
        When combined with `@requires_newsletter_service`, put `@requires_newsletter_service`
        outermost (above) so its "not configured" NewsletterServiceError doesn't
        get re-wrapped — the pass-through clause below handles it harmlessly
        either way, but the outer placement reads more naturally.

        @requires_newsletter_service
        @reraise_as_newsletter_service_error
        def my_service_fn(...): ...
    """

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except (NewsletterServiceError, InputError):
            raise
        except Exception as e:
            logger.exception(f"Error in {func.__name__}: {e}")
            raise NewsletterServiceError(f"Error in {func.__name__}: {str(e)}")

    return wrapper
