"""
N-M10: /api-terms is linked from developer settings. It is either hidden while developer settings
are off, or carries real terms rather than placeholder text.

Tests whose name ends in known_gap_<id> assert the desired behaviour and fail today. They carry
the `failing` marker, so the default CI run (-m "not failing") leaves them out.
"""
import pytest
from django.test import Client, override_settings

PLACEHOLDER = "lorem ipsum"


@pytest.mark.django_db
@pytest.mark.failing
@override_settings(DEVELOPER_SETTINGS_ENABLED=False)
def test_N_M10_with_developer_settings_off_the_api_terms_are_hidden_or_real_known_gap_N_M10():
    response = Client().get("/api-terms")

    assert response.status_code == 404 or PLACEHOLDER not in response.content.decode().lower()


@pytest.mark.django_db
@pytest.mark.failing
@override_settings(DEVELOPER_SETTINGS_ENABLED=True)
def test_N_M10_with_developer_settings_on_the_api_terms_are_real_terms_known_gap_N_M10():
    response = Client().get("/api-terms")

    assert response.status_code == 200
    assert PLACEHOLDER not in response.content.decode().lower()
