# -*- coding: utf-8 -*-
"""
The Library Assistant's on/off switch, in one place.

The assistant is a plain per-user setting living at
``profile.settings["library_assistant"]``. Every read and write of it goes through this
module — views, templates, context processors and scripts all call in here rather than
touching the key directly.

The key is written for every account:
``scripts/migrations/migrate_experiments_to_library_assistant.py`` backfilled the
existing ones and registration writes it for new ones. A profile without the key reads
as off; re-run the migration if any turn up.

Deliberately *not* done: adding the key to ``UserProfile``'s settings defaults. A default
of ``True`` would silently override a real opt-out on any profile that lost the key, and
``UserProfile.update()`` deep-merges settings, so the wrong value would then be written
back on the user's next profile save. Absent means absent.
"""

SETTING_KEY = "library_assistant"


def normalize(value):
    """
    Coerce a posted value to a bool. The settings form posts a real JSON boolean, but
    ``/api/profile`` and ``/api/profile/sync`` are public, so a posted ``"false"`` must
    not read as truthy.
    """
    if isinstance(value, str):
        return value.strip().lower() not in ("false", "0", "off", "no", "")
    return bool(value)


def is_enabled(profile):
    """
    Whether the Library Assistant should load for this profile.
    """
    if profile is None or getattr(profile, "id", None) is None:
        return False
    settings = getattr(profile, "settings", None) or {}
    return normalize(settings.get(SETTING_KEY, False))


def is_enabled_for_user(user):
    """
    Convenience wrapper for a Django user object, authenticated or not.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False
    from sefaria.model.user_profile import UserProfile
    return is_enabled(UserProfile(user_obj=user))


def set_enabled(user, enabled, notify_crm=True):
    """
    Set the preference for `user` and persist it. Returns the new value.

    `notify_crm` is False for automated writes (the migration backfill), where firing an
    opt-in webhook per user would flood Salesforce with events no user triggered.
    """
    from sefaria.model.user_profile import UserProfile

    enabled = normalize(enabled)
    profile = UserProfile(id=user.id)
    previously = is_enabled(profile)
    profile.update({"settings": {SETTING_KEY: enabled}})
    profile.save()

    if notify_crm and previously != enabled:
        notify_crm_of_change(profile, enabled)

    return enabled


def notify_crm_of_change(profile, enabled):
    """
    Report an opt-in/opt-out to Salesforce. Kept separate from `set_enabled` so callers
    that write the profile by other means (the settings API, which saves the whole
    profile in one go) can still fire exactly one webhook per genuine change.

    The webhook itself is currently deactivated at the dispatch layer — comms has no
    use for the signal while the assistant is on by default. This seam and its
    once-per-change contract stay wired so reactivating is a one-flag change; see
    CHATBOT_OPT_IN_WEBHOOK_DEACTIVATED in sefaria/helper/crm/tasks.py.
    """
    from sefaria.helper.crm.tasks import dispatch_chatbot_opt_in_webhook
    interface_language = profile.settings.get("interface_language", "english")
    dispatch_chatbot_opt_in_webhook(profile.email, enabled, interface_language)
