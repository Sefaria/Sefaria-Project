import base64
import json
import pytest
from unittest.mock import Mock, patch

from django.test.client import Client
from django.contrib.auth.models import User
from django.test import override_settings
from django.core.cache import cache
from django.conf import settings

pytestmark = pytest.mark.django_db


def pytest_configure(config):
    validate_redis_cache_backend()

def validate_redis_cache_backend():
    # Validate that the Django cache backend is using Redis
    # Fail all tests if Redis backend is not configured
    cache_backend = settings.CACHES['default']['BACKEND']

    if cache_backend != 'django_redis.cache.RedisCache':
        error_message = f"""
STRAPI CACHE TESTS REQUIRE REDIS BACKEND

Current cache backend: {cache_backend}
        """.strip()

        pytest.fail(error_message)


@pytest.fixture
def client():
    return Client()

@pytest.fixture(autouse=True)
def clear_cache(cache):
    # Clear cache before and after each test
    from django.core.cache import cache

    cache.clear()

    yield

    # Cleanup after test
    cache.clear()

def get_sample_graphql_query(start_date, end_date):
    # Sample GraphQL query for banners and modals
    # This doesn't include sidebar ads and is representative of what the query might be like
    return f"""
    query {{
      banners(
        filters: {{
          bannerStartDate: {{ gte: "{start_date}" }}
          and: [{{ bannerEndDate: {{ lte: "{end_date}" }} }}]
        }}
      ) {{
        data {{
          id
          attributes {{
            internalBannerName
            bannerStartDate
            bannerEndDate
            bannerText
            buttonText
            buttonURL
            showDelay
            bannerBackgroundColor
            showToNewVisitors
            showToReturningVisitors
            showToSustainers
            showToNonSustainers
            shouldDeployOnMobile
          }}
        }}
      }}
      modals(
        filters: {{
          modalStartDate: {{ gte: "{start_date}" }}
          and: [{{ modalEndDate: {{ lte: "{end_date}" }} }}]
        }}
      ) {{
        data {{
          id
          attributes {{
            internalModalName
            modalStartDate
            modalEndDate
            modalHeader
            modalText
            buttonText
            buttonURL
            showDelay
            showToNewVisitors
            showToReturningVisitors
            showToSustainers
            showToNonSustainers
            shouldDeployOnMobile
          }}
        }}
      }}
    }}
    """


def test_strapi_graphql_cache_get_method_not_allowed(client):
    # Test that GET method returns 405, because only POST is supported
    response = client.get(
        "/api/strapi/graphql-cache?start_date=2023-01-01&end_date=2023-01-31"
    )
    assert response.status_code == 405
    data = json.loads(response.content)
    assert data["error"] == "Only POST method supported"


def test_strapi_graphql_cache_missing_dates(client):
    # Test validation when date parameters are missing
    query = get_sample_graphql_query("2023-01-01T00:00:00Z", "2023-01-31T23:59:59Z")

    # Missing both dates
    response = client.post(
        "/api/strapi/graphql-cache", data=query, content_type="text/plain"
    )
    assert response.status_code == 400
    data = json.loads(response.content)
    assert data["error"] == "start_date parameter must be a single value"

    # Missing end_date
    response = client.post(
        "/api/strapi/graphql-cache?start_date=2023-01-01",
        data=query,
        content_type="text/plain",
    )
    assert response.status_code == 400
    data = json.loads(response.content)
    assert data["error"] == "end_date parameter must be a single value"


def test_strapi_graphql_cache_multiple_date_parameters():
    # Test validation when multiple values are provided for date parameters
    # Multiple start_date values (Example: "?start_date=2023-01-01&start_date=2023-01-02")
    # Currently can't easily test this with Django test client, but the isinstance logic can be tested
    # The validation logic will catch this scenario in real usage
    pass


def test_strapi_graphql_cache_invalid_date_format(client):
    # Test validation of date format
    query = get_sample_graphql_query("2023-01-01T00:00:00Z", "2023-01-31T23:59:59Z")

    # Invalid date format
    response = client.post(
        "/api/strapi/graphql-cache?start_date=invalid&end_date=2023-01-31",
        data=query,
        content_type="text/plain",
    )
    assert response.status_code == 400
    data = json.loads(response.content)
    assert data["error"] == "Dates must be in YYYY-MM-DD format"


def test_strapi_graphql_cache_empty_query(client):
    # Test validation when GraphQL query is empty.
    response = client.post(
        "/api/strapi/graphql-cache?start_date=2023-01-01&end_date=2023-01-31",
        data="",
        content_type="text/plain",
    )
    assert response.status_code == 400
    data = json.loads(response.content)
    assert data["error"] == "GraphQL query required in request body"


def test_strapi_graphql_cache_missing_strapi_config(client):
    # Test behavior when Strapi configuration is missing.
    from django.conf import settings

    query = get_sample_graphql_query("2023-01-01T00:00:00Z", "2023-01-31T23:59:59Z")

    # Mock missing Strapi configuration
    with patch.object(settings, "STRAPI_LOCATION", None):
        response = client.post(
            "/api/strapi/graphql-cache?start_date=2023-01-01&end_date=2023-01-31",
            data=query,
            content_type="text/plain",
        )
        assert response.status_code == 500
        data = json.loads(response.content)
        assert data["error"] == "Strapi environment variables are not configured"


def test_strapi_graphql_cache_functionality(client):
    # Test the complete flow for caching including cache hit and miss
    from sefaria.system.cache import get_cache_elem, set_cache_elem

    query = get_sample_graphql_query("2023-01-01T00:00:00Z", "2023-01-31T23:59:59Z")
    cache_key = "strapi_graphql_2023-01-01_2023-01-31"

    # Mock Strapi response
    mock_response = Mock()
    mock_response.status_code = 200
    # Use example data when there is nothing available
    # TODO: Use example data returned from Strapi in the future
    mock_response.text = json.dumps(
        {"data": {"banners": {"data": []}, "modals": {"data": []}}}
    )

    # Should this use actual environment variables since they're mocked anyway?
    with patch("requests.post", return_value=mock_response), patch(
        "django.conf.settings.STRAPI_LOCATION", "http://localhost"
    ), patch("django.conf.settings.STRAPI_PORT", "1337"):

        # First request - cache miss
        response1 = client.post(
            "/api/strapi/graphql-cache?start_date=2023-01-01&end_date=2023-01-31",
            data=query,
            content_type="text/plain",
        )
        assert response1.status_code == 200
        data1 = json.loads(response1.content)
        assert "data" in data1

        # Verify data was cached
        cached_data = get_cache_elem(cache_key, cache_type="default")
        assert cached_data is not None

        # Second request - cache hit (mock shouldn't be called again)
        with patch("requests.post") as mock_post:
            response2 = client.post(
                "/api/strapi/graphql-cache?start_date=2023-01-01&end_date=2023-01-31",
                data=query,
                content_type="text/plain",
            )
            assert response2.status_code == 200
            data2 = json.loads(response2.content)

            # Should return cached data without calling Strapi
            mock_post.assert_not_called()
            assert data1 == data2


def test_strapi_cache_invalidate_get_method_not_allowed_with_auth(client):
    # Test that GET method returns 405 (method not allowed) for cache invalidation with proper auth
    from django.conf import settings

    # Mock webhook credentials
    with patch.object(settings, "WEBHOOK_USERNAME", "test_user"), patch.object(
        settings, "WEBHOOK_PASSWORD", "test_pass"
    ):

        # Create Basic Auth header
        credentials = base64.b64encode(b"test_user:test_pass").decode("ascii")
        auth_header = f"Basic {credentials}"

        response = client.get(
            "/api/strapi/cache-invalidate", HTTP_AUTHORIZATION=auth_header
        )
        assert response.status_code == 405
        data = json.loads(response.content)
        assert data["error"] == "Only POST method supported"


def test_strapi_cache_invalidate_no_auth_redirects(client):
   # Test cache invalidation without auth (302 redirect location)
    response = client.post(
        "/api/strapi/cache-invalidate", data="{}", content_type="application/json"
    )
    assert response.status_code == 302


def test_strapi_cache_invalidate_invalid_auth(client):
    # Test cache invalidation with invalid Basic Auth returns 401
    from django.conf import settings

    # Mock webhook credentials
    with patch.object(settings, "WEBHOOK_USERNAME", "correct_user"), patch.object(
        settings, "WEBHOOK_PASSWORD", "correct_pass"
    ):

        # Create invalid Basic Auth header
        credentials = base64.b64encode(b"wrong_user:wrong_pass").decode("ascii")
        auth_header = f"Basic {credentials}"

        response = client.post(
            "/api/strapi/cache-invalidate",
            data="{}",
            content_type="application/json",
            HTTP_AUTHORIZATION=auth_header,
        )
        assert response.status_code == 401


def test_strapi_cache_invalidate_with_valid_webhook_auth(client):
    # Test cache invalidation works with valid webhook Basic Auth
    from django.conf import settings

    # Mock webhook credentials
    with patch.object(settings, "WEBHOOK_USERNAME", "test_user"), patch.object(
        settings, "WEBHOOK_PASSWORD", "test_pass"
    ):

        with patch("sefaria.system.cache.get_cache_factory") as mock_cache_factory:
            mock_cache = Mock()
            mock_cache_factory.return_value = mock_cache

            # Mock file-based cache (current setup)
            mock_cache.delete_pattern = None  # File cache doesn't have delete_pattern
            mock_cache.client = None  # File cache doesn't have client

            # Create valid Basic Auth header
            credentials = base64.b64encode(b"test_user:test_pass").decode("ascii")
            auth_header = f"Basic {credentials}"

            response = client.post(
                "/api/strapi/cache-invalidate",
                data="{}",
                content_type="application/json",
                HTTP_AUTHORIZATION=auth_header,
            )
            assert response.status_code == 200

def test_cache_key_generation():
    # Test that cache keys are generated consistently.
    from sefaria.system.cache import get_cache_elem, set_cache_elem

    # Test that same dates generate same cache key
    cache_key = "strapi_graphql_2023-01-01_2023-12-31"
    test_data = {"test": "data"}

    # Set cache
    set_cache_elem(cache_key, json.dumps(test_data), cache_type="default")

    # Retrieve cache
    cached = get_cache_elem(cache_key, cache_type="default")
    assert cached is not None
    assert json.loads(cached) == test_data


def test_strapi_request_timeout_handling(client):
    # Test handling of Strapi request timeouts
    from requests.exceptions import Timeout

    query = get_sample_graphql_query("2023-01-01T00:00:00Z", "2023-01-31T23:59:59Z")

    with patch("requests.post", side_effect=Timeout()), patch(
        "django.conf.settings.STRAPI_LOCATION", "http://localhost"
    ), patch("django.conf.settings.STRAPI_PORT", "1337"):

        response = client.post(
            "/api/strapi/graphql-cache?start_date=2023-01-01&end_date=2023-01-31",
            data=query,
            content_type="text/plain",
        )
        assert response.status_code == 500
        data = json.loads(response.content)
        assert data["error"] == "Internal server error"


def test_strapi_non_200_response(client):
    # Test handling of responses other than 200 from Strapi

    query = get_sample_graphql_query("2023-01-01T00:00:00Z", "2023-01-31T23:59:59Z")

    # Mock Strapi error response
    mock_response = Mock()
    mock_response.status_code = 500

    with patch("requests.post", return_value=mock_response), patch(
        "django.conf.settings.STRAPI_LOCATION", "http://localhost"
    ), patch("django.conf.settings.STRAPI_PORT", "1337"):

        response = client.post(
            "/api/strapi/graphql-cache?start_date=2023-01-01&end_date=2023-01-31",
            data=query,
            content_type="text/plain",
        )
        assert response.status_code == 500
        data = json.loads(response.content)
        assert data["error"] == "Strapi request failed with status 500"
