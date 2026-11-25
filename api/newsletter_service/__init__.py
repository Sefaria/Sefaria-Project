"""
Newsletter service: the public API the newsletter views and Celery tasks use.

Import from this file only. The modules next to it start with an underscore, which
marks them internal (PEP 8: a module whose name starts with an underscore is
internal, and so is everything in it). Unit tests are the exception: they import the
internal modules to test and mock their parts.

The public names below don't mention ActiveCampaign (AC), the email provider we use
today. If Sefaria ever moves to another provider, only the AC code inside this package
should need to change, not the views or tasks that call it.

Glossary: AC's terms, used inside the package, and what they mean on the newsletter page

    contact             AC's record for one email address: a subscriber. It may or
                        may not belong to someone with a Sefaria account.
    list                One newsletter. A "managed" list is one the sign-up page
                        offers (it has metadata, see below). Other lists in the AC
                        account are "unmanaged": the page never shows them, and only
                        a full marketing opt-out removes people from them.
    list membership     Whether a contact is on a list. Status 1 means subscribed and
                        status 2 means unsubscribed. AC keeps the membership after an
                        unsubscribe, which is why readers ask for active_only=True.
    stringid            A list's stable name, like "sefaria_news". The page and the
                        API use stringids, and AC uses numeric list IDs.
    personalization     An AC text value. A managed list's display data (icon,
      variable          language, primary) is stored as JSON in the variable tagged
                        list_<list id>_meta.
    custom field,       A setting stored per contact. The LEARNING_LEVEL field
      field value,      holds the learning level a person picked (1-5). A field is
      perstag           found by its perstag (its tag name), not its numeric ID.

Where data lives: the learning level is stored in AC and, for people with a Sefaria
account, in their UserProfile (MongoDB) too. When the page reads it and the two differ,
AC's value wins, because AC can be changed from outside Sefaria. The marketing opt-out
(wants_marketing_emails) is stored only in the UserProfile.

Layers. Each module imports only from modules on the lines above it, so there are no
import cycles:

    _results, _errors     return shapes; exceptions
    _validation           email and learning-level checks
    _ac_client            the one HTTP client for AC, and the "configured?" check
    _catalog, _contacts,  the managed newsletters; AC contacts, memberships and
      _profiles           fields; UserProfile reads and writes
    _subscriptions,       the flows below, which the views call
      _learning_level
    __init__              this file

Naming:
    fetch_          calls the email provider
    find_           may return None, and never creates anything
    load_ / save_   reads or writes the MongoDB UserProfile
    get_            may be answered from a cache
    parse_          pure, no I/O
Functions that call AC directly have "ac" after the verb (fetch_ac_lists,
find_ac_contact_id_by_email). The public names here never do.
"""

from api.newsletter_service._errors import (
    InvalidEmailError,
    NewsletterListUnavailableError,
    NewsletterServiceError,
    NewsletterServiceNotConfiguredError,
    NewsletterUpdateIncompleteError,
)
from api.newsletter_service._results import (
    AddSubscriptionsResult,
    NewsletterInfo,
    ReplacePreferencesResult,
    SetLearningLevelResult,
    UserSubscriptions,
)
from api.newsletter_service._validation import (
    is_valid_learning_level,
    normalize_and_validate_email,
)
from api.newsletter_service._ac_client import is_newsletter_service_configured
from api.newsletter_service._catalog import get_newsletters
from api.newsletter_service._subscriptions import (
    add_newsletter_subscriptions,
    fetch_user_subscriptions,
    replace_user_preferences,
)
from api.newsletter_service._learning_level import (
    LEARNING_LEVEL_TOKEN_MAX_AGE,
    LEARNING_LEVEL_TOKEN_SALT,
    REGISTRATION_PROVIDER_TIMEOUT,
    copy_learning_level_to_new_profile,
    set_learning_level,
    sign_learning_level_token,
    verify_learning_level_token,
)

__all__ = [
    # Flows. Each one pairs with a view in api/newsletter_views.py (or a task).
    "add_newsletter_subscriptions",  # subscribe_newsletter
    "fetch_user_subscriptions",  # get_user_subscriptions
    "replace_user_preferences",  # update_user_preferences
    "set_learning_level",  # update_learning_level
    "copy_learning_level_to_new_profile",  # the Celery task in api/tasks.py
    "get_newsletters",  # get_newsletter_lists, and the flows above
    # Learning-level token
    "sign_learning_level_token",
    "verify_learning_level_token",
    "LEARNING_LEVEL_TOKEN_SALT",
    "LEARNING_LEVEL_TOKEN_MAX_AGE",
    "REGISTRATION_PROVIDER_TIMEOUT",
    # Checks
    "is_newsletter_service_configured",
    "is_valid_learning_level",
    "normalize_and_validate_email",
    # Errors
    "NewsletterServiceError",
    "InvalidEmailError",
    "NewsletterListUnavailableError",
    "NewsletterServiceNotConfiguredError",
    "NewsletterUpdateIncompleteError",
    # Result shapes
    "NewsletterInfo",
    "AddSubscriptionsResult",
    "UserSubscriptions",
    "ReplacePreferencesResult",
    "SetLearningLevelResult",
]
