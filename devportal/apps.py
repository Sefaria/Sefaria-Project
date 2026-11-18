from django.apps import AppConfig


class DevportalConfig(AppConfig):
    """The developer portal served on the developers host (developers.sefaria.org).

    The app must stay importable without MongoDB, Redis or the library: see
    devportal/tests/isolation_test.py and PLAN.md §2.3.1.
    """

    name = "devportal"
    label = "devportal"
    verbose_name = "Developer portal"
    default_auto_field = "django.db.models.BigAutoField"
