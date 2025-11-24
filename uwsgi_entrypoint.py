"""
uWSGI entrypoint that mirrors the Gunicorn preload behavior:
- Build shared library caches once before worker threads start.
- Expose the Django WSGI application.
"""
import os

# Ensure Django settings are configured before importing anything that needs them
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "sefaria.settings")
import django
django.setup()

from reader.startup import init_library_cache

# Build caches once per worker process; threads share this state.
init_library_cache()

# Import Django WSGI application after cache init
from sefaria.wsgi import application  # noqa: E402
