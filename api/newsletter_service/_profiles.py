"""Reads and writes of the Sefaria UserProfile (MongoDB) that the newsletter flows need."""

from __future__ import annotations

import logging
from typing import Any, Literal, get_args

from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db

logger: logging.Logger = logging.getLogger(__name__)


# The only profile fields the newsletter service may write. save_single_profile_field
# refuses anything else, because logged-out visitors reach it (through the learning-level
# token), and a typo or a field name taken from a request would otherwise write straight
# into someone's profile. Add a field here only after thinking about who can trigger it.
#
# It is a Literal so the type checker flags a wrong name where it is typed. The frozenset
# below is built from it, because a type isn't checked while the code runs and the
# function also has to refuse a name that only exists at runtime.
NewsletterWritableProfileField = Literal["learning_level", "wants_marketing_emails"]
NEWSLETTER_WRITABLE_PROFILE_FIELDS: frozenset[str] = frozenset(
    get_args(NewsletterWritableProfileField)
)


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


def save_single_profile_field(
    profile: UserProfile, field_name: NewsletterWritableProfileField, value: Any
) -> bool:
    """
    Write one field of a UserProfile to MongoDB, and nothing else.

    Why not profile.save(): it writes back every field as this object loaded it
    (except the donor ones). The newsletter endpoints can be used without logging
    in, so a save from here could undo a change the person made in the meantime, and
    would write any field added to the profile later. A $set of one field can only
    ever change that field.

    Mirrors UserProfile.save() in the one way that matters here: the document is
    found by `_id`, and a missing document is not created (no upsert), so no
    slugless profile gets inserted.

    The loaded object is updated too, so a caller still holding it sees the new value.
    These fields aren't part of the public user data, so there is no cache to clear.

    Returns:
        bool: False if no profile document matched; True if the field was written

    Raises:
        ValueError: If field_name isn't in NEWSLETTER_WRITABLE_PROFILE_FIELDS, which the
            type checker catches for a literal name but not for one built at runtime.
            This is a bug in the calling code, not bad input, so it isn't an InputError.
    """
    if field_name not in NEWSLETTER_WRITABLE_PROFILE_FIELDS:
        raise ValueError(
            f"The newsletter service may not write profile field '{field_name}'; "
            f"allowed: {sorted(NEWSLETTER_WRITABLE_PROFILE_FIELDS)}"
        )
    result = db.profiles.update_one({"_id": profile._id}, {"$set": {field_name: value}})
    if result.matched_count == 0:
        return False
    setattr(profile, field_name, value)
    return True


def save_wants_marketing_emails(
    profile: UserProfile | None, wants_marketing: bool
) -> bool:
    """
    Write wants_marketing_emails (that field only, see save_single_profile_field) to
    an already-loaded UserProfile.

    Accepts an already-loaded profile (or None for users without accounts) so
    the caller controls when the MongoDB read happens. If `profile` is None,
    this is a no-op — the user has no Sefaria account to update.

    Errors during the write are logged at warning level and not raised, so a MongoDB
    hiccup never stops the surrounding ActiveCampaign flow. Returns False when
    the write failed or no profile document matched, so a caller can report it: opting out does, because
    nothing else would set it to False later, so the user needs to try again.
    Setting True doesn't need to, because the next form load sets it again if
    the user has active lists.

    Returns:
        bool: False if the write failed; True if it worked or there was no profile
    """
    if profile is None:
        logger.info("No UserProfile in scope; skipping wants_marketing_emails update")
        return True
    try:
        if not save_single_profile_field(profile, "wants_marketing_emails", wants_marketing):
            logger.warning(
                f"No profile document to update wants_marketing_emails for user {profile.id}"
            )
            return False
        logger.info(
            f"Updated wants_marketing_emails={wants_marketing} for user {profile.id}"
        )
        return True
    except Exception as e:
        logger.warning(
            f"Failed to update wants_marketing_emails for user {profile.id}: {e}"
        )
        return False
