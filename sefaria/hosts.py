from django_hosts import patterns, host
from sefaria import settings    
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE
from urllib.parse import urlparse
import re

def get_domain_reg(url):
    return re.escape(urlparse(url).netloc)

# Build domain patterns, including Hebrew domains only if they're configured
library_domains = [get_domain_reg(settings.DOMAIN_MODULES["en"][LIBRARY_MODULE])]
sheets_domains = [get_domain_reg(settings.DOMAIN_MODULES["en"][VOICES_MODULE])]

if "he" in settings.DOMAIN_MODULES:
    library_domains.append(get_domain_reg(settings.DOMAIN_MODULES["he"][LIBRARY_MODULE]))
    sheets_domains.append(get_domain_reg(settings.DOMAIN_MODULES["he"][VOICES_MODULE]))

library_domain = '|'.join(library_domains)
sheets_domain = '|'.join(sheets_domains)
host_patterns = patterns('',
    host(library_domain, 'sefaria.urls_library', name='library'),
    host(sheets_domain, 'sefaria.urls_sheets', name='sheets'),
)
