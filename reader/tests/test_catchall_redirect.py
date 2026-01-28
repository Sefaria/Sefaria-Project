import pytest
from django.test import override_settings
from sefaria.system.exceptions import InputError


TEST_DOMAIN_MODULES = {
    "en": {
        "library": "https://www.modularization.testing.sefaria.org",
        "voices": "https://voices.modularization.testing.sefaria.org",
    },
    "he": {
        "library": "https://www.modularization.testing.sefaria.org",
        "voices": "https://voices.modularization.testing.sefaria.org",
    },
}

TEST_ALLOWED_HOSTS = [
    "www.modularization.testing.sefaria.org",
    "voices.modularization.testing.sefaria.org",
]


@pytest.mark.django_db
@override_settings(DOMAIN_MODULES=TEST_DOMAIN_MODULES, ALLOWED_HOSTS=TEST_ALLOWED_HOSTS)
def test_voices_catchall_ref_redirects_to_library(client, monkeypatch):
    HTTP_HOST = "voices.modularization.testing.sefaria.org"
    class DummyRef:
        def url(self, _=False):
            return "Genesis.1.1"

    monkeypatch.setattr(
        "sefaria.model.Ref.instantiate_ref_with_legacy_parse_fallback",
        lambda tref: DummyRef(),
    )

    response = client.get(
        "/Genesis.1.1",
        {"foo": "bar"},
        HTTP_HOST=HTTP_HOST,
    )

    assert response.status_code == 301
    assert HTTP_HOST not in response["Location"]
    assert response["Location"].split("/")[-1] == "Genesis.1.1?foo=bar"


@pytest.mark.django_db
@override_settings(DOMAIN_MODULES=TEST_DOMAIN_MODULES, ALLOWED_HOSTS=TEST_ALLOWED_HOSTS)
def test_voices_catchall_non_ref_404(client, monkeypatch):
    monkeypatch.setattr(
        "sefaria.model.Ref.instantiate_ref_with_legacy_parse_fallback",
        lambda tref: (_ for _ in ()).throw(InputError("bad ref")),
    )

    response = client.get(
        "/not-a-real-ref",
        HTTP_HOST="voices.modularization.testing.sefaria.org",
    )

    assert response.status_code == 404
