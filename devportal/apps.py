import logging

from django.apps import AppConfig
from django.db.models.signals import post_migrate

logger = logging.getLogger("devportal")


def seed_after_migrate(sender, using="default", **kwargs):  # noqa: ARG001 - signal signature
    """Seed content after `migrate` when the snapshot, spec or renderer changed (PLAN.md §7.6).

    Every web pod runs `migrate` on start (F-15), so every environment seeds itself. Off when
    `DEVPORTAL_AUTO_SEED` is false and under pytest. Never raises: a failure is logged and stored
    on `PortalState.last_seed_error`, and the site starts anyway.
    """
    try:
        from django.db import router

        from devportal.models import Page
        from devportal.services import seed

        if not seed.auto_seed_enabled():
            return
        if not router.allow_migrate_model(using, Page):
            return
        status = seed.auto_seed(using=using)
        logger.info("devportal: content seeding: %s", status)
    except Exception:
        logger.exception("devportal: content seeding hook failed")


class DevportalConfig(AppConfig):
    """The developer portal served on the developers host (developers.sefaria.org).

    The app must stay importable without MongoDB, Redis or the library: see
    devportal/tests/isolation_test.py and PLAN.md §2.3.1.
    """

    name = "devportal"
    label = "devportal"
    verbose_name = "Developer portal"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        post_migrate.connect(seed_after_migrate, sender=self, dispatch_uid="devportal_seed_after_migrate")
