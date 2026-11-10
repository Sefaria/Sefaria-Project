SECRET_KEY = "fixture"
INSTALLED_APPS = ["fixtureapp"]
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.AutoField"
try:
    from sefaria.local_settings import DATABASES  # mounted by the Rollout's ConfigMap
except ImportError:
    DATABASES = {}
