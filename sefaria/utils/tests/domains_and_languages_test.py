from django.test import RequestFactory, override_settings

from sefaria.utils.domains_and_languages import referer_is_sefaria_domain

CONFIG_A = {"en": {"library": "https://www.sefaria.org"}}
CONFIG_B = {"en": {"library": "https://www.other-domain.org"}}


class TestKnownDomainHostnamesCache:
    """_known_domain_hostnames is lru_cache'd for real (non-test) use, where
    DOMAIN_MODULES never changes at runtime -- this proves the setting_changed
    listener actually clears it under override_settings, not just that the rest of
    the suite happens to still pass."""

    def test_cache_is_invalidated_across_overridden_settings(self):
        request = RequestFactory().get('/', HTTP_REFERER='https://www.sefaria.org/texts')

        with override_settings(DOMAIN_MODULES=CONFIG_A):
            assert referer_is_sefaria_domain(request) is True

        with override_settings(DOMAIN_MODULES=CONFIG_B):
            assert referer_is_sefaria_domain(request) is False

        with override_settings(DOMAIN_MODULES=CONFIG_A):
            assert referer_is_sefaria_domain(request) is True
