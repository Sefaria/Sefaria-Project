"""Typed shapes of the values the newsletter service returns."""

from __future__ import annotations

from typing import Any, TypedDict


type DisplayName = dict[str, str | None]


# ========== Typed dict shapes for structured return values ==========


class NewsletterInfo(TypedDict):
    """One managed newsletter with display metadata. Element of get_newsletter_list()."""

    id: str
    stringid: str
    displayName: DisplayName
    icon: str
    language: str
    primary: bool


class SubscribeResult(TypedDict):
    """Return shape of subscribe_with_union: the contact and the union of all current subscriptions."""

    contact: dict[str, Any]
    all_subscriptions: list[str]


class UserSubscriptions(TypedDict):
    """Return shape of fetch_user_subscriptions_impl: a user's full subscription state."""

    subscribed_newsletters: list[str]
    learning_level: int | None
    wants_marketing_emails: bool


class PreferencesResult(TypedDict):
    """Return shape of update_user_preferences_impl: the contact and the post-update subscription list."""

    contact: dict[str, Any]
    subscribed_newsletters: list[str]


class LearningLevelACResult(TypedDict):
    """Return shape of update_learning_level_in_ac: confirms what was written to AC."""

    contact_id: str
    email: str
    learning_level: int | None


class LearningLevelResult(TypedDict):
    """Return shape of update_learning_level_impl: combined outcome of AC + UserProfile updates."""

    email: str
    learning_level: int | None
    user_id: int | None
    message: str
