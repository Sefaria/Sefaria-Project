import django
django.setup()
from sefaria.model import library

library.rebuild_toc()