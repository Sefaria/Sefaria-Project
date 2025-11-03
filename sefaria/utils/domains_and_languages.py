import re
from urllib.parse import urlparse

from django.conf import settings

from sefaria.constants.model import LIBRARY_MODULE
from sefaria.utils.util import short_to_long_lang_code, get_short_lang


def current_domain_lang(request):
    """
    Returns the pinned language for the current domain, or None if current domain is not pinned.
    Uses DOMAIN_MODULES to detect which language the current domain belongs to.

    If the hostname matches multiple languages (e.g., in local development where both languages
    use localhost), returns None to indicate the domain is not language-pinned.

    :param request: Django request object
    :return: 'english', 'hebrew', or None
    """
    if not getattr(settings, 'DOMAIN_MODULES', None):
        return None

    current_hostname = request.get_host().split(':')[0]  # Strip port if present
    matched_langs = []

    for lang_code, modules in settings.DOMAIN_MODULES.items():
        for module_url in modules.values():
            if urlparse(module_url).hostname == current_hostname:
                matched_langs.append(lang_code)
                break  # Only need to match once per language

    # If we matched multiple languages, domain is ambiguous - not pinned. Happens on Local
    if len(matched_langs) != 1:
        return None

    # Only return language if domain uniquely identifies it
    return short_to_long_lang_code(matched_langs[0])


def get_redirect_domain_for_language(request, target_lang):
    """
    Get the redirect domain URL for a given interface language while preserving the current module.

    :param request: Django request object
    :param target_lang: 'english' or 'hebrew'
    :return: Full domain URL (e.g., 'https://www.sefaria.org') or None
    """
    current_module = getattr(request, 'active_module', LIBRARY_MODULE)
    lang_code = get_short_lang(target_lang)
    return settings.DOMAIN_MODULES.get(lang_code, {}).get(current_module)


def needs_domain_switch(request, target_domain):
    """
    Determine if switching to target_domain requires a domain change.

    Compares the current request host with the target domain's hostname.
    Returns False if domains are the same (prevents redirect loops in local dev).

    :param request: Django request object
    :param target_domain: Full domain URL (e.g., 'https://www.sefaria.org') or None
    :return: Boolean indicating if domain switch is needed
    """
    current_hostname = request.get_host().split(':')[0]  # Strip port if present
    target_hostname = urlparse(target_domain).hostname if target_domain else None
    return target_hostname is not None and current_hostname != target_hostname


def get_cookie_domain(language):
    """
    Get the appropriate cookie domain for a given language.

    Finds the common domain suffix for all modules within the specified language,
    allowing cookies to be shared across modules (library/voices) while respecting
    language-specific domains.

    If language is None (ambiguous domain - same domains used for multiple languages),
    finds the common domain suffix across ALL languages and modules.

    :param language: 'english', 'hebrew' (long form), or None for cross-language domains
    :return: Cookie domain string (e.g., '.sefaria.org') or None if no domain should be set
    """
    if not getattr(settings, 'DOMAIN_MODULES', None):
        return None

    # Collect all relevant module URLs
    if language:
        module_urls = settings.DOMAIN_MODULES.get(get_short_lang(language), {}).values()
    else:
        # Cross-language: collect and deduplicate URLs since different languages may share domains
        seen_urls = set()
        module_urls = []
        for lang_modules in settings.DOMAIN_MODULES.values():
            for url in lang_modules.values():
                if url not in seen_urls:
                    seen_urls.add(url)
                    module_urls.append(url)

    # Extract hostnames, filtering out localhost and IP addresses
    hostnames = []
    for url in module_urls:
        hostname = urlparse(url).hostname
        if hostname and 'localhost' not in hostname and not re.match(r'^\d+\.\d+\.\d+\.\d+$', hostname):
            hostnames.append(hostname)

    # Need at least 2 unique hostnames to justify a cookie domain
    if len(hostnames) < 2:
        return None

    # Find common suffix and 
    common_suffix = _find_longest_common_domain_suffix(hostnames)
    # Validate the suffix is not too broad (e.g., ".sefaria.org" not ".org")
    return common_suffix if common_suffix and common_suffix.count('.') >= 2 else None


def _find_longest_common_domain_suffix(hostnames):
    """
    Find the longest common domain suffix among a list of hostnames.

    Returns the shared domain part starting with a dot.
    Example: ['www.sefaria.org', 'voices.sefaria.org'] -> '.sefaria.org'

    :param hostnames: List of 2+ hostname strings
    :return: Domain suffix starting with '.' (e.g., '.sefaria.org'), or None if no common suffix
    """
    common_suffix = hostnames[0]

    for hostname in hostnames[1:]:
        # Trim from the beginning until we find a common suffix at a domain boundary
        while common_suffix and not (hostname.endswith(common_suffix) and common_suffix.startswith('.')):
            common_suffix = common_suffix[1:]

        if not common_suffix:
            return None

    return common_suffix
