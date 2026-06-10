from django.apps import AppConfig
import logging


logger = logging.getLogger(__name__)


class RemoteConfigConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "remote_config"

    def ready(self):
        """
        Load the config cache eagerly during startup. Failures are logged but
        intentionally ignored so that deployments do not break if the database
        is unavailable during initialization.
        """
        from .cache import remoteConfigCache

        try:
            remoteConfigCache.reload()
        except Exception:  # pragma: no cover - defensive logging
            logger.exception("Remote config cache priming failed; will retry lazily.")
