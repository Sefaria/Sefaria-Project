from django_hosts import patterns, host
from sefaria import settings    
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE
from urllib.parse import urlparse
import re

def get_domain_reg(url):
    return re.escape(urlparse(url).netloc)

library_domain = f'{get_domain_reg(settings.DOMAIN_MODULES["en"][LIBRARY_MODULE])}|{get_domain_reg(settings.DOMAIN_MODULES["he"][LIBRARY_MODULE])}'
sheets_domain = f'{get_domain_reg(settings.DOMAIN_MODULES["en"][VOICES_MODULE])}|{get_domain_reg(settings.DOMAIN_MODULES["he"][VOICES_MODULE])}'
host_patterns = patterns('',
    host(library_domain, 'sefaria.urls_library', name='library'),
    host(sheets_domain, 'sefaria.urls_sheets', name='sheets'),
)
