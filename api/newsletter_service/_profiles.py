"""Reads and writes of the Sefaria UserProfile (MongoDB) that the newsletter flows need."""

from __future__ import annotations

import logging

from sefaria.model.user_profile import UserProfile

logger: logging.Logger = logging.getLogger(__name__)


def load_existing_profile_by_email(email: str) -> UserProfile | None:
    """
    Look up the UserProfile for an email, but only if its Mongo profile document exists.

    Returns None when there's no Django user for `email`, and also when there is
    a Django user but no profile document (spam cleanup deletes the document and
    keeps the user, for example). Callers treat both the same way: they skip the
    profile and only update ActiveCampaign.

    Why not return a profile for that second case: `user_registration=True`
    stops UserProfile.__init__ from repairing a missing document, and that repair
    is what assigns the slug. Registration passes the flag too, but then calls
    assign_slug() itself. Saving the unrepaired profile here would insert a
    document with an empty slug, and nothing assigns one later because every
    future load finds the document. The newsletter endpoints can be used without
    logging in, so they shouldn't create profile documents anyway.

    Why this exists as a separate helper: the MongoDB lookup happens exactly
    once per call to the parent service function. Explicit loading at the
    call site makes the cost visible.
    """
    try:
        profile = UserProfile(email=email, user_registration=True)
        # `_id` is the Mongo document's id; it's None when no document was found.
        has_profile_document: bool = profile.id is not None and profile._id is not None
        return profile if has_profile_document else None
    except Exception as e:
        logger.warning(f"Could not load UserProfile for {email}: {e}")
        return None


def save_wants_marketing_emails(
    profile: UserProfile | None, wants_marketing: bool
) -> bool:
    """
    Set wants_marketing_emails on an already-loaded UserProfile and save.

    Accepts an already-loaded profile (or None for users without accounts) so
    the caller controls when the MongoDB read happens. If `profile` is None,
    this is a no-op — the user has no Sefaria account to update.

    Errors during save are logged at warning level and not raised, so a MongoDB
    hiccup never stops the surrounding ActiveCampaign flow. Returns False when
    the save failed, so a caller can report it: opting out does, because
    nothing else would set it to False later, so the user needs to try again.
    Setting True doesn't need to, because the next form load sets it again if
    the user has active lists.

    Returns:
        bool: False if the save failed; True if it worked or there was no profile
    """
    if profile is None:
        logger.info("No UserProfile in scope; skipping wants_marketing_emails update")
        return True
    try:
        profile.wants_marketing_emails = wants_marketing
        profile.save()
        logger.info(
            f"Updated wants_marketing_emails={wants_marketing} for user {profile.id}"
        )
        return True
    except Exception as e:
        logger.warning(
            f"Failed to update wants_marketing_emails for user {profile.id}: {e}"
        )
        return False
