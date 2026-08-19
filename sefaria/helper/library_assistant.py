# -*- coding: utf-8 -*-
"""
The Library Assistant's on/off switch, in one place.

The assistant is a plain per-user setting living at
``profile.settings["library_assistant"]``. Every read and write of it goes through this
module — views, templates, context processors and scripts all call in here rather than
touching the key directly.

Two rules:

1. **Key present** — obey it.
2. **Key absent** — fall back to the experiments rule: the user is on the experiments
   whitelist (a ``UserExperimentSettings`` row exists) *and* ``profile.experiments`` is
   true.

Deliberately *not* done: adding the key to ``UserProfile``'s settings defaults. A default
of ``True`` would make a profile with no key of its own read as on, and
``UserProfile.update()`` deep-merges settings, so that value would then be written back on
the profile's next save. Absent means absent.

TEMPORARY (goes with the experiments framework) — rule 2, the fallback implementing it
below, and this paragraph. The fallback is what makes deploying this module behaviorally
inert: until the migration in
``scripts/migrations/migrate_experiments_to_library_assistant.py`` writes the key, every
user reads exactly as they do today. The migration run — not the deploy — is the moment
the assistant switches from opt-in to opt-out, and rollback is unsetting the key.
"""

# Module import, not `from … import UserProfile`: user_profile imports this module at
# its own top level, so binding the class here at import time would break the cycle.
from sefaria.model import user_profile

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
    if SETTING_KEY in settings:
        return normalize(settings[SETTING_KEY])
    return _legacy_enabled(profile)


def is_enabled_for_user(user):
    """
    Convenience wrapper for a Django user object, authenticated or not.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return is_enabled(user_profile.UserProfile(user_obj=user))


def _legacy_enabled(profile):
    """
    The pre-migration rule: on the experiments whitelist and opted in.

    TEMPORARY (goes with the experiments framework): remove once every profile carries
    the setting key.
    """
    # Imported here, not at the top: the import serves only this TEMPORARY
    # fallback and disappears with it.
    from reader.models import user_has_experiments
    user = getattr(profile, "user", None)
    if user is None:
        return False
    return user_has_experiments(user) and bool(getattr(profile, "experiments", False))


def set_enabled(user, enabled):
    """
    Set the preference for `user` and persist it. Returns the new value.
    """
    enabled = normalize(enabled)
    profile = user_profile.UserProfile(id=user.id)
    profile.update({"settings": {SETTING_KEY: enabled}})
    profile.save()

    return enabled
