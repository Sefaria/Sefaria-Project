from django_hosts import patterns, host
from django.conf import settings
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE
from urllib.parse import urlparse
import re

def get_domain_reg(url):
    return re.escape(urlparse(url).netloc)

# Build domain patterns for all configured languages
library_domains = []
voices_domains = []

for lang in settings.DOMAIN_MODULES.keys():
    library_domains.append(get_domain_reg(settings.DOMAIN_MODULES[lang][LIBRARY_MODULE]))
    voices_domains.append(get_domain_reg(settings.DOMAIN_MODULES[lang][VOICES_MODULE]))

library_domain = '|'.join(library_domains)
voices_domain = '|'.join(voices_domains)
host_patterns = patterns('',
    host(library_domain, 'sefaria.urls_library', name=LIBRARY_MODULE),
    host(voices_domain, 'sefaria.urls_sheets', name=VOICES_MODULE),
)
