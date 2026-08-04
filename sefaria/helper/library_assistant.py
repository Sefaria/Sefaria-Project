# -*- coding: utf-8 -*-
"""
The Library Assistant's on/off switch, in one place.

The assistant is a plain per-user setting living at
``profile.settings["library_assistant"]``. Every read and write of it goes through this
module — views, templates, context processors and scripts all call in here rather than
touching the key directly.

The key is written for every account: registration writes it for new accounts, and
``scripts/migrations/migrate_experiments_to_library_assistant.py`` backfills any profile
missing it. A profile without the key reads as off; re-run the migration if any turn up.

Deliberately *not* done: adding the key to ``UserProfile``'s settings defaults. A default
of ``True`` would silently override a real opt-out on any profile that lost the key, and
``UserProfile.update()`` deep-merges settings, so the wrong value would then be written
back on the user's next profile save. Absent means absent.
"""

from sefaria.model.user_profile import UserProfile

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
    return is_enabled(UserProfile(user_obj=user))


def set_enabled(user, enabled):
    """
    Set the preference for `user` and persist it. Returns the new value.
    """
    enabled = normalize(enabled)
    profile = UserProfile(id=user.id)
    profile.update({"settings": {SETTING_KEY: enabled}})
    profile.save()

    return enabled
