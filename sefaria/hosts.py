from django_hosts import patterns, host
from sefaria.settings import DOMAIN_MODULES
from urllib.parse import urlparse
import re

def get_domain_reg(url):
    return re.escape(urlparse(url).netloc)

library_domain = f'{get_domain_reg(DOMAIN_MODULES["en"]["library"])}|{get_domain_reg(DOMAIN_MODULES["he"]["library"])}'
sheets_domain = f'{get_domain_reg(DOMAIN_MODULES["en"]["voices"])}|{get_domain_reg(DOMAIN_MODULES["he"]["voices"])}'
host_patterns = patterns('',
    host(library_domain, 'sefaria.urls_library', name='library'),
    host(sheets_domain, 'sefaria.urls_sheets', name='sheets'),
)
