# -*- coding: utf-8 -*-
"""
The Library Assistant is a permanent, on-by-default feature, toggled from account
settings like any other user setting. It lives at ``profile.settings["library_assistant"]``.

It began life as the sole entry in the experiments program, where eligibility (a
``UserExperimentSettings`` row) and preference (``profile.experiments``) were conflated.
Everything Library-Assistant-specific now routes through this module, so the experiments
machinery is free to serve actual experiments again.

This module is deliberately the only place that names the setting key. When a future
experiment graduates into a permanent feature, copy this file rather than scattering the
new key across views, templates and context processors.
"""

SETTING_KEY = "library_assistant"

# Users who have never expressed a preference get the assistant. See
# scripts/migrations/migrate_experiments_to_library_assistant.py for the backfill that
# makes this explicit in the stored profiles.
DEFAULT_ENABLED = True


def is_enabled(profile):
    """
    Whether the Library Assistant should load for this profile.
    """
    if profile is None or getattr(profile, "id", None) is None:
        return False
    return bool(profile.settings.get(SETTING_KEY, DEFAULT_ENABLED))


def is_enabled_for_user(user):
    """
    Convenience wrapper for a Django user object, authenticated or not.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False
    from sefaria.model.user_profile import UserProfile
    return is_enabled(UserProfile(user_obj=user))


def normalize(value):
    """
    Coerce a posted value to a bool. The settings form posts a real JSON boolean, but the
    profile API is public, so ``"false"`` must not arrive as truthy.
    """
    if isinstance(value, str):
        return value.strip().lower() not in ("false", "0", "off", "")
    return bool(value)


def set_enabled(user, enabled, notify_crm=True):
    """
    Set the preference for `user` and persist it. Returns the new value.

    `notify_crm` is False for automated enrollment (e.g. the backfill), where firing an
    opt-in webhook per user would flood Salesforce with events the user never triggered.
    """
    from sefaria.model.user_profile import UserProfile

    enabled = normalize(enabled)
    profile = UserProfile(id=user.id)
    previously = profile.settings.get(SETTING_KEY, DEFAULT_ENABLED)
    profile.update({"settings": {SETTING_KEY: enabled}})
    profile.save()

    if notify_crm and previously != enabled:
        notify_crm_of_change(profile, enabled)

    return enabled


def notify_crm_of_change(profile, enabled):
    """
    Report an opt-in/opt-out to Salesforce. Kept separate from `set_enabled` so callers
    that update the profile by other means (the settings API, which saves the whole
    profile in one go) can still fire exactly one webhook.
    """
    from sefaria.helper.crm.tasks import dispatch_chatbot_opt_in_webhook
    interface_language = profile.settings.get("interface_language", "english")
    dispatch_chatbot_opt_in_webhook(profile.email, enabled, interface_language)
