"""Typed shapes of the values the newsletter service returns."""

from __future__ import annotations

from typing import Any, TypedDict


type DisplayName = dict[str, str | None]


# ========== Typed dict shapes for structured return values ==========


class NewsletterInfo(TypedDict):
    """One managed newsletter with display metadata. Element of fetch_ac_newsletters()."""

    id: str
    stringid: str
    displayName: DisplayName
    icon: str
    language: str
    primary: bool


class AddSubscriptionsResult(TypedDict):
    """Return shape of add_newsletter_subscriptions: the contact and the union of all current subscriptions."""

    contact: dict[str, Any]
    all_subscriptions: list[str]


class UserSubscriptions(TypedDict):
    """Return shape of fetch_user_subscriptions: a user's full subscription state."""

    subscribed_newsletters: list[str]
    learning_level: int | None
    wants_marketing_emails: bool


class ReplacePreferencesResult(TypedDict):
    """Return shape of replace_user_preferences: the contact and the post-update subscription list."""

    contact: dict[str, Any]
    subscribed_newsletters: list[str]


class ACLearningLevelResult(TypedDict):
    """Return shape of set_ac_learning_level: confirms what was written to AC."""

    contact_id: str
    email: str
    learning_level: int | None


class SetLearningLevelResult(TypedDict):
    """Return shape of set_learning_level: combined outcome of AC + UserProfile updates."""

    email: str
    learning_level: int | None
    user_id: int | None
    message: str
