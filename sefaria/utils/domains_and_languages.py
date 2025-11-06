import re
from urllib.parse import urlparse

from django.conf import settings

from sefaria.constants.model import LIBRARY_MODULE
from sefaria.utils.util import short_to_long_lang_code, get_short_lang

import structlog
logger = structlog.get_logger(__name__)

IPV4_ADDRESS_PATTERN = r'^\d+\.\d+\.\d+\.\d+$'


def _get_hostname_without_port(request):
    """
    Extract hostname from request, stripping port if present.
    Handles both IPv4 and IPv6 addresses.

    :param request: Django request object
    :return: Hostname without port (e.g., 'example.com' or '[2001:db8::1]')
    """
    host = request.get_host()
    # For IPv6, the format is [host]:port
    # For IPv4, it's host:port
    if host.startswith('['):
        # IPv6 with port: [2001:db8::1]:8000 -> [2001:db8::1]
        return host.split(']')[0] + ']'
    else:
        # IPv4: example.com:8000 -> example.com
        return host.split(':')[0]


def current_domain_lang(request):
    """
    Returns the pinned language for the current domain, or None if current domain is not pinned.
    Uses DOMAIN_MODULES to detect which language the current domain belongs to.

    If the hostname matches multiple languages (e.g., in local development where both languages
    use localhost), returns None to indicate the domain is not language-pinned.

    :param request: Django request object
    :return: 'english', 'hebrew', or None
    """
    logger.info("TEMP: current_domain_lang called", current_host=request.get_host())
    logger.info("TEMP: DOMAIN_MODULES in current_domain_lang", domain_modules=getattr(settings, 'DOMAIN_MODULES', None))

    if not getattr(settings, 'DOMAIN_MODULES', None):
        logger.warning("TEMP: No DOMAIN_MODULES configured in current_domain_lang")
        return None

    current_hostname = _get_hostname_without_port(request)
    logger.info("TEMP: Current hostname extracted", current_hostname=current_hostname)
    matched_langs = []

    for lang_code, modules in settings.DOMAIN_MODULES.items():
        logger.info("TEMP: Checking language", lang_code=lang_code, modules=modules)
        for module_name, module_url in modules.items():
            parsed_hostname = urlparse(module_url).hostname
            logger.info("TEMP: Comparing hostnames",
                       module_name=module_name,
                       module_url=module_url,
                       parsed_hostname=parsed_hostname,
                       current_hostname=current_hostname,
                       match=parsed_hostname == current_hostname)
            if parsed_hostname == current_hostname:
                matched_langs.append(lang_code)
                logger.info("TEMP: Hostname matched for language", lang_code=lang_code)
                break  # Only need to match once per language

    logger.info("TEMP: All matched languages", matched_langs=matched_langs, count=len(matched_langs))

    # If we matched multiple languages, domain is ambiguous - not pinned. Happens on Local
    if len(matched_langs) != 1:
        logger.info("TEMP: Domain not pinned - returning None", reason="multiple matches" if len(matched_langs) > 1 else "no matches")
        return None

    # Only return language if domain uniquely identifies it
    result = short_to_long_lang_code(matched_langs[0])
    logger.info("TEMP: Domain pinned to language", lang_code=matched_langs[0], result=result)
    return result


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
    current_hostname = _get_hostname_without_port(request)
    target_hostname = urlparse(target_domain).hostname if target_domain else None
    return target_hostname is not None and current_hostname != target_hostname

# Comment for PR for Cauldron
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
    logger.info("TEMP: get_cookie_domain called", language=language)
    logger.info("TEMP: DOMAIN_MODULES configuration", domain_modules=getattr(settings, 'DOMAIN_MODULES', None))

    if not getattr(settings, 'DOMAIN_MODULES', None):
        logger.warning("TEMP: No DOMAIN_MODULES configured")
        return None

    # Collect all relevant module URLs
    if language:
        short_lang = get_short_lang(language)
        module_urls = settings.DOMAIN_MODULES.get(short_lang, {}).values()
        logger.info("TEMP: Module URLs for language", language=language, short_lang=short_lang, module_urls=list(module_urls))
    else:
        # Cross-language: collect and deduplicate URLs since different languages may share domains
        module_urls = {url for lang_modules in settings.DOMAIN_MODULES.values() for url in lang_modules.values()}
        logger.info("TEMP: Cross-language module URLs", module_urls=list(module_urls))

    # Extract hostnames, filtering out localhost and IP addresses
    hostnames = [
        hostname
        for url in module_urls
        if (hostname := urlparse(url).hostname)
        and 'localhost' not in hostname
        and not re.match(IPV4_ADDRESS_PATTERN, hostname)
    ]
    logger.info("TEMP: Extracted hostnames", hostnames=hostnames)

    # Need at least 2 unique hostnames to justify a cookie domain
    if len(hostnames) < 2:
        logger.info("TEMP: Not enough hostnames for cookie domain", hostname_count=len(hostnames))
        return None

    # Find common suffix and
    common_suffix = _find_longest_common_domain_suffix(hostnames)
    logger.info("TEMP: Common suffix found", common_suffix=common_suffix)

    # Validate the suffix is not too broad (e.g., ".sefaria.org" not ".org")
    result = common_suffix if common_suffix and common_suffix.count('.') >= 2 else None
    logger.info("TEMP: Final cookie domain result", cookie_domain=result, suffix_dot_count=common_suffix.count('.') if common_suffix else 0)
    return result


def _find_longest_common_domain_suffix(hostnames):
    """
    Find the longest common domain suffix among a list of hostnames.

    Returns the shared domain part starting with a dot.
    Example: ['www.sefaria.org', 'voices.sefaria.org'] -> '.sefaria.org'

    :param hostnames: List of 2+ hostname strings
    :return: Domain suffix starting with '.' (e.g., '.sefaria.org'), or None if no common suffix
    """
    logger.info("TEMP: _find_longest_common_domain_suffix called", hostnames=hostnames)
    common_suffix = hostnames[0]
    logger.info("TEMP: Starting with first hostname as suffix", initial_suffix=common_suffix)

    for idx, hostname in enumerate(hostnames[1:], 1):
        logger.info("TEMP: Comparing with hostname", iteration=idx, hostname=hostname, current_suffix=common_suffix)
        # Find the longest suffix that matches domain boundaries
        common_suffix = next(
            (common_suffix[i:] for i in range(len(common_suffix))
             if hostname.endswith(common_suffix[i:]) and common_suffix[i:].startswith('.')),
            ''
        )
        logger.info("TEMP: Updated common suffix", iteration=idx, new_suffix=common_suffix)

        if not common_suffix:
            logger.info("TEMP: No common suffix found")
            return None

    logger.info("TEMP: Final common suffix", final_suffix=common_suffix)
    return common_suffix
