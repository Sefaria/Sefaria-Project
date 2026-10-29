"""
/api-terms is linked only from developer settings and exists only where they do.

Tests whose name ends in known_gap_<id> assert the desired behaviour and fail today. They carry
the `failing` marker, so the default CI run (-m "not failing") leaves them out.
"""
import pytest
from django.test import Client, override_settings

from reader.conftest import create_test_user, purge_test_profiles

PLACEHOLDER = "lorem ipsum"


@pytest.fixture
def user():
    user = create_test_user("apiterms")
    purge_test_profiles(user)
    yield user
    purge_test_profiles(user)


def logged_in(user):
    client = Client()
    client.force_login(user)
    return client


@pytest.mark.django_db
@override_settings(DEVELOPER_SETTINGS_ENABLED=False)
def test_with_developer_settings_off_the_api_terms_are_not_found(user):
    user.is_staff = True
    user.save()

    assert Client().get("/api-terms").status_code == 404
    assert logged_in(user).get("/api-terms").status_code == 404


@pytest.mark.django_db
@override_settings(DEVELOPER_SETTINGS_ENABLED=True, DEVELOPER_SETTINGS_STAFF_ONLY=True)
def test_with_developer_settings_staff_only_the_api_terms_are_for_staff_alone(user):
    assert Client().get("/api-terms").status_code == 404
    assert logged_in(user).get("/api-terms").status_code == 404

    user.is_staff = True
    user.save()
    assert logged_in(user).get("/api-terms").status_code == 200


@pytest.mark.django_db
@override_settings(DEVELOPER_SETTINGS_ENABLED=True)
def test_with_developer_settings_on_the_api_terms_are_public():
    assert Client().get("/api-terms").status_code == 200
    assert Client().get("/api-terms/").status_code == 200


@pytest.mark.django_db
@pytest.mark.failing
@override_settings(DEVELOPER_SETTINGS_ENABLED=True)
def test_N_M10_with_developer_settings_on_the_api_terms_are_real_terms_known_gap_N_M10():
    response = Client().get("/api-terms")

    assert response.status_code == 200
    assert PLACEHOLDER not in response.content.decode().lower()
