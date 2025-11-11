"""
Process-local cache for remote configuration values.
"""
from __future__ import annotations

from typing import Any, Dict, Optional
import threading


_lock = threading.Lock()
_cache: Optional[Dict[str, Any]] = None


def _build_cache() -> Dict[str, Any]:
    """
    Build a dictionary of active remote config keys to parsed values.
    """
    from .models import RemoteConfigEntry

    entries = RemoteConfigEntry.objects.filter(is_active=True)
    return {entry.key: entry.parse_value() for entry in entries}


def reload_cache() -> None:
    """
    Reload all config entries from the database and swap them into the cache.
    """
    global _cache
    new_cache = _build_cache()
    with _lock:
        _cache = new_cache


def get_cache() -> Dict[str, Any]:
    """
    Lazily build the cache on first access, sharing the result across threads.
    """
    global _cache
    if _cache is None:
        with _lock:
            if _cache is None:  # double-checked locking for minimal contention
                _cache = _build_cache()
    return _cache


def get(key: str, default: Any = None) -> Any:
    """
    Return the value for ``key`` or ``default`` if the key is undefined.
    """
    return get_cache().get(key, default)


def get_all() -> Dict[str, Any]:
    """
    Return a shallow copy of the current cache to prevent accidental mutation.
    """
    return dict(get_cache())
