import re
from urllib.parse import urlparse

from django.conf import settings
from django_hosts import host, patterns

from sefaria.constants.model import DEVELOPERS_MODULE, LIBRARY_MODULE, VOICES_MODULE

# The URLconf of each module, in matching order. The library stays first, and DEFAULT_HOST
# (sefaria/settings.py) stays "library".
MODULE_URLCONFS = {
    LIBRARY_MODULE: "sefaria.urls_library",
    VOICES_MODULE: "sefaria.urls_sheets",
    DEVELOPERS_MODULE: "sefaria.urls_developers",
}


def get_domain_reg(url):
    return re.escape(urlparse(url).netloc)


def module_host_regexes(domain_modules):
    """{module: host regex} for every module of MODULE_URLCONFS that at least one language
    configures, in MODULE_URLCONFS order. A language may leave a module out (the developers module
    exists only under "en"); hostnames shared by several languages appear once.
    """
    regexes = {}
    for module in MODULE_URLCONFS:
        domains = []
        for lang_modules in domain_modules.values():
            url = lang_modules.get(module)
            if not url:
                continue
            domain = get_domain_reg(url)
            if domain not in domains:
                domains.append(domain)
        if domains:
            regexes[module] = "|".join(domains)
    return regexes


def build_host_patterns(domain_modules):
    return patterns(
        "",
        *(
            host(regex, MODULE_URLCONFS[module], name=module)
            for module, regex in module_host_regexes(domain_modules).items()
        ),
    )


if getattr(settings, "NAME_SERVICE", False):
    # This process serves only the autocomplete endpoints; module routing by
    # domain doesn't apply, so every host gets the same minimal URLconf.
    host_patterns = patterns(
        "",
        host(r".*", "sefaria.urls_name", name=LIBRARY_MODULE),
    )
else:
    # Build domain patterns for all configured languages
    host_patterns = build_host_patterns(getattr(settings, "DOMAIN_MODULES", {}))
