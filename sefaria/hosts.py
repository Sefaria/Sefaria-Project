import re
from urllib.parse import urlparse

from django.conf import settings
from django_hosts import host, patterns

from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE


def get_domain_reg(url):
    return re.escape(urlparse(url).netloc)


# Build domain patterns for all configured languages
library_domains = []
voices_domains = []

for lang in settings.DOMAIN_MODULES:
    library_domains.append(get_domain_reg(settings.DOMAIN_MODULES[lang][LIBRARY_MODULE]))
    voices_domains.append(get_domain_reg(settings.DOMAIN_MODULES[lang][VOICES_MODULE]))

library_domain = "|".join(library_domains)
voices_domain = "|".join(voices_domains)
host_patterns = patterns(
    "",
    host(library_domain, "sefaria.urls_library", name=LIBRARY_MODULE),
    host(voices_domain, "sefaria.urls_sheets", name=VOICES_MODULE),
)
