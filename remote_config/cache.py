"""
Process-local cache for remote configuration values.
"""
from __future__ import annotations

from typing import Any, Optional
import threading


class RemoteConfigCache:
    """
    Thread-safe, lazily populated cache of active remote config values.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cache: Optional[dict[str, Any]] = None

    def _build_cache(self) -> dict[str, Any]:
        """
        Build the cache from the database.
        """
        # Import here to avoid circular imports
        from .models import RemoteConfigEntry

        entries = RemoteConfigEntry.objects.filter(is_active=True)
        return {entry.key: entry.parse_value() for entry in entries}

    def reload(self) -> None:
        """
        Reload all config entries from the database and swap them into the cache.
        """
        new_cache = self._build_cache()
        with self._lock:
            self._cache = new_cache

    def get_cache(self) -> dict[str, Any]:
        """
        Lazily build the cache on first access, sharing the result across threads.
        """
        if self._cache is None:
            with self._lock:
                if self._cache is None:  # double-checked locking for minimal contention
                    self._cache = self._build_cache()
        return self._cache

    def get(self, key: str, default: Any = None) -> Any:
        """
        Return the value for ``key`` or ``default`` if the key is undefined.
        """
        return self.get_cache().get(key, default)

    def get_all(self) -> dict[str, Any]:
        """
        Return a shallow copy of the current cache to prevent accidental mutation.
        """
        return dict(self.get_cache())


remoteConfigCache = RemoteConfigCache()
