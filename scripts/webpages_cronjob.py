import django
django.setup()
from sefaria.model import *
from sefaria.model.webpage import *

clean_webpages(test=False)
dedupe_identical_urls(test=False)
dedupe_webpages(test=False)

